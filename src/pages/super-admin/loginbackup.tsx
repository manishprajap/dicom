import {
  IonPage, IonContent, IonButton, IonText, IonToast,
  IonHeader, IonToolbar, IonTitle, IonIcon,
} from '@ionic/react';
import { useState } from 'react';
import { useHistory } from 'react-router-dom';
import { mailOutline, callOutline, logoGoogle } from 'ionicons/icons';
import axios from 'axios';
import '../css/Login.css';

// ─── Role → frontend route ───────────────────────────────
const ROLE_REDIRECTS: Record<string, string> = {
  super_admin: '/super-admin-dashboard',
  hospital_admin: '/hospital-admin-dashboard',
  hospital_user: '/hospital-user-dashboard',
  doctor: '/doctor-dashboard',
  patient: '/dashboard',
};

// ─── i18n strings ────────────────────────────────────────
const LANG: Record<string, Record<string, string>> = {
  en: {
    title: 'Login',
    emailTab: 'Email',
    phoneTab: 'Phone / OTP',
    emailLabel: 'Email',
    emailPH: 'Enter your email',
    passwordLabel: 'Password',
    passwordPH: 'Enter your password',
    mobileLabel: 'Mobile Number',
    mobilePH: 'Enter 10-digit mobile number',
    sendOtp: 'Send OTP',
    sending: 'Sending...',
    loginBtn: 'Login',
    loggingIn: 'Logging in...',
    noAccount: "Don't have an account?",
    signUp: 'Sign up',
    show: 'Show',
    hide: 'Hide',
    orGoogle: 'Or continue with',
    otpSent: 'OTP sent to your mobile!',
  },
  hi: {
    title: 'लॉगिन',
    emailTab: 'ईमेल',
    phoneTab: 'फ़ोन / OTP',
    emailLabel: 'ईमेल',
    emailPH: 'अपना ईमेल डालें',
    passwordLabel: 'पासवर्ड',
    passwordPH: 'अपना पासवर्ड डालें',
    mobileLabel: 'मोबाइल नंबर',
    mobilePH: '10 अंकों का मोबाइल नंबर',
    sendOtp: 'OTP भेजें',
    sending: 'भेज रहे हैं...',
    loginBtn: 'लॉगिन',
    loggingIn: 'लॉग इन हो रहा है...',
    noAccount: 'खाता नहीं है?',
    signUp: 'साइन अप करें',
    show: 'दिखाएं',
    hide: 'छुपाएं',
    orGoogle: 'या जारी रखें',
    otpSent: 'OTP आपके मोबाइल पर भेजा गया!',
  },
};

const BASE_URL = 'https://aarnatechxperts.in/dicomapi/public/api';

