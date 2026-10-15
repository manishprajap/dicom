import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  IonContent,
  IonPage,
  IonHeader,
  IonToolbar,
  IonButtons,
  IonBackButton,
  IonTitle,
  IonLoading,
  IonButton,
  IonIcon,
  IonCard,
  IonCardContent,
  IonModal,
  IonAlert,
  IonToast,
  IonPopover,
} from "@ionic/react";
import {
  logoGoogle,
  logOutOutline,
  cloudUploadOutline,
  documentAttachOutline,
  eyeOutline,
  trashOutline,
  imageOutline,
  videocamOutline,
  documentOutline,
  removeOutline,
  addOutline,
  refreshOutline,
  folderOutline,
  folderOpenOutline,
  personCircleOutline,
  chevronDownOutline,
  chevronBackOutline,
} from "ionicons/icons";
import { useHistory } from "react-router-dom";
import { GoogleAuth } from "@codetrix-studio/capacitor-google-auth";
import cornerstone from "cornerstone-core";
import cornerstoneWADOImageLoader from "cornerstone-wado-image-loader";
import dicomParser from "dicom-parser";
import AppFooter from "../components/AppFooter";

/* ---------------- File type helpers (same pattern as SmbImages) ---------------- */

const IMG_EXT = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "heic"];
const VID_EXT = ["mp4", "mov", "mkv", "webm", "3gp", "avi"];
const PDF_EXT = ["pdf"];
const DICOM_EXT = ["dcm", "dicom"];
const FOLDER_MIME = "application/vnd.google-apps.folder";

const IMG_MIN_ZOOM = 1;
const IMG_MAX_ZOOM = 4;
const DOUBLE_TAP_ZOOM = 2.5;
const DOUBLE_TAP_DELAY = 280; // ms

// DICOM viewer gesture constants (cornerstone uses its own scale/translation
// system, not CSS transforms, so these are separate from the plain-image ones)
const DICOM_MIN_SCALE_MULT = 0.25; // relative to "fit to window" scale
const DICOM_MAX_SCALE_MULT = 8;
const DICOM_DOUBLE_TAP_SCALE_MULT = 2.5;
const DICOM_DOUBLE_TAP_DELAY = 280;

function extOf(name: string) {
  const p = (name || "").split(".");
  return (p.length > 1 ? p[p.length - 1] : "").toLowerCase();
}

function fileType(name: string, mimeType?: string) {
  if (mimeType === FOLDER_MIME) return "folder";
  const e = extOf(name);
  if (mimeType === "application/dicom" || DICOM_EXT.includes(e)) return "dicom";
  if (IMG_EXT.includes(e) || (mimeType || "").startsWith("image/")) return "image";
  if (VID_EXT.includes(e) || (mimeType || "").startsWith("video/")) return "video";
  if (PDF_EXT.includes(e) || mimeType === "application/pdf") return "pdf";
  return "other";
}

// ✅ Cornerstone setup (same pattern as the SMB file browser)
cornerstoneWADOImageLoader.external.cornerstone = cornerstone;
cornerstoneWADOImageLoader.external.dicomParser = dicomParser;
cornerstoneWADOImageLoader.configure({
  useWebWorkers: true,
  decodeConfig: { convertFloatPixelDataToInt: false },
});

/* ------------------------------------------------------------------------
 * Thumbnail fetch cache + concurrency limiter (ported from SmbImages).
 * Without this, every thumbnail (image/video/pdf/dicom) would call the
 * Drive API the instant the grid renders — a folder with 20 files means
 * 20 simultaneous "alt=media" downloads, and re-fetching the same file
 * every time you revisit the page.
 * ---------------------------------------------------------------------- */
const driveThumbCache = new Map<string, string>(); // fileId -> blob: URL
const MAX_CONCURRENT_THUMB_DOWNLOADS = 3;
let activeThumbDownloads = 0;
const thumbDownloadQueue: Array<() => void> = [];

function runQueuedThumbTask<T>(task: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const run = () => {
      activeThumbDownloads++;
      task()
        .then(resolve, reject)
        .finally(() => {
          activeThumbDownloads--;
          const next = thumbDownloadQueue.shift();
          if (next) next();
        });
    };

    if (activeThumbDownloads < MAX_CONCURRENT_THUMB_DOWNLOADS) {
      run();
    } else {
      thumbDownloadQueue.push(run);
    }
  });
}

/** Cached + queued Drive file download -> blob: URL, reused by every thumbnail
 *  component below as well as by the full preview modal. */
async function getDriveFileUri(token: string, fileId: string): Promise<string> {
  const cached = driveThumbCache.get(fileId);
  if (cached) return cached;

  const blobUrl = await runQueuedThumbTask(async () => {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) throw new Error(`Drive fetch failed (${res.status})`);
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  });

  driveThumbCache.set(fileId, blobUrl);
  return blobUrl;
}

export interface DicomViewerHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  reset: () => void;
}

interface DicomViewerProps {
  imageId: string;
  /** Called with the current zoom as a percentage of "fit to window" (100 = fit) */
  onZoomChange?: (zoomPct: number) => void;
}

