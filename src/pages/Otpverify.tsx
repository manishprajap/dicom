import React, { useState, useRef, useEffect } from 'react';
import {
  IonPage, IonContent, IonHeader, IonToolbar, IonTitle,
  IonButtons, IonBackButton, IonButton, IonToast, IonIcon,
} from '@ionic/react';
import { useHistory, useLocation } from 'react-router-dom';
import { checkmarkCircleOutline, reloadOutline } from 'ionicons/icons';
import axios from 'axios';
import '../css/Login.css';

const BASE_URL = 'https://aarnatechxperts.in/dicomapi/public/api';

const ROLE_REDIRECTS: Record<string, string> = {
  super_admin: '/super-admin-dashboard',
  hospital_admin: '/hospital-admin-dashboard',
  hospital_user: '/hospital-user-dashboard',
  doctor: '/doctor-dashboard',
  patient: '/dashboard',
};

interface LocationState {
  mobile: string;
  from?: string;
}

const OtpVerify: React.FC = () => {
  const history = useHistory();
  const location = useLocation<LocationState>();

  const mobile = location.state?.mobile || '';
  const from = location.state?.from || 'login';

  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [verified, setVerified] = useState(false);
  const [timer, setTimer] = useState(60);

  const [toastMsg, setToastMsg] = useState('');
  const [toastColor, setToastColor] = useState<'success' | 'danger'>('danger');
  const [showToast, setShowToast] = useState(false);

  // ✅ Auto focus first input
  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  // ✅ Timer
  useEffect(() => {
    if (timer <= 0) return;
    const t = setInterval(() => setTimer(prev => prev - 1), 1000);
    return () => clearInterval(t);
  }, [timer]);

  const showMsg = (msg: string, color: 'success' | 'danger' = 'danger') => {
    setToastMsg(msg);
    setToastColor(color);
    setShowToast(true);
  };

  // ✅ OTP Change
  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d?$/.test(value)) return;

    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    if (value && index < otp.length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  // ✅ Backspace handling
  const handleOtpKeyDown = (
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (e.key === 'Backspace') {
      if (otp[index]) {
        const newOtp = [...otp];
        newOtp[index] = '';
        setOtp(newOtp);
      } else if (index > 0) {
        inputRefs.current[index - 1]?.focus();
      }
    }
  };

  // ✅ Paste handling
  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();

    const pasted = e.clipboardData
      .getData('text')
      .replace(/\D/g, '')
      .slice(0, otp.length);

    if (!pasted) return;

    const newOtp = pasted.split('');
    setOtp([...newOtp, ...Array(otp.length - newOtp.length).fill('')]);

    const lastIndex = newOtp.length - 1;
    if (lastIndex >= 0) {
      inputRefs.current[lastIndex]?.focus();
    }
  };

  const fullOtp = otp.join('');

  // ✅ Auto verify (optional UX boost)
  useEffect(() => {
    if (fullOtp.length === 6 && !loading) {
      handleVerify();
    }
  }, [otp]);

  // ✅ Verify API
  const handleVerify = async () => {
    if (fullOtp.length < 6) {
      showMsg('Please enter complete 6-digit OTP');
      return;
    }

    setLoading(true);
    try {
      const res = await axios.post(`${BASE_URL}/verify-otp`, {
        mobile,
        otp: fullOtp,
      });

      if (res.data.success) {
        setVerified(true);
        showMsg('OTP verified successfully!', 'success');

        const userData = res.data.data;
        const token = res.data.token;

        localStorage.setItem('uData', JSON.stringify(userData));
        localStorage.setItem('token', token);
        localStorage.setItem('userId', userData.id);
        localStorage.setItem('role', userData.role);

        setTimeout(() => {
          const path = ROLE_REDIRECTS[userData.role] ?? '/dashboard';
          history.push(path);
        }, 1500);
      } else {
        showMsg(res.data.message || 'Invalid OTP');
      }
    } catch {
      showMsg('Verification failed. Try again.');
    } finally {
      setLoading(false);
    }
  };

  // ✅ Resend OTP
  const handleResend = async () => {
    if (timer > 0) return;

    setResending(true);
    try {
      const res = await axios.post(`${BASE_URL}/send-otp`, { mobile });

      if (res.data.success) {
        setTimer(60);
        setOtp(['', '', '', '', '', '']);
        inputRefs.current[0]?.focus();
        showMsg('OTP resent successfully!', 'success');
      } else {
        showMsg(res.data.message || 'Failed to resend OTP');
      }
    } catch {
      showMsg('Failed to resend OTP');
    } finally {
      setResending(false);
    }
  };

  const maskedMobile = mobile
    ? mobile.slice(0, 2) + '******' + mobile.slice(-2)
    : '**********';

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar className="login-toolbar">
          <IonButtons slot="start">
            <IonBackButton defaultHref="/login" color="light" />
          </IonButtons>
          <IonTitle className="text-white text-center">
            OTP Verification
          </IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent fullscreen className="login-bg">
        <div className="login-container">
          <div className="login-box">

            <div className="otp-icon-wrap">
              {verified ? (
                <IonIcon icon={checkmarkCircleOutline} className="otp-success-icon" />
              ) : (
                <div className="otp-phone-icon">📱</div>
              )}
            </div>

            <h2 className="otp-title">
              {verified ? 'Verified!' : 'Enter OTP'}
            </h2>

            <p className="otp-subtitle">
              {verified
                ? 'Login successful. Redirecting...'
                : `6-digit OTP sent to ${maskedMobile}`}
            </p>

            {!verified && (
              <>
                {/* OTP Boxes */}
                <div className="otp-boxes" onPaste={handlePaste}>
                  {otp.map((digit, i) => (
                    <input
                      key={i}
                      ref={(el) => {
                        inputRefs.current[i] = el;
                      }}
                      className={`otp-box ${digit ? 'filled' : ''}`}
                      type="tel"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={1}
                      value={digit}
                      onChange={(e) =>
                        handleOtpChange(i, e.target.value)
                      }
                      onKeyDown={(e) =>
                        handleOtpKeyDown(i, e)
                      }
                    />
                  ))}
                </div>

                <IonButton
                  expand="block"
                  className="login-btn"
                  disabled={loading || fullOtp.length < 6}
                  onClick={handleVerify}
                >
                  {loading ? 'Verifying...' : 'Verify OTP'}
                </IonButton>

                {/* Resend */}
                <div className="otp-resend-row">
                  {timer > 0 ? (
                    <p className="otp-timer">
                      Resend OTP in <span>{timer}s</span>
                    </p>
                  ) : (
                    <button
                      className="otp-resend-btn"
                      onClick={handleResend}
                      disabled={resending}
                    >
                      <IonIcon icon={reloadOutline} style={{ marginRight: 4 }} />
                      {resending ? 'Resending...' : 'Resend OTP'}
                    </button>
                  )}
                </div>

                <p
                  className="otp-change-mobile"
                  onClick={() => history.goBack()}
                >
                  Wrong number? Go back
                </p>
              </>
            )}

          </div>
        </div>

        <IonToast
          isOpen={showToast}
          onDidDismiss={() => setShowToast(false)}
          message={toastMsg}
          duration={2500}
          color={toastColor}
        />
      </IonContent>
    </IonPage>
  );
};

export default OtpVerify;