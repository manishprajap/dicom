import {
  IonPage,
  IonContent,
  IonToast,
} from '@ionic/react';
import { useEffect, useState } from 'react';
import { useHistory } from 'react-router-dom';
import axios from 'axios';
import { Capacitor } from '@capacitor/core';
import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth';

const API_BASE = 'https://aarnatechxperts.in/dicomapi/public/api';

const GOOGLE_WEB_CLIENT_ID =
  '75839040914-0ih63na107kheqhkgf853j1nb3huj2q2.apps.googleusercontent.com';

const GOOGLE_SCOPES =
  'openid email profile https://www.googleapis.com/auth/drive.file';

const ROLE_REDIRECTS: Record<string, string> = {
  Doctor: '/dashboard',
};

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initCodeClient: (config: {
            client_id: string;
            scope: string;
            ux_mode: 'popup' | 'redirect';
            callback: (response: { code?: string; error?: string }) => void;
          }) => { requestCode: () => void };
        };
      };
    };
  }
}

const GSI_SRC = 'https://accounts.google.com/gsi/client';
let gsiLoadPromise: Promise<void> | null = null;

const waitForGoogleIdentityServices = (): Promise<void> => {
  if (window.google?.accounts?.oauth2) {
    return Promise.resolve();
  }

  if (gsiLoadPromise) {
    return gsiLoadPromise;
  }

  gsiLoadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${GSI_SRC}"]`
    );

    const onReady = () => {
      if (window.google?.accounts?.oauth2) {
        resolve();
      } else {
        reject(
          new Error(
            'Google Identity Services script loaded but window.google.accounts.oauth2 is missing.'
          )
        );
      }
    };

    if (existing) {
      existing.addEventListener('load', onReady, { once: true });
      existing.addEventListener(
        'error',
        () => reject(new Error('Failed to load the existing Google Identity Services script tag.')),
        { once: true }
      );
      if (window.google?.accounts?.oauth2) resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = GSI_SRC;
    script.async = true;
    script.defer = true;
    script.onload = onReady;
    script.onerror = () =>
      reject(
        new Error(
          'Could not load accounts.google.com/gsi/client — check your network tab; this is commonly blocked by ad blockers or content blockers.'
        )
      );
    document.head.appendChild(script);
  });

  gsiLoadPromise.catch(() => {
    gsiLoadPromise = null;
  });

  return gsiLoadPromise;
};

