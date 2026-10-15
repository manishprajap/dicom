import React, { useState } from "react";
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonBackButton,
  IonContent,
  IonButton,
  IonCard,
  IonCardContent,
  IonIcon,
  IonText,
  useIonViewWillEnter,
  useIonRouter,
} from "@ionic/react";
import { useParams } from "react-router";
import {
  serverOutline,
  personOutline,
  keyOutline,
  swapVerticalOutline,
  createOutline,
  folderOpenOutline,
  eyeOffOutline,
  eyeOutline,
} from "ionicons/icons";
import { SFTP_LIST_ROUTE } from "./SFTPList";
import AppFooter from "../components/AppFooter";

interface SFTPConfig {
  id: string;
  user: string;
  host: string;
  port: string;
  password: string;
  protocol?: string;
}

const SFTPViewPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [cfg, setCfg] = useState<SFTPConfig | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const router = useIonRouter();

  useIonViewWillEnter(() => {
    // Prefer the id in the URL (works even on direct navigation/refresh);
    // fall back to whatever the list page last stashed as "selected".
    const stored: SFTPConfig[] = JSON.parse(localStorage.getItem("sftpConnections") || "[]");
    const byId = id ? stored.find((c) => c.id === id) : undefined;

    if (byId) {
      setCfg(byId);
      return;
    }

    const selected = localStorage.getItem("sftpSelected");
    setCfg(selected ? JSON.parse(selected) : null);
  });

  const isAuthenticated = () => {
    const token = localStorage.getItem("token");
    const user = localStorage.getItem("uData");
    return !!token && !!user;
  };

  const handleOpenFiles = () => {
    if (!cfg) return;
    if (!isAuthenticated()) {
      router.push("/login", "root");
      return;
    }
    router.push("/sftpBrowse?path=/", "forward");
  };

  const handleEdit = () => {
    if (!cfg) return;
    router.push(`/sftpEdit/${cfg.id}`, "forward");
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar className="custom-toolbar">
          <IonButtons slot="start">
            <IonBackButton defaultHref={SFTP_LIST_ROUTE} color="light" />
          </IonButtons>
          <IonTitle className="ion-text-center text-white">
            {cfg?.protocol?.toUpperCase() || "SFTP"} Details
          </IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent className="dicom-bg server-list-bg ion-padding">
        {!cfg ? (
          <IonText color="medium" className="empty-text">
            No connection selected. Please go back and choose one from the list.
          </IonText>
        ) : (
          <IonCard className="view-card">
            <IonCardContent>
              <div className="view-row">
                <IonIcon icon={serverOutline} />
                <div>
                  <span className="view-label">Host</span>
                  <span className="view-value">{cfg.host}</span>
                </div>
              </div>

              <div className="view-row">
                <IonIcon icon={swapVerticalOutline} />
                <div>
                  <span className="view-label">Port</span>
                  <span className="view-value">{cfg.port}</span>
                </div>
              </div>

              <div className="view-row">
                <IonIcon icon={personOutline} />
                <div>
                  <span className="view-label">Username</span>
                  <span className="view-value">{cfg.user}</span>
                </div>
              </div>

              <div className="view-row">
                <IonIcon icon={keyOutline} />
                <div>
                  <span className="view-label">Password</span>
                  <span className="view-value password-value">
                    {showPassword ? cfg.password : "•".repeat(Math.max(cfg.password?.length || 8, 6))}
                  </span>
                </div>
                <IonButton
                  fill="clear"
                  size="small"
                  className="reveal-btn"
                  onClick={() => setShowPassword((s) => !s)}
                >
                  <IonIcon icon={showPassword ? eyeOffOutline : eyeOutline} />
                </IonButton>
              </div>

              <div className="view-row">
                <IonIcon icon={serverOutline} />
                <div>
                  <span className="view-label">Protocol</span>
                  <span className="view-value">{cfg.protocol?.toUpperCase() || "SFTP"}</span>
                </div>
              </div>

              <div className="button-row">
                <IonButton size="small" color="success" className="box-btn" onClick={handleOpenFiles}>
                  <IonIcon icon={folderOpenOutline} slot="start" />
                  OPEN
                </IonButton>

                <IonButton size="small" color="tertiary" className="box-btn" onClick={handleEdit}>
                  <IonIcon icon={createOutline} slot="start" />
                  EDIT
                </IonButton>
              </div>
            </IonCardContent>
          </IonCard>
        )}
      </IonContent>

      <style>{`
        .view-card {
          border-radius: 14px;
        }

        .view-row {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 0;
          border-bottom: 1px solid rgba(0, 0, 0, 0.06);
        }

        .view-row:last-of-type {
          border-bottom: none;
        }

        .view-row ion-icon {
          font-size: 20px;
          color: #5c5555;
          flex-shrink: 0;
        }

        .view-row > div:not(.reveal-btn) {
          display: flex;
          flex-direction: column;
          flex: 1;
        }

        .view-label {
          font-size: 11px;
          color: #888;
          text-transform: uppercase;
          letter-spacing: 0.4px;
        }

        .view-value {
          font-size: 15px;
          font-weight: 600;
          word-break: break-all;
        }

        .password-value {
          font-family: monospace;
          letter-spacing: 1px;
        }

        .reveal-btn {
          margin: 0;
          --padding-start: 6px;
          --padding-end: 6px;
        }

        .button-row {
          display: flex;
          gap: 8px;
          margin-top: 16px;
        }

        .button-row .box-btn {
          flex: 1 1 0;
          margin: 0;
          --border-radius: 10px;
          font-size: 12px;
          font-weight: 600;
          height: 40px;
        }
      `}</style>
      <AppFooter/>
    </IonPage>
  );
};

export default SFTPViewPage;
