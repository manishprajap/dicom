import {
    IonPage, IonContent, IonButton, IonText, IonToast, IonHeader,
    IonToolbar, IonTitle, IonButtons, IonBackButton, IonItem, IonLabel,
    IonSelect, IonSelectOption,
} from '@ionic/react';
import { useState } from 'react';
import axios from 'axios';
import { useHistory } from 'react-router-dom';
import '../css/SaveServerDetails.css';
import AppFooter from '../components/AppFooter';

const SaveServerDetails: React.FC = () => {
    const history = useHistory();

    const [hostname, setHostname] = useState('');
    const [ips, setIps] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [show, setShow] = useState(false);
    const [port, setPort] = useState('');
    const [callingAETitle, setCallingAETitle] = useState('');
    const [connectionTimeout, setConnectionTimeout] = useState('');
    const [responseTimeout, setResponseTimeout] = useState('');
    const [preferredCharset, setPreferredCharset] = useState('UTF-8');
    const [tlsSupport, setTlsSupport] = useState(false);
    const [description, setDescription] = useState('');
    const [loading, setLoading] = useState(false);
    const [showToast, setShowToast] = useState(false);
    const [toastColor, setToastColor] = useState<'success' | 'danger'>('success');
    const [errorMessage, setErrorMessage] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            setLoading(true);
            const userId = localStorage.getItem('userId') || '1';
            const response = await axios.post('https://aarnatechxperts.in/dicomapi/public/api/hostuser', {
                userId,
                hostname,
                ips,
                port,
                username,
                password,
                callingAETitle,
                calledAETitle: callingAETitle,
                connectionTimeout,
                responseTimeout,
                preferredCharset,
                tlsSupport,
                description,
            });
            console.log('Saved:', response.data);
            setToastColor('success');
            setErrorMessage('Server details saved successfully');
            setShowToast(true);
            history.push('/serverdetailslist');
        } catch (error: any) {
            console.error(error);
            const msg = error?.response?.data?.message || 'Failed to save data';
            setToastColor('danger');
            setErrorMessage(msg);
            setShowToast(true);
        } finally {
            setLoading(false);
        }
    };

    const handleGoBack = () => {
        if (history.length > 2) {
            history.goBack();
        } else {
            history.replace('/serverdetailslist');
        }
    };

    return (
        <IonPage>
            <div className="safe-area-top"></div>
            <IonHeader translucent={true}>
                <IonToolbar className="custom-toolbar">
                    <IonButtons slot="start">
                        <IonBackButton defaultHref="/dashboard" color="light" />
                    </IonButtons>
                    <IonTitle className="text-white text-center">
                        Dicom Server Setup
                    </IonTitle>
                </IonToolbar>
            </IonHeader>

            <IonContent fullscreen className="ion-padding dicom-bg">

                <div className="signup-container">
                    <div className="server-box">
                        <form onSubmit={handleSubmit}>

                            {/* --- 2 Column Fields --- */}
                            <div className="form-grid">
                                <div className="field">
                                    <label>Hostname <span className="required-star">*</span></label>
                                    <input type="text" placeholder="Enter Hostname" value={hostname} onChange={(e) => setHostname(e.target.value)} required />
                                </div>
                                <div className="field">
                                    <label>IP <span className="required-star">*</span></label>
                                    <input type="text" placeholder="Enter IPs" value={ips} onChange={(e) => setIps(e.target.value)} required />
                                </div>

                                <div className="field">
                                    <label>Port <span className="required-star">*</span></label>
                                    <input type="text" placeholder="Enter Port" value={port} onChange={(e) => setPort(e.target.value)} required />
                                </div>

                                <div className="field">
                                    <label>AE Title <span className="required-star">*</span></label>
                                    <input type="text" placeholder="Enter AE Title" value={callingAETitle} onChange={(e) => setCallingAETitle(e.target.value)} required />
                                </div>

                                <div className="field">
                                    <label>Username (Optional)</label>
                                    <input type="text" placeholder="Enter Username" value={username} onChange={(e) => setUsername(e.target.value)} />
                                </div>

                                <div className="field">
                                    <label>Password (Optional)</label>
                                    <div className="pw-wrap">
                                        <input
                                            type={show ? 'text' : 'password'}
                                            placeholder="Enter Password"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                        />
                                        <button type="button" className="pw-show" onClick={() => setShow(!show)}>
                                            {show ? 'Hide' : 'Show'}
                                        </button>
                                    </div>
                                </div>

                                <div className="field">
                                    <label>Connection Timeout (ms) (Optional)</label>
                                    <input type="text" placeholder="Enter Connection Timeout" value={connectionTimeout} onChange={(e) => setConnectionTimeout(e.target.value)} />
                                </div>

                                <div className="field">
                                    <label>Response Timeout (ms) (Optional)</label>
                                    <input type="text" placeholder="Enter Response Timeout" value={responseTimeout} onChange={(e) => setResponseTimeout(e.target.value)} />
                                </div>

                                <div className="field">
                                    <label>Description (Optional)</label>
                                    <textarea placeholder="Enter description here" value={description} onChange={(e) => setDescription(e.target.value)}></textarea>
                                </div>
                            </div>

                            {/* --- Charset + TLS Row --- */}
                            <div className="form-row">
                                <IonItem className="ion-no-padding ion-no-margin glass-item utf-8">
                                    <IonLabel>Preferred Charset (Optional)</IonLabel>
                                    <IonSelect
                                        value={preferredCharset}
                                        onIonChange={(e) => setPreferredCharset(e.detail.value!)}
                                        interface="popover"
                                        interfaceOptions={{
                                            cssClass: 'custom-select-popover'
                                        }}
                                    >
                                        <IonSelectOption value="UTF-8">UTF-8</IonSelectOption>
                                        <IonSelectOption value="ISO-8859-1">ISO-8859-1</IonSelectOption>
                                        <IonSelectOption value="ISO-2022-JP">ISO-2022-JP</IonSelectOption>
                                    </IonSelect>
                                </IonItem>

                                <IonItem className="ion-no-padding ion-no-margin glass-item utf-8">
                                    <IonLabel>TLS Support (Optional)</IonLabel>
                                    <div
                                        onClick={() => setTlsSupport(!tlsSupport)}
                                        className={`toggle ${tlsSupport ? 'on' : 'off'}`}
                                    >
                                        <div className="dot"></div>
                                    </div>
                                </IonItem>
                            </div>

                            {/* --- Buttons --- */}
                            <div className="btn-group">
                                <IonButton expand="block" type="submit" className="save-btn" disabled={loading}>
                                    {loading ? 'Saving...' : 'Save'}
                                </IonButton>
                                {/* <button
                                    type="button"
                                    className="back-btn"
                                    onClick={handleGoBack}
                                >
                                    Go Back
                                </button> */}
                            </div>
                        </form>
                    </div>
                </div>

                <IonToast
                    isOpen={showToast}
                    onDidDismiss={() => setShowToast(false)}
                    message={errorMessage}
                    duration={2500}
                    color={toastColor}
                />
            </IonContent>
            <AppFooter/>
        </IonPage>
    );
};

export default SaveServerDetails;