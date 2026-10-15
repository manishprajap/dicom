import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  IonActionSheet,
  IonBackButton,
  IonBadge,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonLoading,
  IonPage,
  IonProgressBar,
  IonSelect,
  IonSelectOption,
  IonTitle,
  IonToast,
  IonToolbar,
  IonAlert,
  IonImg,
  IonSpinner,
} from "@ionic/react";

import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { Capacitor } from "@capacitor/core";
import { useHistory } from "react-router-dom";

import {
  cameraOutline,
  imagesOutline,
  folderOpenOutline,
  cloudUploadOutline,
  folderOutline,
  addCircleOutline,
  documentOutline,
} from "ionicons/icons";

import {
  smbListDir,
  smbCreateFolder,
  smbUploadFromUri,
  writeFileToCacheChunked,
  deleteCacheFileByUri,
} from "../services/smbClient";

import "../css/SbmUploads.css";
import AppFooter from "../components/AppFooter";

type SmbSelected = {
  title: string;
  ip: string;
  username: string;
  password: string;
  share?: string;
};

// NOTE: `base64` is gone from the picked-file shape. Large files
// (especially DICOM) are written to disk once via writeFileToCacheChunked()
// and uploaded by native file URI, never sent as one giant base64 string
// over the Capacitor bridge. `localUri` is set for every source
// (camera / gallery / file picker) as soon as it's picked.
type Picked = {
  name: string;
  mime: string;
  localUri: string;
  previewUrl: string | null;
  isPreparing?: boolean;
};

