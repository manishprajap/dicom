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
  useIonRouter,
} from '@ionic/react';
import { useState } from 'react';
import '../css/Signup.css';

const AddPatient: React.FC = () => {
  const router = useIonRouter();

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    mobile: '',
    gender: '',
    date_of_birth: '',
    age: '',
    address: '',
    country: '',
    state: '',
    city: '',
    blood_group: '',
    diagnosis_details: '',
  });

  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  const handleChange = (field: string, value: any) => {
    const val = typeof value === 'string' ? value : value?.toString() ?? '';
    const updated = { ...formData, [field]: val };

    // Auto-calculate age when DOB changes
    if (field === 'date_of_birth' && value) {
      const dob = new Date(value);
      const today = new Date();
      let age = today.getFullYear() - dob.getFullYear();
      const m = today.getMonth() - dob.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
        age--;
      }
      updated.age = age >= 0 ? age.toString() : '0';
    }

    setFormData(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Frontend validation
    const newErrors: { [key: string]: string } = {};
    if (!formData.name.trim()) newErrors.name = 'Name is required';
    if (!formData.email.trim()) newErrors.email = 'Email is required';
    if (!formData.mobile.trim()) newErrors.mobile = 'Mobile is required';
    if (!formData.gender.trim()) newErrors.gender = 'Gender is required';
    if (!formData.date_of_birth) newErrors.date_of_birth = 'Date of Birth is required';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      setToastMessage('❌ Please fill all required fields.');
      setShowToast(true);
      return;
    }

    // ===== Get logged-in user info from localStorage =====
    const token = localStorage.getItem('token');
    const userId = localStorage.getItem('userId');
    const role = localStorage.getItem('role');

    if (!token || !userId) {
      setToastMessage('❌ Session expired. Please login again.');
      setShowToast(true);
      setTimeout(() => {
        router.push('/login', 'forward');
      }, 1200);
      return;
    }

    setErrors({});
    setIsSubmitting(true);

    try {
      const payload = {
        ...formData,
        user_id: Number(userId),
        added_by_role: role,
      };

      const response = await fetch(`https://aarnatechxperts.in/dicomapi/public/api/patients`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        // Handle Laravel validation errors (HTTP 422)
        if (response.status === 422 && data.errors) {
          const serverErrors: { [key: string]: string } = {};
          Object.keys(data.errors).forEach((key) => {
            serverErrors[key] = data.errors[key][0];
          });
          setErrors(serverErrors);
          throw new Error('Please fix the highlighted errors.');
        }
        throw new Error(data.message || 'Failed to save patient.');
      }

      // Success
      setToastMessage('✅ Patient saved successfully!');
      setShowToast(true);

      // Reset Form
      setFormData({
        name: '',
        email: '',
        mobile: '',
        gender: '',
        date_of_birth: '',
        age: '',
        address: '',
        country: '',
        state: '',
        city: '',
        blood_group: '',
        diagnosis_details: '',
      });

      setTimeout(() => {
        router.push('/patientlist', 'forward');
      }, 1000);

    } catch (error: any) {
      console.error('API Error:', error);
      setToastMessage(error.message || '❌ Failed to save patient to database');
      setShowToast(true);
    } finally {
      setIsSubmitting(false);
    }
  };

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
            <form onSubmit={handleSubmit}>

              {/* ===== 2 COLUMN GRID ===== */}
              <div className="form-grid">

                <div className="field">
                  <label>Name<span className="required-star">*</span></label>
                  <input
                    type="text"
                    placeholder="Enter name"
                    value={formData.name}
                    onChange={(e) => handleChange('name', e.target.value)}
                  />
                  {errors.name && <span className="error-text">{errors.name}</span>}
                </div>

                <div className="field">
                  <label>Email<span className="required-star">*</span></label>
                  <input
                    type="email"
                    placeholder="Enter email"
                    value={formData.email}
                    onChange={(e) => handleChange('email', e.target.value)}
                  />
                  {errors.email && <span className="error-text">{errors.email}</span>}
                </div>

                <div className="field">
                  <label>Mobile<span className="required-star">*</span></label>
                  <input
                    type="tel"
                    placeholder="Enter mobile number"
                    value={formData.mobile}
                    onChange={(e) => handleChange('mobile', e.target.value)}
                  />
                  {errors.mobile && <span className="error-text">{errors.mobile}</span>}
                </div>

                <div className="field">
                  <label>Date of Birth<span className="required-star">*</span></label>
                  <input
                    type="date"
                    value={formData.date_of_birth}
                    onChange={(e) => handleChange('date_of_birth', e.target.value)}
                  />
                  {errors.date_of_birth && <span className="error-text">{errors.date_of_birth}</span>}
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

                {['country', 'state', 'city'].map((loc) => (
                  <div className="field" key={loc}>
                    <label>{loc.charAt(0).toUpperCase() + loc.slice(1)}</label>
                    <input
                      type="text"
                      placeholder={`Enter ${loc}`}
                      value={(formData as any)[loc]}
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
                <label>Diagnosis Details</label>
                <textarea
                  placeholder="Enter diagnosis details"
                  value={formData.diagnosis_details}
                  onChange={(e) => handleChange('diagnosis_details', e.target.value)}
                  required
                />
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
    </IonPage>
  );
};

export default AddPatient;