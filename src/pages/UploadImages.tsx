import React, { useState, useRef, useMemo, useEffect } from "react";
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonFooter,
  IonButtons,
  IonBackButton,
  IonButton,
  IonIcon,
  IonSelect,
  IonSelectOption,
  IonItem,
  IonLabel,
  IonLoading,
  IonModal,
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
  personAddOutline,
  closeOutline,
  cameraReverseOutline,
  playCircleOutline,
  arrowForwardOutline,
  homeOutline,
  peopleOutline,
  settingsOutline,
  cameraOutline,
} from "ionicons/icons";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Camera } from "@capacitor/camera";
import { Capacitor } from "@capacitor/core";
import { CameraPreview } from "@capgo/camera-preview";
import { useLocation } from "react-router-dom";
import axios from "axios";
import * as dicomParser from "dicom-parser";
import { Dicom } from "@aarna/capacitor-dicom";
import "../css/Dashboard.css";

import { uploadFileToS3 } from "../utils/s3Utils";
import {
  saveDicomUploadRecord,
  normalizeDicomServerKey,
} from "../utils/dicomLocalDb";
import { sftpUploadFile } from "../services/sftpClient";
import { smbUploadFromUri, writeFileToCacheChunked } from "../services/smbClient";
import ImageMeasurementTool, { MeasurementResult } from "../components/ImageMeasurementTool";


const API_BASE_URL = "https://aarnatechxperts.in/dicomapi/public/api";
const PATIENTS_STORAGE_KEY = "patients";
const UPLOAD_CHUNK_SIZE = 5 * 1024 * 1024;

const MAX_RECORD_SECONDS = 15;

const RECORD_WIDTH = 420;
const RECORD_HEIGHT = 746; // ~420 * 16/9, portrait 9:16
const PERMISSION_SETTLE_DELAY_MS = 300;

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

type PatientSex = "M" | "F" | "O";

const MODALITY_OPTIONS: { value: string; label: string }[] = [
  { value: "OT", label: "OT — Other" },
  { value: "SC", label: "SC — Secondary Capture (photo/scan)" },
  { value: "CT", label: "CT — CT Scan" },
  { value: "MR", label: "MR — MRI" },
  { value: "US", label: "US — Ultrasound" },
  { value: "CR", label: "CR — Computed Radiography" },
  { value: "DX", label: "DX — Digital X-Ray" },
  { value: "XA", label: "XA — X-Ray Angiography" },
  { value: "MG", label: "MG — Mammography" },
  { value: "PT", label: "PT — PET" },
  { value: "NM", label: "NM — Nuclear Medicine" },
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
  dob?: string;
  gender?: string;
}


interface DicomMetadata {
  patientName: string;
  patientId: string;
  patientBirthDate: string;
  patientSex: string;
  studyDate: string;
  studyDescription: string;
  modality: string;
  institutionName: string;
  manufacturer: string;
  sliceThickness: string;
  pixelSpacing: string;
  imageOrientationPatient: string;
  imagePositionPatient: string;
  rows: string;
  columns: string;
}

const normalizePatient = (
  raw: unknown
): PatientOption | null => {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const record = raw as Record<string, unknown>;

  const id =
    record.id ??
    record.patientId ??
    record.patient_id ??
    record._id;

  const name =
    record.name ??
    record.patientName ??
    record.patient_name ??
    record.fullName ??
    record.full_name;

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

  const userId = record.user_id ?? record.userId ?? record.userid ?? null;

  const dobRaw =
    record.date_of_birth ?? record.dob ?? record.dateOfBirth ?? null;
  const genderRaw = record.gender ?? record.sex ?? null;

  return {
    id: String(id),
    name: String(name).trim(),
    user_id: userId as string | number | null,
    dob: dobRaw ? String(dobRaw) : undefined,
    gender: genderRaw ? String(genderRaw) : undefined,
  };
};
const mapGenderToDicomSex = (gender?: string): PatientSex | "" => {
  if (!gender) return "";
  const normalized = gender.trim().toLowerCase();
  if (normalized === "male") return "M";
  if (normalized === "female") return "F";
  if (normalized === "other") return "O";
  return "";
};

type Step = "capture" | "details" | "done";
type UploadSource = "camera" | "gallery";
type FileKind = "image" | "pdf" | "video" | "dicom";
type CameraMode = "photo" | "video";

// Represents one file inside a multi-file batch selection.
interface SelectedBatchFile {
  id: string;
  file: File;
  kind: FileKind;
}

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as
      | { message?: string; error?: string }
      | undefined;
    return data?.message || data?.error || error.message || fallback;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
};

interface CameraPreviewExtraOptions {
  enableVideoMode?: boolean;
  force?: boolean;
  aspectRatio?: string;
  aspectMode?: string;
  rotateWhenOrientationChanged?: boolean;
}

type CameraPreviewStartOptions = Parameters<typeof CameraPreview.start>[0] &
  CameraPreviewExtraOptions;
type CameraPreviewRecordOptions = Parameters<
  typeof CameraPreview.startRecordVideo
>[0] &
  CameraPreviewExtraOptions;

const asCameraPreviewStartOptions = (
  options: CameraPreviewStartOptions
): Parameters<typeof CameraPreview.start>[0] =>
  options as unknown as Parameters<typeof CameraPreview.start>[0];

const asCameraPreviewRecordOptions = (
  options: CameraPreviewRecordOptions
): Parameters<typeof CameraPreview.startRecordVideo>[0] =>
  options as unknown as Parameters<typeof CameraPreview.startRecordVideo>[0];

interface CameraPreviewWithPreviewSize {
  setPreviewSize?: (options: {
    width: number;
    height: number;
  }) => Promise<void>;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const callSetPreviewSize = async (
  width: number,
  height: number
): Promise<void> => {
  const plugin = CameraPreview as unknown as CameraPreviewWithPreviewSize;
  if (typeof plugin.setPreviewSize !== "function") {
    return;
  }
  try {
    await plugin.setPreviewSize({ width, height });
  } catch (error: unknown) {
    console.warn("setPreviewSize not supported on this device:", error);
  }
};

interface CameraPreviewWithPermissions {
  checkPermissions?: () => Promise<Record<string, string>>;
  requestPermissions?: (
    options?: Record<string, unknown>
  ) => Promise<Record<string, string>>;
}

const allGranted = (status: Record<string, string> | undefined | null) => {
  if (!status) return false;
  const values = Object.values(status);
  if (values.length === 0) return true;
  return values.every((v) => v === "granted");
};

const ensureCameraPreviewPermissions = async (): Promise<boolean> => {
  const plugin = CameraPreview as unknown as CameraPreviewWithPermissions;

  if (
    typeof plugin.checkPermissions !== "function" ||
    typeof plugin.requestPermissions !== "function"
  ) {
    const permission = await Camera.checkPermissions();
    if (permission.camera !== "granted") {
      const requested = await Camera.requestPermissions();
      if (requested.camera !== "granted") {
        return false;
      }
      await new Promise((r) => setTimeout(r, PERMISSION_SETTLE_DELAY_MS));
    }
    return true;
  }

  try {
    const current = await plugin.checkPermissions();

    if (allGranted(current)) {
      return true;
    }

    const requested = await plugin.requestPermissions();

    if (!allGranted(requested)) {
      return false;
    }

    await new Promise((r) => setTimeout(r, PERMISSION_SETTLE_DELAY_MS));
    return true;
  } catch (error: unknown) {
    console.warn(
      "CameraPreview permission check/request failed, falling back to Camera module:",
      error
    );
    const permission = await Camera.checkPermissions();
    if (permission.camera !== "granted") {
      const requested = await Camera.requestPermissions();
      if (requested.camera !== "granted") {
        return false;
      }
    }
    await new Promise((r) => setTimeout(r, PERMISSION_SETTLE_DELAY_MS));
    return true;
  }
};

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


function formatDicomDate(raw: string | undefined): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  if (/^\d{8}$/.test(trimmed)) {
    return `${trimmed.slice(0, 4)}-${trimmed.slice(4, 6)}-${trimmed.slice(6, 8)}`;
  }
  return trimmed;
}

function formatDicomPersonName(raw: string | undefined): string {
  if (!raw) return "";
  return raw
    .split("^")
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");
}

