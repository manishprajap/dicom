import React, { useEffect, useMemo, useRef, useState } from "react";
import { useIonRouter } from "@ionic/react";
import axios from "axios";
import {
  IonPage,
  IonContent,
  IonFooter,
  IonIcon,
  IonCard,
  IonCardContent,
  IonSpinner,
  IonInput,
  IonToast,
  IonAlert,
} from "@ionic/react";
import "../css/Profile.css";

import {
  chevronBackOutline,
  createOutline,
  checkmarkOutline,
  closeOutline,
  personOutline,
  mailOutline,
  callOutline,
  businessOutline,
  peopleOutline,
  shieldCheckmarkOutline,
  lockClosedOutline,
  logOutOutline,
  homeOutline,
  cameraOutline,
  cloudUploadOutline,
  settingsOutline,
  personCircleOutline,
  locationOutline,
} from "ionicons/icons";

const API_BASE = "https://aarnatechxperts.in/dicomapi/public/api";

// ---- Types -------------------------------------------------------------

interface UserData {
  name?: string;
  email?: string;
  phone?: string;
  facility?: string;
  department?: string;
  types?: string;
  address?: string;
  photo?: string;
}

interface EditableFields {
  name: string;
  phone: string;
  facility: string;
  department: string;
  address: string;
  
}

// ---- Component -----------------------------------------------------------

