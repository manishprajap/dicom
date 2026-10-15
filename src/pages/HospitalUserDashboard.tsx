import {
    IonPage, IonContent, IonHeader, IonToolbar, IonTitle,
    IonButton, IonIcon,
} from '@ionic/react';
import { useHistory } from 'react-router-dom';
import {
    documentTextOutline, searchOutline, cloudUploadOutline,
    logOutOutline, personOutline, timeOutline, checkmarkCircleOutline,
    folderOpenOutline,
} from 'ionicons/icons';
import "../css/Dashboard.css";

const LEFT_CARD_COLOR = "#8cdcc8";
const RIGHT_CARD_COLOR = "#00a0a0";
const HospitalUserDashboard: React.FC = () => {
    const history = useHistory();
    const uData = JSON.parse(localStorage.getItem('uData') || '{}');

    const handleLogout = () => {
        localStorage.clear();
        history.push('/login');
    };

    const recentFiles = [
        { name: 'CT_Scan_Rahul.dcm', date: 'Today 10:30 AM', status: 'Uploaded' },
        { name: 'MRI_Priya.dcm', date: 'Today 09:15 AM', status: 'Processing' },
        { name: 'XRay_Anil.dcm', date: 'Yesterday 04:00 PM', status: 'Uploaded' },
        { name: 'Echo_Sunita.dcm', date: 'Yesterday 02:30 PM', status: 'Uploaded' },
    ];

    const dicomActions = [
        { icon: cloudUploadOutline, label: 'Upload DICOM' },
        { icon: searchOutline, label: 'Search Files' },
        { icon: documentTextOutline, label: 'My Reports' },
        { icon: folderOpenOutline, label: 'All Files' },
    ];

    return (
        <IonPage>
            <IonHeader>
                <IonToolbar className="custom-toolbar">
                    <div className="dash-header-inner">
                        <div className="dash-header-left">
                            <IonIcon icon={personOutline} className="dash-header-icon" />
                            <IonTitle className="dash-title">Hospital User</IonTitle>
                        </div>
                        <IonButton fill="clear" className="logout-btn" onClick={handleLogout}>
                            <IonIcon icon={logOutOutline} />
                        </IonButton>
                    </div>
                </IonToolbar>
            </IonHeader>

            <IonContent className="dicom-bg">
                {/* Welcome */}
                <div className="dash-welcome">
                    <h2>Hello, {uData?.name || 'User'} 👋</h2>
                    <p>Manage and upload DICOM files</p>
                </div>

                {/* Quick Actions */}
                <div className="section-title">Quick Actions</div>
                <div className="action-grid">
                    {dicomActions.map((item, i) => {
                        const row = Math.floor(i / 2);
                        const isLeftColumn = i % 2 === 0;

                        const cardColor =
                            row % 2 === 0
                                ? isLeftColumn
                                    ? LEFT_CARD_COLOR
                                    : RIGHT_CARD_COLOR
                                : isLeftColumn
                                    ? RIGHT_CARD_COLOR
                                    : LEFT_CARD_COLOR;

                        return (
                            <button
                                key={i}
                                className="action-btn"
                                style={{
                                    background: cardColor,
                                    color: '#fff',
                                }}
                            >
                                <IonIcon
                                    icon={item.icon}
                                    style={{
                                        color: '#fff',
                                        fontSize: '28px',
                                    }}
                                />
                                <span style={{ color: '#fff' }}>{item.label}</span>
                            </button>
                        );
                    })}
                </div>

                {/* Upload Box */}
                <div className="section-title">Upload New File</div>
                <div className="upload-box">
                    <IonIcon icon={cloudUploadOutline} className="upload-icon" />
                    <p>Tap to select DICOM file</p>
                    <button className="upload-btn-inner">Browse File</button>
                </div>

                {/* Recent Files */}
                <div className="section-title">Recent Uploads</div>
                <div className="table-card">
                    {recentFiles.map((f, i) => (
                        <div className="table-row" key={i}>
                            <div className="table-row-info">
                                <p className="row-name">{f.name}</p>
                                <span className="row-sub">{f.date}</span>
                            </div>
                            <span className={`status-badge ${f.status === 'Uploaded' ? 'badge-success' : 'badge-pending'}`}>
                                <IonIcon icon={f.status === 'Uploaded' ? checkmarkCircleOutline : timeOutline} />
                                {f.status}
                            </span>
                        </div>
                    ))}
                </div>
            </IonContent>
        </IonPage>
    );
};

export default HospitalUserDashboard;