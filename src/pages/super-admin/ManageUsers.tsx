import React, { useState } from 'react';
import {
    IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
    IonButtons, IonBackButton, IonIcon, IonToast,
} from '@ionic/react';
import { personOutline, addOutline, createOutline, trashOutline, searchOutline } from 'ionicons/icons';
import '../../css/Superadmin.css';


type Role = 'super_admin' | 'hospital_admin' | 'hospital_user' | 'doctor' | 'patient';

interface UserItem {
    id: number;
    name: string;
    email: string;
    mobile: string;
    role: Role;
    status: 'Active' | 'Inactive';
}

const ROLE_LABELS: Record<Role, string> = {
    super_admin:    'Super Admin',
    hospital_admin: 'Hospital Admin',
    hospital_user:  'Hospital User',
    doctor:         'Doctor',
    patient:        'Patient',
};

const ROLE_COLORS: Record<Role, string> = {
    super_admin:    '#ef4444',
    hospital_admin: '#3b82f6',
    hospital_user:  '#8b5cf6',
    doctor:         '#10b981',
    patient:        '#f59e0b',
};

const DUMMY: UserItem[] = [
    { id: 1, name: 'Ravi Kumar',   email: 'ravi@mail.com',   mobile: '9876543210', role: 'hospital_admin', status: 'Active'   },
    { id: 2, name: 'Dr. Priya',    email: 'priya@mail.com',  mobile: '9123456789', role: 'doctor',         status: 'Active'   },
    { id: 3, name: 'Arjun Singh',  email: 'arjun@mail.com',  mobile: '9012345678', role: 'patient',        status: 'Inactive' },
    { id: 4, name: 'Sneha Patil',  email: 'sneha@mail.com',  mobile: '9988776655', role: 'hospital_user',  status: 'Active'   },
    { id: 5, name: 'Karan Mehta',  email: 'karan@mail.com',  mobile: '9977665544', role: 'doctor',         status: 'Active'   },
];

const ROLES: Role[] = ['hospital_admin', 'hospital_user', 'doctor', 'patient'];

