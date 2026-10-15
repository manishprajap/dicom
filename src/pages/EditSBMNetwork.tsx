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
  IonSpinner,
  useIonRouter,
  useIonViewWillEnter,
} from "@ionic/react";

import { useState } from "react";
import { useParams } from "react-router-dom";
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

const EditSBMNetwork: React.FC = () => {
  const router = useIonRouter();
  const { id } = useParams<{ id: string }>();

  const [formData, setFormData] = useState<FormData>({
    title: "",
    ip: "",
    share: "",
    username: "",
    password: "",
  });

  const [loaded, setLoaded] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch this entry from the API every time the page is entered —
  // same pattern as SFTPEditPage / AwsConfigEdit.
  useIonViewWillEnter(() => {
    setLoaded(false);
    setNotFound(false);

    const fetchRecord = async () => {
      try {
        const token = localStorage.getItem("token");

        const response = await fetch(`${API_BASE_URL}/getsbm/${id}`, {
          method: "GET",
          headers: {
            Accept: "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });

        if (response.status === 404) {
          setNotFound(true);
          setLoaded(true);
          return;
        }

        const data = await response.json();

        if (!response.ok) {
          setNotFound(true);
          setLoaded(true);
          return;
        }

        const record = data.data || data;

        setFormData({
          title: record.title || "",
          ip: record.ip || "",
          share: record.share || "",
          username: record.username || "",
          password: record.password || "",
        });
        setNotFound(false);
        setLoaded(true);
      } catch (error) {
        console.error(error);
        setNotFound(true);
        setLoaded(true);
      }
    };

    fetchRecord();
  });

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
      const token = localStorage.getItem("token");

      const response = await fetch(`${API_BASE_URL}/updatesbm/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
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
            : data?.message || "❌ Failed to update entry";
        setToastMessage(firstError);
        setShowToast(true);
        setIsSubmitting(false);
        return;
      }

      // Keep "sbmSelected" in sync too, in case SbmUploads reads it next.
      const updatedRecord = data.data;
      if (updatedRecord) {
        localStorage.setItem(
          "sbmSelected",
          JSON.stringify({
            id: String(updatedRecord.id),
            title: updatedRecord.title,
            ip: updatedRecord.ip,
            share: updatedRecord.share,
            username: updatedRecord.username,
            password: updatedRecord.password,
          })
        );
      }

      setToastMessage("✅ SMB Network entry updated!");
      setShowToast(true);

      // FIX: "back" direction can silently fail to navigate if this page
      // wasn't reached via a matching forward push in the stack (e.g. after
      // a refresh or deep link). "forward" reliably navigates regardless
      // of stack state — same fix applied to the other edit pages.
      setTimeout(() => {
        router.push("/sbm", "forward");
      }, 600);
    } catch (error) {
      console.error("Update SBM error:", error);
      setToastMessage("❌ Failed to update entry");
      setShowToast(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loaded && notFound) {
    return (
      <IonPage>
        <IonHeader translucent>
          <IonToolbar className="custom-toolbar">
            <IonButtons slot="start">
              <IonBackButton defaultHref="/sbm" color="light" />
            </IonButtons>
            <IonTitle className="text-white text-center">Edit SMB Network</IonTitle>
          </IonToolbar>
        </IonHeader>
        <IonContent fullscreen className="dicom-bg">
          <div className="signup-container">
            <p style={{ color: "#fff", textAlign: "center", marginTop: 40 }}>
              Entry not found. It may have been deleted.
            </p>
          </div>
        </IonContent>
      </IonPage>
    );
  }

  return (
    <IonPage>
      <IonHeader translucent>
        <IonToolbar className="custom-toolbar">
          <IonButtons slot="start">
            <IonBackButton defaultHref="/sbm" color="light" />
          </IonButtons>
          <IonTitle className="text-white text-center">Edit SMB Network</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent fullscreen className="dicom-bg">
        <div className="signup-container">
          <div className="signup-box">
            {!loaded ? (
              <div className="ion-text-center ion-padding">
                <IonSpinner name="crescent" />
              </div>
            ) : (
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
                  <label>Username (optional)</label>
                  <input
                    type="text"
                    placeholder="Leave blank for Guest"
                    value={formData.username}
                    onChange={(e) => handleChange("username", e.target.value)}
                  />
                </div>

                <div className="field">
                  <label>Password (optional)</label>
                  <input
                    type="password"
                    placeholder="Leave blank for Guest"
                    value={formData.password}
                    onChange={(e) => handleChange("password", e.target.value)}
                  />
                </div>

                <IonButton expand="block" type="submit" className="signup-btn" disabled={isSubmitting}>
                  {isSubmitting ? "Updating..." : "Update SMB Network"}
                </IonButton>
              </form>
            )}
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

export default EditSBMNetwork;