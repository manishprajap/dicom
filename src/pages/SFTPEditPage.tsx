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
    IonSelectOption,
    IonSelect,
    IonText,
    IonSpinner,
    IonIcon,
    useIonViewWillEnter,
    useIonRouter,
} from '@ionic/react';
import { eyeOutline, eyeOffOutline } from 'ionicons/icons';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import '../css/Signup.css';
import { SFTP_LIST_ROUTE } from './SFTPList';
import AppFooter from '../components/AppFooter';

const API_BASE_URL = 'https://aarnatechxperts.in/dicomapi/public/api';

const SFTPEditPage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const router = useIonRouter();

    const [notFound, setNotFound] = useState(false);
    const [loaded, setLoaded] = useState(false);

    // SFTP fields — same shape as AddSFTPDetails
    const [name, setName] = useState('');
    const [protocol, setProtocol] = useState('');
    const [host, setHost] = useState('');
    const [port, setPort] = useState('22');
    const [user, setUser] = useState('');
    const [password, setPassword] = useState('');
    const [loginType, setLoginType] = useState('normal');

    const [loading, setLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [showToast, setShowToast] = useState(false);

    // Single toggle is enough here — this page edits one record at a time,
    // not a list, so no need for a Set of revealed ids.
    const [showPassword, setShowPassword] = useState(false);

    useIonViewWillEnter(() => {
        setLoaded(false);
        setNotFound(false);

        const fetchRecord = async () => {
            try {
                const token = localStorage.getItem('token');

                const response = await fetch(`${API_BASE_URL}/getftp/${id}`, {
                    method: 'GET',
                    headers: {
                        Accept: 'application/json',
                        ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    },
                });

                if (response.status === 404) {
                    setNotFound(true);
                    setLoaded(true);
                    return;
                }

                const data = await response.json();

                if (!response.ok) {
                    setNotFound(true);
                    setLoaded(true);
                    return;
                }

                const record = data.data || data;

                setName(record.name || '');
                setProtocol(record.protocol || '');
                setHost(record.server_address || '');
                setPort(String(record.port || '22'));
                setUser(record.username || '');
                setPassword(record.password || '');
                setLoginType(record.loginType || 'normal');
                setNotFound(false);
                setLoaded(true);
            } catch (error) {
                console.error(error);
                setNotFound(true);
                setLoaded(true);
            }
        };

        fetchRecord();
    });

    const handleSaveSFTP = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        if (!name || !host || !port || !user || !password || !loginType) {
            setErrorMessage('Please fill all required fields.');
            setShowToast(true);
            setLoading(false);
            return;
        }

        try {
            const token = localStorage.getItem('token');

            const response = await fetch(`${API_BASE_URL}/updateftp/${id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                    name,
                    serverAddress: host,
                    port: Number(port),
                    username: user,
                    password,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                const firstError =
                    data?.errors && Object.values(data.errors)[0]
                        ? (Object.values(data.errors)[0] as string[])[0]
                        : data?.message || 'Error updating SFTP details. Please try again.';
                setErrorMessage(firstError);
                setShowToast(true);
                setLoading(false);
                return;
            }

            // Keep "sftpSelected" in sync too, in case another page reads it.
            const updatedRecord = data.data;
            if (updatedRecord) {
                localStorage.setItem(
                    'sftpSelected',
                    JSON.stringify({
                        id: String(updatedRecord.id),
                        user: updatedRecord.username,
                        host: updatedRecord.server_address,
                        port: String(updatedRecord.port),
                        password: updatedRecord.password,
                        name: updatedRecord.name,
                    })
                );
            }

            setErrorMessage(data.message || 'SFTP details updated successfully!');
            setShowToast(true);

            setTimeout(() => {
                router.push(SFTP_LIST_ROUTE, 'back');
            }, 1000);
        } catch (error) {
            console.error(error);
            setErrorMessage('Error updating SFTP details. Please try again.');
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
                    <IonTitle className="text-white text-center">Edit SFTP Details</IonTitle>
                </IonToolbar>
            </IonHeader>

            <IonContent fullscreen className="dicom-bg">
                <div className="signup-container">
                    <div className="signup-box">

                        {!loaded ? (
                            <div className="ion-text-center ion-padding">
                                <IonSpinner name="crescent" />
                            </div>
                        ) : notFound ? (
                            <IonText color="medium">
                                Connection not found. It may have been deleted.
                            </IonText>
                        ) : (
                            <form onSubmit={handleSaveSFTP}>
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

                                    <IonSelect
                                        value={protocol}
                                        placeholder="Select Protocol"
                                        onIonChange={(e) => setProtocol(e.detail.value)}
                                        interface="popover"
                                        className="custom-select"
                                    >
                                        <IonSelectOption value="sftp">
                                            SFTP - SSH File Transfer Protocol
                                        </IonSelectOption>

                                        <IonSelectOption value="ftp">
                                            FTP - File Transfer Protocol
                                        </IonSelectOption>

                                        <IonSelectOption value="ftps">
                                            FTPS - FTP Secure
                                        </IonSelectOption>
                                    </IonSelect>
                                </div>

                                <div className="field">
                                    <label>Host</label>
                                    <input
                                        type="text"
                                        placeholder="Enter host"
                                        value={host}
                                        onChange={(e) => setHost(e.target.value)}
                                        required
                                    />
                                </div>

                                <div className="field">
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
                                            style={{
                                                position: 'absolute',
                                                right: 0,
                                                top: '50%',
                                                transform: 'translateY(-50%)',
                                            }}
                                        >
                                            <IonIcon icon={showPassword ? eyeOffOutline : eyeOutline} />
                                        </IonButton>
                                    </div>
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
                                        {loading ? 'Saving...' : 'Save Changes'}
                                    </IonButton>

                                    <IonButton
                                        type="button"
                                        color="medium"
                                        className="signup-btn"
                                        onClick={() => router.push(SFTP_LIST_ROUTE, 'back')}
                                        style={{ flex: 1, height: '45px', minWidth: '120px' }}
                                        disabled={loading}
                                    >
                                        Cancel
                                    </IonButton>
                                </div>
                            </form>
                        )}
                    </div>
                </div>

                <IonToast
                    isOpen={showToast}
                    onDidDismiss={() => setShowToast(false)}
                    message={errorMessage}
                    duration={2000}
                    color={errorMessage.includes('successfully') ? 'success' : 'danger'}
                />
            </IonContent>
            <AppFooter/>
        </IonPage>
    );
};

export default SFTPEditPage;