const ManageUsers: React.FC = () => {
    const [users, setUsers]       = useState<UserItem[]>(DUMMY);
    const [search, setSearch]     = useState('');
    const [filterRole, setFilterRole] = useState<string>('all');
    const [showForm, setShowForm] = useState(false);
    const [editItem, setEditItem] = useState<UserItem | null>(null);
    const [toast, setToast]       = useState('');

    const [form, setForm] = useState({
        name: '', email: '', mobile: '', role: 'doctor' as Role, status: 'Active' as 'Active' | 'Inactive',
    });

    const filtered = users.filter(u => {
        const matchSearch = u.name.toLowerCase().includes(search.toLowerCase()) ||
                            u.email.toLowerCase().includes(search.toLowerCase());
        const matchRole   = filterRole === 'all' || u.role === filterRole;
        return matchSearch && matchRole;
    });

    const openAdd = () => {
        setEditItem(null);
        setForm({ name: '', email: '', mobile: '', role: 'doctor', status: 'Active' });
        setShowForm(true);
    };

    const openEdit = (u: UserItem) => {
        setEditItem(u);
        setForm({ name: u.name, email: u.email, mobile: u.mobile, role: u.role, status: u.status });
        setShowForm(true);
    };

    const handleSave = () => {
        if (!form.name || !form.email || !form.mobile) {
            setToast('Please fill all required fields');
            return;
        }
        if (editItem) {
            setUsers(prev => prev.map(u => u.id === editItem.id ? { ...u, ...form } : u));
            setToast('User updated successfully');
        } else {
            setUsers(prev => [...prev, { id: Date.now(), ...form }]);
            setToast('User added successfully');
        }
        setShowForm(false);
    };

    const handleDelete = (id: number) => {
        setUsers(prev => prev.filter(u => u.id !== id));
        setToast('User deleted');
    };

    return (
        <IonPage>
            <IonHeader>
                <IonToolbar className="custom-toolbar">
                    <IonButtons slot="start">
                        <IonBackButton defaultHref="/super-admin/dashboard" color="light" />
                    </IonButtons>
                    <IonTitle style={{ color: '#fff' }}>Manage Users</IonTitle>
                    <IonButtons slot="end">
                        <button className="sa-icon-btn" onClick={openAdd}>
                            <IonIcon icon={addOutline} />
                        </button>
                    </IonButtons>
                </IonToolbar>
            </IonHeader>

            <IonContent className="dicom-bg ion-padding">

                {/* Search */}
                <div className="sa-search-wrap">
                    <IonIcon icon={searchOutline} className="sa-search-icon" />
                    <input className="sa-search" placeholder="Search by name or email..."
                        value={search} onChange={e => setSearch(e.target.value)} />
                </div>

                {/* Role filter chips */}
                <div className="sa-filter-row">
                    {['all', ...ROLES].map(r => (
                        <button key={r}
                            className={`sa-filter-chip ${filterRole === r ? 'active' : ''}`}
                            onClick={() => setFilterRole(r)}>
                            {r === 'all' ? 'All' : ROLE_LABELS[r as Role]}
                        </button>
                    ))}
                </div>

                {/* Summary */}
                <div className="sa-summary-row">
                    <div className="sa-summary-chip">Total: {users.length}</div>
                    <div className="sa-summary-chip active">Active: {users.filter(u => u.status === 'Active').length}</div>
                    <div className="sa-summary-chip inactive">Inactive: {users.filter(u => u.status === 'Inactive').length}</div>
                </div>

                {/* List */}
                {filtered.map(u => (
                    <div className="sa-card" key={u.id}>
                        <div className="sa-card-left">
                            <div className="sa-card-avatar" style={{ background: ROLE_COLORS[u.role] }}>
                                {u.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                                <p className="sa-card-title">{u.name}</p>
                                <p className="sa-card-sub">{u.email} • {u.mobile}</p>
                                <div className="sa-card-badges">
                                    <span className="sa-badge" style={{ background: ROLE_COLORS[u.role] + '22', color: ROLE_COLORS[u.role] }}>
                                        {ROLE_LABELS[u.role]}
                                    </span>
                                    <span className={`sa-badge ${u.status === 'Active' ? 'badge-green' : 'badge-red'}`}>{u.status}</span>
                                </div>
                            </div>
                        </div>
                        <div className="sa-card-actions">
                            <button className="sa-action-icon edit" onClick={() => openEdit(u)}>
                                <IonIcon icon={createOutline} />
                            </button>
                            <button className="sa-action-icon del" onClick={() => handleDelete(u.id)}>
                                <IonIcon icon={trashOutline} />
                            </button>
                        </div>
                    </div>
                ))}

                {filtered.length === 0 && <p className="sa-empty">No users found.</p>}

                {/* Form Modal */}
                {showForm && (
                    <div className="sa-modal-overlay">
                        <div className="sa-modal">
                            <h3 className="sa-modal-title">{editItem ? 'Edit User' : 'Add User'}</h3>

                            <label className="sa-label">Full Name *</label>
                            <input className="sa-input" placeholder="Enter name" value={form.name}
                                onChange={e => setForm({ ...form, name: e.target.value })} />

                            <label className="sa-label">Email *</label>
                            <input className="sa-input" type="email" placeholder="Enter email" value={form.email}
                                onChange={e => setForm({ ...form, email: e.target.value })} />

                            <label className="sa-label">Mobile *</label>
                            <input className="sa-input" type="tel" placeholder="Enter mobile" value={form.mobile}
                                onChange={e => setForm({ ...form, mobile: e.target.value })} />

                            <label className="sa-label">Role</label>
                            <select className="sa-input" value={form.role}
                                onChange={e => setForm({ ...form, role: e.target.value as Role })}>
                                {ROLES.map(r => (
                                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                                ))}
                            </select>

                            <label className="sa-label">Status</label>
                            <select className="sa-input" value={form.status}
                                onChange={e => setForm({ ...form, status: e.target.value as 'Active' | 'Inactive' })}>
                                <option value="Active">Active</option>
                                <option value="Inactive">Inactive</option>
                            </select>

                            <div className="sa-modal-btns">
                                <button className="sa-btn-cancel" onClick={() => setShowForm(false)}>Cancel</button>
                                <button className="sa-btn-save"   onClick={handleSave}>
                                    {editItem ? 'Update' : 'Add User'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                <IonToast isOpen={!!toast} message={toast} duration={2000}
                    onDidDismiss={() => setToast('')} color="success" />
            </IonContent>
        </IonPage>
    );
};

export default ManageUsers;