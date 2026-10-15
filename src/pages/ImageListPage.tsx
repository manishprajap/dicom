import React, { useCallback, useEffect, useState, useRef } from "react";
import {
  IonButtons,
  IonContent,
  IonBackButton,
  IonPage,
  IonButton,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonModal,
  IonImg,
  IonSpinner,
  IonAlert,
  IonInfiniteScroll,
  IonInfiniteScrollContent,
  IonIcon,
  IonFooter,
  useIonRouter,
} from "@ionic/react";
import axios from "axios";
import { useLocation, useHistory } from "react-router-dom";
import { Dicom } from "@aarna/capacitor-dicom";
import { Capacitor } from "@capacitor/core";
import * as cornerstone from "cornerstone-core";
import * as cornerstoneWADOImageLoader from "cornerstone-wado-image-loader";
import dicomParser from "dicom-parser";
import { getDicomUploadRecordsForServer, type DicomUploadLocalRecord } from "../utils/dicomLocalDb";
import {
  eyeOutline,
  trashOutline,
  removeOutline,
  addOutline,
  refreshOutline,
  playOutline,
  pauseOutline,
  playSkipBackOutline,
  playSkipForwardOutline,
  volumeHighOutline,
  volumeMuteOutline,
  volumeMediumOutline,
  expandOutline,
  contractOutline,
  openOutline,
  chevronBackOutline,
  chevronForwardOutline,
  cloudUploadOutline,
  personOutline,
  calendarOutline,
  imagesOutline,
  homeOutline,
  peopleOutline,
  cameraOutline,
  settingsOutline,
  serverOutline,
  contrastOutline,
  syncOutline,
  swapHorizontalOutline,
  swapVerticalOutline,
  colorFilterOutline,
} from "ionicons/icons";
import "../css/imagelistpage.css";

const IMG_MIN_ZOOM = 1;
const IMG_MAX_ZOOM = 4;
const DOUBLE_TAP_ZOOM = 2.5;
const DOUBLE_TAP_DELAY = 280; // ms
const CONTROLS_HIDE_DELAY = 3000; // ms
const PDF_LOAD_TIMEOUT = 8000; // ms - if iframe hasn't fired onLoad by then, show fallback
const DEFAULT_FRAME_FPS = 2; // default cine playback speed

const FALLBACK_PLACEHOLDER = "https://cdn-icons-png.flaticon.com/512/1829/1829586.png";

