import React, { useState } from 'react';
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
} from '@ionic/react';
import '../css/Signup.css';
import AppFooter from '../components/AppFooter';
import { useHistory } from 'react-router-dom';

const PATIENTS_STORAGE_KEY = 'patients';

interface PatientFormData {
  name: string;
  email: string;
  mobile: string;
  gender: string;
  date_of_birth: string; // stored as yyyy-mm-dd (built from the 3 dropdowns)
  age: string;
  address: string;
  country: string;
  province: string;
  city: string;
  blood_group: string;
  diagnosis_details: string;
}

interface DobParts {
  day: string;
  month: string;
  year: string;
}

const EMPTY_FORM: PatientFormData = {
  name: '',
  email: '',
  mobile: '',
  gender: '',
  date_of_birth: '',
  age: '',
  address: '',
  country: 'USA',
  province: '',
  city: '',
  blood_group: '',
  diagnosis_details: '',
};

const EMPTY_DOB: DobParts = { day: '', month: '', year: '' };

// ===== DOB dropdown options =====
const MIN_YEAR = 1940;
const CURRENT_YEAR = new Date().getFullYear();

const pad = (n: number) => n.toString().padStart(2, '0');

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => pad(i + 1)); // 01 - 12
const YEAR_OPTIONS = Array.from(
  { length: CURRENT_YEAR - MIN_YEAR + 1 },
  (_, i) => (CURRENT_YEAR - i).toString()
); // current year -> 1940

// Number of days in the selected month/year (handles Feb & leap years)
const getDaysInMonth = (year: string, month: string): number => {
  const y = year ? Number(year) : 2000; // 2000 is a leap year (Feb = 29 days)
  const m = month ? Number(month) : 1; // default: 31 days
  return new Date(y, m, 0).getDate();
};

const calculateAge = (isoDate: string): string => {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dob = new Date(y, m - 1, d);
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const diff = today.getMonth() - dob.getMonth();
  if (diff < 0 || (diff === 0 && today.getDate() < dob.getDate())) {
    age--;
  }
  return age >= 0 ? age.toString() : '0';
};