const SbmUploads: React.FC = () => {
  const isNative = Capacitor.isNativePlatform();
  const history = useHistory();

  const [cfg, setCfg] = useState<SmbSelected | null>(null);

  const [picked, setPicked] = useState<Picked | null>(null);
  const [showPickSheet, setShowPickSheet] = useState(false);

  const [folders, setFolders] = useState<string[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string>(""); // "" = root
  const [loadingFolders, setLoadingFolders] = useState(false);

  const [showNewFolderAlert, setShowNewFolderAlert] = useState(false);
  const [folderError, setFolderError] = useState("");

  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [toastMessage, setToastMessage] = useState("");

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const shareName = useMemo(() => cfg?.share || "WiFiShare", [cfg]);

  const uploadFolderPath = useMemo(() => {
    return selectedFolder ? `/${selectedFolder}` : "/";
  }, [selectedFolder]);

  const selectedFileLabel = useMemo(() => {
    if (!picked) return "No file selected";
    return picked.isPreparing ? `Preparing ${picked.name}…` : picked.name;
  }, [picked]);

  const credsOf = (c: SmbSelected) => ({
    ip: c.ip,
    username: c.username,
    password: c.password,
    share: shareName,
  });

  useEffect(() => {
    const stored = localStorage.getItem("sbmSelected");
    if (stored) setCfg(JSON.parse(stored));
    else setToastMessage("No SMB selected. Please go back and select a server.");
  }, []);

  const fetchFolders = async (c: SmbSelected) => {
    if (!isNative) return;
    setLoadingFolders(true);
    try {
      const items = await smbListDir(credsOf(c), "/");
      const dirs = (items || []).filter((x: any) => x.isDir).map((x: any) => x.name);
      const unique = Array.from(new Set(dirs)).sort((a, b) => a.localeCompare(b));
      setFolders(unique);
    } catch (err) {
      console.error("Failed to fetch folders:", err);
    } finally {
      setLoadingFolders(false);
    }
  };

  useEffect(() => {
    if (cfg && isNative) fetchFolders(cfg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg]);

  // Camera / Gallery
  const pickFromCameraOrGallery = async (source: CameraSource) => {
    try {
      const photo = await Camera.getPhoto({
        source,
        resultType: CameraResultType.Uri, // native URI instead of DataUrl
        quality: 90,
        allowEditing: false,
      });

      if (!photo?.path && !photo?.webPath) return;

      const format = (photo.format || "jpeg").toLowerCase();
      const mime = `image/${format === "jpg" ? "jpeg" : format}`;
      const filename =
        source === CameraSource.Camera
          ? `camera_${Date.now()}.${format}`
          : `gallery_${Date.now()}.${format}`;

      setPicked({
        name: filename,
        mime,
        localUri: photo.path || photo.webPath!,
        previewUrl: photo.webPath || photo.path || null,
      });
    } catch (err) {
      console.log("Camera/Gallery cancelled or error:", err);
    }
  };

  const openNativeFilePicker = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  };

  const getMimeType = (file: File) => {
    const name = file.name.toLowerCase();
    if (name.endsWith(".dcm") || name.endsWith(".dicom")) {
      return "application/dicom";
    }
    return file.type || "application/octet-stream";
  };

  const onFilePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;

    const mime = getMimeType(f);

    // Small preview for image/video/pdf only — this is just for the UI
    // thumbnail, never used for the actual upload.
    let previewUrl: string | null = null;
    if (mime.startsWith("image/") || mime.startsWith("video/") || mime === "application/pdf") {
      previewUrl = URL.createObjectURL(f);
    }

    // Show something in the UI immediately while the file is written
    // to disk in chunks (can take a moment for large DICOM files).
    setPicked({
      name: f.name,
      mime,
      localUri: "",
      previewUrl,
      isPreparing: true,
    });

    try {
      const localUri = await writeFileToCacheChunked(f, (pct) => {
        setUploadProgress(pct);
      });
      setPicked({
        name: f.name,
        mime,
        localUri,
        previewUrl,
        isPreparing: false,
      });
    } catch (err: any) {
      console.error("Failed to prepare file:", err);
      setToastMessage(`Failed to read file: ${err.message || err}`);
      setPicked(null);
    } finally {
      setUploadProgress(0);
    }
  };

  // Create folder
  const handleCreateFolder = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) {
      setFolderError("Folder name cannot be empty.");
      return;
    }
    if (/[\\/]/.test(trimmed)) {
      setFolderError("Folder name cannot contain slashes.");
      return;
    }
    if (folders.includes(trimmed)) {
      setSelectedFolder(trimmed);
      setToastMessage(`Folder "${trimmed}" already exists — selected it.`);
      return;
    }
    if (!cfg) return;

    if (!isNative) {
      setToastMessage("SMB is not supported on Web. Use Android or iOS app.");
      return;
    }

    setLoading(true);
    try {
      const parent = uploadFolderPath;
      const newPath = parent === "/" ? `/${trimmed}` : `${parent}/${trimmed}`;
      await smbCreateFolder(credsOf(cfg), newPath);
      setToastMessage(`Folder "${trimmed}" created.`);
      await fetchFolders(cfg);
      setSelectedFolder(trimmed);
    } catch (err: any) {
      console.error("Create folder error:", err);
      setToastMessage(`Failed to create folder: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Upload
  const handleUpload = async () => {
    if (!isNative) {
      setToastMessage("SMB is not supported on Web. Use Android or iOS app.");
      return;
    }
    if (!cfg || !picked || picked.isPreparing || !picked.localUri) {
      setToastMessage("No file ready for upload yet.");
      return;
    }

    setLoading(true);
    setUploadProgress(20);
    try {
      const remotePath =
        uploadFolderPath === "/" ? `/${picked.name}` : `${uploadFolderPath}/${picked.name}`;

      setUploadProgress(60);
      await smbUploadFromUri(credsOf(cfg), remotePath, picked.localUri, picked.mime);
      setUploadProgress(100);

      setToastMessage("File uploaded successfully.");

      // Clean up the temp cache file now that the upload is done.
      deleteCacheFileByUri(picked.localUri);

      setPicked(null);
      if (fileInputRef.current) fileInputRef.current.value = "";

      // Redirect to SMB list page after a successful upload
      setTimeout(() => {
        history.push("/smbImages");
      }, 400);
    } catch (error: any) {
      console.error("Upload error:", error);
      setToastMessage(`Upload failed: ${error.message}`);
    } finally {
      setLoading(false);
      setUploadProgress(0);
    }
  };

  const clearSelected = () => {
    if (picked?.localUri) deleteCacheFileByUri(picked.localUri);
    setPicked(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar
          style={
            {
              "--background": "#0f766e",
              "--color": "#ffffff",
              "--border-color": "transparent",
            } as any
          }
        >
          <IonButtons slot="start">
            <IonBackButton defaultHref="/sbm" style={{ "--color": "#ffffff" } as any} />
          </IonButtons>
          <IonTitle
            style={{
              color: "#ffffff",
              fontWeight: 700,
              textAlign: "center",
              fontSize: "18px",
            }}
          >
            Upload File
          </IonTitle>
          <IonButtons slot="end">
            <IonButton style={{ "--color": "#ffffff" } as any} onClick={() => history.push("/sbm")}>
              View Files
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>

      <IonContent className="uploads-bg">
        <IonLoading isOpen={loading && uploadProgress === 0} message="Please wait..." />

        <IonCard className="upload-card">
          <IonCardContent>
            <IonItem lines="none" className="upload-card-header">
              <IonLabel>
                <div className="upload-title">Upload a file</div>
                <div className="upload-subtitle">{selectedFileLabel}</div>
                {cfg && (
                  <div className="upload-subtitle" style={{ opacity: 0.7 }}>
                    {cfg.ip} • {shareName}
                  </div>
                )}
              </IonLabel>
              {picked && (
                <IonBadge className="kind-badge" slot="end">
                  {picked.mime.split("/")[0] || "file"}
                </IonBadge>
              )}
            </IonItem>

            <input
              type="file"
              ref={fileInputRef}
              onChange={onFilePicked}
              className="file-input"
              style={{ display: "none" }}
              accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.mp4,.mov,.mpeg,.dcm,.dicom"
            />

            {/* Folder picker */}
            <div className="folder-picker">
              <IonIcon icon={folderOutline} className="folder-picker-icon" />
              <IonSelect
                interface="action-sheet"
                placeholder={loadingFolders ? "Loading folders…" : "Root (no folder)"}
                value={selectedFolder}
                onIonChange={(e) => setSelectedFolder(e.detail.value || "")}
                className="folder-select"
              >
                <IonSelectOption value="">Root (no folder)</IonSelectOption>
                {folders.map((f) => (
                  <IonSelectOption key={f} value={f}>
                    {f}
                  </IonSelectOption>
                ))}
              </IonSelect>
              <IonButton
                fill="clear"
                className="new-folder-btn"
                onClick={() => {
                  setFolderError("");
                  setShowNewFolderAlert(true);
                }}
              >
                <IonIcon icon={addCircleOutline} slot="start" />
                New Folder
              </IonButton>
            </div>

            <div className="upload-actions">
              <IonButton
                expand="block"
                fill="outline"
                className="btn-choose"
                disabled={picked?.isPreparing}
                onClick={() => setShowPickSheet(true)}
              >
                <IonIcon icon={folderOpenOutline} slot="start" />
                Choose File
              </IonButton>

              <IonButton
                expand="block"
                className="btn-upload"
                disabled={!picked || picked.isPreparing || loading || !isNative}
                onClick={handleUpload}
              >
                <IonIcon icon={cloudUploadOutline} slot="start" />
                {picked?.isPreparing ? "Preparing…" : "Upload"}
              </IonButton>
            </div>

            {/* File is selected but still being written to the device
                cache (writeFileToCacheChunked). Upload stays disabled
                and this section is clearly visible until it finishes,
                so the user can't tap Upload before the file is ready. */}
            {picked?.isPreparing && (
              <div className="preparing-file-section">
                <IonItem lines="none" className="preparing-file-item">
                  <IonSpinner name="crescent" slot="start" />
                  <IonLabel>
                    <div style={{ fontWeight: 600 }}>Preparing file…</div>
                    <div style={{ fontSize: 13, opacity: 0.7 }}>
                      Please wait, do not press Upload yet.
                    </div>
                  </IonLabel>
                </IonItem>
                <IonProgressBar value={uploadProgress / 100} />
                <div style={{ textAlign: "right", fontSize: 12, opacity: 0.7 }}>
                  {uploadProgress}%
                </div>
              </div>
            )}

            {loading && !picked?.isPreparing && uploadProgress > 0 && (
              <div className="upload-progress-row">
                <IonProgressBar value={uploadProgress / 100} />
                <span>{uploadProgress}%</span>
              </div>
            )}

            {picked && (
              <div className="remove-row">
                <IonButton size="small" fill="clear" color="danger" onClick={clearSelected}>
                  Remove
                </IonButton>
              </div>
            )}

            {picked?.previewUrl && picked.mime.startsWith("image/") && (
              <div className="local-preview">
                <IonImg src={picked.previewUrl} className="local-preview-img" />
              </div>
            )}

            {picked?.previewUrl && picked.mime.startsWith("video/") && (
              <div className="local-preview">
                <video controls className="local-preview-video" src={picked.previewUrl} />
              </div>
            )}

            {picked?.previewUrl && picked.mime === "application/pdf" && (
              <div className="local-preview">
                <IonIcon icon={documentOutline} style={{ fontSize: 40 }} />
              </div>
            )}

            {picked && picked.mime === "application/dicom" && (
              <div className="local-preview">
                <IonIcon icon={documentOutline} style={{ fontSize: 40 }} />
              </div>
            )}

            {!isNative && (
              <IonItem lines="none">
                <IonLabel color="danger">
                  SMB is not supported on Web. Please run this app on Android or iOS build.
                </IonLabel>
              </IonItem>
            )}
          </IonCardContent>
        </IonCard>

        {/* Choose Source Sheet */}
        <IonActionSheet
          isOpen={showPickSheet}
          onDidDismiss={() => setShowPickSheet(false)}
          header="Choose source"
          buttons={[
            {
              text: "Camera",
              icon: cameraOutline,
              handler: async () => {
                setShowPickSheet(false);
                await pickFromCameraOrGallery(CameraSource.Camera);
              },
            },
            {
              text: "Gallery",
              icon: imagesOutline,
              handler: async () => {
                setShowPickSheet(false);
                await pickFromCameraOrGallery(CameraSource.Photos);
              },
            },
            {
              text: "Files (PDF/Video/DCM)",
              icon: folderOpenOutline,
              handler: () => {
                setShowPickSheet(false);
                openNativeFilePicker();
              },
            },
            { text: "Cancel", role: "cancel" },
          ]}
        />

        {/* New Folder Alert */}
        <IonAlert
          isOpen={showNewFolderAlert}
          onDidDismiss={() => setShowNewFolderAlert(false)}
          header="Create New Folder"
          message={folderError || "Enter a name for the new folder."}
          inputs={[
            {
              name: "folderName",
              type: "text",
              placeholder: "e.g. invoices",
            },
          ]}
          buttons={[
            { text: "Cancel", role: "cancel" },
            {
              text: "Create",
              handler: (data) => {
                handleCreateFolder(data.folderName || "");
              },
            },
          ]}
        />

        <IonToast
          isOpen={!!toastMessage}
          message={toastMessage}
          duration={2500}
          onDidDismiss={() => setToastMessage("")}
        />
      </IonContent>
      <AppFooter/>
    </IonPage>
  );
};

export default SbmUploads;