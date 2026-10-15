import { 
    IonPage, IonContent, IonButton, IonText, IonToast, IonHeader, 
    useIonRouter, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon
} from '@ionic/react';
import { useState } from 'react';
import axios from 'axios';
import { eyeOutline, eyeOffOutline } from 'ionicons/icons';
import '../css/Signup.css';

type AccountType = 'individual' | 'group';

const Signup: React.FC = () => {
    const router = useIonRouter();

    const [accountType,     setAccountType]     = useState<AccountType | ''>('');

    const [name,            setName]            = useState('');
    const [email,           setEmail]           = useState('');
    const [mobile,          setMobile]          = useState('');
    const [password,        setPassword]        = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword,        setShowPassword]        = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    const [loading,          setLoading]          = useState(false);
    const [errorMessage,     setErrorMessage]     = useState('');
    const [showToast,        setShowToast]        = useState(false);
    const [successMessage,   setSuccessMessage]   = useState('');
    const [showSuccessToast, setShowSuccessToast] = useState(false);

    const handleSignup = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!accountType) {
            setErrorMessage('Please select an account type.');
            setShowToast(true);
            return;
        }

        if (password !== confirmPassword) {
            setErrorMessage('Passwords do not match.');
            setShowToast(true);
            return;
        }

        setLoading(true);

        try {
            const payload = {
                name,
                email,
                mobile,
                account_type: accountType,
                password,
                confirmPassword,
            };

            const response = await axios.post(
                'https://aarnatechxperts.in/dicomapi/public/api/register',
                payload
            );

            console.log('Signup response:', response.data);

            if (response.data.success) {
                const userData = response.data.data;

                localStorage.setItem('uData',  JSON.stringify(userData));
                localStorage.setItem('token',  response.data.token);
                localStorage.setItem('userId', userData.id);
                localStorage.setItem('role',   userData.role);

                setSuccessMessage('Your registration has been successfully completed!');
                setShowSuccessToast(true);

                setTimeout(() => {
                    if (router.canGoBack()) {
                        router.push('/');
                    } else {
                        window.location.replace('/');
                    }
                }, 2000);
            } else {
                setErrorMessage(response.data.message || 'Signup failed! Try again.');
                setShowToast(true);
            }
        } catch (error: any) {
            console.error('Signup error:', error);
            const msg =
                error?.response?.data?.message ||
                'An error occurred. Please try again.';
            setErrorMessage(msg);
            setShowToast(true);
        } finally {
            setLoading(false);
        }
    };

    return (
        <IonPage>
            <IonHeader>
                <IonToolbar className="custom-toolbar">
                    <IonButtons slot="start">
                        <IonBackButton defaultHref="/" color="light" />
                    </IonButtons>
                    <IonTitle className="text-white text-center">
                        Create new account
                    </IonTitle>
                </IonToolbar>
            </IonHeader>

            <IonContent fullscreen className="dicom-bg">
                <div className="signup-container">
                    <div className="signup-box">
                        
                        <form onSubmit={handleSignup}>

                            {/* Account Type */}
                            <div className="field full-width">
                                <label>Select Account Type<span className="required-star">*</span></label>
                                <select
                                    value={accountType}
                                    onChange={(e) => setAccountType(e.target.value as AccountType)}
                                    required
                                >
                                    <option value="" disabled>Select account type</option>
                                    <option value="individual">Individual</option>
                                    <option value="group">Group</option>
                                </select>
                            </div>

                            {/* ===== 2 COLUMN GRID ===== */}
                            <div className="form-grid">

                                <div className="field full-width">
                                    <label>Name<span className="required-star">*</span></label>
                                    <input
                                        type="text"
                                        placeholder="Enter your name"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        required
                                    />
                                </div>

                                <div className="field full-width">
                                    <label>Email<span className="required-star">*</span></label>
                                    <input
                                        type="email"
                                        placeholder="Enter your email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        required
                                    />
                                </div>

                                <div className="field full-width">
                                    <label>Mobile<span className="required-star">*</span></label>
                                    <input
                                        type="tel"
                                        placeholder="Enter your mobile number"
                                        value={mobile}
                                        onChange={(e) => setMobile(e.target.value)}
                                        required
                                        maxLength={11}
                                        pattern="[0-9]*"
                                        inputMode="numeric"
                                    />
                                </div>

                                <div className="field full-width">
                                    <label>Password<span className="required-star">*</span></label>
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        placeholder="******"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        required
                                    />
                                    <IonIcon
                                        icon={showPassword ? eyeOffOutline : eyeOutline}
                                        className="pw-eye"
                                        onClick={() => setShowPassword((prev) => !prev)}
                                    />
                                </div>

                                <div className="field full-width">
                                    <label>Confirm Password<span className="required-star">*</span></label>
                                    <input
                                        type={showConfirmPassword ? 'text' : 'password'}
                                        placeholder="******"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        required
                                    />
                                    <IonIcon
                                        icon={showConfirmPassword ? eyeOffOutline : eyeOutline}
                                        className="pw-eye"
                                        onClick={() => setShowConfirmPassword((prev) => !prev)}
                                    />
                                </div>

                            </div>

                            <IonButton
                                expand="block"
                                type="submit"
                                className="signup-btn"
                                disabled={loading}
                            >
                                {loading ? 'Creating Account...' : 'Create Account'}
                            </IonButton>
                        </form>

                        <IonText className="login-text">
                            Already have an account?{' '}
                            <span onClick={() => router.push('/')}>Login</span>
                        </IonText>
                    </div>
                </div>

                {/* Error Toast */}
                <IonToast
                    isOpen={showToast}
                    onDidDismiss={() => setShowToast(false)}
                    message={errorMessage}
                    duration={2500}
                    color="danger"
                />

                {/* Success Toast */}
                <IonToast
                    isOpen={showSuccessToast}
                    onDidDismiss={() => setShowSuccessToast(false)}
                    message={successMessage}
                    duration={2500}
                    color="success"
                />
            </IonContent>
        </IonPage>
    );
};

export default Signup;