async function parseDicomFile(file: File): Promise<DicomMetadata | null> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const byteArray = new Uint8Array(arrayBuffer);
    const dataSet = dicomParser.parseDicom(byteArray);

    return {
      patientName: formatDicomPersonName(dataSet.string("x00100010")),
      patientId: dataSet.string("x00100020") || "",
      patientBirthDate: formatDicomDate(dataSet.string("x00100030")),
      patientSex: dataSet.string("x00100040") || "",
      studyDate: formatDicomDate(dataSet.string("x00080020")),
      studyDescription: dataSet.string("x00081030") || "",
      modality: dataSet.string("x00080060") || "",
      institutionName: dataSet.string("x00080080") || "",
      manufacturer: dataSet.string("x00080070") || "",
      sliceThickness: dataSet.string("x00180050") || "",
      pixelSpacing: dataSet.string("x00280030") || "",
      imageOrientationPatient: dataSet.string("x00200037") || "",
      imagePositionPatient: dataSet.string("x00200032") || "",
      rows: dataSet.uint16("x00280010")?.toString() || "",
      columns: dataSet.uint16("x00280011")?.toString() || "",
    };
  } catch (error: unknown) {
    console.warn("Could not parse DICOM metadata:", error);
    return null;
  }
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

  const [showPatientPrompt, setShowPatientPrompt] = useState<boolean>(
    uploadSource === "camera"
  );
  useEffect(() => {
    const active =
      step === "capture" && uploadSource === "camera" && !showPatientPrompt;
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
  }, [step, uploadSource, showPatientPrompt]);


  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [comparisonPhotoUrl, setComparisonPhotoUrl] = useState<string | null>(
    null
  );
  const [annotatedImageDataUrl, setAnnotatedImageDataUrl] = useState<string | null>(null);
  const [measurement, setMeasurement] = useState<MeasurementResult | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileKind, setFileKind] = useState<FileKind | null>(null);
  const [multiFiles, setMultiFiles] = useState<SelectedBatchFile[]>([]);
  const [batchPreviews, setBatchPreviews] = useState<Record<string, string>>({});
  const [activeBatchPreview, setActiveBatchPreview] = useState<SelectedBatchFile | null>(null);

  const [dicomMetadata, setDicomMetadata] = useState<DicomMetadata | null>(null);
  const [dicomParseError, setDicomParseError] = useState<string | null>(null);

  const [cameraMode, setCameraMode] = useState<CameraMode>("photo");
  const [isRecording, setIsRecording] = useState(false);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("environment");
  const [multiCaptureMode, setMultiCaptureMode] = useState(false);

  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const recordingStartedAtRef = useRef<number | null>(null);
  const autoStopTimerRef = useRef<number | null>(null);
  const cameraSessionRef = useRef(0);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoPosterUrl, setVideoPosterUrl] = useState<string | null>(null);
  const [servers, setServers] = useState<ServerOption[]>([]);
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [selectedServerId, setSelectedServerId] = useState("");
  const [selectedPatient, setSelectedPatient] = useState("");
  const [serversLoading, setServersLoading] = useState(true);
  const [patientsLoading, setPatientsLoading] = useState(false);

  const [modality, setModality] = useState<string>("OT");

  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("Uploading...");
  const [toastMsg, setToastMsg] = useState("");
  const [showUploadSuccess, setShowUploadSuccess] = useState(false);

  const selectedServerObj = useMemo(
    () => servers.find((s) => s.id === selectedServerId) || null,
    [servers, selectedServerId]
  );

  useEffect(() => {
    if (step === "done") {
      setShowUploadSuccess(true);
    }
  }, [step]);

  const formatRecordingTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  useEffect(() => {
    const urls: Record<string, string> = {};

    multiFiles.forEach((item) => {
      if (item.kind === "image" || item.kind === "video") {
        urls[item.id] = URL.createObjectURL(item.file);
      }
    });

    setBatchPreviews(urls);

    return () => {
      Object.values(urls).forEach((url) => URL.revokeObjectURL(url));
    };
  }, [multiFiles]);

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

      let rawPatients: unknown[] = [];

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

  const startNativeCamera = async () => {
    const sessionId = ++cameraSessionRef.current;

    try {
      document.documentElement.style.setProperty(
        "--ion-background-color",
        "transparent"
      );
      document.body.classList.add("native-camera-active");
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      );

      const granted = await ensureCameraPreviewPermissions();
      if (!granted) {
        if (cameraSessionRef.current === sessionId) {
          setToastMsg("Camera permission is required.");
        }
        return;
      }

      await CameraPreview.stop().catch(() => undefined);

      if (cameraSessionRef.current !== sessionId) return;
      await CameraPreview.start(
        asCameraPreviewStartOptions({
          position: facingMode === "environment" ? "rear" : "front",
          x: 0,
          y: 0,
          toBack: true,
          storeToFile: true,
          disableAudio: true,
          enableVideoMode: true,
          force: true,
        })
      );
      if (cameraSessionRef.current !== sessionId) {
        await CameraPreview.stop().catch(() => undefined);
        return;
      }

    } catch (error: unknown) {
      if (cameraSessionRef.current !== sessionId) return;
      console.error("Native camera start error:", error);
      setToastMsg(getErrorMessage(error, "Could not start camera."));
    }
  };

  useEffect(() => {
    const active =
      step === "capture" && uploadSource === "camera" && !showPatientPrompt;

    if (active) {
      void startNativeCamera();
    } else {
      ++cameraSessionRef.current;
      CameraPreview.stop().catch(() => undefined);
    }

    return () => {
      ++cameraSessionRef.current;
      CameraPreview.stop().catch(() => undefined);
    };
  }, [step, uploadSource, showPatientPrompt]);

  const capturePhoto = async () => {
    try {
      const result = await CameraPreview.capture({
        quality: 90,
      });

      const path = result.value;
      if (!path) throw new Error("Camera did not return a photo.");

      const file = await nativePathToFile(path, `photo_${Date.now()}.jpg`, "image/jpeg");

      if (multiCaptureMode) {
        const newItem: SelectedBatchFile = {
          id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          file,
          kind: "image",
        };
        setMultiFiles((prev) => [...prev, newItem]);
        setToastMsg(`Photo added (${multiFiles.length + 1}).`);
        // Stay on the capture screen so more photos can be taken.
        return;
      }

      const dataUrl = await fileToDataUrl(file);

      setSelectedFile(file);
      setFileKind("image");
      setImageDataUrl(dataUrl);

      await CameraPreview.stop();
      setStep("details");
    } catch (error: unknown) {
      console.error("Photo capture error:", error);
      setToastMsg(getErrorMessage(error, "Could not capture photo."));
    }
  };

  const finishMultiCapture = async () => {
    if (multiFiles.length === 0) {
      setToastMsg("Take at least one photo first.");
      return;
    }
    await CameraPreview.stop().catch(() => undefined);
    setStep("details");
  };

  const toggleMultiCaptureMode = () => {
    setMultiCaptureMode((prev) => {
      const next = !prev;
      if (next) {
        // Multi-capture only applies to photos.
        setCameraMode("photo");
      }
      return next;
    });
  };

  const startRecording = async () => {
    if (isRecording) return;

    try {
      await CameraPreview.startRecordVideo(
        asCameraPreviewRecordOptions({
          storeToFile: true,
          disableAudio: true,
          enableVideoMode: true,
        })
      );

      recordingStartedAtRef.current = Date.now();
      setRecordingSeconds(0);
      setIsRecording(true);

      autoStopTimerRef.current = window.setTimeout(() => {
        stopRecording();
      }, MAX_RECORD_SECONDS * 1000);
    } catch (error: unknown) {
      console.error("Native video start error:", error);
      recordingStartedAtRef.current = null;
      setIsRecording(false);
      setToastMsg(getErrorMessage(error, "Could not start video recording."));
    }
  };

  const pickSupportedVideoMimeType = (): string => {
    const candidates = [
      "video/mp4;codecs=h264",
      "video/mp4",
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm",
    ];
    for (const type of candidates) {
      if (
        typeof MediaRecorder !== "undefined" &&
        MediaRecorder.isTypeSupported(type)
      ) {
        return type;
      }
    }
    return "video/webm";
  };

  async function compressVideoFile(
    inputFile: File,
    targetWidth: number,
    targetHeight: number,
    onProgress?: (percent: number) => void
  ): Promise<File> {
    return new Promise<File>((resolve, reject) => {
      const sourceUrl = URL.createObjectURL(inputFile);
      const video = document.createElement("video");
      video.src = sourceUrl;
      video.muted = true;
      video.playsInline = true;
      video.preload = "auto";

      let rafId = 0;

      const cleanup = () => {
        cancelAnimationFrame(rafId);
        URL.revokeObjectURL(sourceUrl);
      };

      video.onerror = () => {
        cleanup();
        reject(new Error("Could not load recorded video for compression."));
      };

      video.onloadedmetadata = () => {
        const srcW = video.videoWidth || targetWidth;
        const srcH = video.videoHeight || targetHeight;
        // Scale down to fit within target box, never upscale.
        const scale = Math.min(targetWidth / srcW, targetHeight / srcH, 1);
        const outW = Math.max(2, Math.round(srcW * scale));
        const outH = Math.max(2, Math.round(srcH * scale));

        const canvas = document.createElement("canvas");
        canvas.width = outW;
        canvas.height = outH;
        const ctx = canvas.getContext("2d");

        if (!ctx) {
          cleanup();
          reject(new Error("Canvas not supported on this device."));
          return;
        }

        const canvasWithStream = canvas as HTMLCanvasElement & {
          captureStream: (fps?: number) => MediaStream;
        };

        if (typeof canvasWithStream.captureStream !== "function") {
          cleanup();
          reject(new Error("Video compression is not supported on this device."));
          return;
        }

        const stream = canvasWithStream.captureStream(24);
        const mimeType = pickSupportedVideoMimeType();

        let recorder: MediaRecorder;
        try {
          recorder = new MediaRecorder(stream, {
            mimeType,
            videoBitsPerSecond: 900_000, // ~900kbps — keeps a <=15s clip small
          });
        } catch (err) {
          cleanup();
          reject(err instanceof Error ? err : new Error("MediaRecorder init failed."));
          return;
        }

        const chunks: BlobPart[] = [];
        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) chunks.push(e.data);
        };

        recorder.onerror = () => {
          cleanup();
          reject(new Error("Video compression failed."));
        };

        recorder.onstop = () => {
          cleanup();
          const isMp4 = mimeType.includes("mp4");
          const ext = isMp4 ? "mp4" : "webm";
          const outType = isMp4 ? "video/mp4" : "video/webm";
          const blob = new Blob(chunks, { type: outType });
          const outFile = new File(
            [blob],
            inputFile.name.replace(/\.[^.]+$/, `.${ext}`),
            { type: outType }
          );
          onProgress?.(100);
          resolve(outFile);
        };

        const drawFrame = () => {
          if (video.paused || video.ended) return;
          ctx.drawImage(video, 0, 0, outW, outH);
          if (video.duration) {
            onProgress?.(
              Math.min(99, Math.round((video.currentTime / video.duration) * 100))
            );
          }
          rafId = requestAnimationFrame(drawFrame);
        };

        video.onplay = () => {
          recorder.start();
          drawFrame();
        };

        video.onended = () => {
          if (recorder.state !== "inactive") recorder.stop();
        };

        video.play().catch((err) => {
          cleanup();
          reject(err instanceof Error ? err : new Error("Could not play recorded video."));
        });
      };
    });
  }

  const stopRecording = async () => {
    if (!isRecording) return;
    if (autoStopTimerRef.current !== null) {
      window.clearTimeout(autoStopTimerRef.current);
      autoStopTimerRef.current = null;
    }

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

      setLoadingMessage("Compressing video...");
      setLoading(true);

      let finalFile = file;
      try {
        finalFile = await compressVideoFile(
          file,
          RECORD_WIDTH,
          RECORD_HEIGHT,
          (percent) => setLoadingMessage(`Compressing video... ${percent}%`)
        );
      } catch (compressError: unknown) {
        console.warn(
          "Video compression unavailable, using original file:",
          compressError
        );
        finalFile = file;
      } finally {
        setLoading(false);
      }

      if (finalFile === file && !file.name.toLowerCase().endsWith(".mp4")) {
        console.warn("Native recorder returned:", file.name);
      }

      setSelectedFile(finalFile);
      setFileKind("video");
      setImageDataUrl(null);
      setVideoDuration(elapsed);

      recordingStartedAtRef.current = null;

      await CameraPreview.stop().catch(() => undefined);
      setStep("details");
    } catch (error: unknown) {
      console.error("Native video stop/read error:", error);
      recordingStartedAtRef.current = null;
      setIsRecording(false);
      setToastMsg(
        getErrorMessage(error, "Video was recorded but could not be loaded.")
      );
    }
  };

  const toggleFacingMode = async () => {
    try {
      await CameraPreview.flip();
      setFacingMode((current) =>
        current === "environment" ? "user" : "environment"
      );
    } catch (error: unknown) {
      console.error("Camera flip error:", error);
      setToastMsg(getErrorMessage(error, "Could not switch camera."));
    }
  };

  async function nativePathToFile(
    nativePath: string,
    fileName: string,
    mimeType: string
  ): Promise<File> {

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

  const handleGalleryFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const input = e.target;
    const files = input.files ? Array.from(input.files) : [];
    input.value = "";

    if (files.length === 0) return;

    const validFiles: File[] = [];
    let skippedAny = false;

    for (const file of files) {
      const isDcm = file.name.toLowerCase().endsWith(".dcm");
      if (!ALLOWED_FILE_TYPES.includes(file.type) && !isDcm) {
        skippedAny = true;
        continue;
      }
      validFiles.push(file);
    }

    if (validFiles.length === 0) {
      setToastMsg("Only images, videos, PDFs, and DICOM files are allowed.");
      return;
    }

    if (skippedAny) {
      setToastMsg(
        "Some files were skipped — only images, videos, PDFs, and DICOM files are allowed."
      );
    }

    if (multiFiles.length > 0 || validFiles.length > 1) {
      // Batch mode: clear any single-file state and merge into the list.
      setSelectedFile(null);
      setFileKind(null);
      setImageDataUrl(null);
      setAnnotatedImageDataUrl(null);
      setMeasurement(null);
      setDicomMetadata(null);
      setDicomParseError(null);

      const newBatch: SelectedBatchFile[] = validFiles.map((file, index) => ({
        id: `${Date.now()}_${index}_${Math.random().toString(36).slice(2, 7)}`,
        file,
        kind: detectFileKind(file),
      }));

      setMultiFiles((prev) => [...prev, ...newBatch]);
      setStep("details");
      return;
    }

    // Single file, not in batch mode — original flow, unchanged.
    const file = validFiles[0];
    const kind = detectFileKind(file);
    setSelectedFile(file);
    setFileKind(kind);
    setDicomMetadata(null);
    setDicomParseError(null);

    if (kind === "image") {
      const reader = new FileReader();
      reader.onload = () => {
        setImageDataUrl((reader.result as string) || null);
        setStep("details");
      };
      reader.onerror = () => setToastMsg("Failed to read the selected image.");
      reader.readAsDataURL(file);
    } else if (kind === "dicom") {
      setImageDataUrl(null);
      setStep("details");

      const metadata = await parseDicomFile(file);
      if (metadata) {
        setDicomMetadata(metadata);
      } else {
        setDicomParseError(
          "Could not read DICOM header details from this file, but it can still be uploaded."
        );
      }
    } else {
      setImageDataUrl(null);
      setStep("details");
    }
  };

  // Removes one file from the batch (e.g. user changed their mind before upload).
  const removeBatchFile = (id: string) => {
    setMultiFiles((prev) => {
      const next = prev.filter((file) => file.id !== id);
      if (next.length === 0 && uploadSource === "camera") {
        setActiveBatchPreview(null);
        setMultiCaptureMode(false);
        setCameraMode("photo");
        setStep("capture");
        setShowPatientPrompt(false);
      }
      return next;
    });
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

    // Prefer the annotated (measured) image when the user drew a measurement.
    if (fileKind === "image" && annotatedImageDataUrl) {
      const blob = await (await fetch(annotatedImageDataUrl)).blob();
      const newFileName = `${cleanPatientName}_${timestamp}.jpg`;
      return new File([blob], newFileName, { type: "image/jpeg" });
    }

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

  const resolveBatchFiles = (patientName?: string): File[] => {
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

    return multiFiles.map(({ file }, index) => {
      const lastDotIndex = file.name.lastIndexOf(".");
      const fileExt = lastDotIndex !== -1 ? file.name.substring(lastDotIndex) : "";
      const newFileName = `${cleanPatientName}_${timestamp}_${index + 1}${fileExt}`;
      return new File([file], newFileName, { type: file.type });
    });
  };

  const generateDicomUid = (prefix: string) => {
    const randomPart = `${Date.now()}${Math.random().toString(16).slice(2, 10)}`;
    return `1.2.826.0.1.3680043.8.498.${prefix}.${randomPart}`;
  };

  const stageDimseFile = async (file: File) => {
    const dataUrl = await fileToDataUrl(file);

    if (!dataUrl) {
      throw new Error(`Could not read file: ${file.name}`);
    }

    const base64 = dataUrl.split(",")[1] ?? "";
    if (!base64) {
      throw new Error(`Could not convert file to base64: ${file.name}`);
    }

    const stagedPath = `dicom_uploads/${Date.now()}-${file.name}`;
    await Filesystem.writeFile({
      path: stagedPath,
      data: base64,
      directory: Directory.Cache,
      recursive: true,
    });

    const uriResult = await Filesystem.getUri({
      path: stagedPath,
      directory: Directory.Cache,
    });

    return uriResult.uri.replace(/^file:\/\//, "");
  };

  const uploadToDicomServer = async (
  file: File,
  server: ServerOption,
  patient: PatientOption,
  metadata: {
    birthdate: string;
    sex: PatientSex | "";
    modality: string;
  },
  seriesContext?: {
    study_uid?: string;
    series_uid?: string;
    instance_number?: number;
  }
) => {
  const userId = localStorage.getItem("userId");

  if (!userId) {
    throw new Error("User ID is missing.");
  }

  if (!server?.ips) {
    throw new Error("DICOM server IP is missing.");
  }

  if (!server?.port) {
    throw new Error("DICOM server port is missing.");
  }

  if (!patient?.id) {
    throw new Error("Patient ID is missing.");
  }

  if (!file) {
    throw new Error("File is missing.");
  }

  if (Capacitor.getPlatform() === "web") {
    throw new Error("DICOM upload uses C-STORE and is available in the Android app.");
  }

  const instanceNumber =
    Number(seriesContext?.instance_number) > 0
      ? Number(seriesContext?.instance_number)
      : 1;

  try {
    await Dicom.connect({
      mode: "dimse",
      dimse: {
        host: String(server.ips),
        port: Number(server.port),
        callingAET: server.callingAETitle || "MYSCU",
        calledAET: server.calledAETitle || "PACS_SERVER",
      },
    });

    const localFilePath = await stageDimseFile(file);
    const result = await Dicom.store({ filePath: localFilePath });

    if (!result.success) {
      throw new Error(`C-STORE failed with status 0x${(result.status ?? -1).toString(16)}`);
    }

    const response = {
      success: true,
      status: result.status ?? 0,
      study_uid: result.studyInstanceUID || "",
      series_uid: result.seriesInstanceUID || "",
      instance_number: instanceNumber,
      sopInstanceUID: result.sopInstanceUID || "",
      sopClassUID: result.sopClassUID || "",
      transferSyntaxUID: result.transferSyntaxUID || "",
      message: result.message || "DICOM store succeeded.",
      patientId: String(patient.id),
      patientName: String(patient.name || "Unknown"),
      userId: String(userId),
      modality: metadata.modality || "OT",
      fileName: file.name,
    };

    const persistedRecord = saveDicomUploadRecord(
      server,
      patient,
      file,
      {
        instanceId: response.sopInstanceUID || `${Date.now()}`,
        study_uid: response.study_uid,
        series_uid: response.series_uid,
        sopInstanceUID: response.sopInstanceUID,
      },
      {
        patientId: response.patientId,
        patientName: response.patientName,
        modality: response.modality,
        birthdate: metadata.birthdate,
        sex: metadata.sex,
        instance_number: response.instance_number,
        serverIp: server.ips,
        serverPort: server.port,
      }
    );

    console.log("DICOM C-STORE RESPONSE:", response);
    console.log("Saved DICOM upload entry in local DB:", persistedRecord);
    return {
      ...response,
      localDbKey: normalizeDicomServerKey(server.ips),
      localDbInstanceId: persistedRecord.instanceId,
    };
  } catch (error: unknown) {
    console.error("DICOM C-STORE ERROR:", error);
    throw error;
  }
};

  const uploadMultipleFiles = async (
  files: File[],
  server: ServerOption,
  patient: PatientOption,
  metadata: {
    birthdate: string;
    sex: PatientSex | "";
    modality: string;
  }
) => {
  const uploadedResults: any[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const instanceNumber = i + 1;

    setLoadingMessage(
      `Uploading DICOM ${instanceNumber}/${files.length}...`
    );

    const result = await uploadToDicomServer(
      file,
      server,
      patient,
      metadata,
      {
        instance_number: instanceNumber,
      }
    );

    console.log("Server response:", result);

    uploadedResults.push(result);
  }

  return {
    success: true,
    study_uid: uploadedResults[0]?.study_uid || "",
    series_uid: uploadedResults[0]?.series_uid || "",
    total: uploadedResults.length,
    instances: uploadedResults,
  };
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

  const handleBatchUpload = async (patient: PatientOption) => {
    if (!selectedServerObj) {
      setToastMsg("Please select a destination server.");
      return;
    }

    const files = resolveBatchFiles(patient.name);

    if (files.length === 0) {
      setToastMsg("No files to upload.");
      return;
    }

    setLoading(true);
    setLoadingMessage(`Preparing ${files.length} file(s)...`);

    try {

      if (selectedServerObj.type === "dicom") {
        let metadataForBatch = {
          birthdate: patient.dob || "",
          sex: mapGenderToDicomSex(patient.gender),
          modality,
        };

        const firstFile = files[0];
        const firstKind =
          multiFiles[0]?.kind ?? detectFileKind(firstFile);

        if (firstKind === "dicom") {
          const dcmMeta = await parseDicomFile(firstFile);

          if (dcmMeta) {
            metadataForBatch = {
              birthdate:
                dcmMeta.patientBirthDate ||
                metadataForBatch.birthdate,

              sex:
                (dcmMeta.patientSex as PatientSex) ||
                metadataForBatch.sex,

              modality:
                dcmMeta.modality ||
                metadataForBatch.modality,
            };
          }
        }

        setLoadingMessage(
          `Uploading DICOM series: 0/${files.length}`
        );

        /*
         * THIS IS THE IMPORTANT CALL.
         */
        const result = await uploadMultipleFiles(
          files,
          selectedServerObj,
          patient,
          metadataForBatch
        );

        setLoading(false);

        setToastMsg(
          `${result.total} file(s) uploaded into ONE DICOM Series.`
        );

        setStep("done");

        return;
      }

      let successCount = 0;
      let failCount = 0;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        setLoadingMessage(
          `Uploading file ${i + 1} of ${files.length}...`
        );

        try {
          switch (selectedServerObj.type) {
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

          successCount++;
        } catch (error: unknown) {
          failCount++;

          console.error(
            `Batch upload failed for ${file.name}:`,
            error
          );
        }
      }

      setLoading(false);

      if (failCount === 0) {
        setToastMsg(
          `Upload successful for all ${successCount} file(s).`
        );
      } else if (successCount === 0) {
        setToastMsg(
          `Upload failed for all ${failCount} file(s).`
        );
      } else {
        setToastMsg(
          `${successCount} file(s) uploaded, ${failCount} failed.`
        );
      }

      setStep("done");
    } catch (error: unknown) {
      console.error(
        "========== BATCH UPLOAD ERROR =========="
      );

      console.error(
        axios.isAxiosError(error)
          ? error.response?.data
          : error
      );

      console.error(
        "========================================="
      );

      setLoading(false);

      setToastMsg(
        getErrorMessage(
          error,
          "Batch upload failed."
        )
      );
    }
  };

  const handleUpload = async () => {
    if (!selectedServerObj) {
      setToastMsg(
        "Please select a destination server."
      );
      return;
    }

    let patient: PatientOption;

    let dicomPatientOverride: { birthdate?: string; sex?: PatientSex | "" } | null = null;

    if (selectedPatient) {
      const found = patients.find(
        (item) => String(item.id) === String(selectedPatient)
      );

      if (!found) {
        setToastMsg(
          "Selected patient was not found."
        );
        return;
      }

      patient = found;
    } else if (
      multiFiles.length === 0 &&
      fileKind === "dicom" &&
      dicomMetadata &&
      (dicomMetadata.patientName || dicomMetadata.patientId)
    ) {
      patient = {
        id: dicomMetadata.patientId || `unassigned_${Date.now()}`,
        name: dicomMetadata.patientName || "Unassigned Patient",
      };
      dicomPatientOverride = {
        birthdate: dicomMetadata.patientBirthDate || "",
        sex: (dicomMetadata.patientSex as PatientSex) || "",
      };
    } else {
      patient = {
        id: `unassigned_${Date.now()}`,
        name: "Unassigned Patient",
      };
    }

    // Batch mode: hand off to the multi-file uploader and stop here.
    if (multiFiles.length > 0) {
      await handleBatchUpload(patient);
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
            patient,
            {
              birthdate: dicomPatientOverride?.birthdate ?? (patient.dob || ""),
              sex: dicomPatientOverride?.sex ?? mapGenderToDicomSex(patient.gender),
              modality: (fileKind === "dicom" && dicomMetadata?.modality) || modality,
            }
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

    } catch (error: unknown) {

      console.error(
        "========== UPLOAD ERROR =========="
      );

      console.error(
        axios.isAxiosError(error) ? error.response?.data : error
      );

      console.error(
        "=================================="
      );

      setLoading(false);

      setToastMsg(getErrorMessage(error, "Upload failed."));
    }
  };


  // From the single-photo preview: keep this photo, go back to the camera
  // to take more, and merge everything into one batch (one DICOM series).
  const addAnotherPhoto = () => {
    if (selectedFile && fileKind === "image") {
      const keepFile =
        annotatedImageDataUrl == null
          ? selectedFile
          : selectedFile; // annotation only applies to the single-photo view

      const existing: SelectedBatchFile = {
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        file: keepFile,
        kind: "image",
      };
      setMultiFiles((prev) => [...prev, existing]);
    }

    setSelectedFile(null);
    setFileKind(null);
    setImageDataUrl(null);
    setAnnotatedImageDataUrl(null);
    setMeasurement(null);
    setDicomMetadata(null);
    setDicomParseError(null);
    setMultiCaptureMode(true);
    setCameraMode("photo");
    setStep("capture");
  };

  // From the batch preview: reopen the camera to take more photos,
  // keeping everything already captured.
  const resumeCameraCapture = () => {
    setMultiCaptureMode(true);
    setCameraMode("photo");
    setStep("capture");
  };

  const changeFile = () => {
    setImageDataUrl(null);
    setAnnotatedImageDataUrl(null);
    setMeasurement(null);
    setSelectedFile(null);
    setFileKind(null);
    setMultiFiles([]);
    setDicomMetadata(null);
    setDicomParseError(null);
    setVideoPreviewUrl(null);
    setVideoDuration(0);
    setVideoPosterUrl(null);
    setRecordingSeconds(0);
    setComparisonPhotoUrl(null);
    recordingStartedAtRef.current = null;
    if (autoStopTimerRef.current !== null) {
      window.clearTimeout(autoStopTimerRef.current);
      autoStopTimerRef.current = null;
    }
    setIsRecording(false);
    setCameraMode("photo");
    setMultiCaptureMode(false);

    if (uploadSource === "gallery") {
      openGalleryPicker();
    } else {
      setStep("capture");
    }
  };

  // After a successful upload, "View" should land on the list page that
  // matches whichever destination server this upload went to.
  const goToUploadedList = () => {
    const type = selectedServerObj?.type;

    switch (type) {
      case "dicom":
        router.push("/serverdetailslist", "back");
        break;
      case "aws":
        router.push("/awscloud", "back");
        break;
      case "sftp":
        router.push("/sftpBrowse", "back");
        break;
      case "sbm":
        router.push("/smbImages", "back");
        break;
      default:
        router.push("/dashboard", "back");
        break;
    }
  };

  const resetFlow = async () => {
    setShowUploadSuccess(false);
    setImageDataUrl(null);
    setAnnotatedImageDataUrl(null);
    setMeasurement(null);
    setSelectedFile(null);
    setFileKind(null);
    setMultiFiles([]);
    setDicomMetadata(null);
    setDicomParseError(null);
    setVideoPreviewUrl(null);
    setVideoDuration(0);
    setVideoPosterUrl(null); // clear generated poster on reset
    setRecordingSeconds(0);
    setSelectedServerId("");
    setSelectedPatient("");
    setModality("OT");
    setComparisonPhotoUrl(null);
    recordingStartedAtRef.current = null;
    if (autoStopTimerRef.current !== null) {
      window.clearTimeout(autoStopTimerRef.current);
      autoStopTimerRef.current = null;
    }
    setIsRecording(false);
    setCameraMode("photo");
    setMultiCaptureMode(false);
    setStep("capture");
    // Re-show the patient prompt for the next capture cycle too.
    setShowPatientPrompt(uploadSource === "camera");

    if (uploadSource === "gallery") {
      openGalleryPicker();
    }
  };

  return (
    <IonPage>
      {step === "capture" && uploadSource === "camera" && !showPatientPrompt && (
        <style>{`
          :root {
            --ion-background-color: transparent !important;
          }

          html,
          body,
          body.native-camera-active,
          body.native-camera-active #root,
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

          body.native-camera-active ion-content::part(background),
          body.native-camera-active ion-content::part(scroll) {
            background: transparent !important;
            background-color: transparent !important;
          }

          body.native-camera-active #root,
          body.native-camera-active ion-app,
          body.native-camera-active ion-router-outlet {
            min-height: 100% !important;
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
              "--background": "linear-gradient(135deg, #0f766e 0%, #059669 100%)",
              "--color": "#ffffff",
              "--border-width": "0",
            } as React.CSSProperties}
          >
            <IonButtons slot="start">
              <IonBackButton defaultHref="/dashboard" style={{ "--color": "#ffffff" } as React.CSSProperties} />
            </IonButtons>

            <IonTitle style={{ fontWeight: 700 }}>
              <div>{uploadSource === "gallery" ? "Upload from Gallery" : "Upload File"}</div>
              <div
                style={{
                  fontSize: 11.5,
                  fontWeight: 500,
                  opacity: 0.85,
                  marginTop: 1,
                }}
              >
                HIPAA compliant · Secure upload
              </div>
            </IonTitle>
          </IonToolbar>
        </IonHeader>
      ) : null}

      <IonContent
        fullscreen={step === "capture" && uploadSource === "camera" && !showPatientPrompt}
        scrollY={true}
        className={
          step === "capture" && uploadSource === "camera" && !showPatientPrompt
            ? "camera-preview-content"
            : step === "details" && (multiFiles.length > 0 || fileKind === "image")
              ? "ion-padding upload-preview-content"
              : "ion-padding"
        }
        style={{
          "--background":
            step === "capture" && uploadSource === "camera" && !showPatientPrompt
              ? "transparent"
              : "#f8fafc",
        } as React.CSSProperties}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
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
                    border: "1px solid #e5e7eb",
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
                      background: "#dbeafe",
                    }}
                  >
                    <IonIcon
                      icon={imagesOutline}
                      style={{ fontSize: 38, color: "#2563eb" }}
                    />
                  </div>

                  <h2 style={{ margin: 0, color: "#111827" }}>
                    Select files
                  </h2>

                  <p
                    style={{
                      color: "#64748b",
                      lineHeight: 1.6,
                      margin: "10px 0 24px",
                    }}
                  >
                    Select one or more images, MP4 videos, PDFs or DICOM files.
                  </p>

                  <IonButton
                    expand="block"
                    onClick={openGalleryPicker}
                    style={
                      {
                        "--background": "linear-gradient(135deg, #0f766e 0%, #059669 100%)",
                        "--border-radius": "14px",
                        "--box-shadow": "0 8px 20px rgba(5,150,105,.25)",
                      } as React.CSSProperties
                    }
                  >
                    <IonIcon icon={imagesOutline} slot="start" />
                    Choose Files
                  </IonButton>
                </div>
              </div>
            ) : showPatientPrompt ? (
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
                    border: "1px solid #e5e7eb",
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
                      background: "#ede9fe",
                    }}
                  >
                    <IonIcon
                      icon={personAddOutline}
                      style={{ fontSize: 38, color: "#7c3aed" }}
                    />
                  </div>

                  <h2 style={{ margin: 0, color: "#111827" }}>
                    Add a patient?
                  </h2>

                  <p
                    style={{
                      color: "#64748b",
                      lineHeight: 1.6,
                      margin: "10px 0 20px",
                    }}
                  >
                    Select an existing patient, add a new one, or skip for
                    now — you can always add one later.
                  </p>

                  <IonItem lines="none" className="upload-picker-ion-item upload-picker-trigger-patient">
                    <span slot="start" className="upload-picker-trigger-icon"><IonIcon icon={personOutline} /></span>
                    <IonLabel position="stacked">Select Patient</IonLabel>
                    <IonSelect
                      value={selectedPatient}
                      placeholder={patientsLoading ? "Loading patients..." : patients.length === 0 ? "No patients added yet" : "Choose a patient"}
                      disabled={patientsLoading || patients.length === 0}
                      interface="popover"
                      interfaceOptions={{ cssClass: "upload-themed-select" }}
                      onIonChange={(e) => {
                        const id = String(e.detail.value ?? "");
                        setSelectedPatient(id);
                        if (id) setShowPatientPrompt(false);
                      }}
                    >
                      {patients.map((patient) => <IonSelectOption key={String(patient.id)} value={String(patient.id)}>{patient.name}</IonSelectOption>)}
                    </IonSelect>
                  </IonItem>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      margin: "4px 0 16px",
                      color: "#94a3b8",
                      fontSize: 12,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: 0.4,
                    }}
                  >
                    <span style={{ flex: 1, height: 1, background: "#e5e7eb" }} />
                    or
                    <span style={{ flex: 1, height: 1, background: "#e5e7eb" }} />
                  </div>

                  <IonButton
                    expand="block"
                    onClick={() => router.push("/patientlist")}
                    style={
                      {
                        "--background": "linear-gradient(135deg, #0f766e 0%, #059669 100%)",
                        "--border-radius": "14px",
                        "--box-shadow": "0 8px 20px rgba(5,150,105,.25)",
                      } as React.CSSProperties
                    }
                  >
                    <IonIcon icon={personAddOutline} slot="start" />
                    Add Patient
                  </IonButton>

                  <IonButton
                    expand="block"
                    fill="outline"
                    onClick={() => setShowPatientPrompt(false)}
                    style={
                      {
                        marginTop: 10,
                        "--border-radius": "14px",
                        "--border-color": "#0f766e",
                        "--color": "#0f766e",
                      } as React.CSSProperties
                    }
                  >
                    Skip
                    <IonIcon icon={arrowForwardOutline} slot="end" />
                  </IonButton>
                </div>
              </div>
            ) : (
              <div
                style={{
                  position: "fixed",
                  inset: 0,
                  // Must stay transparent: an opaque background here would
                  // stack directly on top of the native camera layer.
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
                      REC {formatRecordingTime(recordingSeconds)} / {formatRecordingTime(MAX_RECORD_SECONDS)}
                    </div>
                  ) : multiCaptureMode ? (
                    <div
                      style={{
                        padding: "8px 14px",
                        borderRadius: 20,
                        background: "rgba(5,150,105,.92)",
                        color: "#fff",
                        fontSize: 13,
                        fontWeight: 700,
                        backdropFilter: "blur(10px)",
                      }}
                    >
                      Multiple Photos · {multiFiles.length} taken
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

                  <button
                    onClick={toggleMultiCaptureMode}
                    disabled={isRecording || cameraMode === "video"}
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: "50%",
                      border: multiCaptureMode
                        ? "1px solid rgba(5,150,105,.9)"
                        : "1px solid rgba(255,255,255,.15)",
                      background: multiCaptureMode
                        ? "rgba(5,150,105,.92)"
                        : "rgba(0,0,0,.45)",
                      color: "#fff",
                      display: "grid",
                      placeItems: "center",
                      backdropFilter: "blur(10px)",
                      opacity: cameraMode === "video" ? 0.4 : 1,
                    }}
                    title="Take Multiple Photos"
                  >
                    <IonIcon icon={imagesOutline} style={{ fontSize: 20 }} />
                  </button>
                </div>

                {multiCaptureMode && multiFiles.length > 0 && (
                  <div
                    style={{
                      position: "absolute",
                      left: 16,
                      right: 16,
                      bottom: 200,
                      zIndex: 50,
                      display: "flex",
                      gap: 8,
                      overflowX: "auto",
                      padding: "4px 2px",
                    }}
                  >
                    {multiFiles.map((item) => (
                      <div
                        key={item.id}
                        style={{
                          position: "relative",
                          width: 62,
                          height: 62,
                          flexShrink: 0,
                          borderRadius: 12,
                          overflow: "hidden",
                          border: "2px solid rgba(255,255,255,.85)",
                          background: "#0f172a",
                        }}
                      >
                        {batchPreviews[item.id] && (
                          <img
                            src={batchPreviews[item.id]}
                            alt={item.file.name}
                            style={{
                              width: "100%",
                              height: "100%",
                              objectFit: "cover",
                              display: "block",
                            }}
                          />
                        )}
                        <button
                          onClick={() => removeBatchFile(item.id)}
                          style={{
                            position: "absolute",
                            top: 2,
                            right: 2,
                            width: 20,
                            height: 20,
                            borderRadius: "50%",
                            border: "none",
                            background: "rgba(0,0,0,.65)",
                            color: "#fff",
                            display: "grid",
                            placeItems: "center",
                            padding: 0,
                          }}
                        >
                          <IonIcon icon={closeOutline} style={{ fontSize: 13 }} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

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

                    {multiCaptureMode ? (
                      <button
                        onClick={finishMultiCapture}
                        disabled={multiFiles.length === 0}
                        style={{
                          width: 50,
                          height: 50,
                          borderRadius: 16,
                          border: "1px solid rgba(255,255,255,.2)",
                          background:
                            multiFiles.length === 0
                              ? "rgba(0,0,0,.45)"
                              : "rgba(22,163,74,.92)",
                          color: "#fff",
                          display: "grid",
                          placeItems: "center",
                          opacity: multiFiles.length === 0 ? 0.4 : 1,
                          fontWeight: 800,
                          fontSize: 12,
                        }}
                      >
                        <IonIcon icon={checkmarkCircle} style={{ fontSize: 24 }} />
                      </button>
                    ) : (
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
                    )}
                  </div>

                  {multiCaptureMode ? (
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "center",
                      }}
                    >
                      <div
                        style={{
                          padding: "8px 18px",
                          borderRadius: 24,
                          background: "rgba(0,0,0,.58)",
                          border: "1px solid rgba(255,255,255,.12)",
                          backdropFilter: "blur(12px)",
                          color: "#fff",
                          fontSize: 12.5,
                          fontWeight: 600,
                        }}
                      >
                        {multiFiles.length === 0
                          ? "Tap the shutter to add a photo"
                          : `Tap ✓ when you're done (${multiFiles.length} photo${multiFiles.length > 1 ? "s" : ""})`}
                      </div>
                    </div>
                  ) : (
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
                  )}
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
            className="upload-details-panel"
            style={{
              maxWidth: 760,
              margin: "0 auto",
              padding: "8px 0 32px",
            }}
          >
            <div
              className="upload-detail-actions"
              style={{
                marginBottom: 8,
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "flex-end",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              {uploadSource === "camera" &&
                fileKind === "image" &&
                multiFiles.length === 0 &&
                selectedFile && (
                  <IonButton
                    size="small"
                    onClick={addAnotherPhoto}
                    className="upload-detail-action"
                    style={
                      {
                        "--background": "linear-gradient(135deg, #0f766e 0%, #059669 100%)",
                        "--border-radius": "10px",
                        flexShrink: 0,
                        marginTop: 0,
                      } as React.CSSProperties
                    }
                  >
                    <IonIcon icon={cameraReverseOutline} slot="start" />
                    Add Photo
                  </IonButton>
                )}

              <IonButton
                fill="outline"
                size="small"
                onClick={changeFile}
                className="upload-detail-action"
                style={
                  {
                    "--border-radius": "10px",
                    "--border-color": "#0f766e",
                    "--color": "#0f766e",
                    flexShrink: 0,
                    marginTop: 0,
                  } as React.CSSProperties
                }
              >
                <IonIcon icon={imagesOutline} slot="start" />
                Change
              </IonButton>
            </div>

            {multiFiles.length > 0 && (
              <div
                style={{
                  background: "#fff",
                  borderRadius: 18,
                  padding: 14,
                  marginBottom: 18,
                  boxShadow: "0 8px 30px rgba(15,23,42,.06)",
                  border: "1px solid #e5e7eb",
                }}
              >
                <div
                  style={{
                    fontWeight: 800,
                    color: "#111827",
                    marginBottom: 10,
                    fontSize: 14,
                  }}
                >
                  {multiFiles.length} file{multiFiles.length > 1 ? "s" : ""} selected
                </div>

                <div className="batch-preview-strip">
                  {multiFiles.map((item) => (
                    <div
                      key={item.id}
                      className="batch-preview-item"
                      onClick={() => item.kind === "image" && setActiveBatchPreview(item)}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "stretch",
                        gap: 6,
                        padding: 7,
                        borderRadius: 12,
                        background: "#f8fafc",
                        border: "1px solid #e5e7eb",
                        cursor: item.kind === "image" ? "pointer" : "default",
                      }}
                    >
                      <div
                        style={{
                          width: "100%",
                          height: 82,
                          borderRadius: 10,
                          display: "grid",
                          placeItems: "center",
                          background: "#d1fae5",
                          flexShrink: 0,
                          overflow: "hidden",
                        }}
                      >
                        {item.kind === "image" && batchPreviews[item.id] ? (
                          <img
                            src={batchPreviews[item.id]}
                            alt={item.file.name}
                            style={{
                              width: "100%",
                              height: "100%",
                              objectFit: "cover",
                              display: "block",
                            }}
                          />
                        ) : item.kind === "video" && batchPreviews[item.id] ? (
                          <video
                            src={batchPreviews[item.id]}
                            muted
                            playsInline
                            preload="metadata"
                            style={{
                              width: "100%",
                              height: "100%",
                              objectFit: "cover",
                              display: "block",
                              background: "#0f172a",
                            }}
                          />
                        ) : (
                          <IonIcon
                            icon={fileKindIcon(item.kind)}
                            style={{ fontSize: 22, color: "#059669" }}
                          />
                        )}
                      </div>

                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div
                          style={{
                            fontWeight: 700,
                            fontSize: 11,
                            color: "#111827",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {item.file.name}
                        </div>
                        <div style={{ fontSize: 10, color: "#64748b" }}>
                          {fileKindLabel(item.kind)} ·{" "}
                          {(item.file.size / 1024 / 1024).toFixed(2)} MB
                        </div>
                      </div>

                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          removeBatchFile(item.id);
                        }}
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: "50%",
                          border: "1px solid #e5e7eb",
                          background: "#fff",
                          display: "grid",
                          placeItems: "center",
                          flexShrink: 0,
                          color: "#64748b",
                        }}
                      >
                        <IonIcon icon={closeOutline} style={{ fontSize: 13 }} />
                      </button>
                    </div>
                  ))}
                </div>

                {uploadSource === "camera" ? (
                  <IonButton
                    fill="clear"
                    size="small"
                    onClick={resumeCameraCapture}
                    style={{ marginTop: 8, "--padding-start": "4px", "--color": "#0f766e" } as React.CSSProperties}
                  >
                    <IonIcon icon={cameraReverseOutline} slot="start" />
                    Take Another Photo
                  </IonButton>
                ) : (
                  <IonButton
                    fill="clear"
                    size="small"
                    onClick={openGalleryPicker}
                    style={{ marginTop: 8, "--padding-start": "4px", "--color": "#0f766e" } as React.CSSProperties}
                  >
                    <IonIcon icon={imagesOutline} slot="start" />
                    Add More Files
                  </IonButton>
                )}
              </div>
            )}

            {multiFiles.length === 0 && fileKind === "image" && imageDataUrl && (
              <div
                style={{
                  background: "#fff",
                  borderRadius: 12,
                  padding: 6,
                  marginBottom: 8,
                  boxShadow: "0 8px 30px rgba(15,23,42,.06)",
                  border: "1px solid #e5e7eb",
                }}
              >
                <ImageMeasurementTool
                  imageUrl={imageDataUrl}
                  compact
                  onAnnotatedImage={(dataUrl, result) => {
                    setAnnotatedImageDataUrl(dataUrl);
                    setMeasurement(result);
                  }}
                  onClearMeasurement={() => {
                    setAnnotatedImageDataUrl(null);
                    setMeasurement(null);
                  }}
                />

                {measurement && (
                  <div
                    style={{
                      marginTop: 10,
                      padding: "8px 12px",
                      borderRadius: 10,
                      background: "#f0fdf4",
                      color: "#166534",
                      fontSize: 13,
                      fontWeight: 700,
                      textAlign: "center",
                    }}
                  >
                    Wound size: {measurement.width.toFixed(1)} cm ×{" "}
                    {measurement.height.toFixed(1)} cm
                  </div>
                )}
              </div>
            )}

            {multiFiles.length === 0 && fileKind === "video" && selectedFile && videoPreviewUrl && (
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
                    poster={videoPosterUrl || undefined}
                    controls
                    playsInline
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
                      background: "#dbeafe",
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

            {multiFiles.length === 0 && fileKind && fileKind !== "image" && fileKind !== "video" && selectedFile && (
              <div
                style={{
                  background: "#fff",
                  border: "1px solid #e5e7eb",
                  borderRadius: 18,
                  padding: 24,
                  marginBottom: 18,
                  textAlign: fileKind === "dicom" ? "left" : "center",
                }}
              >
                <div
                  style={{
                    textAlign: "center",
                    marginBottom: fileKind === "dicom" ? 18 : 0,
                  }}
                >
                  <IonIcon
                    icon={fileKindIcon(fileKind)}
                    style={{ fontSize: 58, color: "#059669" }}
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

                {fileKind === "dicom" && dicomMetadata && (
                  <div
                    style={{
                      marginTop: 16,
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 12,
                    }}
                  >
                    {[
                      ["Patient Name", dicomMetadata.patientName],
                      ["Patient ID", dicomMetadata.patientId],
                      ["Date of Birth", dicomMetadata.patientBirthDate],
                      ["Sex", dicomMetadata.patientSex],
                      ["Study Date", dicomMetadata.studyDate],
                      ["Study Description", dicomMetadata.studyDescription],
                      ["Modality", dicomMetadata.modality],
                      ["Institution", dicomMetadata.institutionName],
                      ["Manufacturer", dicomMetadata.manufacturer],
                      ["Slice Thickness", dicomMetadata.sliceThickness],
                      ["Pixel Spacing", dicomMetadata.pixelSpacing],
                      [
                        "Image Orientation",
                        dicomMetadata.imageOrientationPatient,
                      ],
                      ["Image Position", dicomMetadata.imagePositionPatient],
                      [
                        "Dimensions (rows × cols)",
                        dicomMetadata.rows && dicomMetadata.columns
                          ? `${dicomMetadata.rows} × ${dicomMetadata.columns}`
                          : "",
                      ],
                    ]
                      .filter(([, value]) => !!value)
                      .map(([label, value]) => (
                        <div
                          key={label}
                          style={{
                            background: "#f8fafc",
                            border: "1px solid #e5e7eb",
                            borderRadius: 10,
                            padding: "8px 10px",
                          }}
                        >
                          <div
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              color: "#64748b",
                              textTransform: "uppercase",
                              letterSpacing: 0.3,
                            }}
                          >
                            {label}
                          </div>
                          <div
                            style={{
                              marginTop: 2,
                              fontSize: 13,
                              fontWeight: 600,
                              color: "#111827",
                              wordBreak: "break-word",
                            }}
                          >
                            {value}
                          </div>
                        </div>
                      ))}
                  </div>
                )}

                {fileKind === "dicom" && dicomParseError && (
                  <div
                    style={{
                      marginTop: 16,
                      padding: "10px 12px",
                      borderRadius: 10,
                      background: "#fff7ed",
                      color: "#9a3412",
                      fontSize: 13,
                      textAlign: "center",
                    }}
                  >
                    {dicomParseError}
                  </div>
                )}
              </div>
            )}

            {!serversLoading && servers.length === 0 ? (
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
                  Please add a server first
                </h3>
                <p style={{ color: "#9a3412", margin: "0 0 18px", fontSize: 14 }}>
                  You need at least one destination server before you can
                  upload. A patient is optional and can be added anytime.
                </p>
                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    justifyContent: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <IonButton
                    size="small"
                    onClick={() => router.push("/addserver")}
                    style={{ "--background": "linear-gradient(135deg, #0f766e 0%, #059669 100%)" } as React.CSSProperties}
                  >
                    <IonIcon icon={serverOutline} slot="start" />
                    Add Server
                  </IonButton>

                  {patients.length === 0 && (
                    <IonButton
                      size="small"
                      fill="outline"
                      onClick={() => router.push("/patientlist")}
                      style={{ "--border-color": "#ea580c", "--color": "#ea580c" } as React.CSSProperties}
                    >
                      <IonIcon icon={personAddOutline} slot="start" />
                      Add Patient (optional)
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
                  <IonItem lines="none" className="upload-picker-ion-item">
                    <span slot="start" className="upload-picker-trigger-icon upload-picker-server-icon"><IonIcon icon={serverOutline} /></span>
                    <IonLabel position="stacked">Destination Server</IonLabel>
                    <IonSelect
                      value={selectedServerId}
                      placeholder={serversLoading ? "Loading servers..." : "Choose server"}
                      disabled={serversLoading}
                      interface="popover"
                      interfaceOptions={{ cssClass: "upload-themed-select" }}
                      onIonChange={(e) => setSelectedServerId(String(e.detail.value ?? ""))}
                    >
                      {servers.map((server) => <IonSelectOption key={server.id} value={server.id}>{server.label} ({server.type.toUpperCase()})</IonSelectOption>)}
                    </IonSelect>
                  </IonItem>

                  <IonItem lines="none" className="upload-picker-ion-item upload-picker-trigger-patient">
                    <span slot="start" className="upload-picker-trigger-icon"><IonIcon icon={personOutline} /></span>
                    <IonLabel position="stacked">Patient (Optional)</IonLabel>
                    <IonSelect
                      value={selectedPatient}
                      placeholder={patientsLoading ? "Loading patients..." : patients.length === 0 ? "No patients added" : "No patient selected"}
                      disabled={patientsLoading || patients.length === 0}
                      interface="popover"
                      interfaceOptions={{ cssClass: "upload-themed-select" }}
                      onIonChange={(e) => setSelectedPatient(String(e.detail.value ?? ""))}
                    >
                      {patients.map((patient) => <IonSelectOption key={String(patient.id)} value={String(patient.id)}>{patient.name}</IonSelectOption>)}
                    </IonSelect>
                  </IonItem>

                  {selectedPatient && (
                    (() => {
                      const chosen = patients.find(
                        (p) => String(p.id) === String(selectedPatient)
                      );
                      if (!chosen) return null;
                      return (
                        <div
                          style={{
                            margin: "4px 16px 8px",
                            padding: "8px 12px",
                            borderRadius: 10,
                            background: "#f1f5f9",
                            color: "#475569",
                            fontSize: 12.5,
                          }}
                        >
                          Using on-file details for {chosen.name}:{" "}
                          <strong>DOB {chosen.dob || "not set"}</strong>,{" "}
                          <strong>{chosen.gender || "gender not set"}</strong>
                        </div>
                      );
                    })()
                  )}

                  <IonItem lines="none" style={{ "--padding-start": "8px" } as React.CSSProperties}>
                    <div
                      slot="start"
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 12,
                        display: "grid",
                        placeItems: "center",
                        background: "#fed7aa",
                      }}
                    >
                      <IonIcon icon={medkitOutline} style={{ fontSize: 20, color: "#ea580c" }} />
                    </div>
                    <IonLabel position="stacked" style={{ fontWeight: 700, color: "#111827" }}>
                      Modality
                    </IonLabel>
                    <IonSelect
                      value={modality}
                      placeholder="Choose modality"
                      onIonChange={(e) => setModality(e.detail.value)}
                    >
                      {MODALITY_OPTIONS.map((opt) => (
                        <IonSelectOption key={opt.value} value={opt.value}>
                          {opt.label}
                        </IonSelectOption>
                      ))}
                    </IonSelect>
                  </IonItem>
                </div>

                <IonButton
                  expand="block"
                  onClick={handleUpload}
                  className="upload-submit-button"
                  disabled={
                    !selectedServerId ||
                    (multiFiles.length === 0 && !selectedFile)
                  }
                  style={
                    {
                      marginTop: 10,
                      height: 52,
                      "--background": "linear-gradient(135deg, #0f766e 0%, #059669 100%)",
                      "--background-activated": "linear-gradient(135deg, #0f766e 0%, #059669 100%)",
                      "--box-shadow": "0 10px 24px rgba(5,150,105,.28)",
                      "--border-radius": "15px",
                      fontWeight: 700,
                    } as React.CSSProperties
                  }
                >
                  <IonIcon icon={cloudUploadOutline} slot="start" />
                  Upload {multiFiles.length > 1 ? `${multiFiles.length} Files` : "File"}
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
                borderRadius: 28,
                padding: "40px 32px 32px",
                textAlign: "center",
                boxShadow: "0 24px 60px rgba(15,23,42,.10)",
              }}
            >
              <div
                style={{
                  width: 88,
                  height: 88,
                  margin: "0 auto 22px",
                  borderRadius: "50%",
                  display: "grid",
                  placeItems: "center",
                  background:
                    "linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%)",
                  boxShadow: "0 10px 24px rgba(22,163,74,.18)",
                }}
              >
                <IonIcon
                  icon={checkmarkCircle}
                  style={{ fontSize: 52, color: "#16a34a" }}
                />
              </div>

              <h2
                style={{
                  color: "#111827",
                  marginBottom: 8,
                  fontSize: 21,
                  fontWeight: 800,
                  letterSpacing: -0.2,
                }}
              >
                Upload Successful
              </h2>

              <p
                style={{
                  color: "#64748b",
                  marginTop: 0,
                  marginBottom: 30,
                  fontSize: 14,
                  lineHeight: 1.6,
                }}
              >
                {multiFiles.length > 1
                  ? `${multiFiles.length} files were uploaded`
                  : "Your file was uploaded"}
                {selectedServerObj
                  ? ` to ${selectedServerObj.label}.`
                  : "."}
              </p>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                <IonButton
                  expand="block"
                  onClick={goToUploadedList}
                  style={
                    {
                      height: 50,
                      "--background": "linear-gradient(135deg, #0f766e 0%, #059669 100%)",
                      "--border-radius": "14px",
                      fontWeight: 700,
                    } as React.CSSProperties
                  }
                >
                  <IonIcon icon={serverOutline} slot="start" />
                  View
                </IonButton>

                <IonButton
                  expand="block"
                  fill="outline"
                  onClick={resetFlow}
                  style={
                    {
                      height: 50,
                      "--border-radius": "14px",
                      "--border-color": "#0f766e",
                      "--color": "#0f766e",
                    } as React.CSSProperties
                  }
                >
                  <IonIcon icon={cloudUploadOutline} slot="start" />
                  Upload Another
                </IonButton>
              </div>
            </div>
          </div>
        )}

        <IonLoading isOpen={loading} message={loadingMessage} />

        <IonModal
          isOpen={!!activeBatchPreview}
          onDidDismiss={() => setActiveBatchPreview(null)}
          className="batch-image-preview-modal"
        >
          <IonHeader>
            <IonToolbar className="custom-toolbar">
              <IonButtons slot="start">
                <IonButton onClick={() => setActiveBatchPreview(null)}>Close</IonButton>
              </IonButtons>
              <IonTitle>Image Preview</IonTitle>
            </IonToolbar>
          </IonHeader>
          <IonContent className="batch-image-preview-content">
            {activeBatchPreview && batchPreviews[activeBatchPreview.id] && (
              <ImageMeasurementTool
                imageUrl={batchPreviews[activeBatchPreview.id]}
                compact
                onAnnotatedImage={() => undefined}
              />
            )}
          </IonContent>
        </IonModal>

        <IonModal
          isOpen={showUploadSuccess}
          onDidDismiss={() => setShowUploadSuccess(false)}
          className="upload-success-modal"
        >
          <div className="upload-success-popup">
            <div className="upload-success-check">
              <IonIcon icon={checkmarkCircle} />
            </div>
            <h2>Upload Successful</h2>
            <p>
              {multiFiles.length > 1
                ? `${multiFiles.length} files have been uploaded successfully.`
                : "Your image has been uploaded successfully."}
            </p>
            <IonButton expand="block" onClick={() => setShowUploadSuccess(false)}>
              Continue
            </IonButton>
          </div>
        </IonModal>

        <IonToast
          isOpen={!!toastMsg}
          message={toastMsg}
          duration={2800}
          onDidDismiss={() => setToastMsg("")}
        />
      </IonContent>

      {!(step === "capture" && uploadSource === "camera" && !showPatientPrompt) && (
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
      )}
      
    </IonPage>
  );
};

export default UploadImage;