import React from 'react';
import {
    IonPage,
    IonContent,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButton,
    IonIcon,
} from '@ionic/react';
import { useHistory } from 'react-router-dom';
import {
    peopleOutline,
    medkitOutline,
    documentTextOutline,
    calendarOutline,
    logOutOutline,
    checkmarkCircleOutline,
    timeOutline,
} from 'ionicons/icons';
import '../css/Dashboard.css';

const LEFT_CARD_COLOR = '#8cdcc8';
const RIGHT_CARD_COLOR = '#00a0a0';

const HospitalAdminDashboard: React.FC = () => {
    const history = useHistory();
    const uData = JSON.parse(localStorage.getItem('uData') || '{}');

    const handleLogout = () => {
        localStorage.clear();
        history.push('/login');
    };

    const stats = [
        { label: 'Total Doctors', value: '42', icon: medkitOutline },
        { label: 'Total Patients', value: '318', icon: peopleOutline },
        { label: 'Reports Today', value: '26', icon: documentTextOutline },
        { label: 'Appointments', value: '14', icon: calendarOutline },
    ];

    const quickActions = [
        { label: 'Add Doctor', icon: medkitOutline },
        { label: 'Add Patient', icon: peopleOutline },
        { label: 'View Reports', icon: documentTextOutline },
        { label: 'Appointments', icon: calendarOutline },
    ];

    const recentReports = [
        { patient: 'Rahul Sharma', doctor: 'Dr. Mehta', time: '10:30 AM', status: 'Done' },
        { patient: 'Priya Singh', doctor: 'Dr. Gupta', time: '11:00 AM', status: 'Pending' },
        { patient: 'Anil Kumar', doctor: 'Dr. Verma', time: '12:15 PM', status: 'Done' },
        { patient: 'Sunita Devi', doctor: 'Dr. Mehta', time: '02:00 PM', status: 'Pending' },
    ];

    return (
        <IonPage>
            <IonHeader>
                <IonToolbar className="custom-toolbar">
                    <div className="dash-header-inner">
                        <IonTitle className="dash-title">Hospital Admin</IonTitle>

                        <IonButton fill="clear" onClick={handleLogout}>
                            <IonIcon
                                icon={logOutOutline}
                                style={{ color: 'red', fontSize: '24px' }}
                            />
                        </IonButton>
                    </div>
                </IonToolbar>
            </IonHeader>

            <IonContent className="dicom-bg">
                {/* Welcome */}
                <div className="dash-welcome">
                    <h2>Welcome, {uData?.name || 'Hospital Admin'} 👋</h2>
                    <p>Manage your hospital operations efficiently</p>
                </div>

                {/* Stats */}
                <div className="stats-grid">
                    {stats.map((item, i) => {
                        const row = Math.floor(i / 2); // 2 cards per row
                        const isLeftColumn = i % 2 === 0;

                        const cardColor =
                            row % 2 === 0
                                ? isLeftColumn
                                    ? LEFT_CARD_COLOR
                                    : RIGHT_CARD_COLOR
                                : isLeftColumn
                                    ? RIGHT_CARD_COLOR
                                    : LEFT_CARD_COLOR;

                        const textColor = cardColor === LEFT_CARD_COLOR ? '#333' : '#fff';

                        return (
                            <div
                                key={i}
                                className="stat-card"
                                style={{
                                    background: cardColor,
                                    color: textColor,
                                }}
                            >
                                <IonIcon
                                    icon={item.icon}
                                    style={{
                                        fontSize: '30px',
                                        color: textColor,
                                    }}
                                />

                                <div>
                                    <h3>{item.value}</h3>
                                   <p style={{ color: '#fff' }}>{item.label}</p>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Quick Actions */}
                <div className="section-title">Quick Actions</div>
                <div className="action-grid">
                    {quickActions.map((item, i) => {
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

                        const textColor = cardColor === LEFT_CARD_COLOR ? '#333' : '#fff';

                        return (
                            <button
                                key={i}
                                className="action-btn"
                                style={{
                                    background: cardColor,
                                    color: textColor,
                                }}
                            >
                                <IonIcon
                                    icon={item.icon}
                                    style={{
                                        color: textColor,
                                        fontSize: '28px',
                                    }}
                                />
                                <span style={{ color: '#fff' }}>{item.label}</span>
                            </button>
                        );
                    })}
                </div>

                {/* Reports */}
                <div className="section-title">Today's Reports</div>
                <div className="table-card">
                    {recentReports.map((r, i) => (
                        <div key={i} className="table-row">
                            <div>
                                <p className="row-name">{r.patient}</p>
                                <span className="row-sub">
                                    {r.doctor} · {r.time}
                                </span>
                            </div>

                            <span
                                className={`status-badge ${r.status === 'Done' ? 'badge-success' : 'badge-pending'
                                    }`}
                            >
                                <IonIcon
                                    icon={
                                        r.status === 'Done'
                                            ? checkmarkCircleOutline
                                            : timeOutline
                                    }
                                />
                                {r.status}
                            </span>
                        </div>
                    ))}
                </div>
            </IonContent>
        </IonPage>
    );
};

export default HospitalAdminDashboard;