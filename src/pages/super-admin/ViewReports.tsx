import React, { useState } from 'react';
import {
    IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
    IonButtons, IonBackButton, IonIcon,
} from '@ionic/react';
import {
    statsChartOutline, businessOutline, peopleOutline,
    cloudUploadOutline, cardOutline, trendingUpOutline,
} from 'ionicons/icons';
import '../../css/Superadmin.css';

type Period = 'today' | 'week' | 'month';

const DATA: Record<Period, { hospitals: string; users: string; uploads: string; revenue: string }> = {
    today: { hospitals: '2',    users: '18',    uploads: '54',    revenue: '₹12,400'  },
    week:  { hospitals: '7',    users: '93',    uploads: '312',   revenue: '₹78,200'  },
    month: { hospitals: '24',   users: '1,284', uploads: '2,108', revenue: '₹3,42,000' },
};

const RECENT_UPLOADS = [
    { hospital: 'City Hospital',   patient: 'Ramesh K.',   type: 'DICOM',  time: '5 min ago'  },
    { hospital: 'Apollo Clinic',   patient: 'Sita Devi',   type: 'PDF',    time: '18 min ago' },
    { hospital: 'Max Healthcare',  patient: 'Arjun S.',    type: 'DICOM',  time: '42 min ago' },
    { hospital: 'Medanta Center',  patient: 'Pooja M.',    type: 'MP4',    time: '1 hr ago'   },
    { hospital: 'Fortis Hospital', patient: 'Deepak R.',   type: 'DICOM',  time: '2 hr ago'   },
];

const TYPE_COLOR: Record<string, string> = {
    DICOM: '#3b82f6',
    PDF:   '#ef4444',
    MP4:   '#f59e0b',
};

const ViewReports: React.FC = () => {
    const [period, setPeriod] = useState<Period>('month');
    const d = DATA[period];

    const stats = [
        { label: 'Hospitals',  value: d.hospitals, icon: businessOutline,     color: '#8cdcc8' },
        { label: 'Users',      value: d.users,     icon: peopleOutline,       color: '#00a0a0' },
        { label: 'Uploads',    value: d.uploads,   icon: cloudUploadOutline,  color: '#8cdcc8' },
        { label: 'Revenue',    value: d.revenue,   icon: cardOutline,         color: '#00a0a0' },
    ];

    return (
        <IonPage>
            <IonHeader>
                <IonToolbar className="custom-toolbar">
                    <IonButtons slot="start">
                        <IonBackButton defaultHref="/super-admin/dashboard" color="light" />
                    </IonButtons>
                    <IonTitle style={{ color: '#fff' }}>View Reports</IonTitle>
                </IonToolbar>
            </IonHeader>

            <IonContent className="dicom-bg ion-padding">

                {/* Period Tabs */}
                <div className="sa-tab-row">
                    {(['today', 'week', 'month'] as Period[]).map(p => (
                        <button key={p} className={`sa-tab ${period === p ? 'active' : ''}`}
                            onClick={() => setPeriod(p)}>
                            {p.charAt(0).toUpperCase() + p.slice(1)}
                        </button>
                    ))}
                </div>

                {/* Stats Grid */}
                <div className="stats-grid" style={{ marginTop: 12 }}>
                    {stats.map((s, i) => (
                        <div className="stat-card" key={i} style={{ background: s.color, color: '#fff' }}>
                            <IonIcon icon={s.icon} style={{ fontSize: 28, color: '#fff' }} />
                            <div>
                                <h3 style={{ color: '#fff' }}>{s.value}</h3>
                                <p  style={{ color: '#fff' }}>{s.label}</p>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Bar chart (CSS-based) */}
                <div className="section-title" style={{ marginTop: 20 }}>Upload Activity</div>
                <div className="sa-bar-chart">
                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, i) => {
                        const heights = [60, 80, 45, 90, 70, 55, 40];
                        return (
                            <div className="sa-bar-col" key={day}>
                                <div className="sa-bar" style={{ height: heights[i] + '%' }} />
                                <span className="sa-bar-label">{day}</span>
                            </div>
                        );
                    })}
                </div>

                {/* Subscription breakdown */}
                <div className="section-title" style={{ marginTop: 20 }}>Plan Breakdown</div>
                <div className="sa-plan-row">
                    {[
                        { plan: 'Basic',    count: 8,  pct: 33, color: '#8cdcc8' },
                        { plan: 'Standard', count: 10, pct: 42, color: '#00a0a0' },
                        { plan: 'Premium',  count: 6,  pct: 25, color: '#006e6e' },
                    ].map(p => (
                        <div className="sa-plan-card" key={p.plan}>
                            <p className="sa-plan-name">{p.plan}</p>
                            <p className="sa-plan-count">{p.count}</p>
                            <div className="sa-plan-bar-bg">
                                <div className="sa-plan-bar-fill" style={{ width: p.pct + '%', background: p.color }} />
                            </div>
                            <p className="sa-plan-pct">{p.pct}%</p>
                        </div>
                    ))}
                </div>

                {/* Recent uploads */}
                <div className="section-title" style={{ marginTop: 20 }}>Recent Uploads</div>
                {RECENT_UPLOADS.map((r, i) => (
                    <div className="sa-card" key={i} style={{ alignItems: 'center' }}>
                        <div className="sa-card-left">
                            <div className="sa-card-icon-wrap" style={{ background: TYPE_COLOR[r.type] + '22' }}>
                                <IonIcon icon={cloudUploadOutline} style={{ color: TYPE_COLOR[r.type] }} />
                            </div>
                            <div>
                                <p className="sa-card-title">{r.patient}</p>
                                <p className="sa-card-sub">{r.hospital}</p>
                            </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <span className="sa-badge" style={{ background: TYPE_COLOR[r.type] + '22', color: TYPE_COLOR[r.type] }}>
                                {r.type}
                            </span>
                            <p className="sa-card-sub" style={{ marginTop: 4 }}>{r.time}</p>
                        </div>
                    </div>
                ))}

            </IonContent>
        </IonPage>
    );
};

export default ViewReports;