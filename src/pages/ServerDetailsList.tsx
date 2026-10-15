import React, { useEffect, useState } from "react";
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonBackButton,
  IonContent,
  IonCard,
  IonCardContent,
  IonButton,
  IonToast,
  IonSpinner,
  IonIcon,
  IonAlert,
  IonFooter,
  useIonRouter,
} from "@ionic/react";
import axios from "axios";
import { useHistory } from "react-router-dom";
import {
  serverOutline,
  folderOpenOutline,
  cloudUploadOutline,
  createOutline,
  trashOutline,
  copyOutline,
  checkmarkOutline,
  homeOutline,
  peopleOutline,
  cameraOutline,
  settingsOutline,
} from "ionicons/icons";
import "../css/ServerList.css";

// Shared app accent — same gradient used on the dashboard header and the
// upload flow, so this page doesn't feel like a different app.
const HEADER_GRADIENT = "linear-gradient(135deg, #0f766e 0%, #059669 100%)";

const ServerDetailsList: React.FC = () => {
  const history = useHistory();
  const router = useIonRouter();
  const [serverDetails, setServerDetails] = useState<any[]>([]);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  useEffect(() => {
    const userID = localStorage.getItem("userId");
    console.log('userid:', userID);
    if (!userID) {
      setToastMessage("User not logged in. Please login again.");
      setShowToast(true);
      setLoading(false);
      return;
    }

    const fetchServerDetails = async () => {
      try {
        const response = await axios.post(
          "https://aarnatechxperts.in/dicomapi/public/api/hostuserlist",
          { userID }
        );

        if (response.data.success) {
          setServerDetails(response.data.data || []);
        } else {
          setToastMessage("Failed to load server details.");
          setShowToast(true);
        }
      } catch (error) {
        console.error("Error fetching server details", error);
        setToastMessage("An error occurred while fetching server data.");
        setShowToast(true);
      } finally {
        setLoading(false);
      }
    };

    fetchServerDetails();
  }, []);

  // 🧭 Navigation Handlers
  const handleOpenImages = (server: any) => {
    history.push({ pathname: "/image-list", state: { server } });
  };

  const handleViewServer = (server: any) => {
    history.push({ pathname: "/server-details", state: { server } });
  };

  const handleDelete = async (id: number) => {
    try {
      await axios.post(
        `https://aarnatechxperts.in/dicomapi/public/api/deleteDicomserver/${id}`
      );
      setServerDetails((prev) => prev.filter((s) => s.id !== id));
      setToastMessage("Server deleted successfully.");
      setShowToast(true);
    } catch (error) {
      console.error("Error deleting server:", error);
      setToastMessage("Failed to delete server.");
      setShowToast(true);
    } finally {
      setConfirmDeleteId(null);
    }
  };

  const copyToClipboard = (value: string, field: string) => {
    if (!value) return;
    navigator.clipboard?.writeText(value).then(() => {
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 1200);
    });
  };

  return (
    <IonPage>
      {/* 🔹 HEADER — same teal gradient used across the app */}
      <IonHeader translucent>
        <IonToolbar
          style={
            {
              "--background": HEADER_GRADIENT,
              "--color": "#ffffff",
              "--border-width": "0",
            } as React.CSSProperties
          }
        >
          <IonButtons slot="start">
            <IonBackButton
              defaultHref="/dashboard"
              style={{ "--color": "#ffffff" } as React.CSSProperties}
            />
          </IonButtons>
          <IonTitle className="ion-text-center" style={{ fontWeight: 700 }}>
            Server Details
          </IonTitle>
        </IonToolbar>
      </IonHeader>

      {/* 🔹 CONTENT */}
      <IonContent fullscreen className="dicom-bg server-list-bg" style={{ "--background": "#f8fafc" } as React.CSSProperties}>
        {loading ? (
          <div className="ion-text-center ion-margin-top">
            <IonSpinner name="crescent" style={{ color: "#059669" } as React.CSSProperties} />
          </div>
        ) : serverDetails.length === 0 ? (
          <p className="empty-text">No servers found.</p>
        ) : (
          <div className="server-list">
            {serverDetails.map((server) => (
              <div key={server.id} className="server-list-row" onClick={() => handleOpenImages(server)}>
                <span className="server-list-icon"><IonIcon icon={serverOutline} /></span>
                <div className="server-list-copy">
                  <div className="server-list-title-row">
                    <p className="server-list-name">{server.hostname || "Unnamed Server"}</p>
                    <span className="server-list-port">:{server.port || "-"}</span>
                  </div>
                  <div className="server-list-address-row">
                    <span className="server-list-address">{server.ips || "IP unavailable"}</span>
                    {server.ips && (
                      <button
                        className="server-list-copy-btn"
                        onClick={(event) => {
                          event.stopPropagation();
                          copyToClipboard(server.ips, `ip-${server.id}`);
                        }}
                        aria-label="Copy IP address"
                      >
                        <IonIcon icon={copiedField === `ip-${server.id}` ? checkmarkOutline : copyOutline} />
                      </button>
                    )}
                  </div>
                </div>
                <div className="server-list-actions" onClick={(event) => event.stopPropagation()}>
                  <IonButton fill="clear" className="server-list-action" aria-label="Edit server" onClick={() => handleViewServer(server)}>
                    <IonIcon icon={createOutline} />
                  </IonButton>
                  <IonButton fill="clear" className="server-list-action server-list-delete" aria-label="Delete server" onClick={() => setConfirmDeleteId(server.id)}>
                    <IonIcon icon={trashOutline} />
                  </IonButton>
                </div>
              </div>
            ))}
          </div>
        )}

        <IonAlert
          isOpen={confirmDeleteId !== null}
          onDidDismiss={() => setConfirmDeleteId(null)}
          header="Delete Server"
          message="Are you sure you want to delete this server?"
          buttons={[
            { text: "Cancel", role: "cancel" },
            {
              text: "Delete",
              role: "destructive",
              handler: () => {
                if (confirmDeleteId !== null) handleDelete(confirmDeleteId);
              },
            },
          ]}
        />

        <IonToast
          isOpen={showToast}
          message={toastMessage}
          duration={2000}
          onDidDismiss={() => setShowToast(false)}
          color={toastMessage.includes("successfully") ? "success" : "danger"}
        />
      </IonContent>
      <IonFooter className="dash-footer">
          <div className="dash-tabbar">
            <button
              className="dash-tab"
              onClick={() => router.push("/dashboard", "back")}
            >
              <IonIcon icon={homeOutline} />
              <span>Dashboard</span>
            </button>

            <button
              className="dash-tab"
              onClick={() => router.push("/patientlist", "forward")}
            >
              <IonIcon icon={peopleOutline} />
              <span>Patients</span>
            </button>

            <button
              className="dash-tab-capture"
              onClick={() => router.push("/uploadImages?source=camera", "forward")}
            >
              <IonIcon icon={cameraOutline} />
            </button>

            <button
              className="dash-tab dash-tab-active"
              onClick={() => router.push("/viewall", "forward")}
            >
              <IonIcon icon={cloudUploadOutline} />
              <span>View</span>
            </button>

            <button
              className="dash-tab"
              onClick={() => router.push("/settings", "forward")}
            >
              <IonIcon icon={settingsOutline} />
              <span>Settings</span>
            </button>
          </div>
        </IonFooter>
    </IonPage>
  );
};

export default ServerDetailsList;