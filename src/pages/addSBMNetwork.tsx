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
} from "@ionic/react";

import { useState } from "react";
import "../css/Signup.css";
import AppFooter from "../components/AppFooter";

const API_BASE_URL = "https://aarnatechxperts.in/dicomapi/public/api";

type FormData = {
  title: string;
  ip: string;
  share: string;
  username: string;
  password: string;
};

const AddSBMNetwork: React.FC = () => {
  const router = useIonRouter();

  const [formData, setFormData] = useState<FormData>({
    title: "",
    ip: "",
    share: "WiFiShare",
    username: "",
    password: "",
  });

  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (field: keyof FormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.title.trim() || !formData.ip.trim() || !formData.share.trim()) {
      setToastMessage("❌ Please fill Title, IP Address and Share Name");
      setShowToast(true);
      return;
    }

    setIsSubmitting(true);

    try {
      const userID = localStorage.getItem("userId") || localStorage.getItem("user_id");
      const token = localStorage.getItem("token");

      if (!userID) {
        setToastMessage("❌ User not logged in. Please login again.");
        setShowToast(true);
        setIsSubmitting(false);
        return;
      }

      const response = await fetch(`${API_BASE_URL}/storesbm`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          userID,
          title: formData.title.trim(),
          ip: formData.ip.trim(),
          share: formData.share.trim(),
          username: formData.username.trim(),
          password: formData.password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        const firstError =
          data?.errors && Object.values(data.errors)[0]
            ? (Object.values(data.errors)[0] as string[])[0]
            : data?.message || "❌ Failed to save entry";
        setToastMessage(firstError);
        setShowToast(true);
        setIsSubmitting(false);
        return;
      }

      setToastMessage("✅ SMB Network entry saved!");
      setShowToast(true);

      setFormData({
        title: "",
        ip: "",
        share: "WiFiShare",
        username: "",
        password: "",
      });

      setTimeout(() => {
        router.push("/sbm", "forward");
      }, 600);
    } catch (error) {
      console.error("Save SMB error:", error);
      setToastMessage("❌ Failed to save entry");
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
            <IonBackButton defaultHref="/dashboard" color="light" />
          </IonButtons>
          <IonTitle className="text-white text-center">Add SMB Network</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent fullscreen className="dicom-bg">
        <div className="signup-container">
          <div className="signup-box">
            <form onSubmit={handleSubmit}>
              <div className="field">
                <label>Title</label>
                <input
                  type="text"
                  placeholder="File Share"
                  value={formData.title}
                  onChange={(e) => handleChange("title", e.target.value)}
                />
              </div>

              <div className="field">
                <label>IP Address</label>
                <input
                  type="text"
                  placeholder="192.168.1.46"
                  value={formData.ip}
                  onChange={(e) => handleChange("ip", e.target.value)}
                />
              </div>

              <div className="field">
                <label>Share Name</label>
                <input
                  type="text"
                  placeholder="WiFiShare / Public / shared"
                  value={formData.share}
                  onChange={(e) => handleChange("share", e.target.value)}
                />
              </div>

              <div className="field">
                <label>Username </label>
                <input
                  type="text"
                  placeholder="Please enter the user name"
                  value={formData.username}
                  onChange={(e) => handleChange("username", e.target.value)}
                />
              </div>

              <div className="field">
                <label>Password </label>
                <input
                  type="password"
                  placeholder="Please enter password"
                  value={formData.password}
                  onChange={(e) => handleChange("password", e.target.value)}
                />
              </div>

              <IonButton expand="block" type="submit" className="signup-btn" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : "Save SMB Network"}
              </IonButton>
            </form>
          </div>
        </div>

        <IonToast
          isOpen={showToast}
          onDidDismiss={() => setShowToast(false)}
          message={toastMessage}
          duration={2500}
          color={toastMessage.includes("✅") ? "success" : "danger"}
        />
      </IonContent>
      <AppFooter/>
    </IonPage>
  );
};

export default AddSBMNetwork;