const formatUsDateTime = (value: unknown): string => {
  if (!value) return "Date unavailable";
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat("en-US", {
    month: "numeric",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
};

cornerstoneWADOImageLoader.external.cornerstone = cornerstone;
cornerstoneWADOImageLoader.external.dicomParser = dicomParser;
cornerstoneWADOImageLoader.configure({
  useWebWorkers: true,
  decodeConfig: { convertFloatPixelDataToInt: false },
});

type PreviewType = "image" | "pdf" | "dicom" | "video" | "frames" | null;

interface DicomViewport {
  scale: number;
  translation: { x: number; y: number };
  voi: { windowWidth: number; windowCenter: number };
  invert: boolean;
  rotation: number;
  hflip: boolean;
  vflip: boolean;
}

interface DicomViewportControls {
  zoomIn: () => void;
  zoomOut: () => void;
  reset: () => void;
  invert: () => void;
  rotate: () => void;
  flipHorizontal: () => void;
  flipVertical: () => void;
  changeWindow: (widthDelta: number, centerDelta: number) => void;
}

const DicomImageViewer: React.FC<{
  imageUrl: string;
  onReady: (controls: DicomViewportControls) => void;
  onError: (message: string) => void;
}> = ({ imageUrl, onReady, onError }) => {
  const elementRef = useRef<HTMLDivElement | null>(null);
  const enabledRef = useRef(false);
  const baseScaleRef = useRef(1);

  const withViewport = useCallback((update: (viewport: DicomViewport) => void) => {
    const element = elementRef.current;
    if (!element || !enabledRef.current) return;
    try {
      const viewport = cornerstone.getViewport(element) as DicomViewport;
      update(viewport);
      cornerstone.setViewport(element, viewport);
    } catch {
      // The modal may have closed while a toolbar event was queued.
    }
  }, []);

  useEffect(() => {
    const element = elementRef.current;
    if (!element || !imageUrl) return;
    let active = true;

    const load = async () => {
      try {
        if (!enabledRef.current) {
          cornerstone.enable(element);
          enabledRef.current = true;
        }
        const image = await cornerstone.loadImage(`wadouri:${imageUrl}`);
        if (!active) return;
        cornerstone.displayImage(element, image);
        cornerstone.fitToWindow(element);
        baseScaleRef.current = (cornerstone.getViewport(element) as DicomViewport).scale || 1;

        onReady({
          zoomIn: () => withViewport((viewport) => {
            viewport.scale = Math.min(viewport.scale + baseScaleRef.current * 0.5, baseScaleRef.current * 8);
          }),
          zoomOut: () => withViewport((viewport) => {
            viewport.scale = Math.max(viewport.scale - baseScaleRef.current * 0.5, baseScaleRef.current * 0.25);
          }),
          reset: () => {
            cornerstone.reset(element);
            cornerstone.fitToWindow(element);
          },
          invert: () => withViewport((viewport) => { viewport.invert = !viewport.invert; }),
          rotate: () => withViewport((viewport) => { viewport.rotation = (viewport.rotation + 90) % 360; }),
          flipHorizontal: () => withViewport((viewport) => { viewport.hflip = !viewport.hflip; }),
          flipVertical: () => withViewport((viewport) => { viewport.vflip = !viewport.vflip; }),
          changeWindow: (widthDelta, centerDelta) => withViewport((viewport) => {
            viewport.voi.windowWidth = Math.max(1, viewport.voi.windowWidth + widthDelta);
            viewport.voi.windowCenter += centerDelta;
          }),
        });
      } catch (error) {
        console.error("DICOM viewer load failed:", error);
        onError("The retrieved file could not be displayed as a DICOM image.");
      }
    };

    void load();
    const onResize = () => {
      if (enabledRef.current) cornerstone.resize(element, true);
    };
    window.addEventListener("resize", onResize);
    return () => {
      active = false;
      window.removeEventListener("resize", onResize);
      if (enabledRef.current) {
        cornerstone.disable(element);
        enabledRef.current = false;
      }
    };
  }, [imageUrl, onError, onReady, withViewport]);

  return <div ref={elementRef} className="dicom-image-canvas" />;
};

/** Convert a DICOM date string "YYYYMMDD" -> "DD-MM-YYYY". Returns "N/A" if missing/invalid. */
const formatDicomDate = (raw?: string | null): string => {
  if (!raw || raw.length !== 8) return "N/A";
  const y = raw.slice(0, 4);
  const m = raw.slice(4, 6);
  const d = raw.slice(6, 8);
  return `${d}-${m}-${y}`;
};

/** Compute age in years from a DICOM date-of-birth string "YYYYMMDD". Returns null if unavailable. */
const calculateAge = (dobRaw?: string | null): number | null => {
  if (!dobRaw || dobRaw.length !== 8) return null;
  const y = parseInt(dobRaw.slice(0, 4), 10);
  const m = parseInt(dobRaw.slice(4, 6), 10);
  const d = parseInt(dobRaw.slice(6, 8), 10);
  const dob = new Date(y, m - 1, d);
  if (isNaN(dob.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age--;
  }
  return age;
};

/** Expand a DICOM sex code into a readable label */
const formatSex = (raw?: string | null): string => {
  if (!raw) return "N/A";
  const code = raw.trim().toUpperCase();
  if (code === "M") return "Male";
  if (code === "F") return "Female";
  if (code === "O") return "Other";
  return raw;
};

const ImageListPage: React.FC = () => {
  const location = useLocation<{ server: any }>();
  const history = useHistory();
  const router = useIonRouter();

  // ---- Server-side pagination state ----
  const [displayedImages, setDisplayedImages] = useState<any[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState<boolean>(false);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewType, setPreviewType] = useState<PreviewType>(null);
  const [showModal, setShowModal] = useState<boolean>(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [deleteSeriesId, setDeleteSeriesId] = useState<string | null>(null);
  const [loadedMap, setLoadedMap] = useState<Record<string, boolean>>({});
  const [localUploadDetails, setLocalUploadDetails] = useState<Record<string, DicomUploadLocalRecord & { remoteDetail?: any }>>({});
  const [viewerRecord, setViewerRecord] = useState<DicomUploadLocalRecord | null>(null);
  const [viewerImageUrl, setViewerImageUrl] = useState<string | null>(null);
  const [viewerLoading, setViewerLoading] = useState(false);
  const [viewerError, setViewerError] = useState("");
  const [dicomControls, setDicomControls] = useState<DicomViewportControls | null>(null);

  // ---- Patient details for whichever series is currently open in the modal ----
  const [previewPatient, setPreviewPatient] = useState<any>(null);

  // ---- PDF viewer state ----
  const [pdfLoaded, setPdfLoaded] = useState(false);
  const [pdfFailed, setPdfFailed] = useState(false);
  const pdfTimeoutRef = useRef<any>(null);

  // ---- Frame cine-player state (multi-frame series played like a video) ----
  const [frameList, setFrameList] = useState<any[]>([]);
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [isFramePlaying, setIsFramePlaying] = useState(false);
  const [frameFps, setFrameFps] = useState(DEFAULT_FRAME_FPS);
  const frameTimerRef = useRef<any>(null);
  const filmstripRef = useRef<HTMLDivElement | null>(null);

  const [frameLayerSrc, setFrameLayerSrc] = useState<{ a: string; b: string }>({ a: "", b: "" });
  const [frontFrameLayer, setFrontFrameLayer] = useState<"a" | "b">("a");
  const backFrameLayerRef = useRef<"a" | "b">("b");
  const preloadedFramesRef = useRef<Set<string>>(new Set());
  const [thumbErrorMap, setThumbErrorMap] = useState<Record<string, number>>({});

  // Zoom & Pan states (for rendering) — shared by image viewer, video viewer AND frame cine player
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);

  // ---- Video player state (real video files only, e.g. file.videourl) ----
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [showVideoControls, setShowVideoControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const controlsHideTimer = useRef<any>(null);
  const singleTapTimer = useRef<any>(null);
  const videoWrapperRef = useRef<HTMLDivElement | null>(null);

  const viewerStageRef = useRef<HTMLDivElement | null>(null);
  const mediaRef = useRef<HTMLImageElement | HTMLVideoElement | null>(null);
  const lastTouchDistance = useRef<number | null>(null);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  const positionRef = useRef({ x: 0, y: 0 });
  const lastTapRef = useRef(0);

  const contentRef = useRef<HTMLIonContentElement | null>(null);
  const server = location.state?.server;

  const apiUrl = "https://aarnatechxperts.in/dicomapi/public/api/retrieveimagesdicom";
  const deleteApi = "https://aarnatechxperts.in/dicomapi/public/api/deleteDicomInstance";
  const imagesPerLoad = 10;
  const localUploads = getDicomUploadRecordsForServer(server?.ips);
  const DEFAULT_MEDICAL_THUMBNAIL = "https://cdn-icons-png.flaticon.com/512/2966/2966488.png";

  const fetchLocalUploadDetails = async (item: DicomUploadLocalRecord) => {
    if (!server?.ips) {
      return item;
    }

    try {
      const response = await axios.post(apiUrl, {
        server,
        page: 1,
        per_page: 10,
        instance_id: item.instanceId,
      });

      const payload = response.data?.data ?? [];
      const matched = Array.isArray(payload)
        ? payload.find((entry: any) => {
            const matchId = String(entry.instance_id ?? entry.instanceId ?? entry.series_id ?? "");
            return matchId === String(item.instanceId);
          })
        : null;

      if (matched) {
        return {
          ...item,
          serverIp: server.ips,
          remoteDetail: matched,
          patientName: matched.patient_name || item.patientName,
          patientId: matched.patient_id || item.patientId,
          fileName: matched.file_name || item.fileName,
        };
      }
    } catch (error) {
      console.warn("Could not fetch local upload details from PACS using instance ID:", error);
    }

    return item;
  };

  useEffect(() => {
    if (!server?.ips || localUploads.length === 0) {
      setLocalUploadDetails({});
      return;
    }

    let active = true;

    const hydrateLocalRecords = async () => {
      const resolved: Record<string, DicomUploadLocalRecord & { remoteDetail?: any }> = {};

      for (const item of localUploads) {
        const nextItem = await fetchLocalUploadDetails(item);
        if (active) {
          resolved[item.instanceId] = nextItem as DicomUploadLocalRecord & { remoteDetail?: any };
        }
      }

      if (active) {
        setLocalUploadDetails(resolved);
      }
    };

    hydrateLocalRecords();

    return () => {
      active = false;
    };
  }, [server?.ips, localUploads.length]);

  const localMergedFiles = localUploads.map((item) => {
    const detail = localUploadDetails[item.instanceId] || item;
    return {
      series_id: `local-${item.instanceId}`,
      patient_name: detail.patientName,
      patient_id: detail.patientId,
      thumbnail: (detail as any)?.remoteDetail?.thumbnail || DEFAULT_MEDICAL_THUMBNAIL,
      frames: [],
      total_frames: 1,
      videourl: null,
      pdfview: null,
      localUpload: item,
      file_name: detail.fileName,
      file_type: detail.fileType,
      uploaded_at: detail.uploadedAt,
      instance_id: detail.instanceId,
      isLocalUpload: true,
    };
  });

  const mergedFiles = [
    ...displayedImages,
    ...localMergedFiles,
  ];

  useEffect(() => {
    return () => {
      if (controlsHideTimer.current) clearTimeout(controlsHideTimer.current);
      if (singleTapTimer.current) clearTimeout(singleTapTimer.current);
      if (pdfTimeoutRef.current) clearTimeout(pdfTimeoutRef.current);
      if (frameTimerRef.current) clearInterval(frameTimerRef.current);
    };
  }, []);
  // Keep refs in sync with state
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => { positionRef.current = position; }, [position]);

  /**
   * Fetch a single page of series from the server.
   * Response shape: { data: [...series], pagination: { current_page, per_page, total, last_page, has_more } }
   */
  const fetchPage = async (page: number, isInitial = false) => {
    try {
      if (isInitial) setLoading(true);
      else setLoadingMore(true);

      const response = await axios.post(apiUrl, {
        server,
        page,
        per_page: imagesPerLoad,
      });

      const { data, pagination } = response.data;

      setDisplayedImages((prev) => (isInitial ? data : [...prev, ...data]));
      setCurrentPage(pagination.current_page);
      setTotalCount(pagination.total);
      setHasMore(pagination.has_more);
    } catch (error) {
      console.error("Error fetching images:", error);
    } finally {
      if (isInitial) setLoading(false);
      else setLoadingMore(false);
    }
  };

  /** Initial load / reload whenever the target server changes */
  useEffect(() => {
    if (server) {
      setDisplayedImages([]);
      setCurrentPage(1);
      setTotalCount(0);
      setHasMore(true);
      fetchPage(1, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [server]);

  /** Resolve which URL to use for a card's thumbnail, based on fallback stage */
  const getThumbSrc = (file: any) => {
    if (file.pdfview) {
      return "https://cdn-icons-png.flaticon.com/512/337/337946.png";
    }
    const stage = thumbErrorMap[file.series_id] || 0;
    if (stage === 0 && file.thumbnail) return file.thumbnail;
    if (stage <= 1 && file.frames?.length > 0) return file.frames[0].image;
    return FALLBACK_PLACEHOLDER;
  };

  /** Returns the badge label + css class shown on each card, based on file type */
  const getFileTypeBadge = (file: any): { label: string; className: string } => {
    if (file.videourl) return { label: "VIDEO", className: "badge-video" };
    if (file.pdfview) return { label: "PDF", className: "badge-pdf" };
    if (file.total_frames > 1) return { label: "DICOM", className: "badge-dicom" };
    return { label: "IMAGE", className: "badge-image" };
  };

  /** Advance the fallback stage for a series when its current thumbnail fails to load */
  const handleThumbError = (file: any) => {
    console.log("Thumbnail failed for series:", file.series_id, getThumbSrc(file));
    setThumbErrorMap((prev) => {
      const current = prev[file.series_id] || 0;
      if (current >= 2) return prev;
      return { ...prev, [file.series_id]: current + 1 };
    });
  };

  /** Clamp pan position so the media can never be dragged fully out of view */
  const clampPosition = (pos: { x: number; y: number }, zoomLevel: number) => {
    const container = viewerStageRef.current;
    const mediaEl = mediaRef.current;
    if (!container || !mediaEl) return pos;

    const containerRect = container.getBoundingClientRect();
    const baseW = mediaEl.offsetWidth;
    const baseH = mediaEl.offsetHeight;

    const scaledW = baseW * zoomLevel;
    const scaledH = baseH * zoomLevel;

    const maxX = Math.max((scaledW - containerRect.width) / 2, 0);
    const maxY = Math.max((scaledH - containerRect.height) / 2, 0);

    return {
      x: Math.min(Math.max(pos.x, -maxX), maxX),
      y: Math.min(Math.max(pos.y, -maxY), maxY),
    };
  };

  /** Central place to change zoom — always keeps position clamped/reset */
  const applyZoom = (nextZoomRaw: number, anchorPos?: { x: number; y: number }) => {
    const nextZoom = Math.min(Math.max(nextZoomRaw, IMG_MIN_ZOOM), IMG_MAX_ZOOM);
    zoomRef.current = nextZoom;
    setZoom(nextZoom);

    if (nextZoom <= 1) {
      zoomRef.current = 1;
      positionRef.current = { x: 0, y: 0 };
      setZoom(1);
      setPosition({ x: 0, y: 0 });
      return;
    }

    const base = anchorPos ?? positionRef.current;
    const clamped = clampPosition(base, nextZoom);
    positionRef.current = clamped;
    setPosition(clamped);
  };

  /** Toggle between 100% and a fixed zoomed-in level (double-tap / double-click) */
  const toggleZoom = () => {
    if (zoomRef.current > 1) {
      applyZoom(1);
    } else {
      applyZoom(DOUBLE_TAP_ZOOM);
    }
  };

  /** Reset zoom & position */
  const resetZoom = () => {
    zoomRef.current = 1;
    positionRef.current = { x: 0, y: 0 };
    setZoom(1);
    setPosition({ x: 0, y: 0 });
  };

  /* ----------------------------------------------------------------
   * VIDEO PLAYER HELPERS (real video files, e.g. file.videourl)
   * ---------------------------------------------------------------- */

  const formatTime = (secs: number) => {
    if (!isFinite(secs) || secs < 0) return "0:00";
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const scheduleHideControls = () => {
    if (controlsHideTimer.current) clearTimeout(controlsHideTimer.current);
    controlsHideTimer.current = setTimeout(() => {
      setShowVideoControls(false);
    }, CONTROLS_HIDE_DELAY);
  };

  const revealControls = (autoHide = true) => {
    setShowVideoControls(true);
    if (autoHide) scheduleHideControls();
    else if (controlsHideTimer.current) clearTimeout(controlsHideTimer.current);
  };

  const togglePlay = () => {
    const video = mediaRef.current as HTMLVideoElement | null;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => { });
    } else {
      video.pause();
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = mediaRef.current as HTMLVideoElement | null;
    if (!video) return;
    const next = parseFloat(e.target.value);
    video.currentTime = next;
    setCurrentTime(next);
    revealControls();
  };

  const toggleMute = () => {
    const video = mediaRef.current as HTMLVideoElement | null;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
    revealControls();
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = mediaRef.current as HTMLVideoElement | null;
    if (!video) return;
    const next = parseFloat(e.target.value);
    video.volume = next;
    video.muted = next === 0;
    setVolume(next);
    setIsMuted(next === 0);
    revealControls();
  };

  const toggleFullscreen = () => {
    const wrapper = videoWrapperRef.current;
    if (!wrapper) return;
    if (!document.fullscreenElement) {
      wrapper.requestFullscreen?.().catch(() => { });
    } else {
      document.exitFullscreen?.().catch(() => { });
    }
    revealControls();
  };

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  /** Reset the video player's UI state whenever a new video is opened / modal closes */
  useEffect(() => {
    if (previewType === "frames" && showModal && frameList.length > 0) {
      setCurrentFrameIndex(0);
      setIsFramePlaying(true);
    }
  }, [previewType, showModal, frameList]);

  /* ----------------------------------------------------------------
   * PDF VIEWER HELPERS
   * ---------------------------------------------------------------- */

  useEffect(() => {
    if (previewType === "pdf" && showModal && previewUrl) {
      setPdfLoaded(false);
      setPdfFailed(false);

      if (pdfTimeoutRef.current) {
        clearTimeout(pdfTimeoutRef.current);
      }

      pdfTimeoutRef.current = setTimeout(() => {
        setPdfFailed(true); // ✅ direct set karo
      }, PDF_LOAD_TIMEOUT);
    }

    return () => {
      if (pdfTimeoutRef.current) {
        clearTimeout(pdfTimeoutRef.current);
      }
    };
  }, [previewType, showModal, previewUrl]);

  const toggleFramePlay = () => {
    setIsFramePlaying((prev) => !prev);
  };

  const handleFrameSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = parseInt(e.target.value, 10);
    setIsFramePlaying(false);
    setCurrentFrameIndex(next);
  };

  const stepFrame = (delta: number) => {
    setIsFramePlaying(false);
    setCurrentFrameIndex((prev) => {
      const len = frameList.length || 1;
      let next = prev + delta;
      if (next < 0) next = len - 1;
      if (next >= len) next = 0;
      return next;
    });
  };

  /** Tapping/clicking the main frame image zooms it in/out (pinch & double-tap still work on touch) */
  const handleFrameStageClick = () => {
    if (isDraggingRef.current) return;
    toggleZoom();
  };

  /** Jump straight to a frame by clicking its filmstrip thumbnail */
  const handleThumbnailClick = (idx: number) => {
    setIsFramePlaying(false);
    setCurrentFrameIndex(idx);
  };

  /** Scroll the filmstrip left/right using the arrow nav buttons */
  const scrollFilmstrip = (direction: number) => {
    const container = filmstripRef.current;
    if (!container) return;
    container.scrollBy({ left: direction * 260, behavior: "smooth" });
  };

  /** Keep the active thumbnail scrolled into view as playback advances */
  useEffect(() => {
    if (
      previewType === "frames" &&
      isFramePlaying &&
      frameList &&
      frameList.length > 1
    ) return;
    const container = filmstripRef.current;
    if (!container) return;
    const activeEl = container.querySelector(
      `[data-frame-index="${currentFrameIndex}"]`
    ) as HTMLElement | null;
    activeEl?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [currentFrameIndex, previewType]);

  /** Reset the cine player whenever a new series is opened / modal closes — autoplays on open */
  useEffect(() => {
    if (previewType === "frames" && showModal) {
      setCurrentFrameIndex(0);
      setIsFramePlaying(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewType, showModal]);

  /** Seed the front buffer layer with frame 0 as soon as a new series loads */
  useEffect(() => {
    if (previewType === "frames" && frameList.length > 0) {
      const firstSrc = frameList[0].image;
      setFrameLayerSrc({ a: firstSrc, b: "" });
      setFrontFrameLayer("a");
      backFrameLayerRef.current = "b";
    }
  }, [previewType, frameList]);

  useEffect(() => {
    if (previewType !== "frames" || frameList.length === 0) return;
    const nextSrc = frameList[currentFrameIndex]?.image;
    if (!nextSrc) return;
    const frontSrc = frameLayerSrc[frontFrameLayer];
    if (frontSrc === nextSrc) return; // already showing this frame (e.g. initial mount)

    const back = backFrameLayerRef.current;
    setFrameLayerSrc((prev) => ({ ...prev, [back]: nextSrc }));
  }, [currentFrameIndex, previewType, frameList]);

  /** Promote the back layer to front once its image has actually finished loading */
  const handleFrameLayerLoad = (layer: "a" | "b") => {
    if (layer === backFrameLayerRef.current) {
      setFrontFrameLayer(layer);
      backFrameLayerRef.current = layer === "a" ? "b" : "a";
    }
  };

  /** Drive playback: advance one frame every 1000/fps ms while playing, looping at the end */
  useEffect(() => {
    if (frameTimerRef.current) {
      clearInterval(frameTimerRef.current);
      frameTimerRef.current = null;
    }
    if (previewType === "frames" && isFramePlaying && frameList.length > 1) {
      frameTimerRef.current = setInterval(() => {
        setCurrentFrameIndex((prev) => {
          const next = prev + 1;
          return next >= frameList.length ? 0 : next;
        });
      }, 1000 / frameFps);
    }
    return () => {
      if (frameTimerRef.current) {
        clearInterval(frameTimerRef.current);
        frameTimerRef.current = null;
      }
    };
  }, [previewType, isFramePlaying, frameFps, frameList.length]);

  /** Warm the browser's image cache (and decode) for every frame so scrubbing/playback
   *  never stalls waiting on a network fetch mid-cine-loop. */
  useEffect(() => {
    if (previewType === "frames" && frameList.length > 0) {
      preloadedFramesRef.current = new Set();
      frameList.forEach((f) => {
        const img = new Image();
        img.src = f.image;
        const markLoaded = () => preloadedFramesRef.current.add(f.image);
        if (img.decode) {
          img.decode().then(markLoaded).catch(markLoaded);
        } else {
          img.onload = markLoaded;
        }
      });
    }
  }, [previewType, frameList]);

  /* ----------------------------------------------------------------
   * PINCH / PAN / DOUBLE-TAP TOUCH HANDLING (image, video & frames stages)
   * ---------------------------------------------------------------- */

  useEffect(() => {
    if (!showModal || (previewType !== "image" && previewType !== "video" && previewType !== "frames")) return;

    let cleanup: (() => void) | null = null;

    const timer = setTimeout(() => {
      const el = viewerStageRef.current;
      if (!el) return;

      const onTouchStart = (e: TouchEvent) => {
        if (e.touches.length === 2) {
          if (singleTapTimer.current) clearTimeout(singleTapTimer.current);
          const dx = e.touches[0].clientX - e.touches[1].clientX;
          const dy = e.touches[0].clientY - e.touches[1].clientY;
          lastTouchDistance.current = Math.sqrt(dx * dx + dy * dy);
          isDraggingRef.current = false;
        } else if (e.touches.length === 1) {
          const now = Date.now();
          const sinceLastTap = now - lastTapRef.current;
          lastTapRef.current = now;

          if (sinceLastTap < DOUBLE_TAP_DELAY) {
            if (singleTapTimer.current) clearTimeout(singleTapTimer.current);
            toggleZoom();
            isDraggingRef.current = false;
            setIsDragging(false);
            return;
          }

          if (zoomRef.current > 1) {
            isDraggingRef.current = true;
            setIsDragging(true);
            dragStartRef.current = {
              x: e.touches[0].clientX - positionRef.current.x,
              y: e.touches[0].clientY - positionRef.current.y,
            };
          }
        }
      };

      const onTouchMove = (e: TouchEvent) => {
        e.preventDefault();

        if (e.touches.length === 2 && lastTouchDistance.current !== null) {
          const dx = e.touches[0].clientX - e.touches[1].clientX;
          const dy = e.touches[0].clientY - e.touches[1].clientY;
          const newDist = Math.sqrt(dx * dx + dy * dy);
          const scale = newDist / lastTouchDistance.current;

          const nextZoom = Math.min(Math.max(zoomRef.current * scale, IMG_MIN_ZOOM), IMG_MAX_ZOOM);
          zoomRef.current = nextZoom;
          setZoom(nextZoom);

          const clamped =
            nextZoom <= 1 ? { x: 0, y: 0 } : clampPosition(positionRef.current, nextZoom);
          positionRef.current = clamped;
          setPosition(clamped);

          lastTouchDistance.current = newDist;
        } else if (e.touches.length === 1 && isDraggingRef.current) {
          const rawPos = {
            x: e.touches[0].clientX - dragStartRef.current.x,
            y: e.touches[0].clientY - dragStartRef.current.y,
          };
          const clamped = clampPosition(rawPos, zoomRef.current);
          positionRef.current = clamped;
          setPosition(clamped);
        }
      };

      const onTouchEnd = (e: TouchEvent) => {
        const wasDragging = isDraggingRef.current;
        lastTouchDistance.current = null;
        isDraggingRef.current = false;
        setIsDragging(false);

        if (zoomRef.current < 1) {
          applyZoom(1);
        }

        if (previewType === "video" && !wasDragging && e.touches.length === 0) {
          if (singleTapTimer.current) clearTimeout(singleTapTimer.current);
          singleTapTimer.current = setTimeout(() => {
            setShowVideoControls((prev) => {
              const next = !prev;
              if (next) scheduleHideControls();
              return next;
            });
          }, DOUBLE_TAP_DELAY);
        }
      };

      // Desktop scroll-to-zoom — attached natively so preventDefault actually works
      const onWheelNative = (e: WheelEvent) => {
        e.preventDefault();
        const delta = e.deltaY * -0.0015;
        applyZoom(zoomRef.current + delta);
      };

      el.addEventListener("touchstart", onTouchStart, { passive: false });
      el.addEventListener("touchmove", onTouchMove, { passive: false });
      el.addEventListener("touchend", onTouchEnd);
      el.addEventListener("wheel", onWheelNative, { passive: false });

      cleanup = () => {
        el.removeEventListener("touchstart", onTouchStart);
        el.removeEventListener("touchmove", onTouchMove);
        el.removeEventListener("touchend", onTouchEnd);
        el.removeEventListener("wheel", onWheelNative);
      };
    }, 300);

    return () => {
      clearTimeout(timer);
      if (cleanup) cleanup();
    };
  }, [showModal, previewType]);

  /** Load next page of images from the server (called by IonInfiniteScroll) */
  const loadMoreImages = async () => {
    if (!hasMore || loadingMore) return;
    await fetchPage(currentPage + 1, false);
  };

  /** Close modal and reset zoom/players */
  const handleModalDismiss = () => {
    setShowModal(false);
    resetZoom();
    setIsPlaying(false);
    setIsFramePlaying(false);
    setCurrentFrameIndex(0);
    setPreviewPatient(null);
    if (frameTimerRef.current) {
      clearInterval(frameTimerRef.current);
      frameTimerRef.current = null;
    }
  };

  const closeDicomViewer = () => {
    setViewerRecord(null);
    setViewerImageUrl(null);
    setViewerLoading(false);
    setViewerError("");
    setDicomControls(null);
  };

  const openLocalDicomViewer = async (record: DicomUploadLocalRecord) => {
    setViewerRecord(record);
    setViewerImageUrl(null);
    setViewerError("");
    setDicomControls(null);

    if (!Capacitor.isNativePlatform()) {
      setViewerError("DICOM PACS retrieval and viewing are available in the Android app.");
      return;
    }
    if (!record.study_uid) {
      setViewerError("This saved upload has no Study UID, so the PACS cannot retrieve its DICOM file.");
      return;
    }
    if (!/^\d+(\.\d+)+$/.test(record.study_uid)) {
      setViewerError("This record was created with an old placeholder Study UID. Upload it again so the app can save the genuine PACS Study UID for direct retrieval.");
      return;
    }

    try {
      setViewerLoading(true);
      await Dicom.connect({
        mode: "dimse",
        dimse: {
          host: record.serverIp,
          port: Number(record.serverPort || 4242),
          callingAET: record.callingAET || "MYSCU",
          calledAET: record.calledAET || "PACS_SERVER",
        },
      });
      const result = await Dicom.get({ studyInstanceUID: record.study_uid });
      if (result.status !== 0 || result.files.length === 0) {
        throw new Error("The PACS did not return a DICOM file for this study.");
      }
      const matchingFile = result.files.find((path) => path.includes(record.instanceId)) || result.files[0];
      const nativeUri = matchingFile.startsWith("file://") ? matchingFile : `file://${matchingFile}`;
      setViewerImageUrl(Capacitor.convertFileSrc(nativeUri));
    } catch (error) {
      console.error("DICOM PACS retrieval failed:", error);
      setViewerError(error instanceof Error ? error.message : "Unable to retrieve this DICOM image from PACS.");
    } finally {
      setViewerLoading(false);
    }
  };

  /** Handle series card click — opens the appropriate viewer for the series */
  const handleImageClick = (file: any) => {
    resetZoom();
    setPreviewPatient(file); // carry patient/study metadata into the modal regardless of preview type

    if (file.videourl) {
      setPreviewType("video");
      setPreviewUrl(file.videourl);
      setShowModal(true);
      return;
    }

    if (file.pdfview) {
      setPreviewType("pdf");
      setPreviewUrl(file.pdfview);
      setShowModal(true);
      setPdfLoaded(false);
      setPdfFailed(false);
      return;
    }

    if (file.total_frames > 1 && file.frames?.length > 0) {
      setPreviewType("frames");
      const sortedFrames = [...file.frames].sort(
        (a, b) => (a.instance_number || 0) - (b.instance_number || 0)
      );

      setFrameList(sortedFrames);
      setCurrentFrameIndex(0);
      setIsFramePlaying(true);
      setShowVideoControls(true);
      setShowModal(true);
      return;
    }

    // single image
    setPreviewType("image");
    setPreviewUrl(file.thumbnail ?? file.frames?.[0]?.image ?? null);
    setShowModal(true);
  };

  /** Delete series setup */
  const handleDeleteClick = (seriesId: string) => {
    setDeleteSeriesId(seriesId);
    setShowConfirm(true);
  };

  /** Confirm delete — deletes the whole series (all frames/instances) */
  const confirmDelete = async () => {
    if (!deleteSeriesId) return;
    try {
      const response = await axios.post(deleteApi, {
        seriesId: deleteSeriesId,
      });
      if (response.data.success) {
        setDisplayedImages((prev) => prev.filter((img) => img.series_id !== deleteSeriesId));
        setTotalCount((prev) => Math.max(prev - 1, 0));
      } else {
        alert("Delete failed");
      }
    } catch (error) {
      console.error(error);
      alert("Failed to delete image");
    } finally {
      setDeleteSeriesId(null);
      setShowConfirm(false);
    }
  };

  /** Mouse drag handlers — desktop only */
  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom > 1) {
      setIsDragging(true);
      isDraggingRef.current = true;
      dragStartRef.current = { x: e.clientX - position.x, y: e.clientY - position.y };
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDraggingRef.current) {
      const rawPos = {
        x: e.clientX - dragStartRef.current.x,
        y: e.clientY - dragStartRef.current.y,
      };
      const clamped = clampPosition(rawPos, zoomRef.current);
      setPosition(clamped);
      positionRef.current = clamped;
    }
    if (previewType === "video") revealControls();
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    isDraggingRef.current = false;
  };

  /** Double-click to zoom — desktop only */
  const handleDoubleClick = () => {
    toggleZoom();
  };

  /** Single click on the video stage (desktop) toggles the control bar */
  const handleStageClick = () => {
    if (previewType !== "video") return;
    if (isDraggingRef.current) return;
    setShowVideoControls((prev) => {
      const next = !prev;
      if (next) scheduleHideControls();
      return next;
    });
  };

  /** Navigate to the upload page, carrying the current server context */
  const goToUploadPage = () => {
    history.push("/uploadfiles", { server });
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar className="custom-toolbar">
          <IonButtons slot="start">
            <IonBackButton defaultHref="/serverdetailslist" />
          </IonButtons>
          <IonTitle className="text-white text-center">Dicom Server Images</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={goToUploadPage}>
              <IonIcon icon={cloudUploadOutline} slot="start" />
              Upload
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>

      <IonContent ref={contentRef} className="dicom-bg">
        {loading && (
          <div className="flex justify-center items-center h-32">
            <IonSpinner name="crescent" />
            <span className="ml-2 text-gray-600">Loading images...</span>
          </div>
        )}

        <section className="dicom-server-summary">
          <div className="dicom-server-summary-row">
            <IonIcon icon={serverOutline} />
            <span>{server?.hostname || "DICOM Server"}</span>
          </div>
          <div className="dicom-server-summary-details">
            <span><IonIcon icon={serverOutline} /> {server?.ips || "IP unavailable"}</span>
            <span><IonIcon icon={settingsOutline} /> Port {server?.port || "-"}</span>
            <span><IonIcon icon={personOutline} /> AE {server?.callingAETitle || server?.calledAETitle || "-"}</span>
          </div>
        </section>

        <div className="dicom-upload-list">
          {!loading && mergedFiles.length === 0 ? (
            <div className="w-full text-center text-gray-500 py-8">No Files Found</div>
          ) : (
            mergedFiles.map((file, index) => {
              const isLocalItem = Boolean(file.isLocalUpload);
              const patientName = file.patient_name || file.localUpload?.patientName || "Unknown patient";
              const patientId = file.patient_id || file.localUpload?.patientId || "-";
              const instanceId = file.instance_id || file.localUpload?.instanceId || "-";
              const uploadedAt = file.uploaded_at || file.created_at || file.updated_at || file.localUpload?.uploadedAt;
              const imageCount = Math.max(1, Number(file.total_frames) || file.frames?.length || file.instance_count || file.image_count || 1);
              const openItem = () => {
                if (isLocalItem) {
                  void openLocalDicomViewer(file.localUpload);
                  return;
                }
                handleImageClick(file);
              };
              return (
                <div key={file.series_id ?? index} className="dicom-upload-row" onClick={openItem}>
                  <span className="dicom-upload-icon"><IonIcon icon={personOutline} /></span>
                  <div className="dicom-upload-info">
                    <p className="dicom-upload-patient">{patientName}</p>
                    <p className="dicom-upload-meta">Patient ID: {patientId}</p>
                    <p className="dicom-upload-meta dicom-upload-instance">Instance ID: {instanceId}</p>
                    <div className="dicom-upload-series-meta">
                      <span><IonIcon icon={calendarOutline} /> {formatUsDateTime(uploadedAt)}</span>
                      <span><IonIcon icon={imagesOutline} /> {imageCount} {imageCount === 1 ? "image" : "images"}</span>
                    </div>
                  </div>
                  {!isLocalItem && (
                    <IonButton fill="clear" aria-label="Delete upload" onClick={(event) => {
                      event.stopPropagation();
                      handleDeleteClick(file.series_id);
                    }} className="dicom-upload-delete">
                      <IonIcon icon={trashOutline} />
                    </IonButton>
                  )}
                  <IonIcon icon={chevronForwardOutline} className="dicom-upload-chevron" />
                </div>
              );
            })
          )}
        </div>

        <IonInfiniteScroll
          threshold="100px"
          disabled={!hasMore}
          onIonInfinite={async (e) => {
            await loadMoreImages();
            (e.target as HTMLIonInfiniteScrollElement).complete();
          }}
        >
          <IonInfiniteScrollContent loadingText="Loading more images..." />
        </IonInfiniteScroll>

        {/* Modal Preview */}
        <IonModal isOpen={!!viewerRecord} onDidDismiss={closeDicomViewer}>
          <IonHeader>
            <IonToolbar className="custom-toolbar">
              <IonButtons slot="start">
                <IonButton onClick={closeDicomViewer}>Close</IonButton>
              </IonButtons>
              <IonTitle className="text-center text-white dicom-bg">DICOM Image Viewer</IonTitle>
            </IonToolbar>
          </IonHeader>
          <IonContent className="dicom-viewer-content">
            {viewerLoading && <div className="dicom-viewer-status"><IonSpinner name="crescent" /> Retrieving DICOM image from PACS...</div>}
            {viewerError && <div className="dicom-viewer-status dicom-viewer-error">{viewerError}</div>}
            {viewerImageUrl && (
              <div className="dicom-image-viewer">
                <DicomImageViewer imageUrl={viewerImageUrl} onReady={setDicomControls} onError={setViewerError} />
                <div className="dicom-toolbox">
                  <IonButton fill="clear" title="Zoom out" onClick={() => dicomControls?.zoomOut()}><IonIcon icon={removeOutline} /></IonButton>
                  <IonButton fill="clear" title="Zoom in" onClick={() => dicomControls?.zoomIn()}><IonIcon icon={addOutline} /></IonButton>
                  <IonButton fill="clear" title="Decrease window" onClick={() => dicomControls?.changeWindow(-50, 0)}><IonIcon icon={contrastOutline} /></IonButton>
                  <IonButton fill="clear" title="Increase window" onClick={() => dicomControls?.changeWindow(50, 0)}><IonIcon icon={colorFilterOutline} /></IonButton>
                  <IonButton fill="clear" title="Invert image" onClick={() => dicomControls?.invert()}><IonIcon icon={syncOutline} /></IonButton>
                  <IonButton fill="clear" title="Rotate image" onClick={() => dicomControls?.rotate()}><IonIcon icon={refreshOutline} /></IonButton>
                  <IonButton fill="clear" title="Flip horizontally" onClick={() => dicomControls?.flipHorizontal()}><IonIcon icon={swapHorizontalOutline} /></IonButton>
                  <IonButton fill="clear" title="Flip vertically" onClick={() => dicomControls?.flipVertical()}><IonIcon icon={swapVerticalOutline} /></IonButton>
                  <IonButton fill="clear" title="Reset image" onClick={() => dicomControls?.reset()}><IonIcon icon={contractOutline} /></IonButton>
                </div>
              </div>
            )}
          </IonContent>
        </IonModal>

        <IonModal isOpen={showModal} onDidDismiss={handleModalDismiss}>
          <IonHeader>
            <IonToolbar className="custom-toolbar">
              <IonButtons slot="start">
                <IonButton onClick={handleModalDismiss}>Close</IonButton>
              </IonButtons>
              <IonTitle className="text-center text-white dicom-bg">
                {previewType === "pdf"
                  ? "PDF Viewer"
                  : previewType === "dicom"
                    ? "DICOM Viewer"
                    : previewType === "video"
                      ? "Video Viewer"
                      : previewType === "frames"
                        ? "Dicom Viewer"
                        : "Image Viewer"}
              </IonTitle>
              {((previewType === "image" && previewUrl) ||
                (previewType === "video" && previewUrl) ||
                (previewType === "frames" && frameList.length > 0)) && (
                  <div className="header-zoom-badge" slot="end">
                    {Math.round(zoom * 100)}%
                  </div>
                )}
              {previewType === "pdf" && previewUrl && (
                <IonButton
                  slot="end"
                  fill="clear"
                  onClick={() => window.open(previewUrl, "_blank", "noopener,noreferrer")}
                >
                  <IonIcon icon={openOutline} />
                </IonButton>
              )}
            </IonToolbar>

            {/* ---- Patient details bar — shown for every preview type ---- */}
            {previewPatient && (previewPatient.patient_name || previewPatient.patient_id) && (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "4px 16px",
                  padding: "8px 14px",
                  background: "#0f172a",
                  borderTop: "1px solid rgba(255,255,255,0.08)",
                  borderBottom: "1px solid rgba(255,255,255,0.08)",
                  color: "#e2e8f0",
                  fontSize: "12.5px",
                  lineHeight: 1.5,
                }}
              >
                <span style={{ fontWeight: 600, color: "#ffffff" }}>
                  {previewPatient.patient_name || "Unknown Patient"}
                </span>
                <span>ID: {previewPatient.patient_id || "N/A"}</span>
                <span>Sex: {formatSex(previewPatient.sex)}</span>
                <span>
                  DOB: {formatDicomDate(previewPatient.date_of_birth)}
                  {calculateAge(previewPatient.date_of_birth) !== null
                    ? ` (${calculateAge(previewPatient.date_of_birth)} yrs)`
                    : ""}
                </span>
                <span>Study: {formatDicomDate(previewPatient.study_date)}</span>
                {previewPatient.modality && <span>Modality: {previewPatient.modality}</span>}
                {previewPatient.study_description && (
                  <span>Desc: {previewPatient.study_description}</span>
                )}
              </div>
            )}
          </IonHeader>

          <IonContent scrollY={false} className="viewer-body">

            {/* PDF VIEWER — loads the PDF directly (native browser renderer), no third-party viewer dependency */}
            {previewType === "pdf" && previewUrl ? (
              <div className="pdf-stage">
                {!pdfLoaded && !pdfFailed && (
                  <div className="pdf-loading">
                    <IonSpinner name="crescent" />
                    <p>Loading PDF...</p>
                  </div>
                )}

                {pdfFailed ? (
                  <div className="pdf-error">
                    <IonIcon icon={openOutline} className="pdf-error-icon" />
                    <p>Couldn't preview this PDF in-app.</p>
                    <IonButton
                      onClick={() => window.open(previewUrl, "_blank", "noopener,noreferrer")}
                    >
                      Open PDF
                    </IonButton>
                  </div>
                ) : (
                  <iframe
                    key={previewUrl}
                    src={previewUrl}
                    onLoad={() => {
                      setPdfLoaded(true);
                      setPdfFailed(false);

                      if (pdfTimeoutRef.current) {
                        clearTimeout(pdfTimeoutRef.current);
                      }
                    }}
                  />
                )}
              </div>

            ) : previewType === "video" ? (

              /* ---------------- PROFESSIONAL VIDEO PLAYER (real video files) ---------------- */
              <div
                ref={videoWrapperRef}
                className={`video-viewer-wrapper ${isFullscreen ? "is-fullscreen" : ""}`}
                onMouseMove={() => revealControls()}
              >
                {previewUrl ? (
                  <>
                    <div
                      ref={viewerStageRef}
                      className="video-viewer-stage"
                      style={{ cursor: zoom > 1 ? (isDragging ? "grabbing" : "grab") : "default" }}
                      onMouseDown={handleMouseDown}
                      onMouseMove={handleMouseMove}
                      onMouseUp={handleMouseUp}
                      onMouseLeave={handleMouseUp}
                      onDoubleClick={handleDoubleClick}
                      onClick={handleStageClick}
                    >
                      <video
                        ref={mediaRef as React.RefObject<HTMLVideoElement>}
                        src={previewUrl}
                        playsInline
                        className="viewer-video"
                        style={{
                          transform: `translate(${position.x}px, ${position.y}px) scale(${zoom})`,
                          transition: isDragging ? "none" : "transform 0.2s ease",
                        }}
                        onLoadedMetadata={(e) => setDuration((e.target as HTMLVideoElement).duration || 0)}
                        onTimeUpdate={(e) => setCurrentTime((e.target as HTMLVideoElement).currentTime)}
                        onPlay={() => { setIsPlaying(true); revealControls(); }}
                        onPause={() => { setIsPlaying(false); revealControls(false); }}
                        onEnded={() => { setIsPlaying(false); revealControls(false); }}
                        onWaiting={() => setIsBuffering(true)}
                        onPlaying={() => setIsBuffering(false)}
                        onVolumeChange={(e) => {
                          const v = e.target as HTMLVideoElement;
                          setVolume(v.volume);
                          setIsMuted(v.muted);
                        }}
                      />

                      {isBuffering && (
                        <div className="video-buffering">
                          <IonSpinner name="crescent" />
                        </div>
                      )}

                      {!isPlaying && !isBuffering && (
                        <button
                          className="video-center-play"
                          aria-label={isPlaying ? "Pause" : "Play"}
                          onClick={(e) => { e.stopPropagation(); togglePlay(); }}
                        >
                          <IonIcon icon={playOutline} />
                        </button>
                      )}

                      {zoom === 1 && showVideoControls && (
                        <div className="zoom-hint">Pinch or double-tap to zoom</div>
                      )}
                    </div>

                    {/* Custom control bar */}
                    <div className={`video-controls ${showVideoControls ? "visible" : "hidden"}`}>
                      <input
                        type="range"
                        className="video-seek"
                        min={0}
                        max={duration || 0}
                        step={0.1}
                        value={Math.min(currentTime, duration || 0)}
                        onChange={handleSeek}
                        onMouseDown={() => revealControls(false)}
                        onMouseUp={() => revealControls()}
                        aria-label="Seek"
                      />

                      <div className="video-controls-row">
                        <button className="video-ctrl-btn" onClick={togglePlay} aria-label={isPlaying ? "Pause" : "Play"}>
                          <IonIcon icon={isPlaying ? pauseOutline : playOutline} />
                        </button>

                        <span className="video-time">
                          {formatTime(currentTime)} / {formatTime(duration)}
                        </span>

                        <div className="video-volume-group">
                          <button className="video-ctrl-btn" onClick={toggleMute} aria-label={isMuted ? "Unmute" : "Mute"}>
                            <IonIcon
                              icon={
                                isMuted || volume === 0
                                  ? volumeMuteOutline
                                  : volume < 0.5
                                    ? volumeMediumOutline
                                    : volumeHighOutline
                              }
                            />
                          </button>
                          <input
                            type="range"
                            className="video-volume-slider"
                            min={0}
                            max={1}
                            step={0.05}
                            value={isMuted ? 0 : volume}
                            onChange={handleVolumeChange}
                            aria-label="Volume"
                          />
                        </div>

                        <div className="video-spacer" />

                        <button
                          className="video-ctrl-btn"
                          onClick={() => applyZoom(zoomRef.current - 0.5)}
                          disabled={zoom <= IMG_MIN_ZOOM}
                          aria-label="Zoom out"
                        >
                          <IonIcon icon={removeOutline} />
                        </button>
                        <span className="video-zoom-value">{Math.round(zoom * 100)}%</span>
                        <button
                          className="video-ctrl-btn"
                          onClick={() => applyZoom(zoomRef.current + 0.5)}
                          disabled={zoom >= IMG_MAX_ZOOM}
                          aria-label="Zoom in"
                        >
                          <IonIcon icon={addOutline} />
                        </button>
                        <button
                          className="video-ctrl-btn"
                          onClick={resetZoom}
                          disabled={zoom === 1 && position.x === 0 && position.y === 0}
                          aria-label="Reset zoom"
                        >
                          <IonIcon icon={refreshOutline} />
                        </button>

                        <button className="video-ctrl-btn" onClick={toggleFullscreen} aria-label="Fullscreen">
                          <IonIcon icon={isFullscreen ? contractOutline : expandOutline} />
                        </button>
                      </div>
                    </div>
                  </>
                ) : null}
              </div>

            ) : previewType === "frames" ? (

              /* ---------------- FRAME CINE PLAYER ----------------
               * YouTube-style layout: big autoplaying frame on top,
               * a persistent control bar, and a scrollable filmstrip
               * of every frame below it — click any thumbnail to jump
               * straight to that frame. Click/tap the main image, or
               * pinch/double-tap it, to zoom in and out.
               * ---------------------------------------------------- */
              <div
                ref={videoWrapperRef}
                className={`frame-cine-wrapper ${isFullscreen ? "is-fullscreen" : ""}`}
              >
                {frameList.length > 0 ? (
                  <>
                    <div
                      ref={viewerStageRef}
                      className="video-viewer-stage frame-cine-stage"
                      style={{ cursor: zoom > 1 ? (isDragging ? "grabbing" : "grab") : "zoom-in" }}
                      onMouseDown={handleMouseDown}
                      onMouseMove={handleMouseMove}
                      onMouseUp={handleMouseUp}
                      onMouseLeave={handleMouseUp}
                      onClick={handleFrameStageClick}
                    >
                      {/* Double-buffered frame layers — both stay mounted; only opacity
                          swaps, so playback never remounts/re-decodes the DOM node and
                          never shows a blank gap between frames. */}
                      <img
                        ref={frontFrameLayer === "a" ? (mediaRef as React.RefObject<HTMLImageElement>) : undefined}
                        src={frameLayerSrc.a}
                        alt={`frame ${currentFrameIndex + 1} of ${frameList.length}`}
                        draggable={false}
                        className={`viewer-video frame-layer ${frontFrameLayer === "a" ? "frame-layer-visible" : "frame-layer-hidden"}`}
                        style={{
                          transform: `translate(${position.x}px, ${position.y}px) scale(${zoom})`,
                          transition: isDragging ? "none" : "transform 0.2s ease",
                        }}
                        onLoad={() => handleFrameLayerLoad("a")}
                      />
                      <img
                        ref={frontFrameLayer === "b" ? (mediaRef as React.RefObject<HTMLImageElement>) : undefined}
                        src={frameLayerSrc.b}
                        alt=""
                        aria-hidden="true"
                        draggable={false}
                        className={`viewer-video frame-layer ${frontFrameLayer === "b" ? "frame-layer-visible" : "frame-layer-hidden"}`}
                        style={{
                          transform: `translate(${position.x}px, ${position.y}px) scale(${zoom})`,
                          transition: isDragging ? "none" : "transform 0.2s ease",
                        }}
                        onLoad={() => handleFrameLayerLoad("b")}
                      />

                      {zoom === 1 && (
                        <div className="zoom-hint">Tap image to zoom · pinch to zoom</div>
                      )}
                    </div>

                    {/* Persistent cine control bar (always visible, sits under the image) */}
                    <div className="frame-controls-bar">
                      <input
                        type="range"
                        className="frame-seek"
                        min={0}
                        max={Math.max(frameList.length - 1, 0)}
                        step={1}
                        value={currentFrameIndex}
                        onChange={handleFrameSeek}
                        aria-label="Frame"
                      />

                      <div className="frame-controls-row">
                        <button className="frame-ctrl-btn" onClick={() => stepFrame(-1)} aria-label="Previous frame">
                          <IonIcon icon={playSkipBackOutline} />
                        </button>
                        <button className="frame-ctrl-btn" onClick={toggleFramePlay} aria-label={isFramePlaying ? "Pause" : "Play"}>
                          <IonIcon icon={isFramePlaying ? pauseOutline : playOutline} />
                        </button>
                        <button className="frame-ctrl-btn" onClick={() => stepFrame(1)} aria-label="Next frame">
                          <IonIcon icon={playSkipForwardOutline} />
                        </button>

                        <span className="frame-time">
                          {currentFrameIndex + 1} / {frameList.length}
                        </span>

                        <div className="frame-spacer" />

                        <select
                          className="frame-speed-select"
                          value={frameFps}
                          onChange={(e) => setFrameFps(parseInt(e.target.value, 10))}
                          aria-label="Playback speed"
                        >
                          <option value={2}>2 fps</option>
                          <option value={3}>3 fps</option>
                          <option value={5}>5 fps</option>
                          <option value={8}>8 fps</option>
                          <option value={10}>10 fps</option>
                          <option value={15}>15 fps</option>
                          <option value={24}>24 fps</option>
                        </select>

                        <button
                          className="frame-ctrl-btn"
                          onClick={() => applyZoom(zoomRef.current - 0.5)}
                          disabled={zoom <= IMG_MIN_ZOOM}
                          aria-label="Zoom out"
                        >
                          <IonIcon icon={removeOutline} />
                        </button>
                        <span className="frame-zoom-value">{Math.round(zoom * 100)}%</span>
                        <button
                          className="frame-ctrl-btn"
                          onClick={() => applyZoom(zoomRef.current + 0.5)}
                          disabled={zoom >= IMG_MAX_ZOOM}
                          aria-label="Zoom in"
                        >
                          <IonIcon icon={addOutline} />
                        </button>
                        <button
                          className="frame-ctrl-btn"
                          onClick={resetZoom}
                          disabled={zoom === 1 && position.x === 0 && position.y === 0}
                          aria-label="Reset zoom"
                        >
                          <IonIcon icon={refreshOutline} />
                        </button>

                        <button className="frame-ctrl-btn" onClick={toggleFullscreen} aria-label="Fullscreen">
                          <IonIcon icon={isFullscreen ? contractOutline : expandOutline} />
                        </button>
                      </div>
                    </div>

                    {/* Filmstrip — every frame in the series, click to jump straight to it */}
                    <div className="frame-filmstrip">
                      <button
                        className="filmstrip-nav-btn"
                        onClick={() => scrollFilmstrip(-1)}
                        aria-label="Scroll thumbnails left"
                      >
                        <IonIcon icon={chevronBackOutline} />
                      </button>

                      <div className="filmstrip-track" ref={filmstripRef}>
                        {frameList.map((f, idx) => (
                          <button
                            key={f.instance_id ?? idx}
                            type="button"
                            data-frame-index={idx}
                            className={`filmstrip-thumb ${idx === currentFrameIndex ? "active" : ""}`}
                            onClick={() => handleThumbnailClick(idx)}
                            aria-label={`Go to frame ${idx + 1}`}
                          >
                            <img src={f.image} alt={`frame ${idx + 1} thumbnail`} loading="lazy" />
                            <span className="filmstrip-thumb-index">{idx + 1}</span>
                          </button>
                        ))}
                      </div>

                      <button
                        className="filmstrip-nav-btn"
                        onClick={() => scrollFilmstrip(1)}
                        aria-label="Scroll thumbnails right"
                      >
                        <IonIcon icon={chevronForwardOutline} />
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="pdf-error">
                    <p>No frames available for this series.</p>
                  </div>
                )}
              </div>

            ) : previewType === "image" && previewUrl ? (

              <div className="image-viewer-wrapper">
                <div
                  ref={viewerStageRef}
                  className="image-viewer-stage"
                  style={{ cursor: zoom > 1 ? (isDragging ? "grabbing" : "grab") : "default" }}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                  onDoubleClick={handleDoubleClick}
                >
                  <img
                    ref={mediaRef as React.RefObject<HTMLImageElement>}
                    src={previewUrl}
                    alt="preview"
                    draggable={false}
                    className="viewer-image"
                    style={{
                      transform: `translate(${position.x}px, ${position.y}px) scale(${zoom})`,
                      transition: isDragging ? "none" : "transform 0.2s ease",
                    }}
                  />

                  {zoom === 1 && (
                    <div className="zoom-hint">Pinch or double-tap to zoom</div>
                  )}
                </div>

                {/* Bottom frosted toolbar — safe-area aware, can never clip */}
                <div className="zoom-toolbar">
                  <button
                    className="zoom-toolbar-btn"
                    onClick={() => applyZoom(zoomRef.current - 0.5)}
                    disabled={zoom <= IMG_MIN_ZOOM}
                    aria-label="Zoom out"
                  >
                    <IonIcon icon={removeOutline} />
                  </button>

                  <span className="zoom-toolbar-value">{Math.round(zoom * 100)}%</span>

                  <button
                    className="zoom-toolbar-btn"
                    onClick={() => applyZoom(zoomRef.current + 0.5)}
                    disabled={zoom >= IMG_MAX_ZOOM}
                    aria-label="Zoom in"
                  >
                    <IonIcon icon={addOutline} />
                  </button>

                  <div className="zoom-toolbar-divider" />

                  <button
                    className="zoom-toolbar-btn"
                    onClick={resetZoom}
                    disabled={zoom === 1 && position.x === 0 && position.y === 0}
                    aria-label="Reset zoom"
                  >
                    <IonIcon icon={refreshOutline} />
                  </button>
                </div>
              </div>

            ) : previewType === "dicom" ? (
              <div className="dicom-placeholder">
                <IonImg
                  src="https://cdn-icons-png.flaticon.com/512/3374/3374411.png"
                  alt="DICOM Preview"
                  className="dicom-icon"
                />
                <p className="text-center text-gray-500 mt-2">
                  DICOM viewer not supported in preview
                </p>
              </div>
            ) : (
              <p className="text-red-600 text-center mt-4">Failed to load preview.</p>
            )}
          </IonContent>
        </IonModal>

        <IonAlert
          isOpen={showConfirm}
          onDidDismiss={() => setShowConfirm(false)}
          header="Confirm Delete"
          message="Are you sure you want to delete this series? All frames in it will be removed."
          buttons={[
            { text: "Cancel", role: "cancel" },
            { text: "Delete", handler: confirmDelete },
          ]}
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

export default ImageListPage;