const DicomViewer = forwardRef<DicomViewerHandle, DicomViewerProps>(
  ({ imageId, onZoomChange }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const elementRef = useRef<HTMLDivElement>(null);
    const enabledRef = useRef(false);
    const baseScaleRef = useRef(1); // "fit to window" scale === 100%

    const lastTouchDistance = useRef<number | null>(null);
    const isDraggingRef = useRef(false);
    const dragStartRef = useRef({ x: 0, y: 0 });
    const dragStartTranslationRef = useRef({ x: 0, y: 0 });
    const lastTapRef = useRef(0);

    const getViewport = () => {
      if (!elementRef.current || !enabledRef.current) return null;
      try {
        return cornerstone.getViewport(elementRef.current);
      } catch {
        return null;
      }
    };

    const applyViewport = (vp: any) => {
      if (!elementRef.current || !enabledRef.current) return;
      try {
        cornerstone.setViewport(elementRef.current, vp);
        const pct = Math.round((vp.scale / baseScaleRef.current) * 100);
        onZoomChange?.(pct);
      } catch {
        // element may not be enabled yet — ignore
      }
    };

    const clampScale = (scale: number) =>
      Math.min(
        Math.max(scale, baseScaleRef.current * DICOM_MIN_SCALE_MULT),
        baseScaleRef.current * DICOM_MAX_SCALE_MULT
      );

    const zoomTo = (scale: number) => {
      const vp = getViewport();
      if (!vp) return;
      vp.scale = clampScale(scale);
      if (vp.scale <= baseScaleRef.current) {
        vp.translation = { x: 0, y: 0 };
      }
      applyViewport(vp);
    };

    useImperativeHandle(ref, () => ({
      zoomIn: () => {
        const vp = getViewport();
        if (!vp) return;
        zoomTo(vp.scale + baseScaleRef.current * 0.5);
      },
      zoomOut: () => {
        const vp = getViewport();
        if (!vp) return;
        zoomTo(vp.scale - baseScaleRef.current * 0.5);
      },
      reset: () => {
        zoomTo(baseScaleRef.current);
      },
    }));

    /** Wait until the element has a real, non-zero size before touching cornerstone. */
    const waitForSize = (el: HTMLElement) =>
      new Promise<void>((resolve) => {
        const check = () => {
          if (el.clientWidth > 0 && el.clientHeight > 0) {
            resolve();
          } else {
            requestAnimationFrame(check);
          }
        };
        check();
      });

    const loadDicom = useCallback(async () => {
      if (!elementRef.current || !imageId) return;
      const el = elementRef.current;

      try {
        await waitForSize(el);

        if (!enabledRef.current) {
          cornerstone.enable(el);
          enabledRef.current = true;
        }

        const image = await cornerstone.loadImage(imageId);
        cornerstone.displayImage(el, image);

        // Fit the image to the current viewport and remember that scale
        // as our "100%" baseline for zoom calculations.
        cornerstone.fitToWindow(el);
        const vp = cornerstone.getViewport(el);
        baseScaleRef.current = vp.scale || 1;
        onZoomChange?.(100);
      } catch (err) {
        console.error("❌ DICOM load failed:", err);
      }
    }, [imageId]);

    useEffect(() => {
      loadDicom();

      const el = elementRef.current;
      const onResize = () => {
        if (el && enabledRef.current) {
          try {
            cornerstone.resize(el, true);
          } catch {
            // ignore
          }
        }
      };
      window.addEventListener("resize", onResize);

      let resizeObserver: ResizeObserver | null = null;
      if (containerRef.current && "ResizeObserver" in window) {
        resizeObserver = new ResizeObserver(() => onResize());
        resizeObserver.observe(containerRef.current);
      }

      return () => {
        window.removeEventListener("resize", onResize);
        resizeObserver?.disconnect();
        if (el && enabledRef.current) {
          try {
            cornerstone.disable(el);
          } catch {
            // element already torn down — safe to ignore
          } finally {
            enabledRef.current = false;
          }
        }
      };
    }, [loadDicom]);

    // ---- Gestures: pinch-zoom / pan / double-tap (touch) + wheel / dblclick (desktop) ----
    useEffect(() => {
      const el = elementRef.current;
      if (!el) return;

      const onTouchStart = (e: TouchEvent) => {
        if (e.touches.length === 2) {
          const dx = e.touches[0].clientX - e.touches[1].clientX;
          const dy = e.touches[0].clientY - e.touches[1].clientY;
          lastTouchDistance.current = Math.sqrt(dx * dx + dy * dy);
          isDraggingRef.current = false;
        } else if (e.touches.length === 1) {
          const now = Date.now();
          const sinceLastTap = now - lastTapRef.current;
          lastTapRef.current = now;

          if (sinceLastTap < DICOM_DOUBLE_TAP_DELAY) {
            const vp = getViewport();
            if (vp) {
              const isZoomed = vp.scale > baseScaleRef.current * 1.05;
              zoomTo(
                isZoomed
                  ? baseScaleRef.current
                  : baseScaleRef.current * DICOM_DOUBLE_TAP_SCALE_MULT
              );
            }
            isDraggingRef.current = false;
            return;
          }

          const vp = getViewport();
          if (vp && vp.scale > baseScaleRef.current * 1.02) {
            isDraggingRef.current = true;
            dragStartRef.current = {
              x: e.touches[0].clientX,
              y: e.touches[0].clientY,
            };
            dragStartTranslationRef.current = { ...vp.translation };
          }
        }
      };

      const onTouchMove = (e: TouchEvent) => {
        e.preventDefault();

        if (e.touches.length === 2 && lastTouchDistance.current !== null) {
          const dx = e.touches[0].clientX - e.touches[1].clientX;
          const dy = e.touches[0].clientY - e.touches[1].clientY;
          const newDist = Math.sqrt(dx * dx + dy * dy);
          const scaleFactor = newDist / lastTouchDistance.current;
          const vp = getViewport();
          if (vp) {
            zoomTo(vp.scale * scaleFactor);
          }
          lastTouchDistance.current = newDist;
        } else if (e.touches.length === 1 && isDraggingRef.current) {
          const vp = getViewport();
          if (!vp) return;
          const dxScreen = e.touches[0].clientX - dragStartRef.current.x;
          const dyScreen = e.touches[0].clientY - dragStartRef.current.y;
          vp.translation = {
            x: dragStartTranslationRef.current.x + dxScreen / vp.scale,
            y: dragStartTranslationRef.current.y + dyScreen / vp.scale,
          };
          applyViewport(vp);
        }
      };

      const onTouchEnd = () => {
        lastTouchDistance.current = null;
        isDraggingRef.current = false;
      };

      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        const vp = getViewport();
        if (!vp) return;
        const delta = e.deltaY > 0 ? -0.15 : 0.15;
        zoomTo(vp.scale * (1 + delta));
      };

      const onDoubleClick = () => {
        const vp = getViewport();
        if (!vp) return;
        const isZoomed = vp.scale > baseScaleRef.current * 1.05;
        zoomTo(
          isZoomed
            ? baseScaleRef.current
            : baseScaleRef.current * DICOM_DOUBLE_TAP_SCALE_MULT
        );
      };

      el.addEventListener("touchstart", onTouchStart, { passive: false });
      el.addEventListener("touchmove", onTouchMove, { passive: false });
      el.addEventListener("touchend", onTouchEnd);
      el.addEventListener("wheel", onWheel, { passive: false });
      el.addEventListener("dblclick", onDoubleClick);

      return () => {
        el.removeEventListener("touchstart", onTouchStart);
        el.removeEventListener("touchmove", onTouchMove);
        el.removeEventListener("touchend", onTouchEnd);
        el.removeEventListener("wheel", onWheel);
        el.removeEventListener("dblclick", onDoubleClick);
      };
    }, [imageId]);

    return (
      <div ref={containerRef} style={{ width: "100%", height: "100%", position: "relative" }}>
        <div
          ref={elementRef}
          style={{ width: "100%", height: "100%", background: "#000", touchAction: "none" }}
        />
      </div>
    );
  }
);

/** ✅ DICOM Thumbnail — downloads the Drive file, then renders it via DicomViewer */
const DicomThumbnail: React.FC<{ token: string; fileId: string }> = ({ token, fileId }) => {
  const [imageId, setImageId] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!token || !fileId) return;

    (async () => {
      try {
        const blobUri = await getDriveFileUri(token, fileId);
        if (cancelled) return;
        setImageId(`wadouri:${blobUri}`);
      } catch (err) {
        console.error("❌ DICOM thumbnail download failed:", err);
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, fileId]);

  if (failed) {
    return (
      <div className="file-badge-wrap">
        <div className="file-corner" />
        <div className="file-badge dcm-badge">DCM</div>
      </div>
    );
  }
  if (!imageId) return <div className="thumb-skeleton" />;

  return <DicomViewer imageId={imageId} />;
};

