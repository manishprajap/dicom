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
  IonGrid,
  IonAlert,
  IonToast,
  IonText,
  IonIcon,
  IonSpinner,
  useIonViewWillEnter,
  useIonRouter,
} from "@ionic/react";

import {
  eyeOutline,
  createOutline,
  trashOutline,
  folderOpenOutline,
  keyOutline,
  eyeOffOutline,
  shareSocialOutline,
  copyOutline,
  globeOutline,
  personOutline,
} from "ionicons/icons";
import AppFooter from "../components/AppFooter";

interface SFTPConfig {
  id: string;
  user: string;
  host: string;
  port: string;
  password: string;
  protocol?: string;
  name?: string;
}
export const SFTP_LIST_ROUTE = "/sftpView";

const API_BASE_URL = "https://aarnatechxperts.in/dicomapi/public/api";

const SFTPListPage: React.FC = () => {
  const [sftpList, setSftpList] = useState<SFTPConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [selectedConfig, setSelectedConfig] = useState<SFTPConfig | null>(null);

  // NEW: delete-in-progress + toast feedback state
  const [deleting, setDeleting] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [showToast, setShowToast] = useState(false);
  const [toastColor, setToastColor] = useState<"success" | "danger">("success");
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());

  const togglePassword = (id: string) => {
    setRevealedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const copyToClipboard = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setToastMessage(`${label} copied to clipboard`);
      setToastColor("success");
      setShowToast(true);
    } catch (err) {
      console.error("❌ Copy failed:", err);
      setToastMessage("Copy failed");
      setToastColor("danger");
      setShowToast(true);
    }
  };

  const router = useIonRouter();

  const isAuthenticated = () => {
    const token = localStorage.getItem("token");
    const user = localStorage.getItem("uData");
    return !!token && !!user;
  };

  const mapApiRecord = (item: any): SFTPConfig => ({
    id: String(item.id),
    user: item.username,
    host: item.server_address,
    port: String(item.port),
    password: item.password,
    protocol: item.protocol,
    name: item.name,
  });

  const fetchSftpList = async () => {
    setLoading(true);
    setLoadError("");

    try {
      const token = localStorage.getItem("token");
      const userID =
        localStorage.getItem("userId") || localStorage.getItem("user_id");
      const url = userID
        ? `${API_BASE_URL}/ftpserverlist?userID=${encodeURIComponent(userID)}`
        : `${API_BASE_URL}/ftpserverlist`;

      const response = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      const data = await response.json();

      if (!response.ok) {
        setLoadError(data?.message || "Failed to load SFTP list.");
        setSftpList([]);
        return;
      }

      const records = Array.isArray(data) ? data : data.data || [];
      setSftpList(records.map(mapApiRecord));
    } catch (error) {
      console.error(error);
      setLoadError("Failed to load SFTP list. Please try again.");
      setSftpList([]);
    } finally {
      setLoading(false);
    }
  };

  useIonViewWillEnter(() => {
    fetchSftpList();
  });

  const setSelected = (item: SFTPConfig) => {
    localStorage.setItem("sftpSelected", JSON.stringify(item));
  };

  const handleOpenFiles = (item: SFTPConfig) => {
    if (!isAuthenticated()) {
      router.push("/login", "root");
      return;
    }

    setSelected(item);
    router.push("/sftpBrowse?path=/", "forward");
  };

  const handleView = (item: SFTPConfig) => {
    setSelected(item);
    router.push(`/sftpDetails/${item.id}`, "forward");
  };

  const handleEdit = (item: SFTPConfig) => {
    setSelected(item);
    router.push(`/sftpEdit/${item.id}`, "forward");
  };

  const handleDelete = async (item: SFTPConfig) => {
    setDeleting(true);

    try {
      const token = localStorage.getItem("token");
      const userID =
        localStorage.getItem("userId") || localStorage.getItem("user_id");

      const url = userID
        ? `${API_BASE_URL}/deleteftp/${item.id}?userID=${encodeURIComponent(userID)}`
        : `${API_BASE_URL}/deleteftp/${item.id}`;

      const response = await fetch(url, {
        method: "DELETE",
        headers: {
          Accept: "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      const data = await response.json();

      if (!response.ok) {
        setToastMessage(data?.message || "Failed to delete SFTP details.");
        setToastColor("danger");
        setShowToast(true);
        return;
      }

      setSftpList((prev) => prev.filter((b) => b.id !== item.id));
      setToastMessage(data?.message || "SFTP details deleted successfully.");
      setToastColor("success");
      setShowToast(true);
    } catch (error) {
      console.error(error);
      setToastMessage("Failed to delete SFTP details. Please try again.");
      setToastColor("danger");
      setShowToast(true);
    } finally {
      setDeleting(false);
      setShowConfirm(false);
      setSelectedConfig(null);
    }
  };

  const handleAdd = () => {
    router.push("/sftp", "forward");
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar className="custom-toolbar">
          <IonButtons slot="start">
            <IonBackButton defaultHref="/dashboard" color="light" />
          </IonButtons>

          <IonTitle className="ion-text-center text-white">
            SFTP List
          </IonTitle>

          <IonButtons slot="end">
            <IonButton onClick={handleAdd} className="new-sftp">
              + New
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>

      <IonContent className="dicom-bg server-list-bg">
        {loading ? (
          <div className="ion-text-center ion-padding">
            <IonSpinner name="crescent" />
          </div>
        ) : loadError ? (
          <IonText color="danger" className="empty-text">
            {loadError}
          </IonText>
        ) : sftpList.length === 0 ? (
          <IonText color="medium" className="empty-text">
            No SFTP Connection Found
          </IonText>
        ) : (
          <IonGrid>
            {sftpList
              .slice()
              .reverse()
              .map((item) => (
                <IonCard key={item.id} className="server-card">
                  <IonCardContent>
                    {/* ---- Header: icon avatar + name + protocol badge ---- */}
                    <div className="server-card-header">
                      <div className="server-icon">
                        <IonIcon icon={shareSocialOutline} />
                      </div>
                      <h2 className="server-name">
                        {item.name || item.protocol?.toUpperCase() || "SFTP"}
                      </h2>
                      <span className="protocol-badge">
                        {(item.protocol || "SFTP").toUpperCase()}
                      </span>
                    </div>

                    <div className="server-divider" />

                    {/* ---- Field rows: Host / Port / User / Password ---- */}
                    <div className="field-row">
                      <div className="field-left">
                        <IonIcon icon={globeOutline} className="field-icon" />
                        <span className="field-label">IP ADDRESS</span>
                      </div>
                      <span className="field-value">{item.host}</span>
                      <IonButton
                        fill="clear"
                        size="small"
                        className="copy-btn"
                        onClick={() => copyToClipboard(item.host, "IP address")}
                      >
                        <IonIcon icon={copyOutline} />
                      </IonButton>
                    </div>

                    <div className="field-row">
                      <div className="field-left">
                        <IonIcon icon={globeOutline} className="field-icon" />
                        <span className="field-label">PORT</span>
                      </div>
                      <span className="field-value">{item.port}</span>
                      <IonButton
                        fill="clear"
                        size="small"
                        className="copy-btn"
                        onClick={() => copyToClipboard(item.port, "Port")}
                      >
                        <IonIcon icon={copyOutline} />
                      </IonButton>
                    </div>

                    <div className="field-row">
                      <div className="field-left">
                        <IonIcon icon={personOutline} className="field-icon" />
                        <span className="field-label">USERNAME</span>
                      </div>
                      <span className="field-value">{item.user}</span>
                      <IonButton
                        fill="clear"
                        size="small"
                        className="copy-btn"
                        onClick={() => copyToClipboard(item.user, "Username")}
                      >
                        <IonIcon icon={copyOutline} />
                      </IonButton>
                    </div>

                    <div className="field-row">
                      <div className="field-left">
                        <IonIcon icon={keyOutline} className="field-icon" />
                        <span className="field-label">PASSWORD</span>
                      </div>
                      <span className="field-value">
                        {revealedIds.has(item.id)
                          ? item.password
                          : "•".repeat(Math.max(item.password?.length || 8, 6))}
                      </span>
                      <IonButton
                        fill="clear"
                        size="small"
                        className="copy-btn"
                        onClick={() => togglePassword(item.id)}
                      >
                        <IonIcon icon={revealedIds.has(item.id) ? eyeOffOutline : eyeOutline} />
                      </IonButton>
                      <IonButton
                        fill="clear"
                        size="small"
                        className="copy-btn"
                        onClick={() => copyToClipboard(item.password, "Password")}
                      >
                        <IonIcon icon={copyOutline} />
                      </IonButton>
                    </div>

                    <div className="server-divider" />

                    {/* ---- Button row — OPEN (solid) → VIEW → EDIT → DELETE (pastel pills) ---- */}
                    <div className="button-row">
                      <button className="pill-btn pill-open" onClick={() => handleOpenFiles(item)}>
                        <IonIcon icon={folderOpenOutline} />
                        Open
                      </button>

                      <button className="pill-btn pill-view" onClick={() => handleView(item)}>
                        <IonIcon icon={eyeOutline} />
                        View
                      </button>

                      <button className="pill-btn pill-edit" onClick={() => handleEdit(item)}>
                        <IonIcon icon={createOutline} />
                        Edit
                      </button>

                      <button
                        className="pill-btn pill-delete"
                        disabled={deleting}
                        onClick={() => {
                          setSelectedConfig(item);
                          setShowConfirm(true);
                        }}
                      >
                        <IonIcon icon={trashOutline} />
                        Delete
                      </button>
                    </div>
                  </IonCardContent>
                </IonCard>
              ))}
          </IonGrid>
        )}

        <IonAlert
          isOpen={showConfirm}
          onDidDismiss={() => setShowConfirm(false)}
          header="Confirm Delete"
          message={`Are you sure you want to delete "${selectedConfig?.host}"?`}
          buttons={[
            { text: "Cancel", role: "cancel" },
            {
              text: "Yes",
              handler: () => {
                if (selectedConfig) handleDelete(selectedConfig);
              },
            },
          ]}
        />

        <IonToast
          isOpen={showToast}
          onDidDismiss={() => setShowToast(false)}
          message={toastMessage}
          duration={2000}
          color={toastColor}
        />
      </IonContent>

      <style>{`
        .server-list-bg {
          --background: #eef6f2;
        }

        .server-card {
          border-radius: 18px;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.06);
          margin: 14px 12px;
        }

        /* ---------- Header: icon + name + protocol badge ---------- */
        .server-card-header {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .server-icon {
          width: 40px;
          height: 40px;
          border-radius: 12px;
          background: #e6f7ef;
          color: #16a34a;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .server-icon ion-icon {
          font-size: 20px;
        }

        .server-name {
          flex: 1;
          margin: 0;
          font-size: 17px;
          font-weight: 700;
          color: #1f2937;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .protocol-badge {
          background: #e6f7ef;
          color: #16a34a;
          font-size: 12px;
          font-weight: 700;
          padding: 5px 12px;
          border-radius: 999px;
          white-space: nowrap;
          flex-shrink: 0;
        }

        .server-divider {
          height: 1px;
          background: #eef0f2;
          margin: 12px 0;
        }

        /* ---------- Field rows (IP / Port / Username / Password) ---------- */
        .field-row {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 0;
        }

        .field-left {
          display: flex;
          align-items: center;
          gap: 6px;
          min-width: 108px;
          flex-shrink: 0;
        }

        .field-icon {
          font-size: 15px;
          color: #9ca3af;
        }

        .field-label {
          font-size: 11px;
          font-weight: 700;
          color: #9ca3af;
          letter-spacing: 0.3px;
        }

        .field-value {
          flex: 1;
          text-align: right;
          font-size: 14px;
          font-weight: 600;
          color: #1f2937;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .copy-btn {
          --padding-start: 4px;
          --padding-end: 4px;
          margin: 0;
          height: 30px;
          width: 30px;
        }

        .copy-btn ion-icon {
          font-size: 16px;
          color: #9ca3af;
        }

        /* ---------- Button row — pill style matching SMB Network card ---------- */
        .button-row {
          display: flex;
          gap: 8px;
          flex-wrap: nowrap;
        }

        .pill-btn {
          flex: 1 1 0;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          height: 40px;
          border: none;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          transition: transform 0.1s ease, opacity 0.15s ease;
        }

        .pill-btn ion-icon {
          font-size: 15px;
        }

        .pill-btn:active {
          transform: scale(0.96);
        }

        .pill-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .pill-open {
          background: #16a34a;
          color: #ffffff;
        }

        .pill-view {
          background: #fef3c7;
          color: #b45309;
        }

        .pill-edit {
          background: #ede9fe;
          color: #6d28d9;
        }

        .pill-delete {
          background: #fee2e2;
          color: #dc2626;
        }

        .empty-text {
          display: block;
          text-align: center;
          margin-top: 40px;
          font-size: 15px;
        }
      `}</style>
      <AppFooter/>
    </IonPage>
  );
};

export default SFTPListPage;