const Login: React.FC = () => {
  const history = useHistory();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [showToast, setShowToast] = useState(false);

  const isNative = Capacitor.isNativePlatform();

  useEffect(() => {
    if (isNative) {
      GoogleAuth.initialize({
        clientId: GOOGLE_WEB_CLIENT_ID,
        scopes: ['profile', 'email', 'https://www.googleapis.com/auth/drive.file'],
        grantOfflineAccess: true,
      });
    }
  }, [isNative]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const completeLogin = (userData: any, token: string) => {
    const userRole = userData.role;

    localStorage.setItem('uData', JSON.stringify(userData));
    localStorage.setItem('token', token);
    localStorage.setItem('userId', userData.id);
    localStorage.setItem('role', userRole);

    const redirectPath = ROLE_REDIRECTS[userRole] ?? '/dashboard';
    history.push(redirectPath);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await axios.post(`${API_BASE}/login`, {
        email,
        password,
      });

      if (response.data.success) {
        completeLogin(response.data.data, response.data.token);
      } else {
        setErrorMessage(response.data.message || 'Invalid email or password!');
        setShowToast(true);
      }
    } catch (error) {
      console.error('Login error:', error);
      setErrorMessage('An error occurred. Please try again.');
      setShowToast(true);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLoginNative = async () => {
    const googleUser = await GoogleAuth.signIn();

    console.log('GoogleAuth.signIn() result:', googleUser);

    const idToken = googleUser?.authentication?.idToken;
    const serverAuthCode = googleUser?.serverAuthCode;

    if (!idToken && !serverAuthCode) {
      throw new Error(
        'Google sign-in did not return a token. Check that capacitor.config.ts has ' +
        'plugins.GoogleAuth.serverClientId set to your web client ID, and that this ' +
        "app's SHA-1 fingerprint is registered in Google Cloud Console."
      );
    }

    const response = await axios.post(`${API_BASE}/login/google`, {
      idToken,
      serverAuthCode,
      platform: 'native',
    });

    return response;
  };

  const handleGoogleLoginWeb = async (): Promise<void> => {
    await waitForGoogleIdentityServices();

    return new Promise((resolve, reject) => {
      const client = window.google!.accounts.oauth2.initCodeClient({
        client_id: GOOGLE_WEB_CLIENT_ID,
        scope: GOOGLE_SCOPES,
        ux_mode: 'popup',
        callback: async (response) => {
          if (response.error || !response.code) {
            reject(new Error(response.error || 'Google sign-in was cancelled.'));
            return;
          }

          try {
            const apiResponse = await axios.post(`${API_BASE}/login/google`, {
              serverAuthCode: response.code,
              platform: 'web',
            });

            if (apiResponse.data.success) {
              if (apiResponse.data.drive_access_token) {
                localStorage.setItem(
                  'googleDriveToken',
                  apiResponse.data.drive_access_token
                );
              }
              completeLogin(apiResponse.data.data, apiResponse.data.token);
              resolve();
            } else {
              reject(new Error(apiResponse.data.message || 'Google sign-in failed.'));
            }
          } catch (err) {
            reject(err);
          }
        },
      });

      client.requestCode();
    });
  };

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);

    try {
      if (isNative) {
        const response = await handleGoogleLoginNative();
        if (response.data.success) {
          if (response.data.drive_access_token) {
            localStorage.setItem('googleDriveToken', response.data.drive_access_token);
          }
          completeLogin(response.data.data, response.data.token);
        } else {
          setErrorMessage(response.data.message || 'Google sign-in failed.');
          setShowToast(true);
        }
      } else {
        await handleGoogleLoginWeb();
      }

    } catch (error: any) {
      console.error('Google login error:', error);
      const message =
        error?.response?.data?.message ||
        error?.message ||
        'Google sign-in failed. Please try again.';
      setErrorMessage(message);
      setShowToast(true);
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleMicrosoftLogin = () => {
    setErrorMessage('Microsoft sign-in is not available yet.');
    setShowToast(true);
  };

  return (
    <IonPage>
      <IonContent fullscreen className="login-bg">
        <style>{`
          .login-bg {
            --background: linear-gradient(180deg, #f3fbfa 0%, #eaf5f6 40%, #eef7fb 100%);
          }
          .login-wrap {
            position: relative;
            min-height: 100%;
            padding: 28px 20px 40px;
            overflow: hidden;
          }
          .login-wrap::before {
            content: '';
            position: absolute;
            top: -60px;
            right: -80px;
            width: 260px;
            height: 260px;
            background:
              repeating-linear-gradient(
                115deg,
                rgba(28,167,155,0.16) 0px,
                rgba(28,167,155,0.16) 2px,
                transparent 2px,
                transparent 14px
              );
            border-radius: 50%;
            pointer-events: none;
          }
          .login-watermarks {
            position: absolute;
            top: 40px;
            left: 6px;
            display: flex;
            flex-direction: column;
            gap: 34px;
            opacity: 0.16;
            pointer-events: none;
          }
          .login-watermarks svg { display: block; }

          .login-brand {
            position: relative;
            text-align: center;
            margin-bottom: 10px;
          }
          .brand-mark {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 64px;
            height: 64px;
            border-radius: 18px;
            margin-bottom: 10px;
          }
          .brand-title {
            font-size: 20px;
            font-weight: 800;
            color: #0B3A4A;
            margin: 4px 0 2px;
            letter-spacing: 0.2px;
          }
          .brand-e { color: #1CA79B; }
          .brand-tag {
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 2px;
            color: #4C8C93;
            margin: 0 0 14px;
          }
          .brand-divider {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            margin-bottom: 10px;
          }
          .divider-line {
            width: 40px;
            height: 1px;
            background: rgba(28,167,155,0.35);
          }
          .hipaa-badge {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            font-size: 13px;
            color: #275C66;
            line-height: 1.35;
            padding: 0 10px;
          }
          .hipaa-badge strong { color: #0B3A4A; }

          .login-card {
            position: relative;
            background: #ffffff;
            border-radius: 22px;
            box-shadow: 0 18px 40px rgba(11,58,74,0.10);
            padding: 26px 22px 22px;
            margin-top: 22px;
          }
          .card-head {
            text-align: center;
            margin-bottom: 10px;
          }
          .card-head-title {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            font-size: 14px;
            font-weight: 800;
            color: #0B3A4A;
            margin-bottom: 4px;
          }
          .card-head-sub {
            font-size: 13.5px;
            color: #7C8A93;
          }

          .field { margin-bottom: 16px; }
          .field label {
            display: block;
            font-size: 13.5px;
            font-weight: 700;
            color: #0B3A4A;
            margin-bottom: 6px;
          }
          .input-wrap {
            display: flex;
            align-items: center;
            gap: 10px;
            border: 1.4px solid #DCEAEA;
            border-radius: 12px;
            padding: 5px 14px;
            background: #FBFDFD;
          }
          .input-wrap:focus-within {
            border-color: #1CA79B;
            box-shadow: 0 0 0 3px rgba(28,167,155,0.12);
          }
          .input-wrap input {
            border: none;
            outline: none;
            background: transparent;
            flex: 1;
            font-size: 14.5px;
            color: #0B3A4A;
            min-width: 0;
          }
          .input-wrap input::placeholder { color: #9AA9AD; }
          .pw-toggle {
            display: flex;
            align-items: center;
            gap: 4px;
            border: none;
            background: none;
            padding: 0;
            font-size: 13px;
            font-weight: 600;
            color: #1CA79B;
            white-space: nowrap;
          }

          .row-between {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 20px;
          }
          .remember-check {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 13.5px;
            color: #3A4A50;
          }
          .remember-check input { display: none; }
          .checkbox-box {
            width: 19px;
            height: 19px;
            border-radius: 5px;
            border: 1.6px solid #CBD9D9;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #fff;
            flex-shrink: 0;
          }
          .remember-check input:checked + .checkbox-box {
            background: linear-gradient(135deg, #1CA79B, #0B4C6A);
            border-color: transparent;
          }
          .forgot-link {
            font-size: 13px;
            font-weight: 600;
            color: #1CA79B;
          }

          .login-btn {
            width: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            border: none;
            border-radius: 13px;
            padding: 14px 0;
            font-size: 15px;
            font-weight: 700;
            letter-spacing: 0.4px;
            color: #fff;
            background: linear-gradient(90deg, #1CA79B, #0B4C6A);
            box-shadow: 0 10px 22px rgba(11,76,106,0.28);
          }
          .login-btn:disabled { opacity: 0.7; }

          .or-divider {
            display: flex;
            align-items: center;
            gap: 10px;
            margin: 20px 0 14px;
          }
          .or-divider span:not(:nth-child(2)) {
            flex: 1;
            height: 1px;
            background: #E7EFEF;
          }
          .or-divider p {
            font-size: 11.5px;
            font-weight: 700;
            letter-spacing: 1px;
            color: #9AA9AD;
            margin: 0;
            white-space: nowrap;
          }

          .sso-row {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
            margin-bottom: 18px;
          }
          .sso-btn {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            border: 1.4px solid #E4ECEC;
            border-radius: 12px;
            padding: 12px 0;
            background: #fff;
            font-size: 14px;
            font-weight: 700;
            color: #2B3A40;
          }
          .sso-btn:disabled { opacity: 0.6; }

          .security-box {
            display: flex;
            gap: 12px;
            align-items: flex-start;
            background: #F1F8F8;
            border-radius: 14px;
            padding: 14px 14px;
            margin-bottom: 16px;
          }
          .security-box-title {
            font-size: 13.5px;
            font-weight: 800;
            color: #0B3A4A;
            margin: 0 0 2px;
          }
          .security-box-text {
            font-size: 12.5px;
            color: #5E7379;
            line-height: 1.45;
            margin: 0;
          }

          .help-row {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            font-size: 13px;
            color: #4C8C93;
            padding-top: 12px;
            border-top: 1px solid #EEF3F3;
          }

          .login-footer {
            text-align: center;
            margin-top: 18px;
            font-size: 11.5px;
            color: #97A6AB;
            line-height: 1.6;
          }
          .login-footer .footer-links a {
            color: #1CA79B;
            font-weight: 600;
            text-decoration: none;
          }
          .login-footer .footer-links span {
            margin: 0 6px;
            color: #C7D2D2;
          }
        `}</style>

        <div className="login-wrap">
          <div className="login-watermarks">
            <LockIcon size={26} muted />
            <HeartbeatIcon size={26} />
            <CameraIcon size={26} />
            <FolderIcon size={26} />
          </div>

          {/* Brand header */}
          <div className="login-brand">
            <div className="brand-mark">
              <svg viewBox="0 0 48 48" width="46" height="46" fill="none">
                <path
                  d="M24 4c-2.2 0-4 1.8-4 4v6h-6c-2.2 0-4 1.8-4 4v12c0 2.2 1.8 4 4 4h6v6c0 2.2 1.8 4 4 4s4-1.8 4-4v-6h6c2.2 0 4-1.8 4-4V18c0-2.2-1.8-4-4-4h-6V8c0-2.2-1.8-4-4-4z"
                  fill="url(#crossGrad)"
                />
                <path
                  d="M11 24h6l2.5-5 3 9 2.5-6 2 2h9"
                  stroke="#fff"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
                <defs>
                  <linearGradient id="crossGrad" x1="6" y1="4" x2="42" y2="44" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#1CA79B" />
                    <stop offset="1" stopColor="#0B4C6A" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <h1 className="brand-title">
              <span className="brand-e">e</span>Medical Access
            </h1>
            <p className="brand-tag">SECURE. COMPLIANT. CONNECTED.</p>

            <div className="brand-divider">
              <span className="divider-line" />
              <svg viewBox="0 0 60 16" width="60" height="16">
                <polyline
                  points="0,8 14,8 19,1 24,15 29,8 60,8"
                  fill="none"
                  stroke="#1CA79B"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="divider-line" />
            </div>

            <div className="hipaa-badge">
              <ShieldLockIcon size={22} />
              <span>
                <strong>HIPAA compliant.</strong> Your data. Your patients. Our priority.
              </span>
            </div>
          </div>

          {/* Login card */}
          <div className="login-card">
            <div className="card-head">
              <div className="card-head-title">
                <ShieldCheckIcon size={20} />
                Authorized Healthcare Access
              </div>
              <p className="card-head-sub">Sign in to continue</p>
            </div>

            <form onSubmit={handleLogin}>
              <div className="field">
                <label htmlFor="email">Email</label>
                <div className="input-wrap">
                  <MailIcon />
                  <input
                    id="email"
                    type="email"
                    placeholder="Enter your email address"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="field">
                <label htmlFor="password">Password</label>
                <div className="input-wrap">
                  <LockIcon />
                  <input
                    id="password"
                    type={show ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="pw-toggle"
                    onClick={() => setShow((prev) => !prev)}
                    aria-label={show ? 'Hide password' : 'Show password'}
                    aria-pressed={show}
                  >
                    <EyeIcon crossed={show} />
                  </button>
                </div>
              </div>

              <div className="row-between">
                <label className="remember-check">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                  />
                  <span className="checkbox-box">
                    {remember && <CheckIcon />}
                  </span>
                  Remember me
                </label>
                <span
                  className="forgot-link"
                  onClick={() => history.push('/forgot-password')}
                >
                  Forgot password?
                </span>
              </div>

              <button type="submit" className="login-btn" disabled={loading}>
                <LockFilledIcon />
                {loading ? 'Signing in...' : 'SIGN IN'}
              </button>
            </form>

            <div className="or-divider">
              <span />
              <p>OR SIGN IN WITH</p>
              <span />
            </div>

            <div className="sso-row">
             {/*  <button
                type="button"
                className="sso-btn"
                onClick={handleMicrosoftLogin}
              >
                <MicrosoftIcon />
                Microsoft
              </button> */}
              <button
                type="button"
                className="sso-btn"
                onClick={handleGoogleLogin}
                disabled={googleLoading}
              >
                <GoogleIcon />
                {googleLoading ? 'Connecting...' : 'Google'}
              </button>
            </div>
           <div style={{ textAlign: 'center', marginTop: 12 }}>
              Don’t have an account?{' '}
              <span
                style={{ color: '#1CA79B', fontWeight: 700, cursor: 'pointer' }}
                onClick={() => history.push('/signup')}
              >
                Register here
              </span>
            </div> 

            <div className="security-box">
              <ShieldLockIcon size={26} />
              <div>
                <p className="security-box-title">Your security matters</p>
                <p className="security-box-text">
                  All activity is encrypted, monitored, and audited to protect patient information.
                </p>
              </div>
            </div>

            <div className="help-row">
              <HeadsetIcon />
              Need help? Contact your system administrator.
            </div>
          </div>

          <div className="login-footer">
            <div>© {new Date().getFullYear()} eMedical Access. All rights reserved.</div>
            <div className="footer-links">
              <a href="/privacy-policy">Privacy Policy</a>
              <span>|</span>
              <a href="/terms-of-use">Terms of Use</a>
            </div>
          </div>
        </div>

        <IonToast
          isOpen={showToast}
          onDidDismiss={() => setShowToast(false)}
          message={errorMessage}
          duration={2500}
          color="danger"
        />
      </IonContent>
    </IonPage>
  );
};

/* ---------- Inline icon components (no external icon dependency) ---------- */

const MailIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
    <rect x="3" y="5" width="18" height="14" rx="2" stroke="#1CA79B" strokeWidth="1.6" />
    <path d="m3.5 6 8.5 7 8.5-7" stroke="#1CA79B" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const LockIcon = ({ size = 18, muted = false }: { size?: number; muted?: boolean }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none">
    <rect x="4.5" y="10.5" width="15" height="10" rx="2" stroke={muted ? '#0B4C6A' : '#1CA79B'} strokeWidth="1.6" />
    <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" stroke={muted ? '#0B4C6A' : '#1CA79B'} strokeWidth="1.6" />
  </svg>
);

const LockFilledIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
    <rect x="4.5" y="10.5" width="15" height="10" rx="2" fill="#fff" />
    <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" stroke="#fff" strokeWidth="1.6" fill="none" />
  </svg>
);

const EyeIcon = ({ crossed }: { crossed: boolean }) => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
    <path
      d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"
      stroke="#1CA79B"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="12" cy="12" r="3" stroke="#1CA79B" strokeWidth="1.5" />
    {crossed && <line x1="2" y1="21" x2="22" y2="3" stroke="#1CA79B" strokeWidth="1.5" strokeLinecap="round" />}
  </svg>
);

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" width="12" height="12" fill="none">
    <path d="M4 12.5 9.5 18 20 6" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18">
    <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.7-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z" />
    <path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1C3.4 21.3 7.4 24 12 24z" />
    <path fill="#FBBC05" d="M5.4 14.4c-.2-.7-.4-1.5-.4-2.4s.1-1.6.4-2.4V6.5H1.4C.5 8.2 0 10 0 12s.5 3.8 1.4 5.5l4-3.1z" />
    <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4C17.9 1.2 15.2 0 12 0 7.4 0 3.4 2.7 1.4 6.5l4 3.1C6.3 6.9 8.9 4.8 12 4.8z" />
  </svg>
);

const MicrosoftIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18">
    <rect x="2" y="2" width="9" height="9" fill="#F35325" />
    <rect x="13" y="2" width="9" height="9" fill="#81BC06" />
    <rect x="2" y="13" width="9" height="9" fill="#05A6F0" />
    <rect x="13" y="13" width="9" height="9" fill="#FFBA08" />
  </svg>
);

const ShieldCheckIcon = ({ size = 20 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none">
    <path
      d="M12 3 4.5 6v6c0 4.6 3.2 7.9 7.5 9 4.3-1.1 7.5-4.4 7.5-9V6L12 3z"
      stroke="#1CA79B"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
    <path d="M8.5 12.2 11 14.7l4.5-5" stroke="#1CA79B" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ShieldLockIcon = ({ size = 24 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" style={{ flexShrink: 0 }}>
    <path
      d="M12 3 4.5 6v6c0 4.6 3.2 7.9 7.5 9 4.3-1.1 7.5-4.4 7.5-9V6L12 3z"
      fill="url(#shieldGrad)"
    />
    <rect x="9.3" y="11.5" width="5.4" height="4.2" rx="1" fill="#fff" />
    <path d="M10.3 11.5v-1.4a1.7 1.7 0 0 1 3.4 0v1.4" stroke="#fff" strokeWidth="1.3" fill="none" />
    <defs>
      <linearGradient id="shieldGrad" x1="4.5" y1="3" x2="19.5" y2="21" gradientUnits="userSpaceOnUse">
        <stop stopColor="#1CA79B" />
        <stop offset="1" stopColor="#0B4C6A" />
      </linearGradient>
    </defs>
  </svg>
);

const HeadsetIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
    <path
      d="M4 13v-1a8 8 0 0 1 16 0v1"
      stroke="#4C8C93"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
    <rect x="3" y="13" width="4" height="6" rx="1.5" stroke="#4C8C93" strokeWidth="1.6" />
    <rect x="17" y="13" width="4" height="6" rx="1.5" stroke="#4C8C93" strokeWidth="1.6" />
    <path d="M19 19v1a2 2 0 0 1-2 2h-3" stroke="#4C8C93" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

const HeartbeatIcon = ({ size = 26 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none">
    <path
      d="M2 12h4l2-6 3 12 2-9 1.5 3H22"
      stroke="#0B4C6A"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const CameraIcon = ({ size = 26 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none">
    <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" stroke="#0B4C6A" strokeWidth="1.5" strokeLinejoin="round" />
    <circle cx="12" cy="13" r="3.2" stroke="#0B4C6A" strokeWidth="1.5" />
  </svg>
);

const FolderIcon = ({ size = 26 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none">
    <path d="M3 7a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7z" stroke="#0B4C6A" strokeWidth="1.5" strokeLinejoin="round" />
  </svg>
);

export default Login;