import React, { useState, useRef, useMemo, useEffect } from "react";
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButtons,
  IonBackButton,
  IonButton,
  IonIcon,
  IonSelect,
  IonSelectOption,
  IonItem,
  IonLabel,
  IonLoading,
  IonToast,
  useIonRouter,
} from "@ionic/react";
import {
  imagesOutline,
  documentTextOutline,
  videocamOutline,
  medkitOutline,
  cloudUploadOutline,
  checkmarkCircle,
  serverOutline,
  personOutline,
  closeOutline,
  cameraReverseOutline,
  radioButtonOnOutline,
  playCircleOutline,
} from "ionicons/icons";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Camera } from "@capacitor/camera";
import { CameraPreview } from "@capgo/camera-preview";
import { useLocation } from "react-router-dom";
import axios from "axios";
import "../css/Dashboard.css";

import { uploadFileToS3 } from "../utils/s3Utils";
import { sftpUploadFile } from "../services/sftpClient";
import { smbUploadFromUri, writeFileToCacheChunked } from "../services/smbClient";

const API_BASE_URL = "https://aarnatechxperts.in/dicomapi/public/api";
const PATIENTS_STORAGE_KEY = "patients";
const UPLOAD_CHUNK_SIZE = 5 * 1024 * 1024;

// Same validation as the working Uploadfiles.tsx page: only these MIME
// types are accepted, with .dcm files allowed even though DICOM has no
// consistent browser-recognized MIME type.
const ALLOWED_FILE_TYPES = [
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

type ServerType = "dicom" | "aws" | "sftp" | "sbm";

interface ServerOption {
  id: string;
  type: ServerType;
  label: string;
  ips?: string;
  port?: string | number;
  username?: string;
  password?: string;
  callingAETitle?: string;
  calledAETitle?: string;
  host?: string;
  sftpPort?: string | number;
  sftpUser?: string;
  sftpPassword?: string;
  remoteFolder?: string;
  ip?: string;
  share?: string;
  smbUsername?: string;
  smbPassword?: string;
  bucketName?: string;
  region?: string;
  accessKey?: string;
  secretKey?: string;
  s3Folder?: string;
}

interface PatientOption {
  id: string;
  name: string;
  user_id?: string | number | null;
}

const normalizePatient = (
  raw: any
): PatientOption | null => {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const id =
    raw.id ??
    raw.patientId ??
    raw.patient_id ??
    raw._id;

  const name =
    raw.name ??
    raw.patientName ??
    raw.patient_name ??
    raw.fullName ??
    raw.full_name;

  if (
    id === undefined ||
    id === null ||
    String(id).trim() === ""
  ) {
    return null;
  }

  if (
    name === undefined ||
    name === null ||
    String(name).trim() === ""
  ) {
    return null;
  }

  return {
    id: String(id),
    name: String(name).trim(),

    user_id:
      raw.user_id ??
      raw.userId ??
      raw.userid ??
      null,
  };
};

type Step = "capture" | "details" | "done";
type UploadSource = "camera" | "gallery";
type FileKind = "image" | "pdf" | "video" | "dicom";
type CameraMode = "photo" | "video";

const detectFileKind = (file: File): FileKind => {
  const name = file.name.toLowerCase();
  const type = (file.type || "").toLowerCase();

  if (type.startsWith("image/")) return "image";
  if (type === "video/mp4" || name.endsWith(".mp4")) return "video";
  if (type.startsWith("video/")) return "video";
  if (type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (name.endsWith(".dcm") || type === "application/dicom") return "dicom";
  return "image";
};

const fileKindIcon = (kind: FileKind | null) => {
  switch (kind) {
    case "pdf": return documentTextOutline;
    case "video": return videocamOutline;
    case "dicom": return medkitOutline;
    default: return imagesOutline;
  }
};

const fileKindLabel = (kind: FileKind | null) => {
  switch (kind) {
    case "pdf": return "PDF Document";
    case "video": return "Video File";
    case "dicom": return "DICOM File";
    default: return "Image";
  }
};

const getFileExtension = (fileName: string): string => {
  const idx = fileName.lastIndexOf(".");
  return idx !== -1 ? fileName.substring(idx + 1).toLowerCase() : "";
};


const resolveImageType = (file: File): string => {
  const fileName = file.name.toLowerCase();
  const mime = (file.type || "").toLowerCase();

  if (
    fileName.endsWith(".dcm") ||
    mime === "application/dicom"
  ) {
    return "application/dicom";
  }

  if (mime.startsWith("image/")) {
    return mime;
  }

  if (mime.startsWith("video/")) {
    return mime;
  }

  if (mime === "application/pdf") {
    return "application/pdf";
  }

  return mime || "application/octet-stream";
};


const getServerIconSymbol = (type: ServerType) => {
  switch (type) {
    case "dicom": return "🏥 ";
    case "aws": return "☁️ ";
    case "sftp": return "📁 ";
    case "sbm": return "📶 ";
    default: return "🖥️ ";
  }
};

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return buffer;
}

async function writeFileToCacheForSftp(
  file: File,
  onProgress?: (percent: number) => void
): Promise<string> {
  const stagedPath = `sftp_upload_tmp/${file.name}`;
  const totalChunks = Math.max(1, Math.ceil(file.size / UPLOAD_CHUNK_SIZE));

  for (let i = 0; i < totalChunks; i++) {
    const start = i * UPLOAD_CHUNK_SIZE;
    const end = Math.min(start + UPLOAD_CHUNK_SIZE, file.size);
    const chunkBlob = file.slice(start, end);
    const base64Chunk = await blobToBase64(chunkBlob);

    if (i === 0) {
      await Filesystem.writeFile({
        path: stagedPath,
        data: base64Chunk,
        directory: Directory.Cache,
        recursive: true,
      });
    } else {
      await Filesystem.appendFile({
        path: stagedPath,
        data: base64Chunk,
        directory: Directory.Cache,
      });
    }
    onProgress?.(Math.round(((i + 1) / totalChunks) * 100));
  }

  const { uri } = await Filesystem.getUri({
    path: stagedPath,
    directory: Directory.Cache,
  });
  return uri;
}

const UploadImage: React.FC = () => {
  const router = useIonRouter();
  const location = useLocation();

  const uploadSource: UploadSource = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get("source") === "gallery" ? "gallery" : "camera";
  }, [location.search]);

  const [step, setStep] = useState<Step>("capture");

  // The native camera is placed behind the Capacitor WebView (toBack: true).
  // Ionic/WebView backgrounds must therefore be transparent on the camera page.
  useEffect(() => {
    const active = step === "capture" && uploadSource === "camera";
    const root = document.documentElement;
    const body = document.body;

    if (active) {
      body.classList.add("native-camera-active");
      root.style.setProperty("--ion-background-color", "transparent");
    } else {
      body.classList.remove("native-camera-active");
      root.style.removeProperty("--ion-background-color");
    }

    return () => {
      body.classList.remove("native-camera-active");
      root.style.removeProperty("--ion-background-color");
    };
  }, [step, uploadSource]);


  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileKind, setFileKind] = useState<FileKind | null>(null);

  const [cameraMode, setCameraMode] = useState<CameraMode>("photo");
  const [isRecording, setIsRecording] = useState(false);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("environment");

  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const recordingStartedAtRef = useRef<number | null>(null);

  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState(0);

  // FIX: generated thumbnail (poster) for the video preview <video> element.
  // Some Android WebViews show only a generic gray placeholder icon instead of
  // a real frame until playback starts. We capture a real frame ourselves.
  const [videoPosterUrl, setVideoPosterUrl] = useState<string | null>(null);

  const [servers, setServers] = useState<ServerOption[]>([]);
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [selectedServerId, setSelectedServerId] = useState("");
  const [selectedPatient, setSelectedPatient] = useState("");
  const [serversLoading, setServersLoading] = useState(false);
  const [patientsLoading, setPatientsLoading] = useState(false);

  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("Uploading...");
  const [toastMsg, setToastMsg] = useState("");

  const selectedServerObj = useMemo(
    () => servers.find((s) => s.id === selectedServerId) || null,
    [servers, selectedServerId]
  );

  const formatRecordingTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  useEffect(() => {
    if (!selectedFile || fileKind !== "video") {
      setVideoPreviewUrl(null);
      setVideoDuration(0);
      return;
    }

    const url = URL.createObjectURL(selectedFile);
    setVideoPreviewUrl(url);

    return () => URL.revokeObjectURL(url);
  }, [selectedFile, fileKind]);

  // FIX: Generate a real poster frame for the video preview.
  // We load the video off-screen (never attached to the DOM), seek slightly
  // into it, draw the current frame to a canvas, and use the resulting
  // data URL as the <video poster>. This avoids WebViews that only show a
  // generic gray "no thumbnail" placeholder until the user presses play.
  useEffect(() => {
    if (!videoPreviewUrl) {
      setVideoPosterUrl(null);
      return;
    }

    let cancelled = false;
    const video = document.createElement("video");
    video.src = videoPreviewUrl;
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";

    const capture = () => {
      if (cancelled) return;
      try {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth || 320;
        canvas.height = video.videoHeight || 240;
        const ctx = canvas.getContext("2d");
        if (ctx && canvas.width && canvas.height) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          setVideoPosterUrl(canvas.toDataURL("image/jpeg", 0.85));
        }
      } catch (e) {
        console.warn("Poster capture failed:", e);
      }
    };

    const onLoadedData = () => {
      // Seeking slightly forward avoids an all-black/empty first frame
      // on some encoders that write a blank keyframe at time 0.
      try {
        const seekTo = Math.min(0.15, (video.duration || 1) / 2);
        video.currentTime = seekTo;
      } catch {
        capture();
      }
    };

    const onSeeked = () => capture();
    const onError = () =>
      console.warn("Poster generation: video failed to load");

    video.addEventListener("loadeddata", onLoadedData);
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onError);

    return () => {
      cancelled = true;
      video.removeEventListener("loadeddata", onLoadedData);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      video.src = "";
    };
  }, [videoPreviewUrl]);

  useEffect(() => {
    if (!isRecording) return;

    const timer = window.setInterval(() => {
      if (recordingStartedAtRef.current !== null) {
        setRecordingSeconds(
          Math.max(
            0,
            Math.floor((Date.now() - recordingStartedAtRef.current) / 1000)
          )
        );
      }
    }, 250);

    return () => window.clearInterval(timer);
  }, [isRecording]);

  useEffect(() => {
    const loadServers = async () => {
      setServersLoading(true);
      try {
        const userId = localStorage.getItem("userId");
        const res = await axios.get<ServerOption[]>(`${API_BASE_URL}/servers`, {
          params: { userID: userId },
        });
        setServers(res.data || []);
      } catch (err) {
        console.error("Failed to load servers:", err);
        setToastMsg("Failed to load servers.");
      } finally {
        setServersLoading(false);
      }
    };

    loadServers();
  }, []);

 const fetchPatients = () => {
  setPatientsLoading(true);

  try {
    const currentUserId = localStorage.getItem("userId");

    const stored = localStorage.getItem(PATIENTS_STORAGE_KEY);

    if (!stored) {
      setPatients([]);
      return;
    }

    const parsed = JSON.parse(stored);

    let rawPatients: any[] = [];

    if (Array.isArray(parsed)) {
      rawPatients = parsed;
    } else if (Array.isArray(parsed?.data)) {
      rawPatients = parsed.data;
    } else if (Array.isArray(parsed?.patients)) {
      rawPatients = parsed.patients;
    }

    const normalized: PatientOption[] = rawPatients
      .map((raw) => normalizePatient(raw))
      .filter(
        (patient): patient is PatientOption =>
          patient !== null
      );

    /*
     * If patients have user_id, filter by logged-in user.
     * If user_id doesn't exist, keep the patient.
     */
    const filtered = normalized.filter((patient) => {
      if (
        patient.user_id === undefined ||
        patient.user_id === null ||
        patient.user_id === ""
      ) {
        return true;
      }

      return String(patient.user_id) === String(currentUserId);
    });

    /*
     * Remove duplicate patient IDs.
     */
    const uniquePatients = Array.from(
      new Map(
        filtered.map((patient) => [
          String(patient.id),
          patient,
        ])
      ).values()
    );

    console.log(
      "Patients from localStorage:",
      uniquePatients
    );

    setPatients(uniquePatients);
  } catch (error) {
    console.error(
      "Patient localStorage error:",
      error
    );

    setPatients([]);
    setToastMsg(
      "Unable to load patients from localStorage."
    );
  } finally {
    setPatientsLoading(false);
  }
};

