import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButton,
  IonAlert,
  IonToast,
  IonButtons,
  IonBackButton,
  IonActionSheet,
  IonSelect,
  IonSelectOption,
  IonIcon,
  IonProgressBar,
  useIonViewWillEnter,
} from "@ionic/react";
import "../css/saveuser.css";
import {
  addOutline,
  attachOutline,
  cameraOutline,
  imagesOutline,
  folderOpenOutline,
  personCircleOutline,
  cloudUploadOutline,
  documentTextOutline,
  imageOutline,
  videocamOutline,
  medkitOutline,
  closeCircle,
  checkmarkCircle,
  chevronForwardOutline,
} from "ionicons/icons";
import axios from "axios";
import { useLocation, useHistory } from "react-router-dom";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import AppFooter from "../components/AppFooter";

const API_BASE_URL = "https://aarnatechxperts.in/dicomapi/public/api";

type Patient = {
  id: string | number;
  name: string;
};

/** Human-readable file size, e.g. 482 KB / 3.4 MB */
const formatBytes = (bytes?: number | null) => {
  if (!bytes || bytes <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let val = bytes;
  let i = 0;
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024;
    i++;
  }
  return `${val.toFixed(val >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
};

const Uploadfiles: React.FC = () => {
  const location = useLocation<{ server: any }>();
  const server = location.state?.server;
  const history = useHistory();

  const [userId, setUserId] = useState<string>("");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [loadingPatients, setLoadingPatients] = useState<boolean>(false);

  const [fileState, setFileState] = useState<{
    uri: string | null;
    type: string | null;
    name?: string | null;
    size?: number | null;
  }>({
    uri: null,
    type: null,
    name: null,
    size: null,
  });

  const [showAlert, setShowAlert] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [showPickerSheet, setShowPickerSheet] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const storedUserId = localStorage.getItem("userId");
    if (storedUserId) setUserId(storedUserId);
  }, []);

  // Fetch patient list whenever view enters
  useIonViewWillEnter(() => {
    fetchPatients();
  });

  // ---------- Fetch Patients from API ----------
  const fetchPatients = async () => {
    setLoadingPatients(true);
    try {
      const token = localStorage.getItem("token");
      const userId = localStorage.getItem("userId");

      const response = await axios.get(`${API_BASE_URL}/patients?user_id=${userId}`, {
        headers: {
          Accept: "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      const result = response.data;

      // Normalize array output regardless of standard or paginated responses
      const rawList = Array.isArray(result)
        ? result
        : Array.isArray(result?.data)
        ? result.data
        : [];

      const parsed: Patient[] = rawList.map((p: any) => ({
        id: String(p.id),
        name: p.name,
      }));

      setPatients(parsed);
    } catch (error) {
      console.error("Error fetching patients from API:", error);
      setToastMessage("Failed to load patient list from server.");
      setShowToast(true);
      setPatients([]);
    } finally {
      setLoadingPatients(false);
    }
  };

  /** Resolves the detected file "kind" — drives icon, badge label & preview rendering */
  const fileKind = useMemo((): "image" | "video" | "pdf" | "dicom" | "file" | null => {
    if (!fileState.uri || !fileState.type) return null;
    if (fileState.type.startsWith("image/")) return "image";
    if (fileState.type.startsWith("video/")) return "video";
    if (fileState.type === "application/pdf") return "pdf";
    if (
      fileState.type.includes("dicom") ||
      fileState.name?.toLowerCase().endsWith(".dcm")
    )
      return "dicom";
    return "file";
  }, [fileState]);

  const fileKindMeta: Record<
    NonNullable<typeof fileKind>,
    { label: string; icon: string; tint: string }
  > = {
    image: { label: "Image", icon: imageOutline, tint: "#3bd8b1" },
    video: { label: "Video", icon: videocamOutline, tint: "#6366f1" },
    pdf: { label: "PDF", icon: documentTextOutline, tint: "#ef4444" },
    dicom: { label: "DICOM", icon: medkitOutline, tint: "#00a0a0" },
    file: { label: "File", icon: attachOutline, tint: "#64748b" },
  };

  const canUpload = Boolean(selectedPatient?.id && fileState.uri && userId);

  // ---------- Native File Picker (PDF/DICOM/Video/Image) ----------
  const handleFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedFileTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/gif",
      "image/webp",
      "video/mp4",
      "video/mpeg",
      "video/quicktime",
      "application/pdf",
      "application/dicom",
      "application/dicom+json",
      "application/octet-stream",
    ];

    const isDcm = file.name.toLowerCase().endsWith(".dcm");

    if (!allowedFileTypes.includes(file.type) && !isDcm) {
      setToastMessage(
        "Only images, videos, PDFs, and DICOM files are allowed."
      );
      setShowToast(true);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setFileState({
        uri: reader.result as string,
        type:
          file.type ||
          (isDcm ? "application/dicom" : "application/octet-stream"),
        name: file.name,
        size: file.size,
      });
    };
    reader.readAsDataURL(file);
  };

  const openNativeFilePicker = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  };

  // ---------- Camera / Gallery ----------
  const pickFromCameraOrGallery = async (source: CameraSource) => {
    try {
      const photo = await Camera.getPhoto({
        source,
        resultType: CameraResultType.DataUrl,
        quality: 90,
        allowEditing: false,
      });

      if (!photo?.dataUrl) return;

      const mime = photo.format ? `image/${photo.format}` : "image/jpeg";
      // Rough size estimate from the base64 payload (~0.75 bytes per base64 char)
      const base64Len = photo.dataUrl.length - (photo.dataUrl.indexOf(",") + 1);
      const approxSize = Math.round(base64Len * 0.75);

      setFileState({
        uri: photo.dataUrl,
        type: mime,
        name:
          source === CameraSource.Camera ? "camera_photo" : "gallery_photo",
        size: approxSize,
      });
    } catch (err) {
      console.log("Camera/Gallery cancelled or error:", err);
    }
  };

  // ---------- Upload ----------
  const handleSaveDetails = async () => {
    if (!canUpload || !selectedPatient) {
      setToastMessage("Please select a patient and upload a valid file.");
      setShowToast(true);
      return;
    }

    setSaving(true);

    try {
      const response = await axios.post(`${API_BASE_URL}/upload`, {
        userId,
        patientId: selectedPatient.id,
        patientName: selectedPatient.name,
        image: fileState.uri,
        imageType: fileState.type,
        ips: server?.ips,
        port: server?.port,
        username: server?.username,
        password: server?.password,
        callingAE: server?.callingAETitle,
        calledAE: server?.calledAETitle,
      });

      if (response.data?.success) {
        setToastMessage("File uploaded successfully");
        setShowAlert(true);

        history.push("/image-list", { server });

        setFileState({ uri: null, type: null, name: null, size: null });
        setSelectedPatient(null);

        if (fileInputRef.current) fileInputRef.current.value = "";
      } else {
        setToastMessage("Upload failed.");
        setShowToast(true);
      }
    } catch (error) {
      console.error("Upload error", error);
      setToastMessage("Upload failed. Try again.");
      setShowToast(true);
    } finally {
      setSaving(false);
    }
  };

  const clearFile = () => {
    setFileState({ uri: null, type: null, name: null, size: null });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar className="uw-toolbar">
          <IonButtons slot="start">
            <IonBackButton defaultHref="/dashboard" color="light" />
          </IonButtons>
          <IonTitle>Upload DICOM File</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent className="uw-bg">
        <div className="uw-container">

          {/* Progress stepper */}
          <div className="uw-stepper">
            <div className={`uw-step ${selectedPatient ? "done" : "active"}`}>
              <span className="uw-step-dot">
                {selectedPatient ? <IonIcon icon={checkmarkCircle} /> : "1"}
              </span>
              <span className="uw-step-label">Patient</span>
            </div>
            <div className={`uw-step-line ${selectedPatient ? "done" : ""}`} />
            <div className={`uw-step ${fileState.uri ? "done" : selectedPatient ? "active" : ""}`}>
              <span className="uw-step-dot">
                {fileState.uri ? <IonIcon icon={checkmarkCircle} /> : "2"}
              </span>
              <span className="uw-step-label">File</span>
            </div>
            <div className={`uw-step-line ${fileState.uri ? "done" : ""}`} />
            <div className={`uw-step ${canUpload ? "active" : ""}`}>
              <span className="uw-step-dot">3</span>
              <span className="uw-step-label">Upload</span>
            </div>
          </div>

          {/* ---- Card 1: Patient ---- */}
          <div className="uw-card">
            <div className="uw-card-header">
              <div className="uw-card-icon" style={{ background: "rgba(59,216,177,0.15)", color: "#00a0a0" }}>
                <IonIcon icon={personCircleOutline} />
              </div>
              <div>
                <h3>Patient</h3>
                <p>Select who this scan belongs to</p>
              </div>
            </div>

            <div className="uw-card-body">
              <IonSelect
                interface="popover"
                placeholder={loadingPatients ? "Loading patients..." : "Choose a patient"}
                disabled={loadingPatients}
                value={selectedPatient?.id || ""}
                className="uw-select"
                onIonChange={(e: any) => {
                  const id = String(e.detail.value);
                  const p = patients.find((x) => String(x.id) === id) || null;
                  setSelectedPatient(p);
                }}
              >
                {patients.map((p) => (
                  <IonSelectOption key={p.id} value={p.id}>
                    {p.name}
                  </IonSelectOption>
                ))}
              </IonSelect>

              <button className="uw-link-btn" onClick={() => history.push("/patientlist")}>
                <IonIcon icon={addOutline} />
                Add new patient
              </button>
            </div>
          </div>

          {/* ---- Card 2: File ---- */}
          <div className="uw-card">
            <div className="uw-card-header">
              <div className="uw-card-icon" style={{ background: "rgba(0,160,160,0.12)", color: "#00a0a0" }}>
                <IonIcon icon={cloudUploadOutline} />
              </div>
              <div>
                <h3>File</h3>
                <p>Image, video, PDF, or DICOM (.dcm)</p>
              </div>
            </div>

            <div className="uw-card-body">
              {!fileState.uri ? (
                <button className="uw-dropzone" onClick={() => setShowPickerSheet(true)}>
                  <div className="uw-dropzone-icon">
                    <IonIcon icon={cloudUploadOutline} />
                  </div>
                  <span className="uw-dropzone-title">Tap to select a file</span>
                  <span className="uw-dropzone-sub">Camera, Gallery, or Files</span>
                </button>
              ) : (
                <div className="uw-file-preview">
                  <button className="uw-file-remove" onClick={clearFile} aria-label="Remove file">
                    <IonIcon icon={closeCircle} />
                  </button>

                  <div className="uw-file-thumb">
                    {fileKind === "image" && <img src={fileState.uri} alt="preview" />}
                    {fileKind === "video" && (
                      <video src={fileState.uri} muted />
                    )}
                    {(fileKind === "pdf" || fileKind === "dicom" || fileKind === "file") && (
                      <div
                        className="uw-file-icon-tile"
                        style={{ color: fileKindMeta[fileKind].tint, background: `${fileKindMeta[fileKind].tint}1a` }}
                      >
                        <IonIcon icon={fileKindMeta[fileKind].icon} />
                      </div>
                    )}
                  </div>

                  <div className="uw-file-info">
                    <span
                      className="uw-file-badge"
                      style={{ background: `${fileKindMeta[fileKind!].tint}1a`, color: fileKindMeta[fileKind!].tint }}
                    >
                      {fileKindMeta[fileKind!].label}
                    </span>
                    <span className="uw-file-name" title={fileState.name || ""}>
                      {fileState.name || "Selected file"}
                    </span>
                    {!!fileState.size && (
                      <span className="uw-file-size">{formatBytes(fileState.size)}</span>
                    )}
                  </div>

                  <button className="uw-change-btn" onClick={() => setShowPickerSheet(true)}>
                    Change
                    <IonIcon icon={chevronForwardOutline} />
                  </button>
                </div>
              )}

              <input
                type="file"
                ref={fileInputRef}
                accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.mp4,.mov,.mpeg,.dcm"
                style={{ display: "none" }}
                onChange={handleFilePicked}
              />
            </div>
          </div>

          {/* ---- Upload action ---- */}
          <div className="uw-upload-bar">
            <div className="uw-upload-status">
              {saving ? (
                <>
                  <span className="uw-upload-status-title">Uploading…</span>
                  <span className="uw-upload-status-sub">Please don't close this screen</span>
                </>
              ) : canUpload ? (
                <>
                  <span className="uw-upload-status-title">Ready to upload</span>
                  <span className="uw-upload-status-sub">
                    {selectedPatient?.name} · {fileKind ? fileKindMeta[fileKind].label : ""}
                  </span>
                </>
              ) : (
                <>
                  <span className="uw-upload-status-title">Almost there</span>
                  <span className="uw-upload-status-sub">Select a patient and a file to continue</span>
                </>
              )}
            </div>

            <IonButton
              className="uw-upload-btn"
              onClick={handleSaveDetails}
              disabled={!canUpload || saving}
            >
              {saving ? "Uploading" : "Upload"}
              {!saving && <IonIcon icon={cloudUploadOutline} slot="end" />}
            </IonButton>
          </div>

          {saving && <IonProgressBar type="indeterminate" className="uw-progress" />}
        </div>

        {/* ActionSheet */}
        <IonActionSheet
          isOpen={showPickerSheet}
          onDidDismiss={() => setShowPickerSheet(false)}
          header="Choose source"
          buttons={[
            {
              text: "Camera",
              icon: cameraOutline,
              handler: async () => {
                setShowPickerSheet(false);
                await pickFromCameraOrGallery(CameraSource.Camera);
              },
            },
            {
              text: "Gallery",
              icon: imagesOutline,
              handler: async () => {
                setShowPickerSheet(false);
                await pickFromCameraOrGallery(CameraSource.Photos);
              },
            },
            {
              text: "Files (PDF/DICOM/Video)",
              icon: folderOpenOutline,
              handler: () => {
                setShowPickerSheet(false);
                openNativeFilePicker();
              },
            },
            {
              text: "Cancel",
              role: "cancel",
            },
          ]}
        />

        {/* Alerts & Toasts */}
        <IonAlert
          isOpen={showAlert}
          onDidDismiss={() => setShowAlert(false)}
          header="Success"
          message="File uploaded successfully!"
          buttons={["OK"]}
        />
        <IonToast
          isOpen={showToast}
          message={toastMessage}
          duration={2000}
          color={toastMessage.toLowerCase().includes("success") ? "success" : "danger"}
          onDidDismiss={() => setShowToast(false)}
        />
      </IonContent>
      <AppFooter/>
    </IonPage>
  );
};

export default Uploadfiles;