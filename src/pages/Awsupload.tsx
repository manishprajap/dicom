import React, { useEffect, useMemo, useRef, useState } from "react";
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
  IonToast,
  IonLoading,
  IonActionSheet,
  IonCard,
  IonCardContent,
  IonItem,
  IonLabel,
  IonBadge,
  IonImg,
  IonAlert,
  IonSelect,
  IonSelectOption,
  IonProgressBar,
} from "@ionic/react";
import {
  cameraOutline,
  imagesOutline,
  folderOpenOutline,
  cloudUploadOutline,
  folderOutline,
  addCircleOutline,
} from "ionicons/icons";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { useHistory } from "react-router-dom";
import {
  uploadFileToS3,
  listFolders,
  createFolder,
  getFileKind,
  KIND_META,
  dataUrlToFile,
  FileKind,
} from "../utils/s3Utils";
import "../css/s3pages.css";
import AppFooter from "../components/AppFooter";

const AWSUpload: React.FC = () => {
  const history = useHistory();

  const [file, setFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);

  const [folders, setFolders] = useState<string[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string>(""); // "" = root
  const [loadingFolders, setLoadingFolders] = useState(false);

  const [showNewFolderAlert, setShowNewFolderAlert] = useState(false);
  const [folderError, setFolderError] = useState("");

  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [toastMessage, setToastMessage] = useState("");
  const [showPickSheet, setShowPickSheet] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedFileLabel = useMemo(() => {
    if (!file) return "No file selected";
    return `${file.name} • ${(file.size / (1024 * 1024)).toFixed(2)} MB`;
  }, [file]);

  const selectedFileKind: FileKind | null = useMemo(
    () => (file ? getFileKind(file.name) : null),
    [file]
  );

  const fetchFolders = async () => {
    setLoadingFolders(true);
    try {
      const list = await listFolders("");
      setFolders(list);
    } catch (err) {
      console.error("Failed to fetch folders:", err);
    } finally {
      setLoadingFolders(false);
    }
  };

  useEffect(() => {
    fetchFolders();
  }, []);

  // Native file picker
  const handleNativePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    setFile(f);

    if (f) {
      if (
        f.type.startsWith("image/") ||
        f.type.startsWith("video/") ||
        f.type === "application/pdf"
      ) {
        setFilePreviewUrl(URL.createObjectURL(f));
      } else {
        setFilePreviewUrl(null);
      }
    } else {
      setFilePreviewUrl(null);
    }
  };

  const openNativeFilePicker = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  };

  // Camera / Gallery
  const pickFromCameraOrGallery = async (source: CameraSource) => {
    try {
      const photo = await Camera.getPhoto({
        source,
        resultType: CameraResultType.DataUrl,
        quality: 90,
        allowEditing: false,
      });

      if (!photo?.dataUrl) return;

      const format = (photo.format || "jpeg").toLowerCase();
      const mime = `image/${format === "jpg" ? "jpeg" : format}`;
      const filename =
        source === CameraSource.Camera
          ? `camera_${Date.now()}.${format}`
          : `gallery_${Date.now()}.${format}`;

      const f = await dataUrlToFile(photo.dataUrl, filename, mime);
      setFile(f);
      setFilePreviewUrl(photo.dataUrl);
    } catch (err) {
      console.log("Camera/Gallery cancelled or error:", err);
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

    setLoading(true);
    try {
      await createFolder(trimmed);
      setToastMessage(`Folder "${trimmed}" created.`);
      await fetchFolders();
      setSelectedFolder(trimmed);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      console.error("Create folder error:", err);
      setToastMessage(`Failed to create folder: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Upload
  const handleUpload = async () => {
    if (!file) {
      setToastMessage("No file selected for upload.");
      return;
    }
    setLoading(true);
    setUploadProgress(0);
    try {
      await uploadFileToS3(file, selectedFolder, (progress) =>
        setUploadProgress(progress)
      );
      setToastMessage("File uploaded successfully.");
      setFile(null);
      setFilePreviewUrl(null);
      if (fileInputRef.current) fileInputRef.current.value = "";

      // Go straight to the list page (in the same folder) after a successful upload
      setTimeout(() => {
        history.push(
          `/awsfiles${selectedFolder ? `?folder=${encodeURIComponent(selectedFolder)}` : ""}`
        );
      }, 400);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      console.error("Upload error:", error);
      setToastMessage(`Upload failed: ${error.message}`);
    } finally {
      setLoading(false);
      setUploadProgress(0);
    }
  };

  const clearSelected = () => {
    setFile(null);
    setFilePreviewUrl(null);
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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any
          }
        >
          <IonButtons slot="start">
            <IonBackButton
              defaultHref="/awsconfiglist"
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              style={{ "--color": "#ffffff" } as any}
            />
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
            <IonButton
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              style={{ "--color": "#ffffff" } as any}
              onClick={() => history.push("/awsfiles")}
            >
              View Files
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>

      <IonContent className="dicom-bg">
        <IonLoading isOpen={loading && uploadProgress === 0} message="Please wait..." />

        <IonCard className="upload-card">
          <IonCardContent>
            <IonItem lines="none" className="upload-card-header">
              <IonLabel>
                <div className="upload-title">Upload a file</div>
                <div className="upload-subtitle">{selectedFileLabel}</div>
              </IonLabel>
              {selectedFileKind && (
                <IonBadge
                  className="kind-badge"
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  style={{ "--background": KIND_META[selectedFileKind].tint } as any}
                  slot="end"
                >
                  {KIND_META[selectedFileKind].label}
                </IonBadge>
              )}
            </IonItem>

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleNativePicked}
              className="file-input"
              style={{ display: "none" }}
              accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.mp4,.mov,.mpeg,.dcm"
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
                onClick={() => setShowPickSheet(true)}
              >
                <IonIcon icon={folderOpenOutline} slot="start" />
                Choose File
              </IonButton>

              <IonButton
                expand="block"
                className="btn-upload"
                disabled={!file || loading}
                onClick={handleUpload}
              >
                <IonIcon icon={cloudUploadOutline} slot="start" />
                Upload
              </IonButton>
            </div>

            {loading && uploadProgress > 0 && (
              <div className="upload-progress-row">
                <IonProgressBar value={uploadProgress / 100} />
                <span>{uploadProgress}%</span>
              </div>
            )}

            {file && (
              <div className="remove-row">
                <IonButton size="small" fill="clear" color="danger" onClick={clearSelected}>
                  Remove
                </IonButton>
              </div>
            )}

            {filePreviewUrl && file?.type?.startsWith("image/") && (
              <div className="local-preview">
                <IonImg src={filePreviewUrl} className="local-preview-img" />
              </div>
            )}

            {filePreviewUrl && file?.type?.startsWith("video/") && (
              <div className="local-preview">
                <video controls className="local-preview-video" src={filePreviewUrl} />
              </div>
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
              text: "Files (PDF/DICOM/Video)",
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

export default AWSUpload;