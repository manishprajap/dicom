import {
  IonPage,
  IonContent,
  IonButton,
  IonToast,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonIcon,
  useIonRouter,
  IonButtons,
  IonBackButton,
} from "@ionic/react";
import { eyeOutline, eyeOffOutline } from "ionicons/icons";
import { useState } from "react";
import "../css/AwsConfig.css";
import AppFooter from "../components/AppFooter";

const API_BASE_URL = "https://aarnatechxperts.in/dicomapi/public/api";

const AwsConfig: React.FC = () => {
  const router = useIonRouter();

  const [bucketName, setBucketName] = useState("");
  const [region, setRegion] = useState("");
  const [accessKey, setAccessKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [showSecretKey, setShowSecretKey] = useState(false);

  const [loading, setLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [showToast, setShowToast] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const userID = localStorage.getItem("userId") || localStorage.getItem("user_id");
      const token = localStorage.getItem("token");

      if (!userID) {
        setToastMessage("User not logged in. Please login again.");
        setShowToast(true);
        setLoading(false);
        return;
      }

      const response = await fetch(`${API_BASE_URL}/storeaws`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          userID,
          bucketName,
          region,
          accessKey,
          secretKey,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        const firstError =
          data?.errors && Object.values(data.errors)[0]
            ? (Object.values(data.errors)[0] as string[])[0]
            : data?.message || "Failed to save AWS configuration.";
        setToastMessage(firstError);
        setShowToast(true);
        setLoading(false);
        return;
      }

      setToastMessage(data.message || "AWS Configuration saved successfully!");
      setShowToast(true);

      setTimeout(() => router.push("/awsConfiglist?reload=1"), 1200);
    } catch (error) {
      console.error("AWS Config error:", error);
      setToastMessage("Failed to save AWS configuration.");
      setShowToast(true);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setBucketName("");
    setRegion("");
    setAccessKey("");
    setSecretKey("");
    router.push("/dashboard");
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar className="custom-toolbar">
          <IonButtons slot="start">
            <IonBackButton defaultHref="/dashboard" color="light" />
          </IonButtons>
          <IonTitle className="text-white w-full text-center">
            AWS Configuration
          </IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent fullscreen className="dicom-bg">
        <div className="awsconfig-container">
          <div className="awsconfig-box">
            <h2 className="awsconfig-title">AWS S3 Setup</h2>

            <form onSubmit={handleSave} className="aws-form">
              <div className="field">
                <label>Bucket Name</label>
                <input
                  type="text"
                  placeholder="Enter S3 bucket name"
                  value={bucketName}
                  onChange={(e) => setBucketName(e.target.value)}
                  required
                />
              </div>

              <div className="field">
                <label>Region</label>
                <input
                  type="text"
                  placeholder="e.g. ap-south-1"
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  required
                />
              </div>

              <div className="field">
                <label>Access Key ID</label>
                <input
                  type="text"
                  placeholder="AWS Access Key ID"
                  value={accessKey}
                  onChange={(e) => setAccessKey(e.target.value)}
                  required
                />
              </div>

              <div className="field">
                <label>Secret Access Key</label>
                <div style={{ position: "relative" }}>
                  <input
                    type={showSecretKey ? "text" : "password"}
                    placeholder="AWS Secret Key"
                    value={secretKey}
                    onChange={(e) => setSecretKey(e.target.value)}
                    required
                    style={{ paddingRight: "40px" }}
                  />
                  <IonButton
                    fill="clear"
                    size="small"
                    className="reveal-btn"
                    onClick={() => setShowSecretKey((s) => !s)}
                    style={{
                      position: "absolute",
                      right: 0,
                      top: "50%",
                      transform: "translateY(-50%)",
                    }}
                  >
                    <IonIcon icon={showSecretKey ? eyeOffOutline : eyeOutline} />
                  </IonButton>
                </div>
              </div>

              <div className="button-group">
                <IonButton
                  expand="block"
                  type="submit"
                  className="save-btn"
                  disabled={loading}
                >
                  {loading ? "Saving..." : "Save"}
                </IonButton>

                <IonButton
                  expand="block"
                  color="medium"
                  className="cancel-btn"
                  onClick={handleCancel}
                  disabled={loading}
                >
                  Cancel
                </IonButton>
              </div>
            </form>
          </div>
        </div>

        <IonToast
          isOpen={showToast}
          onDidDismiss={() => setShowToast(false)}
          message={toastMessage}
          duration={2000}
          color={toastMessage.includes("successfully") ? "success" : "danger"}
        />
      </IonContent>
      <AppFooter/>
    </IonPage>
  );
};

export default AwsConfig;