import React, { useState } from "react";
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButtons,
  IonBackButton,
  IonButton,
  IonToast,
  IonLoading,
  IonToggle,
  IonIcon,
} from "@ionic/react";
import { useIonRouter } from "@ionic/react";
import { eyeOutline, eyeOffOutline } from "ionicons/icons";
import "../css/Signup.css";
import AppFooter from "../components/AppFooter";

// ---------------- Types ----------------
type UserRole = "super_admin" | "hospital_admin" | "hospital_user" | "doctor";

interface FormState {
  fullName: string;
  email: string;
  phone: string;
  username: string;
  password: string;
  confirmPassword: string;
  role: UserRole | "";
  hospitalName: string;
  isActive: boolean;
}

interface FormErrors {
  [key: string]: string;
}

const initialFormState: FormState = {
  fullName: "",
  email: "",
  phone: "",
  username: "",
  password: "",
  confirmPassword: "",
  role: "",
  hospitalName: "",
  isActive: true,
};

const SaveUserDetails: React.FC = () => {
  const router = useIonRouter();

  const [form, setForm] = useState<FormState>(initialFormState);
  const [errors, setErrors] = useState<FormErrors>({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [toastMsg, setToastMsg] = useState("");
  const [toastColor, setToastColor] = useState<"success" | "danger">("success");

  const updateField = (field: keyof FormState, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    // clear the field's error as soon as the user edits it
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  // ---------------- Validation ----------------
  const validate = (): boolean => {
    const newErrors: FormErrors = {};

    if (!form.fullName.trim()) {
      newErrors.fullName = "Full name is required.";
    }

    if (!form.email.trim()) {
      newErrors.email = "Email is required.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      newErrors.email = "Enter a valid email address.";
    }

    if (!form.phone.trim()) {
      newErrors.phone = "Phone number is required.";
    } else if (!/^\d{10}$/.test(form.phone.trim())) {
      newErrors.phone = "Enter a valid 10-digit phone number.";
    }

    if (!form.username.trim()) {
      newErrors.username = "Username is required.";
    }

    if (!form.password) {
      newErrors.password = "Password is required.";
    } else if (form.password.length < 6) {
      newErrors.password = "Password must be at least 6 characters.";
    }

    if (form.confirmPassword !== form.password) {
      newErrors.confirmPassword = "Passwords do not match.";
    }

    if (!form.role) {
      newErrors.role = "Please select a role.";
    }

    if (
      (form.role === "hospital_admin" ||
        form.role === "hospital_user" ||
        form.role === "doctor") &&
      !form.hospitalName.trim()
    ) {
      newErrors.hospitalName = "Hospital/Organization name is required for this role.";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // ---------------- Submit ----------------
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) {
      setToastColor("danger");
      setToastMsg("Please fix the highlighted fields.");
      return;
    }

    setLoading(true);
    try {
      const payload = {
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        username: form.username.trim(),
        password: form.password,
        role: form.role,
        hospitalName: form.hospitalName.trim(),
        isActive: form.isActive,
      };

      // TODO: plug in your actual API endpoint here
      // const res = await axios.post("/api/users", payload);

      console.log("Submitting user:", payload);
      await new Promise((resolve) => setTimeout(resolve, 1000)); // demo delay

      setLoading(false);
      setToastColor("success");
      setToastMsg("User created successfully!");
      setForm(initialFormState);

      setTimeout(() => {
        router.push("/dashboard", "back");
      }, 1200);
    } catch (err) {
      console.error("Failed to create user:", err);
      setLoading(false);
      setToastColor("danger");
      setToastMsg("Failed to create user. Please try again.");
    }
  };

  const showHospitalField =
    form.role === "hospital_admin" ||
    form.role === "hospital_user" ||
    form.role === "doctor";

  return (
    <IonPage>
      <IonHeader translucent>
        <IonToolbar className="custom-toolbar">
          <IonButtons slot="start">
            <IonBackButton defaultHref="/dashboard" />
          </IonButtons>
          <IonTitle className="text-white text-center">Add User</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent fullscreen className="dicom-bg">
        <div className="signup-container">
          <div className="signup-box">
            <form onSubmit={handleSubmit}>

              {/* ===== 2 COLUMN GRID ===== */}
              <div className="form-grid">

                <div className="field">
                  <label>Full Name<span className="required-star">*</span></label>
                  <input
                    type="text"
                    placeholder="Enter full name"
                    value={form.fullName}
                    onChange={(e) => updateField("fullName", e.target.value)}
                  />
                  {errors.fullName && <span className="error-text">{errors.fullName}</span>}
                </div>

                <div className="field">
                  <label>Email<span className="required-star">*</span></label>
                  <input
                    type="email"
                    placeholder="user@example.com"
                    value={form.email}
                    onChange={(e) => updateField("email", e.target.value)}
                  />
                  {errors.email && <span className="error-text">{errors.email}</span>}
                </div>

                <div className="field">
                  <label>Phone Number<span className="required-star">*</span></label>
                  <input
                    type="tel"
                    maxLength={10}
                    placeholder="10-digit mobile number"
                    value={form.phone}
                    onChange={(e) => updateField("phone", e.target.value)}
                  />
                  {errors.phone && <span className="error-text">{errors.phone}</span>}
                </div>

                <div className="field">
                  <label>Username<span className="required-star">*</span></label>
                  <input
                    type="text"
                    placeholder="Choose a username"
                    value={form.username}
                    onChange={(e) => updateField("username", e.target.value)}
                  />
                  {errors.username && <span className="error-text">{errors.username}</span>}
                </div>

                <div className="field pw-wrap">
                  <label>Password<span className="required-star">*</span></label>
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="At least 6 characters"
                    value={form.password}
                    onChange={(e) => updateField("password", e.target.value)}
                  />
                  <IonIcon
                    icon={showPassword ? eyeOffOutline : eyeOutline}
                    className="pw-eye"
                    onClick={() => setShowPassword((prev) => !prev)}
                  />
                  {errors.password && <span className="error-text">{errors.password}</span>}
                </div>

                <div className="field pw-wrap">
                  <label>Confirm Password<span className="required-star">*</span></label>
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="Re-enter password"
                    value={form.confirmPassword}
                    onChange={(e) => updateField("confirmPassword", e.target.value)}
                  />
                  <IonIcon
                    icon={showConfirmPassword ? eyeOffOutline : eyeOutline}
                    className="pw-eye"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                  />
                  {errors.confirmPassword && (
                    <span className="error-text">{errors.confirmPassword}</span>
                  )}
                </div>

                <div className="field">
                  <label>Role<span className="required-star">*</span></label>
                  <select
                    value={form.role}
                    onChange={(e) => updateField("role", e.target.value)}
                  >
                    <option value="" disabled>Select role</option>
                    <option value="super_admin">Super Admin</option>
                    <option value="hospital_admin">Hospital Admin</option>
                    <option value="hospital_user">Hospital User</option>
                    <option value="doctor">Doctor</option>
                  </select>
                  {errors.role && <span className="error-text">{errors.role}</span>}
                </div>

                {showHospitalField && (
                  <div className="field">
                    <label>Hospital / Organization<span className="required-star">*</span></label>
                    <input
                      type="text"
                      placeholder="Enter hospital or organization name"
                      value={form.hospitalName}
                      onChange={(e) => updateField("hospitalName", e.target.value)}
                    />
                    {errors.hospitalName && (
                      <span className="error-text">{errors.hospitalName}</span>
                    )}
                  </div>
                )}

              </div>

              {/* ===== FULL WIDTH FIELDS ===== */}
              <div className="field full-width active-row">
                <label>Active</label>
                <IonToggle
                  checked={form.isActive}
                  onIonChange={(e) => updateField("isActive", e.detail.checked)}
                />
              </div>

              <IonButton
                expand="block"
                type="submit"
                className="signup-btn"
                disabled={loading}
              >
                {loading ? "Saving User..." : "Save User"}
              </IonButton>

            </form>
          </div>
        </div>

        <IonLoading isOpen={loading} message="Saving user..." />
        <IonToast
          isOpen={!!toastMsg}
          message={toastMsg}
          color={toastColor}
          duration={2000}
          onDidDismiss={() => setToastMsg("")}
        />
      </IonContent>
      <AppFooter/>
    </IonPage>
  );
};

export default SaveUserDetails;