/** ✅ Image Thumbnail — downloads the Drive file and shows the actual picture.
 *  Uses an authenticated fetch (Bearer token) + blob: URL, same as DICOM/
 *  video/PDF below — a plain <img src="thumbnailLink"> can't attach an
 *  Authorization header, so Drive rejects it and the browser shows a
 *  broken-image icon instead. */
const ImageThumbnail: React.FC<{ token: string; fileId: string }> = ({ token, fileId }) => {
  const [uri, setUri] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!token || !fileId) return;

    (async () => {
      try {
        const blobUri = await getDriveFileUri(token, fileId);
        if (cancelled) return;
        setUri(blobUri);
      } catch (err) {
        console.error("❌ Image thumbnail download failed:", err);
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, fileId]);

  if (failed) return <IonIcon icon={imageOutline} className="file-type-icon" />;
  if (!uri) return <div className="thumb-skeleton" />;

  return <img src={uri} alt="" className="thumb-image" onError={() => setFailed(true)} />;
};

/** ✅ Video Thumbnail — downloads the clip, then grabs an actual frame onto a canvas. */
const VideoThumbnail: React.FC<{ token: string; fileId: string }> = ({ token, fileId }) => {
  const [uri, setUri] = useState<string | null>(null);
  const [frameUrl, setFrameUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    let cancelled = false;
    if (!token || !fileId) return;

    (async () => {
      try {
        const blobUri = await getDriveFileUri(token, fileId);
        if (cancelled) return;
        setUri(blobUri);
      } catch (err) {
        console.error("❌ Video thumbnail download failed:", err);
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, fileId]);

  const handleLoadedData = () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 200;
      canvas.height = video.videoHeight || 200;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        setFrameUrl(canvas.toDataURL("image/jpeg", 0.7));
      }
    } catch (err) {
      console.error("❌ Video frame capture failed:", err);
    }
  };

  if (failed) return <IonIcon icon={videocamOutline} className="file-type-icon" />;
  if (!uri) return <div className="thumb-skeleton" />;

  return (
    <div className="thumb-video-wrap">
      {frameUrl ? (
        <img src={frameUrl} alt="" className="thumb-image" />
      ) : (
        <video
          ref={videoRef}
          src={`${uri}#t=0.1`}
          muted
          playsInline
          preload="metadata"
          onLoadedData={handleLoadedData}
          onError={() => setFailed(true)}
          style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0, position: "absolute" }}
        />
      )}
      <IonIcon icon={videocamOutline} className="thumb-video-badge" />
    </div>
  );
};

/** ✅ PDF Thumbnail — downloads the file, renders first page via pdf.js. Falls
 *  back to the paper badge if pdfjs-dist isn't available or render fails. */
const pdfPageThumbCache = new Map<string, string>();

const PdfThumbnail: React.FC<{ token: string; fileId: string }> = ({ token, fileId }) => {
  const [pageUrl, setPageUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!token || !fileId) return;

    const cachedPage = pdfPageThumbCache.get(fileId);
    if (cachedPage) {
      setPageUrl(cachedPage);
      return;
    }

    (async () => {
      try {
        const blobUri = await getDriveFileUri(token, fileId);
        if (cancelled) return;

        // @ts-ignore — pdfjs-dist has no bundled TS types for this deep import path
        const pdfjsLib: any = await import("pdfjs-dist/build/pdf");
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.js",
          import.meta.url
        ).toString();

        const pdf = await pdfjsLib.getDocument(blobUri).promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 0.6 });

        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas 2D context unavailable");

        await page.render({ canvasContext: ctx, viewport }).promise;
        if (cancelled) return;
        const dataUrl = canvas.toDataURL("image/jpeg", 0.75);
        pdfPageThumbCache.set(fileId, dataUrl);
        setPageUrl(dataUrl);
      } catch (err) {
        console.error("❌ PDF thumbnail render failed:", err);
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, fileId]);

  if (failed || !pageUrl) {
    return (
      <div className="file-badge-wrap">
        <div className="file-corner" />
        <div className="file-badge">PDF</div>
      </div>
    );
  }

  return <img src={pageUrl} alt="" className="thumb-image thumb-pdf" />;
};

/** ✅ FolderThumbnail — simple folder icon tile for grid rows that are folders. */
const FolderThumbnail: React.FC = () => (
  <div className="folder-thumb-wrap">
    <IonIcon icon={folderOpenOutline} className="folder-icon" />
  </div>
);

/** ✅ FileThumbnail — single dispatcher used by the grid.
 *  NOTE: previously had a "fast path" that hotlinked item.thumbnailLink
 *  directly for images. Removed — Drive's thumbnailLink requires either a
 *  live Google session in-browser or a token attached to the request, and
 *  a plain <img src> can't attach an Authorization header, so those
 *  requests were failing and showing broken-image icons. All image
 *  thumbnails now go through the same authenticated blob-fetch path as
 *  DICOM/video/PDF. */
const FileThumbnail: React.FC<{ token: string; item: any }> = ({ token, item }) => {
  const type = fileType(item.name, item.mimeType);

  if (type === "folder") return <FolderThumbnail />;
  if (type === "dicom") return <DicomThumbnail token={token} fileId={item.id} />;
  if (type === "image") return <ImageThumbnail token={token} fileId={item.id} />;
  if (type === "video") return <VideoThumbnail token={token} fileId={item.id} />;
  if (type === "pdf") return <PdfThumbnail token={token} fileId={item.id} />;
  return <IonIcon icon={documentOutline} className="file-type-icon" />;
};

/* --------------------------------------------------------------------------- */

interface FolderRef {
  id: string;
  name: string;
}

