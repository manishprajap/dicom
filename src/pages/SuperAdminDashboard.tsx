import {
    IonPage, IonContent, IonHeader, IonToolbar, IonTitle,
    IonButton, IonIcon,
} from '@ionic/react';
import { useHistory } from 'react-router-dom';
import {
    peopleOutline, businessOutline, statsChartOutline,
    settingsOutline, logOutOutline, shieldCheckmarkOutline,
    alertCircleOutline, checkmarkCircleOutline,
} from 'ionicons/icons';
import "../css/Dashboard.css";

const LEFT_CARD_COLOR  = "#8cdcc8";
const RIGHT_CARD_COLOR = "#00a0a0";

const SuperAdminDashboard: React.FC = () => {
    const history = useHistory();
    const uData = JSON.parse(localStorage.getItem('uData') || '{}');

    const handleLogout = () => {
        localStorage.clear();
        history.push('/login');
    };

    const stats = [
        { label: 'Total Hospitals',  value: '24',    icon: businessOutline,   color: '#3b82f6' },
        { label: 'Total Users',      value: '1,284', icon: peopleOutline,     color: '#10b981' },
        { label: 'Active Sessions',  value: '87',    icon: statsChartOutline, color: '#f59e0b' },
        { label: 'System Alerts',    value: '3',     icon: alertCircleOutline,color: '#ef4444' },
    ];

    const recentActivities = [
        { text: 'City Hospital Admin created',          time: '2 min ago', status: 'success' },
        { text: 'Apollo Hospital subscription renewed', time: '1 hr ago',  status: 'success' },
        { text: 'Failed login attempt detected',        time: '3 hr ago',  status: 'danger'  },
        { text: 'New hospital registered',              time: '5 hr ago',  status: 'success' },
    ];

    const actions = [
        { icon: businessOutline,  label: 'Manage Hospitals', route: '/super-admin/hospitals'  },
        { icon: peopleOutline,    label: 'Manage Users',     route: '/super-admin/users'      },
        { icon: statsChartOutline,label: 'View Reports',     route: '/super-admin/reports'    },
        { icon: settingsOutline,  label: 'System Settings',  route: '/super-admin/settings'   },
    ];

    return (
        <IonPage>
            <IonHeader>
                <IonToolbar className="custom-toolbar">
                    <div className="dash-header-inner">
                        <div className="dash-header-left">
                            <IonIcon icon={shieldCheckmarkOutline} className="dash-header-icon" />
                            <IonTitle className="dash-title">Super Admin Panel</IonTitle>
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
                    <h2>Welcome, {uData?.name || 'Super Admin'} 👋</h2>
                    <p>Full system control & monitoring</p>
                </div>

                {/* Stats Grid */}
                <div className="stats-grid">
                    {stats.map((s, i) => {
                        const row         = Math.floor(i / 2);
                        const isLeft      = i % 2 === 0;
                        const cardColor   = row % 2 === 0
                            ? isLeft ? LEFT_CARD_COLOR  : RIGHT_CARD_COLOR
                            : isLeft ? RIGHT_CARD_COLOR : LEFT_CARD_COLOR;

                        return (
                            <div className="stat-card" key={i} style={{ background: cardColor, color: '#fff' }}>
                                <IonIcon icon={s.icon} style={{ color: '#fff', fontSize: '28px' }} />
                                <div>
                                    <h3 style={{ color: '#fff' }}>{s.value}</h3>
                                    <p  style={{ color: '#fff' }}>{s.label}</p>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Quick Actions */}
                <div className="section-title">Quick Actions</div>
                <div className="action-grid">
                    {actions.map((item, i) => {
                        const row       = Math.floor(i / 2);
                        const isLeft    = i % 2 === 0;
                        const cardColor = row % 2 === 0
                            ? isLeft ? LEFT_CARD_COLOR  : RIGHT_CARD_COLOR
                            : isLeft ? RIGHT_CARD_COLOR : LEFT_CARD_COLOR;

                        return (
                            <button
                                key={i}
                                className="action-btn"
                                style={{ background: cardColor, color: '#fff' }}
                                onClick={() => history.push(item.route)}   // ← navigation added
                            >
                                <IonIcon icon={item.icon} style={{ color: '#fff', fontSize: '28px' }} />
                                <span style={{ color: '#fff' }}>{item.label}</span>
                            </button>
                        );
                    })}
                </div>

                {/* Recent Activity */}
                <div className="section-title">Recent Activity</div>
                <div className="activity-list">
                    {recentActivities.map((a, i) => (
                        <div className="activity-item" key={i}>
                            <IonIcon
                                icon={a.status === 'success' ? checkmarkCircleOutline : alertCircleOutline}
                                style={{ color: a.status === 'success' ? '#10b981' : '#ef4444' }}
                            />
                            <div className="activity-info">
                                <p>{a.text}</p>
                                <span>{a.time}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </IonContent>
        </IonPage>
    );
};

export default SuperAdminDashboard;