const Profile: React.FC = () => {
  const router = useIonRouter();

  const userId = localStorage.getItem("userId");

  // Seed from localStorage immediately so the page never renders empty,
  // then refresh from the server in the background.
  const storedUser: UserData = useMemo(() => {
    try {
      const raw = localStorage.getItem("uData");
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }, []);

  const [user, setUser] = useState<UserData>(storedUser);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [isEditing, setIsEditing] = useState(false);
  const [fields, setFields] = useState<EditableFields>({
    name: storedUser.name ?? "",
    phone: storedUser.phone ?? "",
    facility: storedUser.facility ?? "",
    department: storedUser.department ?? "",
    address: storedUser.address ?? "",
  });

  const [toast, setToast] = useState<{ show: boolean; message: string; color: "success" | "danger" }>({
    show: false,
    message: "",
    color: "success",
  });
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // ---- Profile photo state ----
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const accountType = (user?.types ?? "").toString().toLowerCase();
  const isGroupAccount = accountType === "group";

  const initials = (user?.name ?? "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "—";

  const avatarSrc = photoPreview || user.photo || "";

  useEffect(() => {
    let cancelled = false;

    const fetchProfile = async () => {
      if (!userId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const res = await axios.get(`${API_BASE}/getProfile`, {
          params: { userId },
        });
        if (!cancelled && res.data?.success && res.data.data) {
          const fresh: UserData = res.data.data;
          setUser(fresh);
          setFields({
            name: fresh.name ?? "",
            phone: fresh.phone ?? "",
            facility: fresh.facility ?? "",
            department: fresh.department ?? "",
            address: fresh.address ?? "",
          });
          
          localStorage.setItem("uData", JSON.stringify(fresh));
        }
      } catch (err) {
        // Non-fatal: fall back to whatever we already loaded from
        // localStorage above.
        console.error("Failed to load profile:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchProfile();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const goBack = () => {
    try {
      router.push("/dashboard", "back");
    } catch {
      window.location.href = "/dashboard";
    }
  };

  const navigateTo = (route: string) => {
    try {
      router.push(route, "forward");
    } catch {
      window.location.href = route;
    }
  };

  const startEditing = () => {
    setFields({
      name: user.name ?? "",
      phone: user.phone ?? "",
      facility: user.facility ?? "",
      department: user.department ?? "",
      address: user.address ?? "",
    });
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
  };

  const saveProfile = async () => {
    if (!userId) return;

    if (!fields.name.trim()) {
      setToast({ show: true, message: "Name cannot be empty.", color: "danger" });
      return;
    }

    setSaving(true);
    try {
      const res = await axios.post(`${API_BASE}/updateProfile`, {
        userId,
        name: fields.name.trim(),
        phone: fields.phone.trim(),
        facility: fields.facility.trim(),
        department: fields.department.trim(),
        address: fields.address.trim(),
       
      });

      if (res.data?.success) {
        const updated: UserData = { ...user, ...fields };
        setUser(updated);
        localStorage.setItem("uData", JSON.stringify(updated));
        setIsEditing(false);
        setToast({ show: true, message: "Profile updated successfully.", color: "success" });
      } else {
        setToast({ show: true, message: res.data?.message || "Could not update profile.", color: "danger" });
      }
    } catch (err) {
      console.error("Failed to update profile:", err);
      setToast({ show: true, message: "Something went wrong. Please try again.", color: "danger" });
    } finally {
      setSaving(false);
    }
  };

  // ---- Profile photo handlers ----

  const openPhotoPicker = () => {
    fileInputRef.current?.click();
  };

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset the input so selecting the same file again still fires onChange.
    e.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setToast({ show: true, message: "Please select an image file.", color: "danger" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setToast({ show: true, message: "Image must be smaller than 5MB.", color: "danger" });
      return;
    }

    // Show an instant local preview.
    const localUrl = URL.createObjectURL(file);
    setPhotoPreview(localUrl);

    if (!userId) return;

    setUploadingPhoto(true);
    try {
      const formData = new FormData();
      formData.append("userId", userId);
      formData.append("photo", file);

      const res = await axios.post(`${API_BASE}/updateProfilePhoto`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      if (res.data?.success) {
        const newPhotoUrl: string = res.data.data?.photo || res.data.photo || localUrl;
        const updated: UserData = { ...user, photo: newPhotoUrl };
        setUser(updated);
        localStorage.setItem("uData", JSON.stringify(updated));
        setToast({ show: true, message: "Profile photo updated.", color: "success" });
      } else {
        setToast({
          show: true,
          message: res.data?.message || "Could not update photo.",
          color: "danger",
        });
      }
    } catch (err) {
      console.error("Failed to upload profile photo:", err);
      setToast({ show: true, message: "Photo upload failed. Please try again.", color: "danger" });
    } finally {
      setUploadingPhoto(false);
    }
  };

  const logout = () => {
    localStorage.clear();
    router.push("/");
  };

  return (
    <IonPage>
      <IonContent fullscreen scrollY className="profile-content">
        
        <style>{`
          /* ---- Headings (matches Login .brand-title / .card-head-title) ---- */
          .profile-header-title {
            font-size: 20px;
            font-weight: 800;
            color: #0B3A4A;
            letter-spacing: 0.2px;
          }
          .profile-name {
            font-size: 20px;
            font-weight: 800;
            color: #0B3A4A;
            letter-spacing: 0.2px;
          }
          .profile-section-title {
            font-size: 14px;
            font-weight: 800;
            color: #0B3A4A;
          }
          .profile-badge {
            font-size: 13px;
            font-weight: 700;
            color: #4C8C93;
          }
          .profile-hipaa {
            font-size: 13px;
            color: #275C66;
          }
          .profile-hipaa strong {
            color: #0B3A4A;
          }

          /* ---- Field labels / values ----
             Label: small, uppercase, muted grey, letter-spaced -> reads as a caption.
             Value: larger, bold, dark -> reads as the actual data.
             This contrast is what was missing before (both looked identical). */
          .profile-field-label {
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.6px;
            text-transform: uppercase;
            color: #8A9AA0;
            margin-bottom: 3px;
          }
          .profile-field-value {
            font-size: 15.5px;
            font-weight: 600;
            color: #0B3A4A;
            line-height: 1.3;
          }
          .profile-field-hint {
            font-size: 12px;
            font-weight: 400;
            color: #9AA9AD;
            margin-top: 4px;
          }
          .profile-field-input {
            font-size: 15px;
            font-weight: 600;
            color: #0B3A4A;
            margin-top: 2px;
          }
          .profile-field-input::part(native) {
            font-size: 15px;
            font-weight: 600;
            color: #0B3A4A;
            padding-left: 0;
          }
          .profile-textarea {
            width: 100%;
            border: none;
            outline: none;
            resize: none;
            background: transparent;
            font-family: inherit;
            font-size: 15px;
            font-weight: 600;
            color: #0B3A4A;
            margin-top: 2px;
            padding: 0;
            border-bottom: 1.4px solid #DCEAEA;
            padding-bottom: 6px;
          }
          .profile-textarea:focus {
            border-bottom-color: #1CA79B;
          }

          /* ---- Buttons (matches Login .login-btn / .sso-btn) ---- */
          .profile-btn-primary,
          .profile-btn-ghost {
            font-size: 15px;
            font-weight: 700;
            letter-spacing: 0.4px;
          }
          .profile-action-label {
            font-size: 14px;
            font-weight: 700;
            color: #2B3A40;
          }
          .profile-tab span {
            font-size: 11.5px;
            font-weight: 600;
          }

          /* ---- Readonly email field, styled like a disabled Login input ---- */
          .profile-readonly-wrap {
            display: flex;
            align-items: center;
            gap: 10px;
            border: 1.4px solid #E4ECEC;
            border-radius: 12px;
            padding: 10px 14px;
            background: #F4F7F7;
          }
          .profile-readonly-wrap input {
            border: none;
            outline: none;
            background: transparent;
            flex: 1;
            font-size: 15px;
            font-weight: 600;
            color: #7C8A93;
            min-width: 0;
          }
          .profile-readonly-lock {
            display: flex;
            align-items: center;
            color: #9AA9AD;
            font-size: 15px;
            flex-shrink: 0;
          }

          /* ---- Avatar + photo upload ---- */
          .profile-avatar-wrap {
            position: relative;
            width: 96px;
            height: 96px;
            margin: 0 auto;
          }
          .profile-avatar-wrap .profile-avatar {
            width: 96px;
            height: 96px;
            overflow: hidden;
          }
          .profile-avatar-wrap .profile-avatar img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            border-radius: 50%;
            display: block;
          }
          .profile-avatar-edit-btn {
            position: absolute;
            bottom: 0;
            right: 0;
            width: 32px;
            height: 32px;
            border-radius: 50%;
            border: 2.5px solid #fff;
            display: flex;
            align-items: center;
            justify-content: center;
            background: linear-gradient(135deg, #1CA79B, #0B4C6A);
            color: #fff;
            font-size: 15px;
            box-shadow: 0 6px 14px rgba(11,76,106,0.3);
          }
          .profile-avatar-edit-btn:disabled {
            opacity: 0.7;
          }
          .profile-avatar-hidden-input {
            display: none;
          }
        `}</style>

        {/* Header */}
        <div className="profile-header">
          <div className="profile-header-row">
            <button className="profile-back-btn" aria-label="Back" onClick={goBack}>
              <IonIcon icon={chevronBackOutline} />
            </button>
            <h1 className="profile-header-title">My Profile</h1>
            {!isEditing ? (
              <button className="profile-icon-btn" aria-label="Edit profile" onClick={startEditing}>
                <IonIcon icon={createOutline} />
              </button>
            ) : (
              <span className="profile-header-spacer" />
            )}
          </div>
        </div>

        <div className="profile-body">
          {loading ? (
            <div className="profile-loading-row">
              <IonSpinner name="dots" />
            </div>
          ) : (
            <>
              {/* Avatar + identity summary */}
              <section className="profile-summary">
                <div className="profile-avatar-wrap">
                  <div className="profile-avatar">
                    {avatarSrc ? <img src={avatarSrc} alt="Profile" /> : <span>{initials}</span>}
                  </div>
                  <button
                    type="button"
                    className="profile-avatar-edit-btn"
                    aria-label="Change profile photo"
                    onClick={openPhotoPicker}
                    disabled={uploadingPhoto}
                  >
                    {uploadingPhoto ? <IonSpinner name="crescent" /> : <IonIcon icon={cameraOutline} />}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="profile-avatar-hidden-input"
                    onChange={handlePhotoChange}
                  />
                </div>
                <h2 className="profile-name">{user.name || "—"}</h2>
                <div className="profile-badge-row">
                  <span className="profile-badge">
                    <IonIcon icon={isGroupAccount ? peopleOutline : personCircleOutline} />
                    {isGroupAccount ? "Group Account" : "Individual Account"}
                  </span>
                </div>
                <div className="profile-hipaa">
                  <IonIcon icon={shieldCheckmarkOutline} />
                  <span>HIPAA compliant · Your data is secure</span>
                </div>
              </section>

              {/* Personal details */}
              <IonCard className="profile-section-card">
                <IonCardContent>
                  <div className="profile-section-header">
                    <span className="profile-section-title">
                      <IonIcon icon={personOutline} />
                      Personal Details
                    </span>
                  </div>

                  <div className="profile-field">
                    <span className="profile-field-icon">
                      <IonIcon icon={personOutline} />
                    </span>
                    <div className="profile-field-body">
                      <p className="profile-field-label">Full Name</p>
                      {isEditing ? (
                        <IonInput
                          className="profile-field-input"
                          value={fields.name}
                          placeholder="Enter your full name"
                          onIonInput={(e) =>
                            setFields((f) => ({ ...f, name: e.detail.value ?? "" }))
                          }
                        />
                      ) : (
                        <p className="profile-field-value">{user.name || "—"}</p>
                      )}
                    </div>
                  </div>

                  <div className="profile-field">
                    <span className="profile-field-icon">
                      <IonIcon icon={mailOutline} />
                    </span>
                    <div className="profile-field-body">
                      <p className="profile-field-label">Email Address</p>
                      {isEditing ? (
                        <>
                          <div className="profile-readonly-wrap">
                            <input type="email" value={user.email || ""} readOnly disabled />
                            <span className="profile-readonly-lock">
                              <IonIcon icon={lockClosedOutline} />
                            </span>
                          </div>
                          <p className="profile-field-hint">Email cannot be changed here</p>
                        </>
                      ) : (
                        <p className="profile-field-value">{user.email || "—"}</p>
                      )}
                    </div>
                  </div>

                  <div className="profile-field">
                    <span className="profile-field-icon">
                      <IonIcon icon={callOutline} />
                    </span>
                    <div className="profile-field-body">
                      <p className="profile-field-label">Phone Number</p>
                      {isEditing ? (
                        <IonInput
                          className="profile-field-input"
                          type="tel"
                          value={fields.phone}
                          placeholder="Enter your phone number"
                          onIonInput={(e) =>
                            setFields((f) => ({ ...f, phone: e.detail.value ?? "" }))
                          }
                        />
                      ) : (
                        <p className="profile-field-value">{user.phone || "—"}</p>
                      )}
                    </div>
                  </div>
                </IonCardContent>
              </IonCard>

              {/* Address details */}
              <IonCard className="profile-section-card">
                <IonCardContent>
                  <div className="profile-section-header">
                    <span className="profile-section-title">
                      <IonIcon icon={locationOutline} />
                      Address Details
                    </span>
                  </div>

                  <div className="profile-field">
                    <span className="profile-field-icon">
                      <IonIcon icon={locationOutline} />
                    </span>
                    <div className="profile-field-body">
                      <p className="profile-field-label">Address</p>
                      {isEditing ? (
                        <textarea
                          className="profile-textarea"
                          rows={2}
                          value={fields.address}
                          placeholder="Enter your street address"
                          onChange={(e) =>
                            setFields((f) => ({ ...f, address: e.target.value }))
                          }
                        />
                      ) : (
                        <p className="profile-field-value">{user.address || "—"}</p>
                      )}
                    </div>
                  </div>
                </IonCardContent>
              </IonCard>

              {/* Facility details */}
              <IonCard className="profile-section-card">
                <IonCardContent>
                  <div className="profile-section-header">
                    <span className="profile-section-title">
                      <IonIcon icon={businessOutline} />
                      Facility Details
                    </span>
                  </div>

                  <div className="profile-field">
                    <span className="profile-field-icon">
                      <IonIcon icon={businessOutline} />
                    </span>
                    <div className="profile-field-body">
                      <p className="profile-field-label">Facility</p>
                      {isEditing ? (
                        <IonInput
                          className="profile-field-input"
                          value={fields.facility}
                          placeholder="Enter facility name"
                          onIonInput={(e) =>
                            setFields((f) => ({ ...f, facility: e.detail.value ?? "" }))
                          }
                        />
                      ) : (
                        <p className="profile-field-value">{user.facility || "—"}</p>
                      )}
                    </div>
                  </div>

                  <div className="profile-field">
                    <span className="profile-field-icon">
                      <IonIcon icon={peopleOutline} />
                    </span>
                    <div className="profile-field-body">
                      <p className="profile-field-label">Department</p>
                      {isEditing ? (
                        <IonInput
                          className="profile-field-input"
                          value={fields.department}
                          placeholder="Enter department"
                          onIonInput={(e) =>
                            setFields((f) => ({ ...f, department: e.detail.value ?? "" }))
                          }
                        />
                      ) : (
                        <p className="profile-field-value">{user.department || "—"}</p>
                      )}
                    </div>
                  </div>
                </IonCardContent>
              </IonCard>

              {/* Save / Cancel bar while editing */}
              {isEditing && (
                <div className="profile-edit-actions">
                  <button className="profile-btn profile-btn-ghost" onClick={cancelEditing} disabled={saving}>
                    <IonIcon icon={closeOutline} />
                    Cancel
                  </button>
                  <button className="profile-btn profile-btn-primary" onClick={saveProfile} disabled={saving}>
                    {saving ? <IonSpinner name="dots" /> : <IonIcon icon={checkmarkOutline} />}
                    Save Changes
                  </button>
                </div>
              )}

              {/* Security & account actions */}
              {!isEditing && (
                <IonCard className="profile-section-card">
                  <IonCardContent>
                    <div className="profile-section-header">
                      <span className="profile-section-title">
                        <IonIcon icon={shieldCheckmarkOutline} />
                        Security
                      </span>
                    </div>

                    <button
                      className="profile-action-row"
                      onClick={() => navigateTo("/changepassword")}
                    >
                      <span className="profile-action-icon">
                        <IonIcon icon={lockClosedOutline} />
                      </span>
                      <span className="profile-action-label">Change Password</span>
                      <IonIcon icon={chevronBackOutline} className="profile-action-chevron" />
                    </button>

                    <button
                      className="profile-action-row profile-action-danger"
                      onClick={() => setShowLogoutConfirm(true)}
                    >
                      <span className="profile-action-icon profile-action-icon-danger">
                        <IonIcon icon={logOutOutline} />
                      </span>
                      <span className="profile-action-label">Logout</span>
                    </button>
                  </IonCardContent>
                </IonCard>
              )}
            </>
          )}
        </div>

        <IonToast
          isOpen={toast.show}
          message={toast.message}
          duration={2500}
          color={toast.color}
          onDidDismiss={() => setToast((t) => ({ ...t, show: false }))}
        />

        <IonAlert
          isOpen={showLogoutConfirm}
          header="Log out"
          message="Are you sure you want to log out?"
          buttons={[
            { text: "Cancel", role: "cancel" },
            { text: "Logout", role: "destructive", handler: logout },
          ]}
          onDidDismiss={() => setShowLogoutConfirm(false)}
        />
      </IonContent>

      {/* Bottom tab bar — kept consistent with Dashboard */}
      <IonFooter className="profile-footer">
        <div className="profile-tabbar">
          <button className="profile-tab" onClick={() => navigateTo("/dashboard")}>
            <IonIcon icon={homeOutline} />
            <span>Dashboard</span>
          </button>
          <button className="profile-tab" onClick={() => navigateTo("/patientlist")}>
            <IonIcon icon={peopleOutline} />
            <span>Patients</span>
          </button>
          <button className="profile-tab-capture" onClick={() => navigateTo("/uploadImages?source=camera")}>
            <IonIcon icon={cameraOutline} />
          </button>
          <button className="profile-tab" onClick={() => navigateTo("/viewall")}>
            <IonIcon icon={cloudUploadOutline} />
            <span>Uploads</span>
          </button>
          <button className="profile-tab profile-tab-active" onClick={() => navigateTo("/settings")}>
            <IonIcon icon={settingsOutline} />
            <span>Settings</span>
          </button>
        </div>
      </IonFooter>
      
    </IonPage>
  );
};

export default Profile;