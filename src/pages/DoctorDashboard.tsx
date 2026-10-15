import {
    IonPage, IonContent, IonHeader, IonToolbar, IonTitle,
    IonButton, IonIcon,
} from '@ionic/react';
import { useHistory } from 'react-router-dom';
import {
    peopleOutline, documentTextOutline, calendarOutline,
    logOutOutline, medkitOutline, timeOutline,
    checkmarkCircleOutline, eyeOutline,
} from 'ionicons/icons';
import "../css/Dashboard.css";

const LEFT_CARD_COLOR = "#8cdcc8";
const RIGHT_CARD_COLOR = "#00a0a0";
const DoctorDashboard: React.FC = () => {
    const history = useHistory();
    const uData = JSON.parse(localStorage.getItem('uData') || '{}');

    const handleLogout = () => {
        localStorage.clear();
        history.push('/login');
    };

    const stats = [
        { label: 'My Patients', value: '56', icon: peopleOutline, color: '#3b82f6' },
        { label: "Today's Reports", value: '8', icon: documentTextOutline, color: '#10b981' },
        { label: 'Appointments', value: '5', icon: calendarOutline, color: '#f59e0b' },
        { label: 'Pending Reviews', value: '3', icon: timeOutline, color: '#ef4444' },
    ];

    const patients = [
        { name: 'Rahul Sharma', age: 34, scan: 'CT Scan', time: '10:30 AM', status: 'Reviewed' },
        { name: 'Priya Singh', age: 28, scan: 'MRI', time: '11:00 AM', status: 'Pending' },
        { name: 'Anil Kumar', age: 52, scan: 'X-Ray', time: '12:00 PM', status: 'Reviewed' },
        { name: 'Sunita Devi', age: 45, scan: 'Echo', time: '02:00 PM', status: 'Pending' },
    ];

    const doctorActions = [
        { icon: peopleOutline, label: 'My Patients' },
        { icon: documentTextOutline, label: 'DICOM Viewer' },
        { icon: calendarOutline, label: 'Schedule' },
        { icon: eyeOutline, label: 'Pending Review' },
    ];

    return (
        <IonPage>
            <IonHeader>
                <IonToolbar className="custom-toolbar">
                    <div className="dash-header-inner">
                        <div className="dash-header-left">
                            <IonIcon icon={medkitOutline} className="dash-header-icon" />
                            <IonTitle className="dash-title">Doctor Panel</IonTitle>
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
                    <h2>Dr. {uData?.name || 'Doctor'} 👨‍⚕️</h2>
                    <p>Review patient DICOM reports</p>
                </div>

                {/* Stats */}
                <div className="stats-grid">
                    {stats.map((s, i) => {
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
                            <div
                                className="stat-card"
                                key={i}
                                style={{
                                    background: cardColor,
                                    color: '#fff',
                                }}
                            >
                                <IonIcon
                                    icon={s.icon}
                                    style={{
                                        color: '#fff',
                                        fontSize: '28px',
                                    }}
                                />

                                <div>
                                    <h3 style={{ color: '#fff' }}>{s.value}</h3>
                                    <p style={{ color: '#fff' }}>{s.label}</p>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Quick Actions */}
                <div className="section-title">Quick Actions</div>
                <div className="action-grid">
                    {doctorActions.map((item, i) => {
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

                {/* Patient List */}
                <div className="section-title">Today's Patients</div>
                <div className="table-card">
                    {patients.map((p, i) => (
                        <div className="table-row" key={i}>
                            <div className="table-row-info">
                                <p className="row-name">{p.name} <span className="age-tag">Age {p.age}</span></p>
                                <span className="row-sub">{p.scan} · {p.time}</span>
                            </div>
                            <span className={`status-badge ${p.status === 'Reviewed' ? 'badge-success' : 'badge-pending'}`}>
                                <IonIcon icon={p.status === 'Reviewed' ? checkmarkCircleOutline : timeOutline} />
                                {p.status}
                            </span>
                        </div>
                    ))}
                </div>
            </IonContent>
        </IonPage>
    );
};

export default DoctorDashboard;