// ─── Component ───────────────────────────────────────────
const Login: React.FC = () => {
  const history = useHistory();

  // Language
  const [lang, setLang] = useState<'en' | 'hi'>('en');
  const t = LANG[lang];

  // Tab: 'email' | 'phone'
  const [tab, setTab] = useState<'email' | 'phone'>('email');

  // Email login
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);

  // Phone login
  const [mobile, setMobile] = useState('');
  const [otpSent, setOtpSent] = useState(false);

  // UI state
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [toastColor, setToastColor] = useState<'danger' | 'success'>('danger');
  const [showToast, setShowToast] = useState(false);

  const showMsg = (msg: string, color: 'danger' | 'success' = 'danger') => {
    setToastMsg(msg);
    setToastColor(color);
    setShowToast(true);
  };

  // ── Save session & redirect ──────────────────────────────
  const saveAndRedirect = (data: any, token: string) => {
    localStorage.setItem('uData', JSON.stringify(data));
    localStorage.setItem('token', token);
    localStorage.setItem('userId', data.id);
    localStorage.setItem('role', data.role);
    const path = ROLE_REDIRECTS[data.role] ?? '/dashboard';
    history.push(path);
  };

  // ── Email login ──────────────────────────────────────────
  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await axios.post(`${BASE_URL}/login`, { email, password });
      if (res.data.success) {
        saveAndRedirect(res.data.data, res.data.token);
      } else {
        showMsg(res.data.message || 'Invalid email or password!');
      }
    } catch {
      showMsg('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Send OTP ─────────────────────────────────────────────
  const handleSendOtp = async () => {
    setSending(true);

    try {
      const res = await axios.post(`${BASE_URL}/login-with-otp`, {
        email,
        password,
      });

      if (res.data.success) {
        history.push('/otp-verify', {
          mobile: res.data.mobile,
          from: 'login'
        });
      } else {
        alert(res.data.message);
      }

    } catch {
      alert('Login failed');
    } finally {
      setSending(false);
    }
  };

  // ── Google login ─────────────────────────────────────────
  const handleGoogleLogin = () => {
    // TODO: Integrate Firebase Google Auth or OAuth
    showMsg('Google login coming soon!', 'success');
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar className="login-toolbar">
          {/* Language switcher */}
          <div slot="end" style={{ display: 'flex', gap: 6, marginRight: 12 }}>
            {(['en', 'hi'] as const).map(l => (
              <button key={l}
                onClick={() => setLang(l)}
                style={{
                  padding: '3px 10px', borderRadius: 20, border: 'none', cursor: 'pointer',
                  fontSize: 12, fontWeight: 600,
                  background: lang === l ? '#fff' : 'rgba(255,255,255,0.2)',
                  color: lang === l ? '#00a0a0' : '#fff',
                }}>
                {l === 'en' ? 'EN' : 'हि'}
              </button>
            ))}
          </div>
          <IonTitle className="text-white w-full text-center font-semibold">
            {t.title}
          </IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent fullscreen className="login-bg">
        <div className="login-container">
          <div className="login-box">

            <img src="./logo2.png" alt="logo" style={{ marginBottom: 16 }} />

            {/* ── Tab switcher ── */}
            <div className="login-tab-row">
              <button
                className={`login-tab ${tab === 'email' ? 'active' : ''}`}
                onClick={() => setTab('email')}
              >
                <IonIcon icon={mailOutline} style={{ marginRight: 6 }} />
                {t.emailTab}
              </button>
              <button
                className={`login-tab ${tab === 'phone' ? 'active' : ''}`}
                onClick={() => setTab('phone')}
              >
                <IonIcon icon={callOutline} style={{ marginRight: 6 }} />
                {t.phoneTab}
              </button>
            </div>

            {/* ── Email login form ── */}
            {tab === 'email' && (
              <form onSubmit={handleEmailLogin}>
                <div className="field">
                  <label>{t.emailLabel}</label>
                  <input type="email" placeholder={t.emailPH}
                    value={email} onChange={e => setEmail(e.target.value)} required />
                </div>

                <div className="field">
                  <label>{t.passwordLabel}</label>
                  <div className="pw-wrap">
                    <input
                      type={show ? 'text' : 'password'}
                      placeholder={t.passwordPH}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      required
                    />
                    <button type="button" className="pw-show" onClick={() => setShow(!show)}>
                      {show ? t.hide : t.show}
                    </button>
                  </div>
                </div>

                <IonButton expand="block" type="submit" className="login-btn" disabled={loading}>
                  {loading ? t.loggingIn : t.loginBtn}
                </IonButton>
              </form>
            )}

            {/* ── Phone / OTP login ── */}
            {tab === 'phone' && (
              <div>
                <div className="field">
                  <label>{t.mobileLabel}</label>
                  <input
                    type="tel" placeholder={t.mobilePH}
                    value={mobile}
                    onChange={e => setMobile(e.target.value.replace(/\D/, '').slice(0, 10))}
                    maxLength={10} inputMode="numeric"
                  />
                </div>

                <IonButton expand="block" className="login-btn" disabled={sending}
                  onClick={handleSendOtp}>
                  {sending ? t.sending : t.sendOtp}
                </IonButton>

                <p style={{ textAlign: 'center', fontSize: 14 }}>
                  OTP will be sent to your registered mobile number
                </p>
              </div>
            )}

            {/* ── Divider ── */}
            <div className="login-divider">
              <span>{t.orGoogle}</span>
            </div>

            {/* ── Google login ── */}
            <button className="google-btn" onClick={handleGoogleLogin}>
              <IonIcon icon={logoGoogle} style={{ fontSize: 20, color: '#EA4335', marginRight: 10 }} />
              Continue with Google
            </button>

            <IonText className="signup-text">
              {t.noAccount}{' '}
              <span onClick={() => history.push('/signup')}>{t.signUp}</span>
            </IonText>
          </div>
        </div>

        <IonToast isOpen={showToast} onDidDismiss={() => setShowToast(false)}
          message={toastMsg} duration={2500} color={toastColor} />
      </IonContent>
    </IonPage>
  );
};

export default Login;