const GoogleDrivePage: React.FC = () => {
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [driveFiles, setDriveFiles] = useState<any[]>([]);
  const [googleUser, setGoogleUser] = useState<any>(null);
  const [toast, setToast] = useState("");
  const history = useHistory();

  // Delete confirmation
  const [showConfirm, setShowConfirm] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any | null>(null);

  // New folder creation
  const [showNewFolderAlert, setShowNewFolderAlert] = useState(false);

  // Folder navigation ("My Drive" root, plus a back-stack of ancestor folders)
  const [currentFolder, setCurrentFolder] = useState<FolderRef>({ id: "root", name: "My Drive" });
  const [folderStack, setFolderStack] = useState<FolderRef[]>([]);

  // Preview modal (image / video / dicom)
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewType, setPreviewType] = useState<"image" | "video" | "pdf" | "dicom" | "other">("other");
  const [previewUri, setPreviewUri] = useState<string>("");
  const [previewName, setPreviewName] = useState<string>("");

  // Zoom & pan (ported) — for plain images
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);

  // Zoom state for the DICOM viewer (cornerstone viewport based)
  const [dicomZoom, setDicomZoom] = useState(100);
  const dicomViewerRef = useRef<DicomViewerHandle>(null);

  const imageViewerRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const lastTouchDistance = useRef<number | null>(null);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  const positionRef = useRef({ x: 0, y: 0 });
  const lastTapRef = useRef(0);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);
  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      GoogleAuth.initialize({
        scopes: ["profile", "email", "https://www.googleapis.com/auth/drive.file"],
        clientId: "75839040914-0ih63na107kheqhkgf853j1nb3huj2q2.apps.googleusercontent.com",
      });
    }
  }, []);

  /** Shared fetch-and-format helper for a given Drive folder id.
   *  Used both on fresh sign-in AND when restoring an existing session
   *  from localStorage — previously only sign-in called this, so coming
   *  back to the page with an already-saved session left driveFiles
   *  empty even though isSignedIn was true. */
  const fetchDriveFiles = async (token: string, folderId: string) => {
    const query = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,mimeType,thumbnailLink,webContentLink,createdTime)&orderBy=folder,name`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) throw new Error(`Drive fetch failed (${res.status})`);
    const data = await res.json();
    return (data.files || []).map((f: any) => ({
      id: f.id,
      name: f.name,
      url:
        f.mimeType === FOLDER_MIME
          ? `https://drive.google.com/drive/folders/${f.id}`
          : `https://drive.google.com/file/d/${f.id}/view`,
      thumbnailLink: f.thumbnailLink,
      uploadTime: f.createdTime ? new Date(f.createdTime).toLocaleString() : "",
      downloadLink: f.webContentLink,
      mimeType: f.mimeType,
    }));
  };

  const pickFile = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*,application/pdf,application/dicom,video/*,.dcm";
    input.onchange = (e: any) => {
      const selectedFile = e.target.files[0];
      if (selectedFile) setFile(selectedFile);
    };
    input.click();
  };

  const uploadToDrive = async () => {
    if (!file) return alert("Please select a file first.");
    const accessToken = googleUser?.authentication?.accessToken;
    if (!accessToken) return alert("Please sign in first.");

    setLoading(true);
    try {
      const initRes = await fetch(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json; charset=UTF-8",
            "X-Upload-Content-Type": file.type || "application/octet-stream",
            "X-Upload-Content-Length": file.size.toString(),
          },
          body: JSON.stringify({
            name: file.name,
            mimeType: file.type || "application/octet-stream",
            parents: [currentFolder.id],
          }),
        }
      );

      const uploadUrl = initRes.headers.get("Location");
      if (!uploadUrl) throw new Error("Failed to get upload URL");

      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });

      const uploadedFile = await uploadRes.json();

      await fetch(`https://www.googleapis.com/drive/v3/files/${uploadedFile.id}/permissions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ role: "reader", type: "anyone" }),
      });

      const infoRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${uploadedFile.id}?fields=id,name,mimeType,thumbnailLink,webContentLink,createdTime`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      const info = await infoRes.json();

      const formatted = {
        id: info.id,
        name: info.name,
        url: `https://drive.google.com/file/d/${info.id}/view`,
        thumbnailLink: info.thumbnailLink,
        uploadTime: new Date(info.createdTime).toLocaleString(),
        downloadLink: info.webContentLink,
        mimeType: info.mimeType,
      };

      setDriveFiles((prev) => [formatted, ...prev]);
      setToast("✅ File uploaded successfully!");
      setFile(null);
    } catch (err: any) {
      setToast("⚠️ Upload failed: " + (err.message || "Unknown error"));
    } finally {
      setLoading(false);
    }
  };

  /** Create a new folder inside the currently-open folder. */
  const createFolder = async (folderNameRaw: string) => {
    const folderName = (folderNameRaw || "").trim();
    if (!folderName) return;

    const token = googleUser?.authentication?.accessToken;
    if (!token) {
      setToast("Please sign in first.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("https://www.googleapis.com/drive/v3/files", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: folderName,
          mimeType: FOLDER_MIME,
          parents: [currentFolder.id],
        }),
      });
      if (!res.ok) throw new Error(`Folder creation failed (${res.status})`);
      const info = await res.json();

      const formatted = {
        id: info.id,
        name: info.name,
        url: `https://drive.google.com/drive/folders/${info.id}`,
        thumbnailLink: null,
        uploadTime: new Date().toLocaleString(),
        downloadLink: null,
        mimeType: FOLDER_MIME,
      };

      setDriveFiles((prev) => [formatted, ...prev]);
      setToast(`📁 "${info.name}" folder created.`);
    } catch (err: any) {
      setToast("⚠️ Folder creation failed: " + (err.message || "Unknown error"));
    } finally {
      setLoading(false);
    }
  };

  const signInToGoogle = async () => {
    setLoading(true);
    try {
      const user = await GoogleAuth.signIn();
      if (!user || !user.authentication?.accessToken) throw new Error("Sign-in failed: No access token");

      setGoogleUser(user);
      setIsSignedIn(true);
      localStorage.setItem("google_User", JSON.stringify(user));

      const token = user.authentication.accessToken;
      setCurrentFolder({ id: "root", name: "My Drive" });
      setFolderStack([]);

      const formatted = await fetchDriveFiles(token, "root");
      setDriveFiles(formatted);
    } catch (err: any) {
      console.error("❌ Google Sign-In Error:", err);
      setToast(err.message || "Sign-in failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // ✅ FIX: previously this only restored `isSignedIn`/`googleUser` from
  // localStorage and never re-fetched `driveFiles` — so navigating away
  // and back (e.g. Back button to dashboard, then back into this page)
  // left the page "signed in" but showing an empty file list. Now it
  // re-fetches the current folder's files using the saved token too.
  useEffect(() => {
    const saved = localStorage.getItem("google_User");
    if (!saved) return;

    let user: any;
    try {
      user = JSON.parse(saved);
    } catch {
      localStorage.removeItem("google_User");
      return;
    }

    setGoogleUser(user);
    setIsSignedIn(true);

    const token = user?.authentication?.accessToken;
    if (!token) return;

    setLoading(true);
    fetchDriveFiles(token, "root")
      .then((formatted) => {
        setDriveFiles(formatted);
      })
      .catch((err) => {
        console.error("❌ Failed to restore Drive files:", err);
        // Access token has very likely expired — ask the user to sign in again
        // instead of silently showing an empty list.
        setToast("Session expired. Please sign in again.");
        localStorage.removeItem("google_User");
        setIsSignedIn(false);
        setGoogleUser(null);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const logoutFromGoogle = async () => {
    try {
      await GoogleAuth.signOut();
      localStorage.removeItem("google_User");
      setIsSignedIn(false);
      setGoogleUser(null);
      setDriveFiles([]);
      setCurrentFolder({ id: "root", name: "My Drive" });
      setFolderStack([]);
    } catch {
      setToast("Logout failed");
    }
  };

  /** Clamp pan position so image can't be dragged fully out of view */
  const clampPosition = (pos: { x: number; y: number }, zoomLevel: number) => {
    const container = imageViewerRef.current;
    const imgEl = imgRef.current;
    if (!container || !imgEl) return pos;

    const containerRect = container.getBoundingClientRect();
    const baseW = imgEl.offsetWidth;
    const baseH = imgEl.offsetHeight;

    const scaledW = baseW * zoomLevel;
    const scaledH = baseH * zoomLevel;

    const maxX = Math.max((scaledW - containerRect.width) / 2, 0);
    const maxY = Math.max((scaledH - containerRect.height) / 2, 0);

    return {
      x: Math.min(Math.max(pos.x, -maxX), maxX),
      y: Math.min(Math.max(pos.y, -maxY), maxY),
    };
  };

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

  const toggleZoom = () => {
    if (zoomRef.current > 1) applyZoom(1);
    else applyZoom(DOUBLE_TAP_ZOOM);
  };

  useEffect(() => {
    if (!previewOpen || previewType !== "image") return;

    const timer = setTimeout(() => {
      const el = imageViewerRef.current;
      if (!el) return;

      const onTouchStart = (e: TouchEvent) => {
        if (e.touches.length === 2) {
          const dx = e.touches[0].clientX - e.touches[1].clientX;
          const dy = e.touches[0].clientY - e.touches[1].clientY;
          lastTouchDistance.current = Math.sqrt(dx * dx + dy * dy);
          isDraggingRef.current = false;
        } else if (e.touches.length === 1) {
          const now = Date.now();
          const sinceLastTap = now - lastTapRef.current;
          lastTapRef.current = now;

          if (sinceLastTap < DOUBLE_TAP_DELAY) {
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

          const clamped = nextZoom <= 1 ? { x: 0, y: 0 } : clampPosition(positionRef.current, nextZoom);
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

      const onTouchEnd = () => {
        lastTouchDistance.current = null;
        isDraggingRef.current = false;
        setIsDragging(false);

        if (zoomRef.current < 1) applyZoom(1);
      };

      el.addEventListener("touchstart", onTouchStart, { passive: false });
      el.addEventListener("touchmove", onTouchMove, { passive: false });
      el.addEventListener("touchend", onTouchEnd);

      return () => {
        el.removeEventListener("touchstart", onTouchStart);
        el.removeEventListener("touchmove", onTouchMove);
        el.removeEventListener("touchend", onTouchEnd);
      };
    }, 300);

    return () => clearTimeout(timer);
  }, [previewOpen, previewType]);

  const resetZoom = () => {
    zoomRef.current = 1;
    positionRef.current = { x: 0, y: 0 };
    setZoom(1);
    setPosition({ x: 0, y: 0 });
    setDicomZoom(100);
  };

  const handlePreviewDismiss = () => {
    // Only revoke blob URLs created fresh for THIS preview (image/video path
    // below always creates a brand-new object URL per open). DICOM URIs come
    // from the shared/cached getDriveFileUri() map, so they are NOT revoked
    // here — revoking them would break the cache for thumbnails/re-opens.
    if (previewType !== "dicom" && previewUri && previewUri.startsWith("blob:")) {
      URL.revokeObjectURL(previewUri);
    }
    setPreviewOpen(false);
    setPreviewUri("");
    resetZoom();
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom > 1) {
      setIsDragging(true);
      isDraggingRef.current = true;
      dragStartRef.current = { x: e.clientX - position.x, y: e.clientY - position.y };
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDraggingRef.current) {
      const rawPos = { x: e.clientX - dragStartRef.current.x, y: e.clientY - dragStartRef.current.y };
      const clamped = clampPosition(rawPos, zoomRef.current);
      setPosition(clamped);
      positionRef.current = clamped;
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    isDraggingRef.current = false;
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.3 : 0.3;
    applyZoom(zoomRef.current + delta);
  };

  const handleDoubleClick = () => toggleZoom();

  /** Navigate into a folder: fetch its contents, push the current folder onto
   *  the back-stack so "Back" can restore it. */
  const openFolder = async (item: any) => {
    const token = googleUser?.authentication?.accessToken;
    if (!token) {
      setToast("Session expired. Please sign in again.");
      return;
    }
    setLoading(true);
    try {
      const formatted = await fetchDriveFiles(token, item.id);
      setFolderStack((prev) => [...prev, currentFolder]);
      setCurrentFolder({ id: item.id, name: item.name });
      setDriveFiles(formatted);
    } catch (err: any) {
      setToast("⚠️ Unable to open folder: " + (err.message || "Unknown error"));
    } finally {
      setLoading(false);
    }
  };

  /** Go back up to the parent folder from the back-stack. */
  const goBackFolder = async () => {
    if (folderStack.length === 0) return;
    const token = googleUser?.authentication?.accessToken;
    if (!token) {
      setToast("Session expired. Please sign in again.");
      return;
    }
    const prevFolder = folderStack[folderStack.length - 1];
    setLoading(true);
    try {
      const formatted = await fetchDriveFiles(token, prevFolder.id);
      setFolderStack((prev) => prev.slice(0, -1));
      setCurrentFolder(prevFolder);
      setDriveFiles(formatted);
    } catch (err: any) {
      setToast("⚠️ Unable to go back: " + (err.message || "Unknown error"));
    } finally {
      setLoading(false);
    }
  };

  /**
   * FIX: previously this pointed to a separate route ("/checkk") with the
   * DICOM blob URL passed through router state — the cornerstone viewer on
   * that route wasn't wired up correctly, so DICOM files never opened.
   * DICOM now opens in the SAME in-page modal used for image/video preview,
   * using the same cached Drive-fetch + cornerstone <DicomViewer> pattern
   * as the SMB file browser.
   */
  const handleFileClick = async (item: any) => {
    const type = fileType(item.name, item.mimeType);
    const token = googleUser?.authentication?.accessToken;

    if (!token) {
      setToast("Session expired. Please sign in again.");
      return;
    }

    if (type === "folder") {
      await openFolder(item);
      return;
    }

    if (type === "dicom") {
      try {
        setLoading(true);
        const blobUri = await getDriveFileUri(token, item.id);
        resetZoom();
        setPreviewType("dicom");
        setPreviewName(item.name);
        setPreviewUri(`wadouri:${blobUri}`);
        setPreviewOpen(true);
      } catch (err: any) {
        setToast("⚠️ Unable to open DICOM file: " + err.message);
      } finally {
        setLoading(false);
      }
      return;
    }

    if (type === "image" || type === "video") {
      try {
        setLoading(true);
        const res = await fetch(`https://www.googleapis.com/drive/v3/files/${item.id}?alt=media`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`Drive fetch failed (${res.status})`);
        const blob = await res.blob();
        const objUrl = URL.createObjectURL(blob);
        resetZoom();
        setPreviewType(type);
        setPreviewUri(objUrl);
        setPreviewName(item.name);
        setPreviewOpen(true);
      } catch (err: any) {
        setToast("⚠️ Unable to open file: " + err.message);
      } finally {
        setLoading(false);
      }
      return;
    }

    // PDF / other -> open Drive's own viewer in a new tab
    window.open(`https://drive.google.com/file/d/${item.id}/view`, "_blank");
  };

  const handleDeleteClick = (item: any) => {
    setSelectedItem(item);
    setShowConfirm(true);
  };

  const confirmDelete = async () => {
    if (!selectedItem) return;
    const token = googleUser?.authentication?.accessToken;
    if (!token) {
      setToast("Session expired");
      setShowConfirm(false);
      return;
    }
    try {
      await fetch(`https://www.googleapis.com/drive/v3/files/${selectedItem.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      setDriveFiles((prev) => prev.filter((f) => f.id !== selectedItem.id));
      setToast(`"${selectedItem.name}" deleted.`);
    } catch {
      setToast("⚠️ Delete failed");
    } finally {
      setShowConfirm(false);
      setSelectedItem(null);
    }
  };

  return (
    <IonPage>
      <IonHeader className="ion-no-border">
        <IonToolbar className="custom-toolbar">
          <IonButtons slot="start">
            <IonBackButton defaultHref="/dashboard" color="light" />
          </IonButtons>
          <IonTitle>Cloud Document Manager</IonTitle>
          {isSignedIn && (
            <IonButtons slot="end">
              <IonButton id="account-trigger" fill="clear" className="account-trigger-btn">
                {googleUser?.imageUrl ? (
                  <img src={googleUser.imageUrl} alt="" className="account-avatar" referrerPolicy="no-referrer" />
                ) : (
                  <IonIcon icon={personCircleOutline} className="account-avatar-fallback" />
                )}
                <IonIcon icon={chevronDownOutline} className="account-chevron" />
              </IonButton>
              <IonPopover trigger="account-trigger" dismissOnSelect className="account-popover">
                <div className="account-popover-content">
                  <div className="account-popover-header">
                    {googleUser?.imageUrl ? (
                      <img
                        src={googleUser.imageUrl}
                        alt=""
                        className="account-popover-avatar"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <IonIcon icon={personCircleOutline} className="account-popover-avatar-fallback" />
                    )}
                    <div className="account-popover-info">
                      <span className="account-popover-name">{googleUser?.name || "Signed in"}</span>
                      <span className="account-popover-email">{googleUser?.email || ""}</span>
                    </div>
                  </div>
                  <button className="account-popover-signout" onClick={logoutFromGoogle}>
                    <IonIcon icon={logOutOutline} />
                    Sign Out
                  </button>
                </div>
              </IonPopover>
            </IonButtons>
          )}
        </IonToolbar>
      </IonHeader>

      <IonContent className="dicom-bg" style={{ "--background": "#EBF5F0" }}>
        <IonLoading isOpen={loading} message={"Processing..."} spinner="circles" />

        <div style={{ padding: "16px" }}>
          {/* Action Center Card */}
          <IonCard style={{ margin: "0 0 20px 0", borderRadius: "12px", boxShadow: "0 4px 12px rgba(0,0,0,0.05)" }}>
            <IonCardContent style={{ padding: "20px" }}>
              {!isSignedIn ? (
                <div style={{ textAlign: "center", padding: "16px 0" }}>
                  <p style={{ margin: "0 0 16px 0", color: "#666", fontSize: "15px" }}>
                    Sign in to access and manage your medical files on Google Drive securely.
                  </p>
                  <IonButton expand="block" color="success" shape="round" onClick={signInToGoogle}>
                    <IonIcon slot="start" icon={logoGoogle} />
                    Sign In with Google
                  </IonButton>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <h3 style={{ margin: 0, fontWeight: "600", color: "#333" }}>File Actions</h3>
                    <span
                      style={{
                        fontSize: "12px",
                        color: "#2dd36f",
                        fontWeight: "500",
                        background: "#e8f9f0",
                        padding: "4px 10px",
                        borderRadius: "20px",
                      }}
                    >
                      Connected
                    </span>
                  </div>

                  <div className="action-row">
                    <IonButton expand="block" fill="outline" shape="round" onClick={pickFile}>
                      <IonIcon slot="start" icon={documentAttachOutline} />
                      Select File
                    </IonButton>
                    <IonButton expand="block" fill="outline" shape="round" onClick={() => setShowNewFolderAlert(true)}>
                      <IonIcon slot="start" icon={folderOutline} />
                      New Folder
                    </IonButton>
                  </div>
                </div>
              )}

              {file && (
                <div
                  style={{
                    marginTop: "16px",
                    padding: "12px",
                    background: "#f4f5f8",
                    borderRadius: "8px",
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                  }}
                >
                  <div style={{ width: "50px", height: "50px", borderRadius: "6px", overflow: "hidden", background: "#ddd" }}>
                    {file.type === "application/pdf" ? (
                      <img
                        src="https://cdn-icons-png.flaticon.com/512/337/337946.png"
                        alt="PDF"
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    ) : fileType(file.name, file.type) === "image" ? (
                      <img
                        src={URL.createObjectURL(file)}
                        alt="preview"
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    ) : (
                      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <IonIcon icon={documentOutline} style={{ fontSize: "24px", color: "#888" }} />
                      </div>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h4 style={{ margin: "0 0 4px 0", fontSize: "14px", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                      {file.name}
                    </h4>
                    <p style={{ margin: 0, fontSize: "12px", color: "#666" }}>{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                  <IonButton size="small" color="success" onClick={uploadToDrive}>
                    <IonIcon slot="start" icon={cloudUploadOutline} />
                    Upload
                  </IonButton>
                </div>
              )}
            </IonCardContent>
          </IonCard>

          {isSignedIn && (
            <>
              <div className="section-header-row">
                <h3 style={{ margin: "12px 4px", fontSize: "16px", fontWeight: "600", color: "#444" }}>
                  Cloud Storage Files ({driveFiles.length})
                </h3>
              </div>

              {(folderStack.length > 0 || currentFolder.id !== "root") && (
                <div className="breadcrumb-bar">
                  <button className="breadcrumb-back" onClick={goBackFolder}>
                    <IonIcon icon={chevronBackOutline} />
                    Back
                  </button>
                  <span className="breadcrumb-current">
                    <IonIcon icon={folderOutline} />
                    {currentFolder.name}
                  </span>
                </div>
              )}
            </>
          )}

          {/* Thumbnail grid — real previews (image/video/pdf/dicom/folder), same pattern as SmbImages */}
          {isSignedIn && (
            <div className="image-grid">
              {driveFiles.length === 0 ? (
                <div className="w-full text-center text-gray-500 py-8" style={{ gridColumn: "1 / -1", textAlign: "center", color: "#888", padding: "24px 0" }}>
                  No files yet
                </div>
              ) : (
                driveFiles.map((f: any) => {
                  const type = fileType(f.name, f.mimeType);
                  const token = googleUser?.authentication?.accessToken || "";
                  return (
                    <div key={f.id} className="image-card">
                      <div className="preview-container" onClick={() => handleFileClick(f)}>
                        <FileThumbnail token={token} item={f} />
                      </div>

                      <div className="file-name-row">
                        <span className="file-name-text">{f.name}</span>
                        <span className="file-type-text">{type.toUpperCase()}</span>
                      </div>

                      <div className="icon-group">
                        <IonButton fill="clear" onClick={() => handleFileClick(f)} className="icon-btn view-btn">
                          <IonIcon icon={type === "folder" ? folderOpenOutline : eyeOutline} size="small" />
                        </IonButton>
                        <IonButton fill="clear" onClick={() => handleDeleteClick(f)} className="icon-btn delete-btn">
                          <IonIcon icon={trashOutline} size="small" />
                        </IonButton>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Preview modal — image / video / dicom */}
        <IonModal isOpen={previewOpen} onDidDismiss={handlePreviewDismiss}>
          <IonHeader>
            <IonToolbar className="custom-toolbar">
              <IonButtons slot="start">
                <IonButton onClick={handlePreviewDismiss}>Close</IonButton>
              </IonButtons>
              <IonTitle style={{ fontSize: 14 }} className="text-white text-center">
                {previewName}
              </IonTitle>
              {previewType === "image" && (
                <div className="header-zoom-badge" slot="end">
                  {Math.round(zoom * 100)}%
                </div>
              )}
              {previewType === "dicom" && (
                <div className="header-zoom-badge" slot="end">
                  {dicomZoom}%
                </div>
              )}
            </IonToolbar>
          </IonHeader>

          <IonContent scrollY={false} className="viewer-body">
            {previewType === "image" ? (
              <div className="image-viewer-wrapper">
                <div
                  ref={imageViewerRef}
                  className="image-viewer-stage"
                  style={{ cursor: zoom > 1 ? (isDragging ? "grabbing" : "grab") : "default" }}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                  onWheel={handleWheel}
                  onDoubleClick={handleDoubleClick}
                >
                  <img
                    ref={imgRef}
                    src={previewUri}
                    alt={previewName}
                    draggable={false}
                    className="viewer-image"
                    style={{
                      transform: `translate(${position.x}px, ${position.y}px) scale(${zoom})`,
                      transition: isDragging ? "none" : "transform 0.2s ease",
                    }}
                  />
                  {zoom === 1 && <div className="zoom-hint">Pinch or double-tap to zoom</div>}
                </div>

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
            ) : previewType === "dicom" && previewUri ? (
              <div className="image-viewer-wrapper">
                <DicomViewer ref={dicomViewerRef} imageId={previewUri} onZoomChange={setDicomZoom} />

                {dicomZoom === 100 && (
                  <div className="zoom-hint">Pinch, wheel, or double-tap to zoom</div>
                )}

                <div className="zoom-toolbar">
                  <button
                    className="zoom-toolbar-btn"
                    onClick={() => dicomViewerRef.current?.zoomOut()}
                    aria-label="Zoom out"
                  >
                    <IonIcon icon={removeOutline} />
                  </button>

                  <span className="zoom-toolbar-value">{dicomZoom}%</span>

                  <button
                    className="zoom-toolbar-btn"
                    onClick={() => dicomViewerRef.current?.zoomIn()}
                    aria-label="Zoom in"
                  >
                    <IonIcon icon={addOutline} />
                  </button>

                  <div className="zoom-toolbar-divider" />

                  <button
                    className="zoom-toolbar-btn"
                    onClick={() => dicomViewerRef.current?.reset()}
                    aria-label="Reset zoom"
                  >
                    <IonIcon icon={refreshOutline} />
                  </button>
                </div>
              </div>
            ) : previewType === "video" ? (
              <video src={previewUri} controls style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            ) : (
              <IonCard>
                <IonCardContent>Preview not supported for this file type.</IonCardContent>
              </IonCard>
            )}
          </IonContent>
        </IonModal>

        <IonAlert
          isOpen={showNewFolderAlert}
          onDidDismiss={() => setShowNewFolderAlert(false)}
          header="New Folder"
          message={`Create inside "${currentFolder.name}"`}
          inputs={[
            {
              name: "folderName",
              type: "text",
              placeholder: "Folder name",
            },
          ]}
          buttons={[
            { text: "Cancel", role: "cancel" },
            {
              text: "Create",
              handler: (data) => createFolder(data?.folderName || ""),
            },
          ]}
        />

        <IonAlert
          isOpen={showConfirm}
          onDidDismiss={() => setShowConfirm(false)}
          header="Confirm Delete"
          message={`Are you sure you want to delete "${selectedItem?.name}" from Google Drive?`}
          buttons={[
            { text: "Cancel", role: "cancel" },
            { text: "Delete", handler: confirmDelete },
          ]}
        />

        <IonToast isOpen={!!toast} message={toast} duration={2500} onDidDismiss={() => setToast("")} />
      </IonContent>

      <style>{`
        .custom-toolbar {
          --background: linear-gradient(135deg, #16a34a, #059669);
        }

        /* ---------- Account menu (avatar + dropdown, replaces the bare logout icon) ---------- */
        .account-trigger-btn {
          --padding-start: 6px;
          --padding-end: 8px;
          height: 40px;
        }

        .account-avatar,
        .account-avatar-fallback {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          object-fit: cover;
          vertical-align: middle;
        }

        .account-avatar {
          border: 2px solid rgba(255, 255, 255, 0.75);
        }

        .account-avatar-fallback {
          font-size: 28px;
          color: #fff;
        }

        .account-chevron {
          font-size: 13px;
          color: rgba(255, 255, 255, 0.85);
          margin-left: 4px;
          vertical-align: middle;
        }

        .account-popover::part(content) {
          border-radius: 14px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.18);
        }

        .account-popover-content {
          padding: 14px;
          min-width: 230px;
        }

        .account-popover-header {
          display: flex;
          align-items: center;
          gap: 10px;
          padding-bottom: 12px;
          margin-bottom: 10px;
          border-bottom: 1px solid #eee;
        }

        .account-popover-avatar,
        .account-popover-avatar-fallback {
          width: 42px;
          height: 42px;
          border-radius: 50%;
          object-fit: cover;
          flex-shrink: 0;
        }

        .account-popover-avatar-fallback {
          font-size: 42px;
          color: #9ca3af;
        }

        .account-popover-info {
          display: flex;
          flex-direction: column;
          min-width: 0;
        }

        .account-popover-name {
          font-size: 14px;
          font-weight: 700;
          color: #1f2937;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .account-popover-email {
          font-size: 12px;
          color: #6b7280;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .account-popover-signout {
          display: flex;
          align-items: center;
          gap: 8px;
          width: 100%;
          border: none;
          background: #fef2f2;
          color: #dc2626;
          font-size: 14px;
          font-weight: 700;
          padding: 10px 12px;
          border-radius: 10px;
          cursor: pointer;
        }

        .account-popover-signout ion-icon {
          font-size: 17px;
        }

        .account-popover-signout:active {
          background: #fee2e2;
        }

        /* ---------- Action buttons row ---------- */
        .action-row {
          display: flex;
          gap: 10px;
        }

        .action-row ion-button {
          flex: 1;
          margin: 0;
        }

        /* ---------- Breadcrumb ---------- */
        .breadcrumb-bar {
          display: flex;
          align-items: center;
          gap: 10px;
          margin: 0 4px 12px;
        }

        .breadcrumb-back {
          display: flex;
          align-items: center;
          gap: 2px;
          border: none;
          background: #fff;
          color: #059669;
          font-size: 13px;
          font-weight: 700;
          padding: 6px 12px;
          border-radius: 20px;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
          cursor: pointer;
        }

        .breadcrumb-current {
          display: flex;
          align-items: center;
          gap: 5px;
          font-size: 13px;
          color: #4b5563;
          font-weight: 600;
        }

        .breadcrumb-current ion-icon {
          font-size: 15px;
          color: #f5b942;
        }

        .image-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 14px;
          padding: 4px 0 12px;
        }

        .image-card {
          background: rgba(255, 255, 255, 0.25);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.3);
          box-shadow: 0 6px 18px rgba(0, 0, 0, 0.15);
          overflow: hidden;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 10px;
          transition: transform 0.2s ease;
        }

        .image-card:hover { transform: scale(1.02); }

        .preview-container {
          width: 100%;
          aspect-ratio: 1 / 1;
          background: #f2f2f2;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          overflow: hidden;
          cursor: pointer;
        }

        .file-type-icon {
          font-size: 48px;
          color: #5c5555;
        }

        .folder-thumb-wrap {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(160deg, #fff8e6, #fef3d9);
        }

        .folder-icon {
          font-size: 52px;
          color: #f5b942;
        }

        .file-badge-wrap {
          position: relative;
          width: 78%;
          height: 88%;
          background: #ffffff;
          border-radius: 6px;
          box-shadow: 0 2px 6px rgba(0,0,0,0.12);
        }

        .file-corner {
          position: absolute;
          top: 0;
          right: 0;
          width: 0;
          height: 0;
          border-style: solid;
          border-width: 0 20px 20px 0;
          border-color: transparent #cfd4d8 transparent transparent;
        }

        .file-badge {
          position: absolute;
          left: 8%;
          top: 32%;
          width: 84%;
          background: #ef4136;
          color: #fff;
          font-weight: 800;
          font-size: 20px;
          text-align: center;
          padding: 6px 0;
          border-radius: 2px;
          letter-spacing: 1px;
        }

        .dcm-badge {
          background: #2563eb;
          font-size: 17px;
        }

        /* ---------- Real file thumbnails (image / video / pdf / dicom) ---------- */
        .thumb-image {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }

        .thumb-pdf {
          object-fit: contain;
          background: #ffffff;
        }

        .thumb-video-wrap {
          position: relative;
          width: 100%;
          height: 100%;
        }

        .thumb-video-badge {
          position: absolute;
          bottom: 6px;
          right: 6px;
          font-size: 16px;
          color: #fff;
          background: rgba(0, 0, 0, 0.5);
          border-radius: 50%;
          padding: 5px;
        }

        .thumb-skeleton {
          width: 60%;
          height: 60%;
          border-radius: 8px;
          background: linear-gradient(90deg, #e2e2e2 25%, #f0f0f0 50%, #e2e2e2 75%);
          background-size: 200% 100%;
          animation: thumb-shimmer 1.4s infinite;
        }

        @keyframes thumb-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }

        .file-name-row {
          padding: 6px 2px 0;
          text-align: center;
          overflow: hidden;
        }

        .file-name-text {
          display: block;
          font-size: 13px;
          font-weight: 600;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .file-type-text {
          display: block;
          font-size: 11px;
          color: #666;
        }

        .icon-group {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 10px;
          border-top: 1px solid #eee;
          padding: 4px 0;
          margin-top: 6px;
          background: rgba(91, 206, 177, 0.35);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          border-radius: 8px;
        }

        .icon-btn::part(native) {
          background: transparent !important;
          box-shadow: none !important;
          padding: 6px;
        }

        .view-btn ion-icon { color: #5c5555 !important; }
        .delete-btn ion-icon { color: #ef4444 !important; }
        .icon-btn ion-icon { font-size: 18px; }

        .icon-btn {
          --padding-start: 0;
          --padding-end: 0;
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        /* ---------- Preview Modal ---------- */

        .header-zoom-badge {
          color: #fff;
          font-size: 13px;
          font-weight: 600;
          padding: 4px 12px;
          margin-right: 8px;
          background: rgba(255, 255, 255, 0.18);
          border-radius: 14px;
          font-variant-numeric: tabular-nums;
        }

        .viewer-body {
          --background: #baf0e2;
        }

        .image-viewer-wrapper {
          position: relative;
          width: 100%;
          height: 100%;
          background: #baf0e2;
        }

        .image-viewer-stage {
          width: 100%;
          height: 100%;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          touch-action: none;
          user-select: none;
          -webkit-user-select: none;
        }

        .viewer-image {
          max-width: 92%;
          max-height: 88%;
          object-fit: contain;
          border-radius: 6px;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
          user-select: none;
          -webkit-user-select: none;
          pointer-events: none;
          transform-origin: center center;
        }

        .zoom-hint {
          position: absolute;
          bottom: calc(96px + env(safe-area-inset-bottom, 0px));
          left: 50%;
          transform: translateX(-50%);
          background: rgba(0, 0, 0, 0.45);
          color: #fff;
          font-size: 12px;
          padding: 5px 12px;
          border-radius: 14px;
          pointer-events: none;
          white-space: nowrap;
          z-index: 10;
        }

        .zoom-toolbar {
          position: absolute;
          left: 50%;
          bottom: calc(20px + env(safe-area-inset-bottom, 0px));
          transform: translateX(-50%);
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 6px 10px;
          background: rgba(24, 28, 32, 0.72);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 999px;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
          z-index: 20;
        }

        .zoom-toolbar-btn {
          width: 38px;
          height: 38px;
          border-radius: 50%;
          border: none;
          background: rgba(255, 255, 255, 0.08);
          color: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
          cursor: pointer;
          transition: background 0.15s ease, opacity 0.15s ease, transform 0.1s ease;
        }

        .zoom-toolbar-btn:active:not(:disabled) {
          transform: scale(0.92);
          background: rgba(255, 255, 255, 0.2);
        }

        .zoom-toolbar-btn:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }

        .zoom-toolbar-value {
          min-width: 42px;
          text-align: center;
          color: #fff;
          font-size: 13px;
          font-weight: 600;
          font-variant-numeric: tabular-nums;
        }

        .zoom-toolbar-divider {
          width: 1px;
          height: 22px;
          background: rgba(255, 255, 255, 0.18);
          margin: 0 2px;
        }
      `}</style>
      <AppFooter/>
    </IonPage>
  );
};

export default GoogleDrivePage;
