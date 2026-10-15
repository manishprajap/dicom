import React, { useState } from 'react';
import {
    IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
    IonButtons, IonBackButton, IonIcon, IonToast,
} from '@ionic/react';
import { businessOutline, addOutline, createOutline, trashOutline, searchOutline } from 'ionicons/icons';
import '../../css/Superadmin.css';

interface Hospital {
    id: number;
    name: string;
    city: string;
    admin: string;
    status: 'Active' | 'Inactive';
    plan: string;
}

const DUMMY: Hospital[] = [
    { id: 1, name: 'City Hospital',   city: 'Delhi',   admin: 'Dr. Ravi',  status: 'Active',   plan: 'Premium'  },
    { id: 2, name: 'Apollo Clinic',   city: 'Mumbai',  admin: 'Dr. Priya', status: 'Active',   plan: 'Standard' },
    { id: 3, name: 'Max Healthcare',  city: 'Pune',    admin: 'Dr. Arjun', status: 'Inactive', plan: 'Basic'    },
    { id: 4, name: 'Medanta Center',  city: 'Noida',   admin: 'Dr. Sneha', status: 'Active',   plan: 'Premium'  },
    { id: 5, name: 'Fortis Hospital', city: 'Chennai', admin: 'Dr. Karan', status: 'Active',   plan: 'Standard' },
];

const ManageHospitals: React.FC = () => {
    const [hospitals, setHospitals]   = useState<Hospital[]>(DUMMY);
    const [search, setSearch]         = useState('');
    const [showForm, setShowForm]     = useState(false);
    const [editItem, setEditItem]     = useState<Hospital | null>(null);
    const [toast, setToast]           = useState('');

    const [form, setForm] = useState({ name: '', city: '', admin: '', plan: 'Basic', status: 'Active' as 'Active' | 'Inactive' });

    const filtered = hospitals.filter(h =>
        h.name.toLowerCase().includes(search.toLowerCase()) ||
        h.city.toLowerCase().includes(search.toLowerCase())
    );

    const openAdd = () => {
        setEditItem(null);
        setForm({ name: '', city: '', admin: '', plan: 'Basic', status: 'Active' });
        setShowForm(true);
    };

    const openEdit = (h: Hospital) => {
        setEditItem(h);
        setForm({ name: h.name, city: h.city, admin: h.admin, plan: h.plan, status: h.status });
        setShowForm(true);
    };

    const handleSave = () => {
        if (!form.name || !form.city || !form.admin) {
            setToast('Please fill all required fields');
            return;
        }
        if (editItem) {
            setHospitals(prev => prev.map(h => h.id === editItem.id ? { ...h, ...form } : h));
            setToast('Hospital updated successfully');
        } else {
            const newH: Hospital = { id: Date.now(), ...form };
            setHospitals(prev => [...prev, newH]);
            setToast('Hospital added successfully');
        }
        setShowForm(false);
    };

    const handleDelete = (id: number) => {
        setHospitals(prev => prev.filter(h => h.id !== id));
        setToast('Hospital deleted');
    };

    return (
        <IonPage>
            <IonHeader>
                <IonToolbar className="custom-toolbar">
                    <IonButtons slot="start">
                        <IonBackButton defaultHref="/super-admin/dashboard" color="light" />
                    </IonButtons>
                    <IonTitle style={{ color: '#fff' }}>Manage Hospitals</IonTitle>
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
                    <input
                        className="sa-search"
                        placeholder="Search by name or city..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>

                {/* Summary row */}
                <div className="sa-summary-row">
                    <div className="sa-summary-chip">Total: {hospitals.length}</div>
                    <div className="sa-summary-chip active">Active: {hospitals.filter(h => h.status === 'Active').length}</div>
                    <div className="sa-summary-chip inactive">Inactive: {hospitals.filter(h => h.status === 'Inactive').length}</div>
                </div>

                {/* List */}
                {filtered.map(h => (
                    <div className="sa-card" key={h.id}>
                        <div className="sa-card-left">
                            <div className="sa-card-icon-wrap">
                                <IonIcon icon={businessOutline} />
                            </div>
                            <div>
                                <p className="sa-card-title">{h.name}</p>
                                <p className="sa-card-sub">{h.city} • Admin: {h.admin}</p>
                                <div className="sa-card-badges">
                                    <span className={`sa-badge ${h.status === 'Active' ? 'badge-green' : 'badge-red'}`}>{h.status}</span>
                                    <span className="sa-badge badge-blue">{h.plan}</span>
                                </div>
                            </div>
                        </div>
                        <div className="sa-card-actions">
                            <button className="sa-action-icon edit" onClick={() => openEdit(h)}>
                                <IonIcon icon={createOutline} />
                            </button>
                            <button className="sa-action-icon del" onClick={() => handleDelete(h.id)}>
                                <IonIcon icon={trashOutline} />
                            </button>
                        </div>
                    </div>
                ))}

                {filtered.length === 0 && (
                    <p className="sa-empty">No hospitals found.</p>
                )}

                {/* Add / Edit Form Modal */}
                {showForm && (
                    <div className="sa-modal-overlay">
                        <div className="sa-modal">
                            <h3 className="sa-modal-title">{editItem ? 'Edit Hospital' : 'Add Hospital'}</h3>

                            <label className="sa-label">Hospital Name *</label>
                            <input className="sa-input" placeholder="Enter hospital name" value={form.name}
                                onChange={e => setForm({ ...form, name: e.target.value })} />

                            <label className="sa-label">City *</label>
                            <input className="sa-input" placeholder="Enter city" value={form.city}
                                onChange={e => setForm({ ...form, city: e.target.value })} />

                            <label className="sa-label">Admin Name *</label>
                            <input className="sa-input" placeholder="Enter admin name" value={form.admin}
                                onChange={e => setForm({ ...form, admin: e.target.value })} />

                            <label className="sa-label">Plan</label>
                            <select className="sa-input" value={form.plan}
                                onChange={e => setForm({ ...form, plan: e.target.value })}>
                                <option value="Basic">Basic</option>
                                <option value="Standard">Standard</option>
                                <option value="Premium">Premium</option>
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
                                    {editItem ? 'Update' : 'Add Hospital'}
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

export default ManageHospitals;