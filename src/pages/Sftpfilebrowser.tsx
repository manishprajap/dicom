import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  IonBackButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonContent,
  IonHeader,
  IonIcon,
  IonLoading,
  IonModal,
  IonPage,
  IonTitle,
  IonToolbar,
  IonToast,
  IonButton,
  IonAlert,
  IonActionSheet,
  IonFab,
  IonFabButton,
  IonFabList,
} from "@ionic/react";
import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { useLocation } from "react-router";
import cornerstone from "cornerstone-core";
import cornerstoneWADOImageLoader from "cornerstone-wado-image-loader";
import dicomParser from "dicom-parser";
import { sftpListDir, sftpDownloadToCache, sftpUploadFile, sftpMkdir, sftpDeleteFile } from "../services/sftpClient";
import {
  eyeOutline,
  trashOutline,
  folderOutline,
  imageOutline,
  videocamOutline,
  documentOutline,
  removeOutline,
  addOutline,
  refreshOutline,
  cloudUploadOutline,
  folderOpenOutline,
  imagesOutline,
  documentAttachOutline,
  chevronForwardOutline,
} from "ionicons/icons";
import { FileOpener } from "@capacitor-community/file-opener";
import AppFooter from "../components/AppFooter";

const IMG_EXT = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "heic"];
const VID_EXT = ["mp4", "mov", "mkv", "webm", "3gp", "avi"];
const PDF_EXT = ["pdf"];
const DCM_EXT = ["dcm", "dicom"];

const IMG_MIN_ZOOM = 1;
const IMG_MAX_ZOOM = 4;
const DOUBLE_TAP_ZOOM = 2.5;
const DOUBLE_TAP_DELAY = 280; // ms

// ---- DICOM viewer gesture constants (separate from the plain-image ones
// above because cornerstone uses its own scale/translation system, not
// CSS transforms) ----
const DICOM_MIN_SCALE_MULT = 0.25; // relative to "fit to window" scale
const DICOM_MAX_SCALE_MULT = 8;
const DICOM_DOUBLE_TAP_SCALE_MULT = 2.5;
const DICOM_DOUBLE_TAP_DELAY = 280;

function extOf(name: string) {
  const p = name.split(".");
  return (p.length > 1 ? p[p.length - 1] : "").toLowerCase();
}

function fileType(name: string) {
  const e = extOf(name);
  if (IMG_EXT.includes(e)) return "image";
  if (VID_EXT.includes(e)) return "video";
  if (PDF_EXT.includes(e)) return "pdf";
  if (DCM_EXT.includes(e)) return "dicom";
  return "other";
}

// ---- Chunked upload settings ----
const UPLOAD_CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB

/** Reads a single Blob/File slice into a base64 string (no data: prefix) */
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

/**
 * Writes a File to the on-device cache in chunks instead of loading the
 * whole thing into memory as one base64 blob. Calls onProgress(percent)
 * after each chunk so the UI can show real upload progress.
 */
async function writeFileChunked(
  file: File,
  stagedPath: string,
  onProgress?: (percent: number) => void
): Promise<void> {
  const totalChunks = Math.max(1, Math.ceil(file.size / UPLOAD_CHUNK_SIZE));

  for (let i = 0; i < totalChunks; i++) {
    const start = i * UPLOAD_CHUNK_SIZE;
    const end = Math.min(start + UPLOAD_CHUNK_SIZE, file.size);
    const chunkBlob = file.slice(start, end);
    const base64Chunk = await blobToBase64(chunkBlob);

    if (i === 0) {
      // First chunk creates the file (and any missing parent folders)
      await Filesystem.writeFile({
        path: stagedPath,
        data: base64Chunk,
        directory: Directory.Cache,
        recursive: true,
      });
    } else {
      // Subsequent chunks are appended to the same file
      await Filesystem.appendFile({
        path: stagedPath,
        data: base64Chunk,
        directory: Directory.Cache,
      });
    }

    onProgress?.(Math.round(((i + 1) / totalChunks) * 100));
  }
}

