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
    IonText,
    IonSpinner,
    IonIcon,
    useIonViewWillEnter,
    useIonRouter,
} from '@ionic/react';
import { eyeOutline, eyeOffOutline } from 'ionicons/icons';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import '../css/AwsConfig.css';
import AppFooter from '../components/AppFooter';

const API_BASE_URL = 'https://aarnatechxperts.in/dicomapi/public/api';

const AwsConfigEdit: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const router = useIonRouter();

    const [notFound, setNotFound] = useState(false);
    const [loaded, setLoaded] = useState(false);

    const [bucketName, setBucketName] = useState('');
    const [region, setRegion] = useState('');
    const [accessKey, setAccessKey] = useState('');
    const [secretKey, setSecretKey] = useState('');
    const [showSecretKey, setShowSecretKey] = useState(false);

    const [loading, setLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [showToast, setShowToast] = useState(false);

    useIonViewWillEnter(() => {
        setLoaded(false);
        setNotFound(false);

        const fetchRecord = async () => {
            try {
                const token = localStorage.getItem('token');

                const response = await fetch(`${API_BASE_URL}/getaws/${id}`, {
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

                setBucketName(record.bucket_name || '');
                setRegion(record.region || '');
                setAccessKey(record.access_key || '');
                setSecretKey(record.secret_key || '');
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

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        if (!bucketName || !region || !accessKey || !secretKey) {
            setErrorMessage('Please fill all required fields.');
            setShowToast(true);
            setLoading(false);
            return;
        }

        try {
            const token = localStorage.getItem('token');

            const response = await fetch(`${API_BASE_URL}/updateaws/${id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                    bucketName,
                    region,
                    accessKey,
                    secretKey,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                const firstError =
                    data?.errors && Object.values(data.errors)[0]
                        ? (Object.values(data.errors)[0] as string[])[0]
                        : data?.message || 'Error updating AWS configuration. Please try again.';
                setErrorMessage(firstError);
                setShowToast(true);
                setLoading(false);
                return;
            }

            setErrorMessage(data.message || 'AWS configuration updated successfully!');
            setShowToast(true);

            setTimeout(() => {
                router.push('/awsConfiglist', 'back');
            }, 1000);
        } catch (error) {
            console.error(error);
            setErrorMessage('Error updating AWS configuration. Please try again.');
            setShowToast(true);
        } finally {
            setLoading(false);
        }
    };

    return (
        <IonPage>
            <IonHeader translucent={true}>
                <IonToolbar className="custom-toolbar">
                    <IonButtons slot="start">
                        <IonBackButton defaultHref="/awsConfiglist" color="light" />
                    </IonButtons>
                    <IonTitle className="text-white text-center">Edit AWS Configuration</IonTitle>
                </IonToolbar>
            </IonHeader>

            <IonContent fullscreen className="dicom-bg">
                <div className="awsconfig-container">
                    <div className="awsconfig-box">

                        {!loaded ? (
                            <div className="ion-text-center ion-padding">
                                <IonSpinner name="crescent" />
                            </div>
                        ) : notFound ? (
                            <IonText color="medium">
                                Configuration not found. It may have been deleted.
                            </IonText>
                        ) : (
                            <form onSubmit={handleSave} className="aws-form">
                                <div className="field">
                                    <label>Bucket Name</label>
                                    <input
                                        type="text"
                                        placeholder="Enter S3 bucket name"
                                        value={bucketName}
                                        onChange={(e) => setBucketName(e.target.value)}
                                        required
                                    />
                                </div>

                                <div className="field">
                                    <label>Region</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. ap-south-1"
                                        value={region}
                                        onChange={(e) => setRegion(e.target.value)}
                                        required
                                    />
                                </div>

                                <div className="field">
                                    <label>Access Key ID</label>
                                    <input
                                        type="text"
                                        placeholder="AWS Access Key ID"
                                        value={accessKey}
                                        onChange={(e) => setAccessKey(e.target.value)}
                                        required
                                    />
                                </div>

                                <div className="field">
                                    <label>Secret Access Key</label>
                                    <div style={{ position: 'relative' }}>
                                        <input
                                            type={showSecretKey ? 'text' : 'password'}
                                            placeholder="AWS Secret Key"
                                            value={secretKey}
                                            onChange={(e) => setSecretKey(e.target.value)}
                                            required
                                            style={{ paddingRight: '40px' }}
                                        />
                                        <IonButton
                                            fill="clear"
                                            size="small"
                                            className="reveal-btn"
                                            onClick={() => setShowSecretKey((s) => !s)}
                                            style={{
                                                position: 'absolute',
                                                right: 0,
                                                top: '50%',
                                                transform: 'translateY(-50%)',
                                            }}
                                        >
                                            <IonIcon icon={showSecretKey ? eyeOffOutline : eyeOutline} />
                                        </IonButton>
                                    </div>
                                </div>

                                <div className="button-group">
                                    <IonButton
                                        expand="block"
                                        type="submit"
                                        className="save-btn"
                                        disabled={loading}
                                    >
                                        {loading ? 'Saving...' : 'Save Changes'}
                                    </IonButton>

                                    <IonButton
                                        expand="block"
                                        color="medium"
                                        className="cancel-btn"
                                        onClick={() => router.push('/awsConfiglist', 'back')}
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

export default AwsConfigEdit;