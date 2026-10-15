import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonBackButton,
  IonContent,
  IonButton,
  IonIcon,
  IonCard,
  IonCardContent,
  IonText,
  IonGrid,
  IonAlert,
  IonToast,
  IonSpinner,
} from "@ionic/react";
import {
  folderOpenOutline,
  cloudUploadOutline,
  createOutline,
  trashOutline,
  eyeOutline,
  eyeOffOutline,
  copyOutline,
  addOutline,
  serverOutline,
} from "ionicons/icons";
import { useState, useRef } from "react";
import { useIonRouter, useIonViewWillEnter } from "@ionic/react";
import "../css/AWSList.css";
import AppFooter from "../components/AppFooter";

const API_BASE_URL = "https://aarnatechxperts.in/dicomapi/public/api";

interface AwsConfig {
  id: string;
  bucketName: string;
  region: string;
  accessKey: string;
  secretKey: string;
}

const AwsS3List: React.FC = () => {
  const [awsS3Config, setAwsS3Config] = useState<AwsConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [selectedConfig, setSelectedConfig] = useState<AwsConfig | null>(null);

  const [deleting, setDeleting] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [showToast, setShowToast] = useState(false);
  const [toastColor, setToastColor] = useState<"success" | "danger">("success");

  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const router = useIonRouter();

  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());

  const togglePassword = (id: string) => {
    setRevealedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const mapApiRecord = (item: any): AwsConfig => ({
    id: String(item.id),
    bucketName: item.bucket_name,
    region: item.region,
    accessKey: item.access_key,
    secretKey: item.secret_key,
  });

  const fetchAwsList = async () => {
    setLoading(true);
    setLoadError("");

    try {
      const token = localStorage.getItem("token");
      const userID = localStorage.getItem("userId") || localStorage.getItem("user_id");
      const url = userID
        ? `${API_BASE_URL}/awsconfiglist?userID=${encodeURIComponent(userID)}`
        : `${API_BASE_URL}/awsconfiglist`;

      const response = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      const data = await response.json();

      if (!response.ok) {
        setLoadError(data?.message || "Failed to load AWS config list.");
        setAwsS3Config([]);
        return;
      }

      const records = Array.isArray(data) ? data : data.data || [];
      setAwsS3Config(records.map(mapApiRecord));
    } catch (error) {
      console.error(error);
      setLoadError("Failed to load AWS config list. Please try again.");
      setAwsS3Config([]);
    } finally {
      setLoading(false);
    }
  };

  useIonViewWillEnter(() => {
    fetchAwsList();
  });

  const handleOpen = (item: AwsConfig) => {
    localStorage.setItem("awsS3CUpdate", JSON.stringify(item));
    localStorage.setItem("awsConfig", JSON.stringify(item));
    router.push("/awscloud", "forward");
  };

  const handleUploadClick = (item: AwsConfig) => {
    localStorage.setItem("awsS3CUpdate", JSON.stringify(item));
    localStorage.setItem("awsConfig", JSON.stringify(item));
    router.push("/awsupload", "forward");
  };

  const handleEditClick = (item: AwsConfig) => {
    router.push(`/awsEdit/${item.id}`, "forward");
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, item: AwsConfig) => {
    const file = e.target.files?.[0];
    if (file) {
      console.log("Uploading file:", file, "for bucket:", item.bucketName);
    }
  };

  const handleCopy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setToastMessage(`${label} copied to clipboard.`);
      setToastColor("success");
      setShowToast(true);
    } catch {
      setToastMessage(`Couldn't copy ${label.toLowerCase()}.`);
      setToastColor("danger");
      setShowToast(true);
    }
  };

  const handleDelete = async (item: AwsConfig) => {
    setDeleting(true);

    try {
      const token = localStorage.getItem("token");
      const userID = localStorage.getItem("userId") || localStorage.getItem("user_id");

      const url = userID
        ? `${API_BASE_URL}/deleteaws/${item.id}?userID=${encodeURIComponent(userID)}`
        : `${API_BASE_URL}/deleteaws/${item.id}`;

      const response = await fetch(url, {
        method: "DELETE",
        headers: {
          Accept: "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      const data = await response.json();

      if (!response.ok) {
        setToastMessage(data?.message || "Failed to delete AWS configuration.");
        setToastColor("danger");
        setShowToast(true);
        return;
      }

      setAwsS3Config((prev) => prev.filter((b) => b.id !== item.id));
      setToastMessage(data?.message || "AWS configuration deleted successfully.");
      setToastColor("success");
      setShowToast(true);
    } catch (error) {
      console.error(error);
      setToastMessage("Failed to delete AWS configuration. Please try again.");
      setToastColor("danger");
      setShowToast(true);
    } finally {
      setDeleting(false);
      setShowConfirm(false);
      setSelectedConfig(null);
    }
  };

  const handleAdd = () => {
    router.push("/awsconfig");
  };

  const maskSecret = (secret?: string) => {
    const len = Math.min(Math.max(secret?.length || 8, 6), 28);
    return "•".repeat(len);
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar className="custom-toolbar">
          <IonButtons slot="start">
            <IonBackButton defaultHref="/dashboard" color="light" />
          </IonButtons>
          <IonTitle className="ion-text-center text-white">AWS S3 Config List</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={handleAdd} className="new-bucket">
              <IonIcon icon={addOutline} slot="start" />
              New Bucket
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>

      <IonContent className="dicom-bg">
        {loading ? (
          <div className="ion-text-center ion-padding">
            <IonSpinner name="crescent" />
          </div>
        ) : loadError ? (
          <div className="empty-container">
            <IonText color="danger" className="empty-text">
              {loadError}
            </IonText>
          </div>
        ) : awsS3Config.length === 0 ? (
          <div className="empty-container">
            <IonIcon icon={serverOutline} className="empty-icon" />
            <IonText className="empty-text">No buckets configured yet.</IonText>
            <IonButton className="empty-cta" onClick={handleAdd}>
              <IonIcon icon={addOutline} slot="start" />
              Add a bucket
            </IonButton>
          </div>
        ) : (
          <IonGrid className="sftp-container">
            {awsS3Config
              .slice()
              .reverse()
              .map((item) => (
                <IonCard key={item.id} className="server-card-aws">
                  <IonCardContent>
                    {/* Header row: icon, name, region chip */}
                    <div className="card-head-aws">
                      <div className="bucket-identity">
                        <span className="bucket-icon-wrap">
                          <IonIcon icon={serverOutline} />
                        </span>
                        <h2>{item.bucketName}</h2>
                      </div>
                      <span className="region-chip">{item.region || "N/A"}</span>
                    </div>

                    {/* Ledger-style credential rows */}
                    <div className="cred-ledger">
                      <div className="cred-row">
                        <span className="cred-label">Access key</span>
                        <span className="cred-leader" />
                        <span className="cred-value">{item.accessKey || "N/A"}</span>
                        {item.accessKey && (
                          <button
                            type="button"
                            className="cred-icon-btn"
                            aria-label="Copy access key"
                            onClick={() => handleCopy(item.accessKey, "Access key")}
                          >
                            <IonIcon icon={copyOutline} />
                          </button>
                        )}
                      </div>

                      <div className="cred-row">
                        <span className="cred-label">Secret key</span>
                        <span className="cred-leader" />
                        <span className="cred-value cred-value-secret">
                          {revealedIds.has(item.id) ? item.secretKey || "N/A" : maskSecret(item.secretKey)}
                        </span>
                        <button
                          type="button"
                          className="cred-icon-btn"
                          aria-label={revealedIds.has(item.id) ? "Hide secret key" : "Reveal secret key"}
                          onClick={() => togglePassword(item.id)}
                        >
                          <IonIcon icon={revealedIds.has(item.id) ? eyeOffOutline : eyeOutline} />
                        </button>
                      </div>
                    </div>

                    <input
                      type="file"
                      ref={(el) => {
                        fileInputRefs.current[item.id] = el;
                      }}
                      style={{ display: "none" }}
                      onChange={(e) => handleFileChange(e, item)}
                    />

                    {/* Action row */}
                    <div className="button-row-aws">
                      <button className="box-btn-aws btn-open" onClick={() => handleOpen(item)}>
                        <IonIcon icon={folderOpenOutline} />
                        Open
                      </button>

                      <button className="box-btn-aws btn-tonal" onClick={() => handleUploadClick(item)}>
                        <IonIcon icon={cloudUploadOutline} />
                        Upload
                      </button>

                      <button className="box-btn-aws btn-tonal" onClick={() => handleEditClick(item)}>
                        <IonIcon icon={createOutline} />
                        Edit
                      </button>

                      <button
                        className="box-btn-aws btn-delete"
                        disabled={deleting}
                        onClick={() => {
                          setSelectedConfig(item);
                          setShowConfirm(true);
                        }}
                        aria-label="Delete bucket configuration"
                      >
                        <IonIcon icon={trashOutline} />
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
          message={`Are you sure you want to delete "${selectedConfig?.bucketName}"? This can't be undone.`}
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
          duration={2200}
          color={toastColor}
        />
      </IonContent>

      <style>{`
        :root {
          --teal-900: #0c4a44;
          --teal-700: #0f766e;
          --teal-600: #0d9488;
          --teal-50: #ecfdf5;
          --slate-900: #0f172a;
          --slate-700: #334155;
          --slate-500: #64748b;
          --slate-400: #94a3b8;
          --slate-300: #cbd5e1;
          --slate-200: #e2e8f0;
          --slate-100: #f1f5f9;
          --slate-50: #f8fafc;
          --red-600: #dc2626;
          --red-50: #fef2f2;
          --mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
        }

        .dicom-bg {
          --background: var(--slate-50);
        }

        .custom-toolbar {
          --background: linear-gradient(135deg, var(--teal-700), var(--teal-900));
          --color: #ffffff;
          --border-color: transparent;
        }

        .new-bucket {
          --background: rgba(255, 255, 255, 0.12);
          --background-activated: rgba(255, 255, 255, 0.22);
          --color: #ffffff;
          --border-radius: 999px;
          --padding-start: 14px;
          --padding-end: 16px;
          font-weight: 600;
          font-size: 13px;
          text-transform: none;
          border: 1px solid rgba(255, 255, 255, 0.3);
        }

        .sftp-container {
          max-width: 560px;
          margin: 0 auto;
          padding: 14px 12px 24px;
        }

        .empty-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 64px 24px;
          text-align: center;
          gap: 10px;
        }
        .empty-icon {
          font-size: 40px;
          color: var(--slate-300);
        }
        .empty-text {
          color: var(--slate-500);
          font-size: 14px;
        }
        .empty-cta {
          --background: var(--teal-700);
          --border-radius: 10px;
          font-weight: 600;
          margin-top: 6px;
        }

        /* ---------- Card ---------- */

        .server-card-aws {
          border-radius: 14px;
          background: #ffffff;
          box-shadow: 0 1px 2px rgba(15, 23, 42, 0.05), 0 6px 20px rgba(15, 23, 42, 0.05);
          border: 1px solid var(--slate-200);
          margin: 0 0 14px 0;
        }

        .card-head-aws {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 14px;
        }

        .bucket-identity {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
        }

        .bucket-icon-wrap {
          flex: 0 0 auto;
          width: 34px;
          height: 34px;
          border-radius: 9px;
          background: var(--teal-50);
          color: var(--teal-700);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 17px;
        }

        .bucket-identity h2 {
          margin: 0;
          font-size: 16px;
          font-weight: 700;
          color: var(--slate-900);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .region-chip {
          flex: 0 0 auto;
          font-size: 11px;
          font-weight: 600;
          color: var(--teal-700);
          background: var(--teal-50);
          border: 1px solid rgba(15, 118, 110, 0.18);
          border-radius: 999px;
          padding: 4px 10px;
          white-space: nowrap;
          font-family: var(--mono);
        }

        /* ---------- Ledger-style credential rows ---------- */

        .cred-ledger {
          border-top: 1px solid var(--slate-100);
          padding-top: 10px;
        }

        .cred-row {
          display: flex;
          align-items: baseline;
          gap: 8px;
          padding: 6px 0;
        }

        .cred-label {
          flex: 0 0 auto;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: var(--slate-500);
        }

        .cred-leader {
          flex: 1 1 auto;
          border-bottom: 1px dotted var(--slate-300);
          height: 1px;
          min-width: 12px;
          margin-bottom: 3px;
        }

        .cred-value {
          flex: 0 1 auto;
          font-family: var(--mono);
          font-size: 12.5px;
          color: var(--slate-900);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 62%;
        }

        .cred-value-secret {
          letter-spacing: 1px;
          color: var(--slate-700);
        }

        .cred-icon-btn {
          flex: 0 0 auto;
          width: 26px;
          height: 26px;
          border: none;
          background: transparent;
          color: var(--slate-400);
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 7px;
          cursor: pointer;
          font-size: 15px;
          transition: background 0.15s ease, color 0.15s ease;
        }
        .cred-icon-btn:hover {
          background: var(--slate-100);
          color: var(--teal-700);
        }

        /* ---------- Action row ---------- */

        .button-row-aws {
          display: flex;
          align-items: stretch;
          gap: 8px;
          margin-top: 16px;
          padding-top: 14px;
          border-top: 1px solid var(--slate-100);
        }

        .box-btn-aws {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 9px 10px;
          border: 1px solid transparent;
          border-radius: 9px;
          font-weight: 600;
          font-size: 12.5px;
          cursor: pointer;
          transition: filter 0.15s ease, background 0.15s ease, border-color 0.15s ease;
          font-family: inherit;
        }

        .box-btn-aws ion-icon {
          font-size: 15px;
        }

        .box-btn-aws:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        /* Primary action */
        .btn-open {
          flex: 1.3 1 0;
          background: var(--teal-700);
          color: #ffffff;
        }
        .btn-open:hover {
          filter: brightness(0.94);
        }

        /* Secondary / tonal actions */
        .btn-tonal {
          flex: 1 1 0;
          background: var(--slate-100);
          color: var(--slate-700);
          border-color: var(--slate-200);
        }
        .btn-tonal:hover {
          background: var(--slate-200);
        }

        /* Destructive action — icon only, visually set apart */
        .btn-delete {
          flex: 0 0 auto;
          width: 40px;
          background: var(--red-50);
          color: var(--red-600);
          border-color: rgba(220, 38, 38, 0.15);
        }
        .btn-delete:hover:not(:disabled) {
          background: #fee2e2;
        }
      `}</style>
      <AppFooter/>
    </IonPage>
  );
};

export default AwsS3List;