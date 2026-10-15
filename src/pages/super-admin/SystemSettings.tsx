import React, { useState } from 'react';
import {
    IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
    IonButtons, IonBackButton, IonIcon, IonToast,
} from '@ionic/react';
import {
    settingsOutline, cloudOutline, cardOutline,
    notificationsOutline, lockClosedOutline, saveOutline,
} from 'ionicons/icons';
import '../../css/Superadmin.css';

const SystemSettings: React.FC = () => {
    const [toast, setToast] = useState('');

    // Storage settings
    const [storageLimit, setStorageLimit] = useState('50');
    const [autoClean,    setAutoClean]    = useState(true);

    // Payment settings
    const [gateway,      setGateway]      = useState<'razorpay' | 'stripe'>('razorpay');
    const [razorpayKey,  setRazorpayKey]  = useState('');
    const [stripeKey,    setStripeKey]    = useState('');

    // Notification settings
    const [emailNotif,   setEmailNotif]   = useState(true);
    const [pushNotif,    setPushNotif]    = useState(true);
    const [smsNotif,     setSmsNotif]     = useState(false);

    // Security settings
    const [otpEnabled,   setOtpEnabled]   = useState(true);
    const [sessionTimeout, setSessionTimeout] = useState('30');
    const [maxLoginAttempts, setMaxLoginAttempts] = useState('5');

    const handleSave = (section: string) => {
        // TODO: call API to save settings
        setToast(`${section} settings saved successfully!`);
    };

    return (
        <IonPage>
            <IonHeader>
                <IonToolbar className="custom-toolbar">
                    <IonButtons slot="start">
                        <IonBackButton defaultHref="/super-admin/dashboard" color="light" />
                    </IonButtons>
                    <IonTitle style={{ color: '#fff' }}>System Settings</IonTitle>
                </IonToolbar>
            </IonHeader>

            <IonContent className="dicom-bg ion-padding">

                {/* ── Storage Settings ── */}
                <div className="sa-settings-section">
                    <div className="sa-settings-header">
                        <IonIcon icon={cloudOutline} className="sa-settings-icon" />
                        <span>Storage Settings</span>
                    </div>

                    <label className="sa-label">Default Storage Limit per Hospital (GB)</label>
                    <input className="sa-input" type="number" value={storageLimit}
                        onChange={e => setStorageLimit(e.target.value)} placeholder="e.g. 50" />

                    <div className="sa-toggle-row">
                        <span className="sa-toggle-label">Auto-clean old temp files</span>
                        <div className={`sa-toggle ${autoClean ? 'on' : ''}`}
                            onClick={() => setAutoClean(!autoClean)}>
                            <div className="sa-toggle-thumb" />
                        </div>
                    </div>

                    <button className="sa-btn-save" style={{ marginTop: 12 }} onClick={() => handleSave('Storage')}>
                        <IonIcon icon={saveOutline} style={{ marginRight: 6 }} /> Save Storage Settings
                    </button>
                </div>

                {/* ── Payment Gateway ── */}
                <div className="sa-settings-section">
                    <div className="sa-settings-header">
                        <IonIcon icon={cardOutline} className="sa-settings-icon" />
                        <span>Payment Gateway</span>
                    </div>

                    <div className="sa-tab-row">
                        <button className={`sa-tab ${gateway === 'razorpay' ? 'active' : ''}`}
                            onClick={() => setGateway('razorpay')}>Razorpay</button>
                        <button className={`sa-tab ${gateway === 'stripe' ? 'active' : ''}`}
                            onClick={() => setGateway('stripe')}>Stripe</button>
                    </div>

                    {gateway === 'razorpay' ? (
                        <>
                            <label className="sa-label">Razorpay Key ID</label>
                            <input className="sa-input" value={razorpayKey}
                                onChange={e => setRazorpayKey(e.target.value)}
                                placeholder="rzp_live_xxxxxxxxxx" />
                        </>
                    ) : (
                        <>
                            <label className="sa-label">Stripe Publishable Key</label>
                            <input className="sa-input" value={stripeKey}
                                onChange={e => setStripeKey(e.target.value)}
                                placeholder="pk_live_xxxxxxxxxx" />
                        </>
                    )}

                    <button className="sa-btn-save" style={{ marginTop: 12 }} onClick={() => handleSave('Payment')}>
                        <IonIcon icon={saveOutline} style={{ marginRight: 6 }} /> Save Payment Settings
                    </button>
                </div>

                {/* ── Notifications ── */}
                <div className="sa-settings-section">
                    <div className="sa-settings-header">
                        <IonIcon icon={notificationsOutline} className="sa-settings-icon" />
                        <span>Notification Settings</span>
                    </div>

                    {[
                        { label: 'Email Notifications', value: emailNotif, set: setEmailNotif },
                        { label: 'Push Notifications',  value: pushNotif,  set: setPushNotif  },
                        { label: 'SMS Notifications',   value: smsNotif,   set: setSmsNotif   },
                    ].map(n => (
                        <div className="sa-toggle-row" key={n.label}>
                            <span className="sa-toggle-label">{n.label}</span>
                            <div className={`sa-toggle ${n.value ? 'on' : ''}`}
                                onClick={() => n.set(!n.value)}>
                                <div className="sa-toggle-thumb" />
                            </div>
                        </div>
                    ))}

                    <button className="sa-btn-save" style={{ marginTop: 12 }} onClick={() => handleSave('Notification')}>
                        <IonIcon icon={saveOutline} style={{ marginRight: 6 }} /> Save Notification Settings
                    </button>
                </div>

                {/* ── Security ── */}
                <div className="sa-settings-section">
                    <div className="sa-settings-header">
                        <IonIcon icon={lockClosedOutline} className="sa-settings-icon" />
                        <span>Security Settings</span>
                    </div>

                    <div className="sa-toggle-row">
                        <span className="sa-toggle-label">Mobile OTP on Login</span>
                        <div className={`sa-toggle ${otpEnabled ? 'on' : ''}`}
                            onClick={() => setOtpEnabled(!otpEnabled)}>
                            <div className="sa-toggle-thumb" />
                        </div>
                    </div>

                    <label className="sa-label">Session Timeout (minutes)</label>
                    <input className="sa-input" type="number" value={sessionTimeout}
                        onChange={e => setSessionTimeout(e.target.value)} placeholder="30" />

                    <label className="sa-label">Max Login Attempts</label>
                    <input className="sa-input" type="number" value={maxLoginAttempts}
                        onChange={e => setMaxLoginAttempts(e.target.value)} placeholder="5" />

                    <button className="sa-btn-save" style={{ marginTop: 12 }} onClick={() => handleSave('Security')}>
                        <IonIcon icon={saveOutline} style={{ marginRight: 6 }} /> Save Security Settings
                    </button>
                </div>

                <IonToast isOpen={!!toast} message={toast} duration={2200}
                    onDidDismiss={() => setToast('')} color="success" />
            </IonContent>
        </IonPage>
    );
};

export default SystemSettings;