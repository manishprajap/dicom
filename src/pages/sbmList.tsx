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
  IonText,
  IonAlert,
  IonIcon,
  IonToast,
  IonSpinner,
} from "@ionic/react";

import { useState } from "react";
import { useIonRouter, useIonViewWillEnter } from "@ionic/react";
import {
  createOutline,
  folderOpenOutline,
  cloudUploadOutline,
  trashOutline,
  copyOutline,
  checkmarkOutline,
  eyeOutline,
  eyeOffOutline,
  addOutline,
  shareSocialOutline,
} from "ionicons/icons";
import "../css/ServerList.css";
import AppFooter from "../components/AppFooter";

const API_BASE_URL = "https://aarnatechxperts.in/dicomapi/public/api";

interface SbmEntry {
  id: string;
  title: string;
  ip: string;
  share: string;
  username: string;
  password: string;
}

const SbmList: React.FC = () => {
  const [sbmList, setSbmList] = useState<SbmEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [selectedItem, setSelectedItem] = useState<SbmEntry | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<{ open: boolean; msg: string; color?: string }>({
    open: false,
    msg: "",
  });

  const router = useIonRouter();

  const mapApiRecord = (item: any): SbmEntry => ({
    id: String(item.id),
    title: item.title,
    ip: item.ip,
    share: item.share,
    username: item.username,
    password: item.password,
  });

  const fetchSbmList = async () => {
    setLoading(true);
    setLoadError("");

    try {
      const token = localStorage.getItem("token");
      const userID = localStorage.getItem("userId") || localStorage.getItem("user_id");
      const url = userID
        ? `${API_BASE_URL}/sbmnetworklist?userID=${encodeURIComponent(userID)}`
        : `${API_BASE_URL}/sbmnetworklist`;

      const response = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      const data = await response.json();

      if (!response.ok) {
        setLoadError(data?.message || "Failed to load SMB Network list.");
        setSbmList([]);
        return;
      }

      const records = Array.isArray(data) ? data : data.data || [];
      setSbmList(records.map(mapApiRecord));
    } catch (error) {
      console.error(error);
      setLoadError("Failed to load SMB Network list. Please try again.");
      setSbmList([]);
    } finally {
      setLoading(false);
    }
  };

  useIonViewWillEnter(() => {
    fetchSbmList();
  });

  const setSelected = (item: SbmEntry) => {
    localStorage.setItem("sbmSelected", JSON.stringify(item));
  };

  const handleOpenImages = (item: SbmEntry) => {
    setSelected(item);
    router.push("/smbImages?path=/", "forward");
  };

  const handleUploads = (item: SbmEntry) => {
    setSelected(item);
    router.push("/sbmUploads", "forward");
  };

  const handleEdit = (item: SbmEntry) => {
    router.push(`/editsbm/${item.id}`, "forward");
  };

  const handleDelete = async (item: SbmEntry) => {
    setDeleting(true);

    try {
      const token = localStorage.getItem("token");
      const userID = localStorage.getItem("userId") || localStorage.getItem("user_id");

      const url = userID
        ? `${API_BASE_URL}/deletesbm/${item.id}?userID=${encodeURIComponent(userID)}`
        : `${API_BASE_URL}/deletesbm/${item.id}`;

      const response = await fetch(url, {
        method: "DELETE",
        headers: {
          Accept: "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      const data = await response.json();

      if (!response.ok) {
        setToast({ open: true, msg: data?.message || "Failed to delete entry.", color: "danger" });
        return;
      }

      setSbmList((prev) => prev.filter((b) => b.id !== item.id));
      setToast({ open: true, msg: data?.message || "SMB Network entry deleted successfully.", color: "success" });
    } catch (error) {
      console.error(error);
      setToast({ open: true, msg: "Failed to delete entry. Please try again.", color: "danger" });
    } finally {
      setDeleting(false);
      setShowConfirm(false);
      setSelectedItem(null);
    }
  };

  const handleAdd = () => {
    router.push("/addsbm", "forward");
  };

  const copyToClipboard = (value: string, field: string) => {
    if (!value) return;
    navigator.clipboard?.writeText(value).then(() => {
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 1200);
    });
  };

  const togglePasswordVisible = (id: string) => {
    setVisiblePasswords((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const maskPassword = (password: string) => "•".repeat(Math.min(password?.length || 8, 14));

  return (
    <IonPage>
      <IonHeader className="ion-no-border">
        <IonToolbar className="custom-toolbar">
          <IonButtons slot="start">
            <IonBackButton defaultHref="/dashboard" text="" />
          </IonButtons>

          <IonTitle className="ion-text-center">SMB Network</IonTitle>

          <IonButtons slot="end">
            <IonButton onClick={handleAdd} className="new-sbm">
              <IonIcon icon={addOutline} slot="start" />
              New
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>

      <IonContent className="server-list-bg">
        {loading ? (
          <div className="ion-text-center ion-padding">
            <IonSpinner name="crescent" />
          </div>
        ) : loadError ? (
          <IonText color="danger" className="empty-text">
            {loadError}
          </IonText>
        ) : sbmList.length === 0 ? (
          <IonText color="medium" className="empty-text">
            No SMB Network Found
          </IonText>
        ) : (
          <div className="server-list">
            {sbmList
              .slice()
              .reverse()
              .map((item) => (
                <IonCard key={item.id} className="server-card">
                  <IonCardContent>
                    {/* Header: icon + title + share tag */}
                    <div className="server-card-header">
                      <div className="server-card-heading">
                        <span className="server-icon-badge">
                          <IonIcon icon={shareSocialOutline} />
                        </span>
                        <h2 className="server-name">{item.title}</h2>
                      </div>
                      {item.share && <span className="server-tag">{item.share}</span>}
                    </div>

                    {/* Key-value rows */}
                    <div className="server-kv-list">
                      <div className="server-kv-row">
                        <span className="server-kv-label">IP ADDRESS</span>
                        <div className="server-kv-value-group">
                          <span className="server-kv-value">{item.ip || "N/A"}</span>
                          {item.ip && (
                            <button
                              className="server-kv-copy"
                              onClick={() => copyToClipboard(item.ip, `ip-${item.id}`)}
                              aria-label="Copy IP address"
                            >
                              <IonIcon icon={copiedField === `ip-${item.id}` ? checkmarkOutline : copyOutline} />
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="server-kv-row">
                        <span className="server-kv-label">USERNAME</span>
                        <div className="server-kv-value-group">
                          <span className="server-kv-value">{item.username || "N/A"}</span>
                          {item.username && (
                            <button
                              className="server-kv-copy"
                              onClick={() => copyToClipboard(item.username, `user-${item.id}`)}
                              aria-label="Copy username"
                            >
                              <IonIcon icon={copiedField === `user-${item.id}` ? checkmarkOutline : copyOutline} />
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="server-kv-row">
                        <span className="server-kv-label">PASSWORD</span>
                        <div className="server-kv-value-group">
                          <span className="server-kv-value">
                            {visiblePasswords[item.id] ? item.password || "N/A" : maskPassword(item.password || "")}
                          </span>
                          {item.password && (
                            <>
                              <button
                                className="server-kv-copy"
                                onClick={() => togglePasswordVisible(item.id)}
                                aria-label="Toggle password visibility"
                              >
                                <IonIcon icon={visiblePasswords[item.id] ? eyeOffOutline : eyeOutline} />
                              </button>
                              <button
                                className="server-kv-copy"
                                onClick={() => copyToClipboard(item.password, `pass-${item.id}`)}
                                aria-label="Copy password"
                              >
                                <IonIcon icon={copiedField === `pass-${item.id}` ? checkmarkOutline : copyOutline} />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Button Actions */}
                    <div className="button-row">
                      <IonButton
                        size="small"
                        className="pill-btn pill-open"
                        onClick={() => handleOpenImages(item)}
                      >
                        <IonIcon icon={folderOpenOutline} slot="start" />
                        Open
                      </IonButton>

                      <IonButton
                        size="small"
                        className="pill-btn pill-upload"
                        onClick={() => handleUploads(item)}
                      >
                        <IonIcon icon={cloudUploadOutline} slot="start" />
                        Upload
                      </IonButton>

                      <IonButton
                        size="small"
                        className="pill-btn pill-view"
                        onClick={() => handleEdit(item)}
                      >
                        <IonIcon icon={createOutline} slot="start" />
                        Edit
                      </IonButton>

                      <IonButton
                        size="small"
                        className="pill-btn pill-delete"
                        disabled={deleting}
                        onClick={() => {
                          setSelectedItem(item);
                          setShowConfirm(true);
                        }}
                      >
                        <IonIcon icon={trashOutline} slot="start" />
                        Delete
                      </IonButton>
                    </div>
                  </IonCardContent>
                </IonCard>
              ))}
          </div>
        )}

        <IonAlert
          isOpen={showConfirm}
          onDidDismiss={() => setShowConfirm(false)}
          header="Confirm Delete"
          message={`Are you sure you want to delete "${selectedItem?.title}"?`}
          buttons={[
            { text: "Cancel", role: "cancel" },
            {
              text: "Yes",
              handler: () => {
                if (selectedItem) handleDelete(selectedItem);
              },
            },
          ]}
        />

        <IonToast
          isOpen={toast.open}
          message={toast.msg}
          duration={2500}
          color={toast.color}
          onDidDismiss={() => setToast({ open: false, msg: "" })}
        />
      </IonContent>
      <AppFooter/>
    </IonPage>
  );
};

export default SbmList;