useEffect(() => {
  fetchPatients();
}, []);

  // FIX: make the WebView transparent BEFORE starting the native preview,
  // and wait a frame so the style actually paints first. Otherwise the
  // preview can start underneath a still-opaque WebView and appear black.
  const startNativeCamera = async () => {
    try {
      document.body.classList.add("native-camera-active");
      document.documentElement.style.setProperty(
        "--ion-background-color",
        "transparent"
      );
      await new Promise((resolve) => requestAnimationFrame(resolve));

      const permission = await Camera.checkPermissions();

      if (permission.camera !== "granted") {
        const requested = await Camera.requestPermissions();
        if (requested.camera !== "granted") {
          setToastMsg("Camera permission is required.");
          return;
        }
      }

      await CameraPreview.start({
        position: facingMode === "environment" ? "rear" : "front",
        toBack: true,
        storeToFile: true,
        disableAudio: true,
        rotateWhenOrientationChanged: true,
        // IMPORTANT for @capgo/camera-preview >= 7.11 on Android:
        // video capture must be initialized when the preview starts.
        enableVideoMode: true,
        aspectRatio: "16:9",
        aspectMode: "cover",
      } as any);
    } catch (error: any) {
      console.error("Native camera start error:", error);
      setToastMsg(error?.message || "Could not start camera.");
    }
  };

  useEffect(() => {
    if (step === "capture" && uploadSource === "camera") {
      startNativeCamera();
    } else {
      CameraPreview.stop().catch(() => undefined);
    }

    return () => {
      CameraPreview.stop().catch(() => undefined);
    };
    // Start/stop only when entering/leaving capture.
    // Camera flip is handled with CameraPreview.flip().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, uploadSource]);

  const capturePhoto = async () => {
    try {
      const result = await CameraPreview.capture({
        quality: 90,
      });

      const path = result.value;
      if (!path) throw new Error("Camera did not return a photo.");

      const file = await nativePathToFile(path, `photo_${Date.now()}.jpg`, "image/jpeg");
      const dataUrl = await fileToDataUrl(file);

      setSelectedFile(file);
      setFileKind("image");
      setImageDataUrl(dataUrl);

      await CameraPreview.stop();
      setStep("details");
    } catch (error: any) {
      console.error("Photo capture error:", error);
      setToastMsg(error?.message || "Could not capture photo.");
    }
  };

  const startRecording = async () => {
    if (isRecording) return;

    try {
      // v7-compatible options only. Do not pass videoCodec,
      // mirrorFrontCamera, aspectMode or videoQuality here.
      // The preview is started with enableVideoMode=true. Passing it here as
      // well keeps this safe across v7 native builds that read the flag from
      // the recording call.
      await CameraPreview.startRecordVideo({
        storeToFile: true,
        disableAudio: true,
        enableVideoMode: true,
      } as any);

      recordingStartedAtRef.current = Date.now();
      setRecordingSeconds(0);
      setIsRecording(true);
    } catch (error: any) {
      console.error("Native video start error:", error);
      recordingStartedAtRef.current = null;
      setIsRecording(false);
      setToastMsg(error?.message || "Could not start video recording.");
    }
  };

  const stopRecording = async () => {
    if (!isRecording) return;

    const elapsed = recordingStartedAtRef.current
      ? Math.max(
        1,
        Math.floor((Date.now() - recordingStartedAtRef.current) / 1000)
      )
      : 1;

    setRecordingSeconds(elapsed);
    setIsRecording(false);

    try {
      const result = await CameraPreview.stopRecordVideo();
      const nativePath = result?.videoFilePath;

      if (!nativePath) {
        throw new Error("Native recorder did not return a video file.");
      }

      const file = await nativePathToFile(
        nativePath,
        `video_${Date.now()}.mp4`,
        "video/mp4"
      );

      if (!file.size) {
        throw new Error("Recorded MP4 file is empty.");
      }

      // Native recorder output is expected to be MP4.
      // Do not rename WebM to MP4.
      if (!file.name.toLowerCase().endsWith(".mp4")) {
        console.warn("Native recorder returned:", file.name);
      }

      setSelectedFile(file);
      setFileKind("video");
      setImageDataUrl(null);
      setVideoDuration(elapsed);

      recordingStartedAtRef.current = null;

      await CameraPreview.stop().catch(() => undefined);
      setStep("details");
    } catch (error: any) {
      console.error("Native video stop/read error:", error);
      recordingStartedAtRef.current = null;
      setIsRecording(false);
      setToastMsg(
        error?.message || "Video was recorded but could not be loaded."
      );
    }
  };

  const toggleFacingMode = async () => {
    try {
      await CameraPreview.flip();
      setFacingMode((current) =>
        current === "environment" ? "user" : "environment"
      );
    } catch (error: any) {
      console.error("Camera flip error:", error);
      setToastMsg(error?.message || "Could not switch camera.");
    }
  };

  async function nativePathToFile(
    nativePath: string,
    fileName: string,
    mimeType: string
  ): Promise<File> {
    /*
     * Capacitor Filesystem returns base64 on native platforms.
     * We convert it through a real ArrayBuffer so modern TypeScript
     * does not complain about Uint8Array<ArrayBufferLike> vs BlobPart.
     */
    const cleanPath = nativePath.startsWith("file://")
      ? nativePath.replace(/^file:\/\//, "")
      : nativePath;
    const result = await Filesystem.readFile({ path: cleanPath });

    if (typeof result.data !== "string") {
      const blob = result.data as Blob;
      return new File([blob], fileName, { type: mimeType });
    }

    const buffer = base64ToArrayBuffer(result.data);
    return new File([buffer], fileName, { type: mimeType });
  }

  async function fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        resolve(reader.result as string);
      };

      reader.onerror = () => {
        reject(
          new Error("Unable to read selected file.")
        );
      };

      reader.readAsDataURL(file);
    });
  }

  const openGalleryPicker = () => {
    fileInputRef.current?.click();
  };

  const handleGalleryFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const isDcm = file.name.toLowerCase().endsWith(".dcm");

    if (!ALLOWED_FILE_TYPES.includes(file.type) && !isDcm) {
      setToastMsg("Only images, videos, PDFs, and DICOM files are allowed.");
      return;
    }

    const kind = detectFileKind(file);
    setSelectedFile(file);
    setFileKind(kind);

    if (kind === "image") {
      const reader = new FileReader();
      reader.onload = () => {
        setImageDataUrl((reader.result as string) || null);
        setStep("details");
      };
      reader.onerror = () => setToastMsg("Failed to read the selected image.");
      reader.readAsDataURL(file);
    } else {
      setImageDataUrl(null);
      setStep("details");
    }
  };

  useEffect(() => {
    if (uploadSource === "gallery") {
      openGalleryPicker();
    }
  }, [uploadSource]);

  const resolveFile = async (patientName?: string): Promise<File | null> => {
    const cleanPatientName = patientName
      ? patientName.trim().replace(/[^a-zA-Z0-9_-]/g, "_")
      : "Patient";

    const now = new Date();
    const timestamp =
      `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}` +
      `${String(now.getDate()).padStart(2, "0")}_` +
      `${String(now.getHours()).padStart(2, "0")}` +
      `${String(now.getMinutes()).padStart(2, "0")}` +
      `${String(now.getSeconds()).padStart(2, "0")}`;

    if (selectedFile) {
      const lastDotIndex = selectedFile.name.lastIndexOf(".");
      const fileExt =
        lastDotIndex !== -1
          ? selectedFile.name.substring(lastDotIndex)
          : fileKind === "video"
            ? ".mp4"
            : ".jpg";

      const newFileName = `${cleanPatientName}_${timestamp}${fileExt}`;
      return new File([selectedFile], newFileName, {
        type: selectedFile.type,
      });
    }

    if (imageDataUrl) {
      const blob = await (await fetch(imageDataUrl)).blob();
      let ext = blob.type.split("/")[1] || "jpg";
      if (ext === "jpeg") ext = "jpg";

      const newFileName = `${cleanPatientName}_${timestamp}.${ext}`;
      return new File([blob], newFileName, {
        type: blob.type || "image/jpeg",
      });
    }

    return null;
  };

  const resolveDataUrl = async (file: File): Promise<string> => {
    if (imageDataUrl && (!selectedFile || fileKind === "image")) {
      return imageDataUrl;
    }
    return fileToDataUrl(file);
  };


  const uploadToDicomServer = async (
    file: File,
    server: ServerOption,
    patient: PatientOption
  ) => {
    const userId = localStorage.getItem("userId");

    if (!userId) {
      throw new Error("User ID is missing.");
    }

    if (!patient?.id) {
      throw new Error("Patient ID is missing.");
    }

    if (!patient?.name) {
      throw new Error("Patient name is missing.");
    }

    if (!server?.ips) {
      throw new Error("DICOM server IP is missing.");
    }

    if (!server?.port) {
      throw new Error("DICOM server port is missing.");
    }

    /*
     * IMPORTANT
     *
     * Only .dcm / application/dicom should be treated
     * as an existing DICOM file.
     *
     * JPEG / PNG / MP4 are NOT DICOM.
     */
    const isDicom =
      file.name.toLowerCase().endsWith(".dcm") ||
      file.type.toLowerCase() === "application/dicom";

    const image = await fileToDataUrl(file);

    const imageType = isDicom
      ? "application/dicom"
      : file.type || "application/octet-stream";

    console.log("========== UPLOAD ==========");
    console.log("userId:", userId);
    console.log("patientId:", patient.id);
    console.log("patientName:", patient.name);
    console.log("fileName:", file.name);
    console.log("fileSize:", file.size);
    console.log("fileType:", file.type);
    console.log("imageType:", imageType);
    console.log("isDicom:", isDicom);
    console.log("DICOM IP:", server.ips);
    console.log("DICOM Port:", server.port);
    console.log("callingAE:", server.callingAETitle);
    console.log("calledAE:", server.calledAETitle);
    console.log("============================");

    /*
     * The Laravel API must convert JPEG/PNG/MP4 into DICOM.
     *
     * Existing .dcm files are passed as real DICOM.
     */
    const response = await axios.post(
      `${API_BASE_URL}/upload`,
      {
        userId: userId,

        patientId: String(patient.id),
        patientName: String(patient.name),

        image: image,
        imageType: imageType,

        ips: String(server.ips),
        port: String(server.port),

        username: server.username || "",
        password: server.password || "",

        callingAE: server.callingAETitle || "MYSCU",
        calledAE: server.calledAETitle || "PACS_SERVER",
      },
      {
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        timeout: 180000,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      }
    );

    console.log("DICOM API response:", response.data);

    if (
      response.data?.success === true ||
      response.data?.statusCode === 200 ||
      response.data?.status === "success"
    ) {
      return response.data;
    }

    throw new Error(
      response.data?.message ||
      response.data?.error ||
      "DICOM server rejected the upload."
    );
  };

  const uploadToAwsServer = async (file: File, server: ServerOption) => {
    if (
      !server.bucketName ||
      !server.region ||
      !server.accessKey ||
      !server.secretKey
    ) {
      throw new Error("This AWS server is missing configuration.");
    }

    localStorage.setItem(
      "awsConfig",
      JSON.stringify({
        bucketName: server.bucketName,
        region: server.region,
        accessKey: server.accessKey,
        secretKey: server.secretKey,
      })
    );

    await uploadFileToS3(file, server.s3Folder || "", (percent) => {
      setLoadingMessage(`Uploading to S3... ${percent}%`);
    });
  };

  const uploadToSftpServer = async (
    file: File,
    server: ServerOption
  ) => {
    const { host, sftpUser, sftpPassword } = server;

    if (!host || !sftpUser || !sftpPassword) {
      throw new Error("This SFTP server is missing configuration.");
    }

    const creds = {
      host,
      port: server.sftpPort ? Number(server.sftpPort) : 22,
      user: sftpUser,
      password: sftpPassword,
    };

    setLoadingMessage(`Preparing ${file.name}...`);
    const localUri = await writeFileToCacheForSftp(file, (percent) => {
      setLoadingMessage(`Preparing ${file.name}... ${percent}%`);
    });

    setLoadingMessage(`Sending ${file.name} to SFTP server...`);
    await sftpUploadFile(
      creds,
      localUri,
      server.remoteFolder || "/",
      file.name
    );
  };

  const uploadToSmbServer = async (
    file: File,
    server: ServerOption
  ) => {
    const { ip, smbUsername, smbPassword } = server;

    if (!ip || !smbUsername || !smbPassword) {
      throw new Error("This SMB server is missing configuration.");
    }

    const creds = {
      ip,
      username: smbUsername,
      password: smbPassword,
      share: server.share || "WiFiShare",
    };

    setLoadingMessage(`Preparing ${file.name}...`);
    const localUri = await writeFileToCacheChunked(file, (percent) => {
      setLoadingMessage(`Preparing ${file.name}... ${percent}%`);
    });

    setLoadingMessage(`Sending ${file.name} to SMB share...`);
    const remoteFolder = server.remoteFolder || "/";
    const remotePath =
      remoteFolder === "/" ? `/${file.name}` : `${remoteFolder}/${file.name}`;

    await smbUploadFromUri(
      creds,
      remotePath,
      localUri,
      file.type || "application/octet-stream"
    );
  };

  const handleUpload = async () => {
  if (!selectedServerObj) {
    setToastMsg(
      "Please select a destination server."
    );
    return;
  }

  if (!selectedPatient) {
    setToastMsg(
      "Please select a patient."
    );
    return;
  }

  const patient = patients.find(
    (item) =>
      String(item.id) ===
      String(selectedPatient)
  );

  if (!patient) {
    setToastMsg(
      "Selected patient was not found."
    );
    return;
  }

  if (!patient.id) {
    setToastMsg(
      "Patient ID is missing."
    );
    return;
  }

  if (!patient.name) {
    setToastMsg(
      "Patient name is missing."
    );
    return;
  }

  const file =
    await resolveFile(patient.name);

  if (!file) {
    setToastMsg(
      "File is missing. Please capture or select a file again."
    );
    return;
  }

  console.log(
    "Uploading file:",
    file.name,
    file.type,
    file.size
  );

  console.log(
    "Uploading for patient:",
    patient
  );

  setLoading(true);
  setLoadingMessage(
    "Preparing upload..."
  );

  try {
    switch (selectedServerObj.type) {

      case "dicom":

        setLoadingMessage(
          "Uploading to DICOM server..."
        );

        await uploadToDicomServer(
          file,
          selectedServerObj,
          patient
        );

        break;

      case "aws":

        await uploadToAwsServer(
          file,
          selectedServerObj
        );

        break;

      case "sftp":

        await uploadToSftpServer(
          file,
          selectedServerObj
        );

        break;

      case "sbm":

        await uploadToSmbServer(
          file,
          selectedServerObj
        );

        break;

      default:

        throw new Error(
          "Unknown server type."
        );
    }

    setLoading(false);

    setToastMsg(
      `Upload successful for ${patient.name}.`
    );

    setStep("done");

  } catch (error: any) {

    console.error(
      "========== UPLOAD ERROR =========="
    );

    console.error(
      error?.response?.data ||
      error
    );

    console.error(
      "=================================="
    );

    setLoading(false);

    const message =
      error?.response?.data?.message ||
      error?.response?.data?.error ||
      error?.message ||
      "Upload failed.";

    setToastMsg(message);
  }
};


  // FIX: "Change File" — lets the person swap the picked/captured file from
  // the review screen without losing their already-selected server/patient.
  // Only clears file-related state, then re-opens the same source they used
  // originally (gallery file picker, or the native camera capture screen).
  const changeFile = () => {
    setImageDataUrl(null);
    setSelectedFile(null);
    setFileKind(null);
    setVideoPreviewUrl(null);
    setVideoDuration(0);
    setVideoPosterUrl(null);
    setRecordingSeconds(0);
    recordingStartedAtRef.current = null;
    setIsRecording(false);
    setCameraMode("photo");

    if (uploadSource === "gallery") {
      openGalleryPicker();
    } else {
      setStep("capture");
    }
  };

  const resetFlow = async () => {
    setImageDataUrl(null);
    setSelectedFile(null);
    setFileKind(null);
    setVideoPreviewUrl(null);
    setVideoDuration(0);
    setVideoPosterUrl(null); // FIX: clear generated poster on reset
    setRecordingSeconds(0);
    setSelectedServerId("");
    setSelectedPatient("");
    recordingStartedAtRef.current = null;
    setIsRecording(false);
    setCameraMode("photo");
    setStep("capture");

    if (uploadSource === "gallery") {
      openGalleryPicker();
    }
  };

  return (
    <IonPage>
      {step === "capture" && uploadSource === "camera" && (
        <style>{`
          body.native-camera-active,
          body.native-camera-active ion-app,
          body.native-camera-active ion-router-outlet,
          body.native-camera-active ion-page,
          body.native-camera-active ion-content,
          body.native-camera-active .camera-preview-content {
            background: transparent !important;
            background-color: transparent !important;
            --background: transparent !important;
            --ion-background-color: transparent !important;
          }

          body.native-camera-active ion-content::part(scroll) {
            background: transparent !important;
          }

          .native-camera-shell {
            position: relative;
            width: 100%;
            height: 100dvh;
            min-height: 100%;
            overflow: hidden;
            background: transparent;
          }

          .native-camera-overlay {
            position: absolute;
            inset: 0;
            z-index: 100;
            pointer-events: none;
          }

          .native-camera-overlay button {
            pointer-events: auto;
          }

          .native-camera-topbar {
            position: absolute;
            top: max(18px, env(safe-area-inset-top));
            left: 16px;
            right: 16px;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }

          .native-camera-bottom {
            position: absolute;
            left: 0;
            right: 0;
            bottom: max(28px, env(safe-area-inset-bottom));
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 16px;
          }

          .native-camera-mode {
            display: flex;
            align-items: center;
            gap: 4px;
            padding: 5px;
            border-radius: 999px;
            background: rgba(15, 23, 42, .72);
            backdrop-filter: blur(12px);
          }

          .native-camera-mode button {
            min-width: 78px;
            border: 0;
            border-radius: 999px;
            padding: 8px 16px;
            color: rgba(255,255,255,.72);
            background: transparent;
            font-weight: 600;
          }

          .native-camera-mode button.active {
            color: #fff;
            background: rgba(255,255,255,.18);
          }
        `}</style>
      )}
      {step !== "capture" || uploadSource === "gallery" ? (
        <IonHeader>
          <IonToolbar
            style={{
              "--background": "#ffffff",
              "--color": "#111827",
              borderBottom: "1px solid #e5e7eb",
            } as React.CSSProperties}
          >
            <IonButtons slot="start">
              <IonBackButton defaultHref="/dashboard" />
            </IonButtons>

            <IonTitle style={{ fontWeight: 700 }}>
              {uploadSource === "gallery" ? "Upload from Gallery" : "Upload File"}
            </IonTitle>
          </IonToolbar>
        </IonHeader>
      ) : null}

      <IonContent
        fullscreen={step === "capture" && uploadSource === "camera"}
        className={
          step === "capture" && uploadSource === "camera"
            ? ""
            : "ion-padding"
        }
        style={{
          // FIX: was "#000000" for the camera step, which painted an opaque
          // black layer directly over the native preview. Must be transparent
          // so the native camera feed (rendered behind the WebView) shows through.
          "--background":
            step === "capture" && uploadSource === "camera"
              ? "transparent"
              : "#f8fafc",
        } as React.CSSProperties}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.mp4,.mov,.mpeg,.dcm"
          style={{
            position: "absolute",
            width: 1,
            height: 1,
            padding: 0,
            margin: -1,
            overflow: "hidden",
            clip: "rect(0,0,0,0)",
            whiteSpace: "nowrap",
            border: 0,
          }}
          onChange={handleGalleryFileChange}
        />

        {step === "capture" && (
          <>
            {uploadSource === "gallery" ? (
              <div
                style={{
                  minHeight: "calc(100vh - 80px)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 24,
                }}
              >
                <div
                  style={{
                    width: "100%",
                    maxWidth: 440,
                    background: "#fff",
                    borderRadius: 24,
                    padding: 32,
                    textAlign: "center",
                    boxShadow: "0 18px 50px rgba(15,23,42,.08)",
                  }}
                >
                  <div
                    style={{
                      width: 76,
                      height: 76,
                      margin: "0 auto 18px",
                      borderRadius: 22,
                      display: "grid",
                      placeItems: "center",
                      background: "#ecfeff",
                    }}
                  >
                    <IonIcon
                      icon={imagesOutline}
                      style={{ fontSize: 38, color: "#0891b2" }}
                    />
                  </div>

                  <h2 style={{ margin: 0, color: "#111827" }}>
                    Select a file
                  </h2>

                  <p
                    style={{
                      color: "#64748b",
                      lineHeight: 1.6,
                      margin: "10px 0 24px",
                    }}
                  >
                    Select an image, MP4 video, PDF or DICOM file.
                  </p>

                  <IonButton
                    expand="block"
                    onClick={openGalleryPicker}
                    style={{ "--border-radius": "14px" } as React.CSSProperties}
                  >
                    <IonIcon icon={imagesOutline} slot="start" />
                    Choose File
                  </IonButton>
                </div>
              </div>
            ) : (
              <div
                style={{
                  position: "fixed",
                  inset: 0,
                  // FIX: was "#000" — an opaque black div stacked directly on
                  // top of the native camera layer, hiding it completely.
                  background: "transparent",
                  overflow: "hidden",
                }}
              >
                {/* Native camera preview is rendered by the plugin behind this UI. */}

                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    padding: "20px 18px",
                    paddingTop: "max(20px, env(safe-area-inset-top))",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    zIndex: 50,
                  }}
                >
                  <button
                    onClick={() => router.push("/dashboard", "back")}
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: "50%",
                      border: "1px solid rgba(255,255,255,.15)",
                      background: "rgba(0,0,0,.45)",
                      color: "#fff",
                      display: "grid",
                      placeItems: "center",
                      backdropFilter: "blur(10px)",
                    }}
                  >
                    <IonIcon icon={closeOutline} style={{ fontSize: 23 }} />
                  </button>

                  {isRecording ? (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "8px 14px",
                        borderRadius: 24,
                        background: "rgba(185,28,28,.92)",
                        color: "#fff",
                        fontWeight: 800,
                        fontSize: 14,
                        boxShadow: "0 8px 25px rgba(0,0,0,.25)",
                      }}
                    >
                      <span
                        style={{
                          width: 9,
                          height: 9,
                          borderRadius: "50%",
                          background: "#fff",
                          animation: "pulse 1s infinite",
                        }}
                      />
                      REC {formatRecordingTime(recordingSeconds)}
                    </div>
                  ) : (
                    <div
                      style={{
                        padding: "8px 13px",
                        borderRadius: 20,
                        background: "rgba(0,0,0,.38)",
                        color: "#fff",
                        fontSize: 13,
                        fontWeight: 600,
                        backdropFilter: "blur(10px)",
                      }}
                    >
                      {cameraMode === "video" ? "Video" : "Photo"}
                    </div>
                  )}

                  <div style={{ width: 44 }} />
                </div>

                <div
                  style={{
                    position: "absolute",
                    left: 16,
                    right: 16,
                    bottom: 0,
                    paddingBottom: "max(24px, env(safe-area-inset-bottom))",
                    zIndex: 50,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "0 22px 20px",
                    }}
                  >
                    <button
                      onClick={openGalleryPicker}
                      disabled={isRecording}
                      style={{
                        width: 50,
                        height: 50,
                        borderRadius: 16,
                        border: "1px solid rgba(255,255,255,.2)",
                        background: "rgba(0,0,0,.45)",
                        color: "#fff",
                        display: "grid",
                        placeItems: "center",
                        opacity: isRecording ? 0.4 : 1,
                      }}
                    >
                      <IonIcon icon={imagesOutline} style={{ fontSize: 24 }} />
                    </button>

                    <button
                      onClick={
                        cameraMode === "photo"
                          ? capturePhoto
                          : isRecording
                            ? stopRecording
                            : startRecording
                      }
                      style={{
                        width: 82,
                        height: 82,
                        borderRadius: "50%",
                        border: "5px solid #fff",
                        background: "rgba(255,255,255,.15)",
                        display: "grid",
                        placeItems: "center",
                        padding: 0,
                        boxShadow: "0 10px 35px rgba(0,0,0,.4)",
                      }}
                    >
                      <span
                        style={{
                          width: isRecording ? 30 : 64,
                          height: isRecording ? 30 : 64,
                          borderRadius: isRecording ? 7 : "50%",
                          background:
                            cameraMode === "photo" ? "#fff" : "#ef4444",
                          transition: "all .2s ease",
                        }}
                      />
                    </button>

                    <button
                      onClick={toggleFacingMode}
                      style={{
                        width: 50,
                        height: 50,
                        borderRadius: 16,
                        border: "1px solid rgba(255,255,255,.2)",
                        background: "rgba(0,0,0,.45)",
                        color: "#fff",
                        display: "grid",
                        placeItems: "center",
                      }}
                    >
                      <IonIcon
                        icon={cameraReverseOutline}
                        style={{ fontSize: 26 }}
                      />
                    </button>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "center",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        gap: 4,
                        padding: 5,
                        borderRadius: 30,
                        background: "rgba(0,0,0,.58)",
                        border: "1px solid rgba(255,255,255,.12)",
                        backdropFilter: "blur(12px)",
                      }}
                    >
                      {(["photo", "video"] as CameraMode[]).map((mode) => (
                        <button
                          key={mode}
                          disabled={isRecording}
                          onClick={() => setCameraMode(mode)}
                          style={{
                            border: "none",
                            borderRadius: 24,
                            padding: "8px 22px",
                            color:
                              cameraMode === mode ? "#111827" : "#d1d5db",
                            background:
                              cameraMode === mode ? "#fff" : "transparent",
                            fontWeight: 700,
                            fontSize: 13,
                            textTransform: "capitalize",
                          }}
                        >
                          {mode}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <style>
                  {`
                    @keyframes pulse {
                      0%,100% { opacity: 1; transform: scale(1); }
                      50% { opacity: .35; transform: scale(.75); }
                    }
                  `}
                </style>
              </div>
            )}
          </>
        )}

        {step === "details" && (
          <div
            style={{
              maxWidth: 760,
              margin: "0 auto",
              padding: "8px 0 32px",
            }}
          >
            <div
              style={{
                marginBottom: 20,
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <div>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 7,
                    padding: "7px 11px",
                    borderRadius: 20,
                    background: "#ecfeff",
                    color: "#0e7490",
                    fontSize: 12,
                    fontWeight: 800,
                  }}
                >
                  <IonIcon icon={checkmarkCircle} />
                  READY TO UPLOAD
                </div>

                <h1
                  style={{
                    margin: "12px 0 5px",
                    fontSize: 26,
                    color: "#0f172a",
                    fontWeight: 800,
                  }}
                >
                  Review your file
                </h1>

                <p style={{ margin: 0, color: "#64748b" }}>
                  Check the preview and select the destination.
                </p>
              </div>

              {/* FIX: was no way to pick a different file from this screen
                  before — this reopens the same source (gallery/camera)
                  without resetting the already-chosen server/patient. */}
              <IonButton
                fill="outline"
                size="small"
                onClick={changeFile}
                style={
                  {
                    "--border-radius": "10px",
                    flexShrink: 0,
                    marginTop: 2,
                  } as React.CSSProperties
                }
              >
                <IonIcon icon={imagesOutline} slot="start" />
                Change File
              </IonButton>
            </div>

            {fileKind === "image" && imageDataUrl && (
              <div
                style={{
                  background: "#fff",
                  borderRadius: 18,
                  padding: 10,
                  marginBottom: 18,
                  boxShadow: "0 8px 30px rgba(15,23,42,.06)",
                  border: "1px solid #e5e7eb",
                }}
              >
                <img
                  src={imageDataUrl}
                  alt="Captured"
                  style={{
                    width: "100%",
                    maxHeight: 440,
                    objectFit: "contain",
                    borderRadius: 12,
                    display: "block",
                  }}
                />
              </div>
            )}

            {fileKind === "video" && selectedFile && videoPreviewUrl && (
              <div
                style={{
                  background: "#fff",
                  borderRadius: 20,
                  padding: 12,
                  marginBottom: 18,
                  border: "1px solid #e5e7eb",
                  boxShadow: "0 8px 30px rgba(15,23,42,.06)",
                }}
              >
                <div
                  style={{
                    position: "relative",
                    borderRadius: 14,
                    overflow: "hidden",
                    background: "#0f172a",
                  }}
                >
                  <video
                    src={videoPreviewUrl}
                    // FIX: real generated poster instead of relying on the
                    // WebView's default gray placeholder icon.
                    poster={videoPosterUrl || undefined}
                    controls
                    playsInline
                    // FIX: "auto" so the browser is more likely to have a
                    // decodable frame ready; the real fix is the poster above.
                    preload="auto"
                    onLoadedMetadata={(e) => {
                      const duration = e.currentTarget.duration;
                      if (Number.isFinite(duration) && duration > 0) {
                        setVideoDuration(Math.ceil(duration));
                      }
                    }}
                    onError={() =>
                      setToastMsg(
                        "MP4 was recorded, but this device could not preview it."
                      )
                    }
                    style={{
                      width: "100%",
                      maxHeight: 430,
                      minHeight: 220,
                      objectFit: "contain",
                      display: "block",
                      background: "#0f172a",
                    }}
                  />
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    marginTop: 12,
                  }}
                >
                  <div
                    style={{
                      width: 46,
                      height: 46,
                      borderRadius: 14,
                      display: "grid",
                      placeItems: "center",
                      background: "#eff6ff",
                      color: "#2563eb",
                    }}
                  >
                    <IonIcon
                      icon={playCircleOutline}
                      style={{ fontSize: 26 }}
                    />
                  </div>

                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        fontWeight: 800,
                        color: "#111827",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {selectedFile.name}
                    </div>
                    <div
                      style={{
                        marginTop: 3,
                        color: "#64748b",
                        fontSize: 13,
                      }}
                    >
                      MP4 Video · Duration{" "}
                      <strong>
                        {formatRecordingTime(videoDuration || recordingSeconds)}
                      </strong>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {fileKind && fileKind !== "image" && fileKind !== "video" && selectedFile && (
              <div
                style={{
                  background: "#fff",
                  border: "1px solid #e5e7eb",
                  borderRadius: 18,
                  padding: 24,
                  marginBottom: 18,
                  textAlign: "center",
                }}
              >
                <IonIcon
                  icon={fileKindIcon(fileKind)}
                  style={{ fontSize: 58, color: "#0891b2" }}
                />
                <div style={{ fontWeight: 800, marginTop: 10, color: "#111827" }}>
                  {fileKindLabel(fileKind)}
                </div>
                <div
                  style={{
                    marginTop: 5,
                    color: "#64748b",
                    wordBreak: "break-all",
                  }}
                >
                  {selectedFile.name}
                </div>
              </div>
            )}

            {!serversLoading &&
              !patientsLoading &&
              (servers.length === 0 || patients.length === 0) ? (
              // No server and/or no patient exists yet — nothing to pick
              // from, so tell the user what to set up first instead of
              // showing empty dropdowns.
              <div
                style={{
                  background: "#fff7ed",
                  border: "1px solid #fed7aa",
                  borderRadius: 20,
                  padding: 24,
                  textAlign: "center",
                }}
              >
                <IonIcon
                  icon={serverOutline}
                  style={{ fontSize: 40, color: "#ea580c" }}
                />
                <h3 style={{ margin: "10px 0 6px", color: "#9a3412" }}>
                  {servers.length === 0 && patients.length === 0
                    ? "Please add a patient and a server first"
                    : servers.length === 0
                      ? "Please add a server first"
                      : "Please add a patient first"}
                </h3>
                <p style={{ color: "#9a3412", margin: "0 0 18px", fontSize: 14 }}>
                  You need at least one patient and one destination server
                  before you can upload.
                </p>
                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    justifyContent: "center",
                    flexWrap: "wrap",
                  }}
                >
                  {patients.length === 0 && (
                    <IonButton size="small" onClick={() => router.push("/patientlist")}>
                      <IonIcon icon={personOutline} slot="start" />
                      Add Patient
                    </IonButton>
                  )}
                  {servers.length === 0 && (
                    <IonButton size="small" onClick={() => router.push("/addserver")}>
                      <IonIcon icon={serverOutline} slot="start" />
                      Add Server
                    </IonButton>
                  )}
                </div>
              </div>
            ) : (
              <>
                <div
                  style={{
                    background: "#fff",
                    border: "1px solid #e5e7eb",
                    borderRadius: 20,
                    padding: 8,
                    boxShadow: "0 8px 30px rgba(15,23,42,.04)",
                  }}
                >
                  <IonItem lines="none">
                    <IonIcon icon={serverOutline} slot="start" color="primary" />
                    <IonLabel position="stacked">Destination Server</IonLabel>
                    <IonSelect
                      value={selectedServerId}
                      placeholder={
                        serversLoading ? "Loading servers..." : "Choose server"
                      }
                      disabled={serversLoading}
                      onIonChange={(e) => setSelectedServerId(e.detail.value)}
                    >
                      {servers.map((s) => (
                        <IonSelectOption key={s.id} value={s.id}>
                          {getServerIconSymbol(s.type)}
                          {s.label} [{s.type.toUpperCase()}]
                        </IonSelectOption>
                      ))}
                    </IonSelect>
                  </IonItem>

                  <IonItem lines="none">
                    <IonIcon icon={personOutline} slot="start" color="primary" />
                    <IonLabel position="stacked">Patient</IonLabel>
                    <IonSelect
                      value={selectedPatient}
                      placeholder={
                        patientsLoading
                          ? "Loading patients..."
                          : "Choose patient"
                      }
                      disabled={patientsLoading || patients.length === 0}
                      onIonChange={(e) => {
                        const id = String(e.detail.value);

                        setSelectedPatient(id);

                        const patient = patients.find(
                          (p) => String(p.id) === id
                        );

                        console.log(
                          "Selected localStorage patient:",
                          patient
                        );
                      }}
                    >
                      {patients.map((p) => (
                        <IonSelectOption
                          key={String(p.id)}
                          value={String(p.id)}
                        >
                          👤 {p.name}
                        </IonSelectOption>
                      ))}
                    </IonSelect>
                  </IonItem>
                </div>

                <IonButton
                  expand="block"
                  onClick={handleUpload}
                  disabled={!selectedServerId || !selectedPatient}
                  style={
                    {
                      marginTop: 18,
                      height: 52,
                      "--border-radius": "15px",
                    } as React.CSSProperties
                  }
                >
                  <IonIcon icon={cloudUploadOutline} slot="start" />
                  Upload File
                </IonButton>
              </>
            )}
          </div>
        )}

        {step === "done" && (
          <div
            style={{
              minHeight: "70vh",
              display: "grid",
              placeItems: "center",
              padding: 24,
            }}
          >
            <div
              style={{
                width: "100%",
                maxWidth: 440,
                background: "#fff",
                border: "1px solid #e5e7eb",
                borderRadius: 24,
                padding: 32,
                textAlign: "center",
                boxShadow: "0 18px 50px rgba(15,23,42,.08)",
              }}
            >
              <IonIcon
                icon={checkmarkCircle}
                style={{ fontSize: 72, color: "#16a34a" }}
              />

              <h2 style={{ color: "#111827", marginBottom: 8 }}>
                Upload Successful
              </h2>

              <p style={{ color: "#64748b", marginTop: 0 }}>
                Your file has been uploaded successfully.
              </p>

              <IonButton
                expand="block"
                onClick={resetFlow}
                style={{ "--border-radius": "14px" } as React.CSSProperties}
              >
                Upload Another
              </IonButton>

              <IonButton
                expand="block"
                fill="outline"
                onClick={() => router.push("/dashboard", "back")}
                style={{
                  marginTop: 8,
                  "--border-radius": "14px",
                } as React.CSSProperties}
              >
                Go to Dashboard
              </IonButton>
            </div>
          </div>
        )}

        <IonLoading isOpen={loading} message={loadingMessage} />

        <IonToast
          isOpen={!!toastMsg}
          message={toastMsg}
          duration={2800}
          onDidDismiss={() => setToastMsg("")}
        />
      </IonContent>
    </IonPage>
  );
};

export default UploadImage;