const AddPatient: React.FC = () => {
  const history = useHistory();
  const [formData, setFormData] = useState<PatientFormData>(EMPTY_FORM);
  const [dob, setDob] = useState<DobParts>(EMPTY_DOB);

  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  const handleChange = (field: keyof PatientFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  // ===== Handle DOB dropdowns (dd / mm / yyyy) =====
  const handleDobChange = (part: keyof DobParts, value: string) => {
    const next: DobParts = { ...dob, [part]: value };

    // If the selected day is not valid for the new month/year (e.g. 31 Feb), reset the day
    const maxDay = getDaysInMonth(next.year, next.month);
    if (next.day && Number(next.day) > maxDay) {
      next.day = '';
    }

    setDob(next);

    if (next.day && next.month && next.year) {
      const iso = `${next.year}-${next.month}-${next.day}`; // yyyy-mm-dd
      setFormData((prev) => ({
        ...prev,
        date_of_birth: iso,
        age: calculateAge(iso),
      }));
      setErrors((prev) => {
        const copy = { ...prev };
        delete copy.date_of_birth;
        return copy;
      });
    } else {
      setFormData((prev) => ({ ...prev, date_of_birth: '', age: '' }));
    }
  };

  // Email & Mobile are optional -> no validation for them
  const validate = (): { [key: string]: string } => {
    const newErrors: { [key: string]: string } = {};

    if (!formData.name.trim()) newErrors.name = 'Name is required';
    if (!formData.gender.trim()) newErrors.gender = 'Gender is required';
    if (!formData.date_of_birth) newErrors.date_of_birth = 'Date of Birth is required';

    return newErrors;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const newErrors = validate();

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      setToastMessage('❌ Please fill all required fields correctly.');
      setShowToast(true);
      return;
    }

    // ===== Get logged-in user info from localStorage =====
    const userId = localStorage.getItem('userId');
    const role = localStorage.getItem('role');

    setErrors({});
    setIsSubmitting(true);

    try {
      const newPatient = {
        ...formData,
        id: Date.now(),
        user_id: userId ? Number(userId) : null,
        added_by_role: role,
        created_at: new Date().toISOString(),
      };

      // Read existing patients from localStorage
      const existingRaw = localStorage.getItem(PATIENTS_STORAGE_KEY);
      const existingPatients = existingRaw ? JSON.parse(existingRaw) : [];

      // Append new patient and save back
      const updatedPatients = [...existingPatients, newPatient];
      localStorage.setItem(PATIENTS_STORAGE_KEY, JSON.stringify(updatedPatients));

      // Success
      setToastMessage('✅ Patient saved successfully!');
      setShowToast(true);

      // Redirect after success
      setTimeout(() => {
        history.push('/patientlist');
      }, 1000);

      // Reset Form and stay on this same page
      setFormData(EMPTY_FORM);
      setDob(EMPTY_DOB);
    } catch (error: unknown) {
      console.error('Local Storage Error:', error);
      const message =
        error instanceof Error ? error.message : '❌ Failed to save patient.';
      setToastMessage(message);
      setShowToast(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const locationFields: Array<keyof PatientFormData> = ['country', 'province', 'city'];

  const dayOptions = Array.from(
    { length: getDaysInMonth(dob.year, dob.month) },
    (_, i) => pad(i + 1)
  );

  return (
    <IonPage>
      <IonHeader translucent>
        <IonToolbar className="custom-toolbar">
          <IonButtons slot="start">
            <IonBackButton defaultHref="/dashboard" />
          </IonButtons>
          <IonTitle className="text-white text-center">Add Patient</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent fullscreen className="dicom-bg">
        <div className="signup-container">
          <div className="signup-box">
            <form onSubmit={handleSubmit} noValidate>

              {/* ===== 2 COLUMN GRID ===== */}
              <div className="form-grid">

                <div className="field full-width">
                  <label>Name<span className="required-star">*</span></label>
                  <input
                    type="text"
                    placeholder="Enter name"
                    value={formData.name}
                    onChange={(e) => handleChange('name', e.target.value)}
                  />
                  {errors.name && <span className="error-text">{errors.name}</span>}
                </div>

                {/* ===== DATE OF BIRTH (dd / mm / yyyy dropdowns) ===== */}
                <div className="field full-width">
                  <label>Date of Birth (DD/MM/YYYY)<span className="required-star">*</span></label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <select
                      style={{ flex: 1 }}
                      value={dob.day}
                      onChange={(e) => handleDobChange('day', e.target.value)}
                    >
                      <option value="" disabled>DD</option>
                      {dayOptions.map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>

                    <select
                      style={{ flex: 1 }}
                      value={dob.month}
                      onChange={(e) => handleDobChange('month', e.target.value)}
                    >
                      <option value="" disabled>MM</option>
                      {MONTH_OPTIONS.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>

                    <select
                      style={{ flex: 1 }}
                      value={dob.year}
                      onChange={(e) => handleDobChange('year', e.target.value)}
                    >
                      <option value="" disabled>YYYY</option>
                      {YEAR_OPTIONS.map((y) => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>
                  {errors.date_of_birth && (
                    <span className="error-text">{errors.date_of_birth}</span>
                  )}
                </div>

                <div className="field">
                  <label>Age</label>
                  <input
                    type="number"
                    placeholder="Auto-calculated"
                    value={formData.age}
                    readOnly
                  />
                </div>

                <div className="field">
                  <label>Gender<span className="required-star">*</span></label>
                  <select
                    value={formData.gender}
                    onChange={(e) => handleChange('gender', e.target.value)}
                  >
                    <option value="" disabled>Select gender</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                  {errors.gender && <span className="error-text">{errors.gender}</span>}
                </div>

                {locationFields.map((loc) => (
                  <div className="field" key={loc}>
                    <label>{loc === 'province' ? 'Province' : loc.charAt(0).toUpperCase() + loc.slice(1)}</label>
                    <input
                      type="text"
                      placeholder={`Enter ${loc}`}
                      value={formData[loc]}
                      onChange={(e) => handleChange(loc, e.target.value)}
                    />
                  </div>
                ))}

                <div className="field">
                  <label>Blood Group</label>
                  <select
                    value={formData.blood_group}
                    onChange={(e) => handleChange('blood_group', e.target.value)}
                  >
                    <option value="" disabled>Select blood group</option>
                    {['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'].map((group) => (
                      <option key={group} value={group}>
                        {group}
                      </option>
                    ))}
                  </select>
                </div>

                {/* ===== OPTIONAL FIELDS ===== */}
                <div className="field full-width">
                  <label>Email (optional)</label>
                  <input
                    type="email"
                    placeholder="Enter email"
                    value={formData.email}
                    onChange={(e) => handleChange('email', e.target.value)}
                  />
                </div>

                <div className="field full-width">
                  <label>Mobile (optional)</label>
                  <input
                    type="tel"
                    placeholder="Enter mobile number"
                    value={formData.mobile}
                    onChange={(e) => handleChange('mobile', e.target.value)}
                  />
                </div>

              </div>

              {/* ===== FULL WIDTH FIELDS ===== */}

              <div className="field full-width">
                <label>Address</label>
                <textarea
                  placeholder="Enter address"
                  value={formData.address}
                  onChange={(e) => handleChange('address', e.target.value)}
                />
              </div>

              <div className="field full-width">
                <label>
                  Diagnosis Details (optional)
                </label>
                <textarea
                  placeholder="Enter diagnosis details"
                  value={formData.diagnosis_details}
                  onChange={(e) => handleChange('diagnosis_details', e.target.value)}
                />
                {errors.diagnosis_details && (
                  <span className="error-text">{errors.diagnosis_details}</span>
                )}
              </div>

              <IonButton
                expand="block"
                type="submit"
                className="signup-btn"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Adding Patient...' : 'Add Patient'}
              </IonButton>

            </form>
          </div>
        </div>

        <IonToast
          isOpen={showToast}
          onDidDismiss={() => setShowToast(false)}
          message={toastMessage}
          duration={2500}
          color={toastMessage.includes('✅') ? 'success' : 'danger'}
        />
      </IonContent>
      <AppFooter />
    </IonPage>
  );
};

export default AddPatient;