// ✅ Cornerstone setup (same pattern as the S3 file browser)
cornerstoneWADOImageLoader.external.cornerstone = cornerstone;
cornerstoneWADOImageLoader.external.dicomParser = dicomParser;
cornerstoneWADOImageLoader.configure({
  useWebWorkers: true,
  decodeConfig: { convertFloatPixelDataToInt: false },
});


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

    // gesture state
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
          // cornerstone translation is in image-space pixels, not screen
          // pixels, so screen deltas must be divided by current scale.
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
      <div
        ref={containerRef}
        style={{ width: "100%", height: "100%", position: "relative" }}
      >
        <div
          ref={elementRef}
          style={{
            width: "100%",
            height: "100%",
            background: "#000",
            touchAction: "none",
          }}
        />
      </div>
    );
  }
);

/** ✅ DICOM Thumbnail — downloads the remote SFTP file to cache, then renders it via DicomViewer */
const DicomThumbnail: React.FC<{ creds: any; remotePath: string }> = ({ creds, remotePath }) => {
  const [imageId, setImageId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!creds || !remotePath) return;

    (async () => {
      try {
        const { localUri } = await sftpDownloadToCache(creds, remotePath);
        if (cancelled) return;
        const webviewUri = Capacitor.convertFileSrc(localUri);
        setImageId(`wadouri:${webviewUri}`);
      } catch (err) {
        console.error("❌ DICOM thumbnail download failed:", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [creds, remotePath]);

  if (!imageId) {
    return <IonIcon icon={imageOutline} className="file-type-icon" />;
  }

  return <DicomViewer imageId={imageId} />;
};

/** ✅ Image Thumbnail — downloads the remote SFTP file to cache and shows the
 *  actual picture (same download-to-cache pattern as DicomThumbnail). */
const ImageThumbnail: React.FC<{ creds: any; remotePath: string }> = ({ creds, remotePath }) => {
  const [uri, setUri] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!creds || !remotePath) return;

    (async () => {
      try {
        const { localUri } = await sftpDownloadToCache(creds, remotePath);
        if (cancelled) return;
        setUri(Capacitor.convertFileSrc(localUri));
      } catch (err) {
        console.error("❌ Image thumbnail download failed:", err);
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [creds, remotePath]);

  if (failed) return <IonIcon icon={imageOutline} className="file-type-icon" />;
  if (!uri) return <div className="thumb-skeleton" />;

  return <img src={uri} alt="" className="thumb-image" onError={() => setFailed(true)} />;
};

/** ✅ Video Thumbnail — downloads the clip, then grabs an actual frame onto a
 *  canvas. A bare <video> tag paints nothing (black) on most webviews until
 *  playback starts, so we decode one frame ourselves and show that as a
 *  still image, with a small camera badge to indicate it's a video. */
const VideoThumbnail: React.FC<{ creds: any; remotePath: string }> = ({ creds, remotePath }) => {
  const [uri, setUri] = useState<string | null>(null);
  const [frameUrl, setFrameUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    let cancelled = false;
    if (!creds || !remotePath) return;

    (async () => {
      try {
        const { localUri } = await sftpDownloadToCache(creds, remotePath);
        if (cancelled) return;
        setUri(Capacitor.convertFileSrc(localUri));
      } catch (err) {
        console.error("❌ Video thumbnail download failed:", err);
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [creds, remotePath]);

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
      // Frame capture can fail on some codecs/webviews — fall back to icon
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

const PdfThumbnail: React.FC<{ creds: any; remotePath: string }> = ({ creds, remotePath }) => {
  const [pageUrl, setPageUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!creds || !remotePath) return;

    (async () => {
      try {
        const { localUri } = await sftpDownloadToCache(creds, remotePath);
        if (cancelled) return;
        const webviewUri = Capacitor.convertFileSrc(localUri);

        // @ts-ignore — pdfjs-dist has no bundled TS types for this deep import path
        const pdfjsLib: any = await import("pdfjs-dist/build/pdf");
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.js",
          import.meta.url
        ).toString();

        const pdf = await pdfjsLib.getDocument(webviewUri).promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 0.6 });

        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas 2D context unavailable");

        await page.render({ canvasContext: ctx, viewport }).promise;
        if (cancelled) return;
        setPageUrl(canvas.toDataURL("image/jpeg", 0.75));
      } catch (err) {
        console.error("❌ PDF thumbnail render failed:", err);
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [creds, remotePath]);

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

const FileThumbnail: React.FC<{ creds: any; item: any }> = ({ creds, item }) => {
  const type = fileType(item.name);

  if (type === "dicom") return <DicomThumbnail creds={creds} remotePath={item.path} />;
  if (type === "image") return <ImageThumbnail creds={creds} remotePath={item.path} />;
  if (type === "video") return <VideoThumbnail creds={creds} remotePath={item.path} />;
  if (type === "pdf") return <PdfThumbnail creds={creds} remotePath={item.path} />;
  return <IonIcon icon={documentOutline} className="file-type-icon" />;
};

const SFTPFileBrowser: React.FC = () => {
  const isNative = Capacitor.isNativePlatform();
  const location = useLocation();

  const [cfg, setCfg] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("Loading SFTP...");
  const [toast, setToast] = useState("");

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewType, setPreviewType] = useState<"image" | "video" | "pdf" | "dicom" | "other">("other");
  const [previewUri, setPreviewUri] = useState<string>("");
  const [previewName, setPreviewName] = useState<string>("");

  // Delete confirmation state
  const [showConfirm, setShowConfirm] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any | null>(null);

  // New folder state
  const [showNewFolder, setShowNewFolder] = useState(false);

  // Upload action sheet + input ref
  const [showUploadSheet, setShowUploadSheet] = useState(false);
  const [uploadAccept, setUploadAccept] = useState("*/*");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Zoom & Pan states (plain image viewer — CSS transform based)
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);

  // Zoom state for the DICOM viewer (cornerstone viewport based, driven
  // via DicomViewerHandle rather than CSS transforms)
  const [dicomZoom, setDicomZoom] = useState(100);
  const dicomViewerRef = useRef<DicomViewerHandle>(null);

  // Refs for native touch handling (avoid stale closure issues)
  const imageViewerRef = useRef<HTMLDivElement | null>(null);
  // Generic ref to whichever visual element is currently rendered
  // (<img> for image type, <canvas> for dicom type) — zoom/pan math
  // reads its rendered box size regardless of which one it is.
  const mediaRef = useRef<HTMLImageElement | null>(null);
  const lastTouchDistance = useRef<number | null>(null);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  const positionRef = useRef({ x: 0, y: 0 });
  const lastTapRef = useRef(0);

  const params = new URLSearchParams(location.search);
  const path = params.get("path") || "/";

  // ---- Breadcrumb path segments: "/var/www/html" -> ["var","www","html"] ----
  const pathSegments = path.split("/").filter(Boolean);

  const navigateTo = (targetPath: string) => {
    window.location.href = `/sftpBrowse?path=${encodeURIComponent(targetPath)}`;
  };

  const goToRoot = () => navigateTo("/");

  const goToSegment = (index: number) => {
    const targetPath = "/" + pathSegments.slice(0, index + 1).join("/");
    navigateTo(targetPath);
  };

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);
  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  // Read the selected SFTP connection saved by SFTPListPage
  useEffect(() => {
    const selected = localStorage.getItem("sftpSelected");
    if (selected) setCfg(JSON.parse(selected));
    else setToast("No SFTP connection selected");
  }, []);

  const credsOf = (c: any) => ({
    host: c.host,
    port: c.port,
    user: c.user,
    password: c.password,
  });

  const refreshListing = async () => {
    if (!cfg) return;
    try {
      const res = await sftpListDir(credsOf(cfg), path);
      setItems(res || []);
    } catch (e: any) {
      setToast(e?.message || "Failed to refresh directory map");
    }
  };

  // Load real directory listing from the SFTP server whenever
  // the config or the current path changes
  useEffect(() => {
    if (!cfg || !isNative) return;

    const load = async () => {
      setLoading(true);
      setLoadingMessage("Loading SFTP...");
      try {
        const res = await sftpListDir(credsOf(cfg), path);
        setItems(res || []);
      } catch (e: any) {
        setToast(e?.message || "Failed to load SFTP directory");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [cfg, path, isNative]);

  /** Clamp pan position so the image can never be dragged fully out of view */
  const clampPosition = (pos: { x: number; y: number }, zoomLevel: number) => {
    const container = imageViewerRef.current;
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

  /**
   * Native touch event listeners with passive:false
   * This is the ONLY way to make preventDefault() work on mobile.
   * Applies to the plain "image" preview only — DICOM has its own gesture
   * handling inside DicomViewer, driven off cornerstone's viewport instead
   * of CSS transforms.
   */
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

        if (zoomRef.current < 1) {
          applyZoom(1);
        }
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

  /** Reset zoom & position */
  const resetZoom = () => {
    zoomRef.current = 1;
    positionRef.current = { x: 0, y: 0 };
    setZoom(1);
    setPosition({ x: 0, y: 0 });
    setDicomZoom(100);
  };

  /** Close modal and reset zoom */
  const handlePreviewDismiss = () => {
    setPreviewOpen(false);
    resetZoom();
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
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    isDraggingRef.current = false;
  };

  /** Scroll to zoom — desktop only */
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.3 : 0.3;
    applyZoom(zoomRef.current + delta);
  };

  /** Double-click to zoom — desktop only */
  const handleDoubleClick = () => {
    toggleZoom();
  };

  const openFolder = (it: any) => {
    navigateTo(it.path);
  };

  const openFile = async (it: any) => {
    const type = fileType(it.name);

    try {
      setLoading(true);
      setLoadingMessage("Opening file...");

      // Download remote SFTP file -> cache (file://...)
      const { localUri } = await sftpDownloadToCache(credsOf(cfg), it.path);

      // PDF: open with native PDF viewer
      if (type === "pdf") {
        await FileOpener.open({
          filePath: localUri, // must be file://...
          contentType: "application/pdf",
        });
        return;
      }

      // DICOM: hand a webview-safe URI to cornerstone's wadouri loader.
      // <DicomViewer imageId={previewUri}> in the modal handles loading + rendering.
      if (type === "dicom") {
        const webviewUri = Capacitor.convertFileSrc(localUri);

        resetZoom();
        setPreviewType("dicom");
        setPreviewName(it.name);
        setPreviewUri(`wadouri:${webviewUri}`);
        setPreviewOpen(true);
        return;
      }

      // Image/Video: preview inside modal using WebView safe URI
      const webviewUri = Capacitor.convertFileSrc(localUri);

      resetZoom();
      setPreviewType(type as any);
      setPreviewUri(webviewUri);
      setPreviewName(it.name);
      setPreviewOpen(true);
    } catch (e: any) {
      setToast(e?.message || "Failed to open file");
    } finally {
      setLoading(false);
    }
  };

  const handleViewClick = (it: any) => {
    if (it.isDir) openFolder(it);
    else openFile(it);
  };

  const handleDeleteClick = (it: any) => {
    setSelectedItem(it);
    setShowConfirm(true);
  };

  // Safe Server-side async confirmation routine
  const confirmDelete = async () => {
    if (!selectedItem || !cfg) return;

    setLoading(true);
    setLoadingMessage("Deleting file...");

    try {
      // 1. Delete it permanently from the SFTP server
      await sftpDeleteFile(credsOf(cfg), selectedItem.path);
      setToast(`"${selectedItem.name}" deleted successfully.`);

      // 2. Refresh the listing layout from the server
      await refreshListing();
    } catch (err: any) {
      setToast(err?.message || "Failed to delete file from server");
    } finally {
      setLoading(false);
      setShowConfirm(false);
      setSelectedItem(null);
    }
  };

  /** Opens the "what do you want to upload" action sheet */
  const handleUploadClick = () => {
    setShowUploadSheet(true);
  };

  /** Sets the picker filter for the chosen type, then opens the native picker */
  const openPickerFor = (accept: string) => {
    setUploadAccept(accept);
    setTimeout(() => fileInputRef.current?.click(), 50);
  };

  /** Reads each picked file, stages it locally, then uploads it over SFTP */
  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !cfg) return;

    setLoading(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const stagedPath = `sftp_upload_tmp/${Date.now()}_${file.name}`;

        // Stage the picked file on-device in small chunks (instead of one
        // huge base64 blob) so large videos/PDFs don't freeze the webview,
        // and show real progress while it happens.
        await writeFileChunked(file, stagedPath, (percent) => {
          setLoadingMessage(
            `Uploading ${file.name} (${i + 1}/${files.length}) — ${percent}%`
          );
        });

        const { uri: localUri } = await Filesystem.getUri({
          path: stagedPath,
          directory: Directory.Cache,
        });

        setLoadingMessage(`Sending ${file.name} to server (${i + 1}/${files.length})...`);
        await sftpUploadFile(credsOf(cfg), localUri, path, file.name);

        // Clean up the staged temp file
        await Filesystem.deleteFile({ path: stagedPath, directory: Directory.Cache }).catch(() => { });
      }

      setToast(files.length > 1 ? `${files.length} files uploaded` : `"${files[0].name}" uploaded`);
      await refreshListing();
    } catch (err: any) {
      setToast(err?.message || "Upload failed");
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  /** Creates a new folder in the current directory */
  const handleCreateFolder = async (data: any) => {
    const name = (data?.folderName || "").trim();
    if (!name || !cfg) return;

    setLoading(true);
    setLoadingMessage("Creating folder...");
    try {
      await sftpMkdir(credsOf(cfg), path, name);
      setToast(`Folder "${name}" created`);
      await refreshListing();
    } catch (err: any) {
      setToast(err?.message || "Failed to create folder");
    } finally {
      setLoading(false);
    }
  };

  return (
    <IonPage>
      <IonHeader>
        {/* Main top header bar with Android Status Bar padding compatibility */}
        <IonToolbar
          style={{
            "--background": "#0cd1a1",
            "--color": "#ffffff",
            paddingTop: "var(--ion-safe-area-top, 0px)",
          }}
        >
          <IonButtons slot="start">
            <IonBackButton defaultHref="/sftpView" color="light" />
          </IonButtons>
          <IonTitle className="ion-text-center" style={{ color: "#ffffff", fontWeight: "bold" }}>
            {cfg ? `${cfg.user}@${cfg.host}` : "SFTP Browser"}
          </IonTitle>
        </IonToolbar>

        {/* High-visibility Breadcrumb system bar */}
        <IonToolbar style={{ "--background": "#e8ecef", minHeight: "48px" }}>
          <div
            className="breadcrumb-bar"
            style={{ display: "flex", alignItems: "center", padding: "0 16px", flexWrap: "wrap" }}
          >
            <span
              className={`breadcrumb-item ${pathSegments.length === 0 ? "active" : ""}`}
              style={{
                color: pathSegments.length === 0 ? "#0cd1a1" : "#333333",
                fontWeight: pathSegments.length === 0 ? "bold" : "600",
                fontSize: '14px',
                cursor: "pointer",
              }}
              onClick={goToRoot}
            >
              root
            </span>
            {pathSegments.map((seg, idx) => (
              <React.Fragment key={idx}>
                <IonIcon
                  icon={chevronForwardOutline}
                  style={{ color: "#666666", margin: "0 6px", fontSize: '14px', fontWeight: "bold" }}
                />
                <span
                  className={`breadcrumb-item ${idx === pathSegments.length - 1 ? "active" : ""}`}
                  style={{
                    color: idx === pathSegments.length - 1 ? "#0cd1a1" : "#333333",
                    fontWeight: idx === pathSegments.length - 1 ? "bold" : "600",
                    fontSize: '14px',
                    cursor: "pointer",
                  }}
                  onClick={() => goToSegment(idx)}
                >
                  {seg}
                </span>
              </React.Fragment>
            ))}
          </div>
        </IonToolbar>
      </IonHeader>

      <IonContent className="dicom-bg">
        <IonLoading isOpen={loading} message={loadingMessage} />

        {!isNative && (
          <IonCard color="warning">
            <IonCardContent>
              <strong>SFTP is not supported in Web browser.</strong>
              <br />
              Please run on Android/iOS build.
            </IonCardContent>
          </IonCard>
        )}

        {isNative && (
          <div className="image-grid">
            {!loading && items.length === 0 ? (
              <div className="w-full text-center text-gray-500 py-8">No files or folders</div>
            ) : (
              items.map((it: any) => {
                const type = it.isDir ? "folder" : fileType(it.name);
                return (
                  <div key={it.path} className="image-card">
                    <div className="preview-container" onClick={() => handleViewClick(it)}>
                      {it.isDir ? (
                        <IonIcon icon={folderOutline} className="file-type-icon" />
                      ) : (
                        <FileThumbnail creds={credsOf(cfg)} item={it} />
                      )}
                    </div>

                    <div className="file-name-row">
                      <span className="file-name-text">{it.name}</span>
                      <span className="file-type-text">{it.isDir ? "Folder" : type.toUpperCase()}</span>
                    </div>

                    <div className="icon-group">
                      <IonButton
                        fill="clear"
                        onClick={() => handleViewClick(it)}
                        className="icon-btn view-btn"
                      >
                        <IonIcon icon={eyeOutline} size="small" />
                      </IonButton>
                      <IonButton
                        fill="clear"
                        onClick={() => handleDeleteClick(it)}
                        className="icon-btn delete-btn"
                      >
                        <IonIcon icon={trashOutline} size="small" />
                      </IonButton>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Hidden File Picker element */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={uploadAccept}
          style={{ display: "none" }}
          onChange={handleFilesSelected}
        />

        {/* Action buttons (FAB layout) */}
        {isNative && cfg && (
          <IonFab vertical="bottom" horizontal="end" slot="fixed" className="main-fab">
            <IonFabButton>
              <IonIcon icon={addOutline} />
            </IonFabButton>
            <IonFabList side="top">
              <IonFabButton onClick={() => setShowNewFolder(true)} aria-label="New folder">
                <IonIcon icon={folderOpenOutline} />
              </IonFabButton>
              <IonFabButton onClick={handleUploadClick} aria-label="Upload">
                <IonIcon icon={cloudUploadOutline} />
              </IonFabButton>
            </IonFabList>
          </IonFab>
        )}

        {/* Picker modal actions */}
        <IonActionSheet
          isOpen={showUploadSheet}
          onDidDismiss={() => setShowUploadSheet(false)}
          header="Upload"
          buttons={[
            {
              text: "Photos & Images",
              icon: imagesOutline,
              handler: () => openPickerFor("image/*"),
            },
            {
              text: "Videos",
              icon: videocamOutline,
              handler: () => openPickerFor("video/*"),
            },
            {
              text: "PDF Documents",
              icon: documentAttachOutline,
              handler: () => openPickerFor("application/pdf"),
            },
            {
              text: "Any File",
              icon: documentOutline,
              handler: () => openPickerFor("*/*"),
            },
            {
              text: "Cancel",
              role: "cancel",
            },
          ]}
        />

        {/* Preview Container modal */}
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
                    ref={(el) => {
                      mediaRef.current = el;
                    }}
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
                <DicomViewer
                  ref={dicomViewerRef}
                  imageId={previewUri}
                  onZoomChange={setDicomZoom}
                />

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
              <video
                src={previewUri}
                controls
                style={{ width: "100%", height: "100%", objectFit: "contain" }}
              />
            ) : (
              <IonCard>
                <IonCardContent>Preview not supported for this file type.</IonCardContent>
              </IonCard>
            )}
          </IonContent>
        </IonModal>

        <IonAlert
          isOpen={showConfirm}
          onDidDismiss={() => setShowConfirm(false)}
          header="Confirm Delete"
          message={`Are you sure you want to remove "${selectedItem?.name}" from this list?`}
          buttons={[
            { text: "Cancel", role: "cancel" },
            { text: "Delete", handler: confirmDelete },
          ]}
        />

        <IonAlert
          isOpen={showNewFolder}
          onDidDismiss={() => setShowNewFolder(false)}
          header="New Folder"
          inputs={[
            {
              name: "folderName",
              type: "text",
              placeholder: "Folder name",
            },
          ]}
          buttons={[
            { text: "Cancel", role: "cancel" },
            { text: "Create", handler: handleCreateFolder },
          ]}
        />

        <IonToast
          isOpen={!!toast}
          message={toast}
          duration={2500}
          onDidDismiss={() => setToast("")}
        />
      </IonContent>
      <style>{`
        /* ---------- Breadcrumb bar ---------- */
        .breadcrumb-toolbar {
          --min-height: 38px;
          --background: rgba(0, 0, 0, 0.08);
        }

        .breadcrumb-bar {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 4px 12px;
          overflow-x: auto;
          white-space: nowrap;
          -webkit-overflow-scrolling: touch;
        }

        .breadcrumb-bar::-webkit-scrollbar { display: none; }

        .breadcrumb-item {
          color: rgba(255, 255, 255, 0.75);
          font-size: 13px;
          font-weight: 600;
          padding: 3px 8px;
          border-radius: 8px;
          cursor: pointer;
          flex-shrink: 0;
        }

        .breadcrumb-item:active {
          background: rgba(255, 255, 255, 0.15);
        }

        .breadcrumb-item.active {
          color: #ffffff;
          background: rgba(255, 255, 255, 0.18);
        }

        .breadcrumb-sep {
          color: rgba(255, 255, 255, 0.5);
          font-size: 12px;
          flex-shrink: 0;
        }

        /* ---------- Grid / Cards ---------- */
        .image-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 14px;
          padding: 12px;
          padding-bottom: 130px; /* extra room so the FAB never overlaps the last row */
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

        /* ---------- Real file thumbnails (image / video / pdf) ---------- */
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

        /* Action row (view/delete) — right aligned.
           To move it to the LEFT instead, change justify-content to flex-start
           and swap padding-right for padding-left below. */
        .icon-group {
          display: flex;
          justify-content: flex-end;
          align-items: center;
          gap: 6px;
          border-top: 1px solid #eee;
          padding: 4px 8px;
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
          width: 34px;
          height: 34px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0;
        }

        /* ---------- FAB fix: proper spacing + z-index so it never
           sits on top of / gets blocked by the last row of cards ---------- */
        .main-fab {
          z-index: 999;
          margin-right: 12px;
          margin-bottom: calc(16px + env(safe-area-inset-bottom, 0px));
        }

        /* ---------- Image / DICOM Viewer Modal ---------- */

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

export default SFTPFileBrowser;