import {
    IonPage,
    IonContent,
    IonButton,
    IonToast,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    useIonRouter,
    IonIcon,
} from '@ionic/react';
import { useState } from 'react';
import '../css/Signup.css';
import { SFTP_LIST_ROUTE } from './SFTPList';
import { eyeOutline, eyeOffOutline } from 'ionicons/icons';
import AppFooter from '../components/AppFooter';

const API_BASE_URL = 'https://aarnatechxperts.in/dicomapi/public/api';

const AddSFTPDetails: React.FC = () => {

    const router = useIonRouter();

    // SFTP fields
    const [name, setName] = useState(''); // connection name
    const [protocol, setProtocol] = useState('');
    const [host, setHost] = useState('');
    const [port, setPort] = useState('22'); // default port
    const [user, setUser] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [password, setPassword] = useState('');
    const [loginType, setLoginType] = useState('normal');
    const [folderPath, setFolderPath] = useState(''); // 👈 Naya state upload folder path ke liye

    const [loading, setLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [showToast, setShowToast] = useState(false);

    const handleAddSFTP = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        if (!name || !protocol || !host || !port || !user || !password || !loginType|| !folderPath) {
            setErrorMessage('Please fill all required fields.');
            setShowToast(true);
            setLoading(false);
            return;
        }

        try {
            const userID = localStorage.getItem('userId') || localStorage.getItem('user_id');

            if (!userID) {
                setErrorMessage('User not logged in. Please login again.');
                setShowToast(true);
                setLoading(false);
                return;
            }

            const token = localStorage.getItem('token');

            const response = await fetch(`${API_BASE_URL}/storeftp`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                    userID,
                    name,
                    serverAddress: host,
                    port: Number(port),
                    username: user,
                    password, 
                    remoteFolder: folderPath || '/root', 
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                const firstError =
                    data?.errors && Object.values(data.errors)[0]
                        ? (Object.values(data.errors)[0] as string[])[0]
                        : data?.message || 'Error saving SFTP details. Please try again.';
                setErrorMessage(firstError);
                setShowToast(true);
                setLoading(false);
                return;
            }

            setErrorMessage(data.message || 'SFTP details added successfully!');
            setShowToast(true);

            setTimeout(() => {
                router.push(SFTP_LIST_ROUTE, 'back');
            }, 1500);
        } catch (error) {
            console.error(error);
            setErrorMessage('Error saving SFTP details. Please try again.');
            setShowToast(true);
        } finally {
            setLoading(false);
        }
    };

    return (
        <IonPage>
            <IonHeader translucent={true}>
                <IonToolbar className='custom-toolbar'>
                    <IonButtons slot="start">
                        <IonBackButton defaultHref={SFTP_LIST_ROUTE} color="light" />
                    </IonButtons>
                    <IonTitle className="text-white text-center">Add SFTP Details</IonTitle>
                </IonToolbar>
            </IonHeader>

            <IonContent fullscreen className="dicom-bg">
                <div className="signup-container">
                    <div className="signup-box">

                        <form onSubmit={handleAddSFTP}>
                            <div className="field">
                                <label>Connection Name</label>
                                <input
                                    type="text"
                                    placeholder="Enter a name for this connection"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    required
                                />
                            </div>

                            <div className="field">
                                <label>Protocol</label>
                                <select
                                    value={protocol}
                                    onChange={(e) => setProtocol(e.target.value)}
                                    required
                                >
                                    <option value="" disabled>Select type</option>
                                    <option value="sftp">SFTP - SSH File Transfer Protocol</option>
                                    <option value="ftp">FTP - File Transfer Protocol</option>
                                    <option value="ftps">FTPS - FTP Secure</option>
                                </select>
                            </div>

                            {/* Host aur Port ek hi row me */}
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <div className="field" style={{ flex: 2 }}>
                                    <label>Host</label>
                                    <input
                                        type="text"
                                        placeholder="Enter host"
                                        value={host}
                                        onChange={(e) => setHost(e.target.value)}
                                        required
                                    />
                                </div>

                                <div className="field" style={{ flex: 1 }}>
                                    <label>Port</label>
                                    <input
                                        type="number"
                                        placeholder="Enter port"
                                        value={port}
                                        onChange={(e) => setPort(e.target.value)}
                                        required
                                        min={1}
                                        max={65535}
                                    />
                                </div>
                            </div>

                            <div className="field">
                                <label>User</label>
                                <input
                                    type="text"
                                    placeholder="Enter username"
                                    value={user}
                                    onChange={(e) => setUser(e.target.value)}
                                    required
                                />
                            </div>

                            <div className="field">
                                <label>Password</label>
                                <div style={{ position: 'relative' }}>
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        placeholder="Enter password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        required
                                        style={{ paddingRight: '40px' }}
                                    />
                                    <IonButton
                                        fill="clear"
                                        size="small"
                                        className="reveal-btn"
                                        onClick={() => setShowPassword((s) => !s)}
                                        style={{ position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)' }}
                                    >
                                        <IonIcon icon={showPassword ? eyeOffOutline : eyeOutline} />
                                    </IonButton>
                                </div>
                            </div>

                            {/* 👈 Naya Field: Target Directory / Folder Path */}
                            <div className="field">
                                <label>Remote Folder Path</label>
                                <input
                                    type="text"
                                    placeholder="e.g. /var/www/uploads or /"
                                    value={folderPath}
                                    onChange={(e) => setFolderPath(e.target.value)}
                                />
                            </div>

                            <div className="field">
                                <label>Login Type</label>
                                <select
                                    value={loginType}
                                    onChange={(e) => setLoginType(e.target.value)}
                                    required
                                >
                                    <option value="normal">Normal</option>
                                </select>
                            </div>

                            <div style={{ display: 'flex', gap: '10px', marginTop: '1rem' }}>
                                <IonButton
                                    type="submit"
                                    className="signup-btn"
                                    disabled={loading}
                                    style={{ flex: 1, height: '45px', minWidth: '120px' }}
                                >
                                    {loading ? 'Adding...' : 'Save'}
                                </IonButton>

                                <IonButton
                                    type="button"
                                    color="medium"
                                    className="signup-btn"
                                    onClick={() => {
                                        setName('');
                                        setProtocol('');
                                        setHost('');
                                        setPort('22');
                                        setUser('');
                                        setPassword('');
                                        setFolderPath('');
                                        setLoginType('normal');
                                    }}
                                    style={{ flex: 1, height: '45px', minWidth: '120px' }}
                                    disabled={loading}
                                >
                                    Reset
                                </IonButton>
                            </div>

                        </form>
                    </div>
                </div>

                <IonToast
                    isOpen={showToast}
                    onDidDismiss={() => setShowToast(false)}
                    message={errorMessage}
                    duration={2500}
                    color={errorMessage.includes('successfully') ? 'success' : 'danger'}
                />
            </IonContent>
            <AppFooter/>
        </IonPage>
    );
};

export default AddSFTPDetails;