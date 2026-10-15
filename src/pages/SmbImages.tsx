import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
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
} from "@ionic/react";
import { Capacitor } from "@capacitor/core";
import { useHistory, useLocation } from "react-router";
import cornerstone from "cornerstone-core";
import cornerstoneWADOImageLoader from "cornerstone-wado-image-loader";
import dicomParser from "dicom-parser";
import { smbListDir, smbDownloadToCache } from "../services/smbClient";
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
} from "ionicons/icons";
import { FileOpener } from "@capacitor-community/file-opener";
import "../css/sbmimages.css";
import AppFooter from "../components/AppFooter";

const IMG_EXT = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "heic"];
const VID_EXT = ["mp4", "mov", "mkv", "webm", "3gp", "avi"];
const PDF_EXT = ["pdf"];
const DCM_EXT = ["dcm", "dicom"];

const IMG_MIN_ZOOM = 1;
const IMG_MAX_ZOOM = 4;
const DOUBLE_TAP_ZOOM = 2.5;
const DOUBLE_TAP_DELAY = 280; // ms

const DICOM_MIN_SCALE_MULT = 0.25;
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

function normalizePath(raw: string | null | undefined): string {
  if (!raw || raw.trim() === "") return "/";
  let p = raw.trim();
  if (!p.startsWith("/")) p = "/" + p;
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p;
}

/**
 * ✅ Sorting: folders always first, and within each group the most
 * recently modified/uploaded item comes first.
 *
 * `smbListDir` results can come back from different SMB backends with
 * different field names for the timestamp, so this checks the common
 * ones in order rather than assuming a single shape. If your smbClient
 * exposes the mtime under a different key, add it to this list.
 */
function getItemTimeMs(it: any): number {
  const raw =
    it?.mtime ??
    it?.mtimeMs ??
    it?.modifiedTime ??
    it?.modified ??
    it?.lastModified ??
    it?.LastWriteTime ??
    it?.date ??
    it?.updatedAt ??
    null;

  if (raw === null || raw === undefined) return 0;
  if (raw instanceof Date) return raw.getTime();
  if (typeof raw === "number") {
    // Guard against seconds-since-epoch values (10 digits) vs ms (13 digits)
    return raw < 1e12 ? raw * 1000 : raw;
  }
  const parsed = new Date(raw).getTime();
  return isNaN(parsed) ? 0 : parsed;
}

function sortItems(list: any[]): any[] {
  return [...list].sort((a, b) => {
    if (!!a.isDir !== !!b.isDir) return a.isDir ? -1 : 1; // folders first
    return getItemTimeMs(b) - getItemTimeMs(a); // newest first within each group
  });
}

const thumbUriCache = new Map<string, string>();
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

async function getThumbUri(creds: any, remotePath: string): Promise<string> {
  const cacheKey = `${creds?.ip}|${creds?.share}|${remotePath}`;
  const cached = thumbUriCache.get(cacheKey);
  if (cached) return cached;

  const { localUri } = await runQueuedThumbTask(() =>
    smbDownloadToCache(creds, remotePath)
  );
  const webviewUri = Capacitor.convertFileSrc(localUri);
  thumbUriCache.set(cacheKey, webviewUri);
  return webviewUri;
}

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
  onZoomChange?: (zoomPct: number) => void;
}

const DicomViewer = forwardRef<DicomViewerHandle, DicomViewerProps>(
  ({ imageId, onZoomChange }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const elementRef = useRef<HTMLDivElement>(null);
    const enabledRef = useRef(false);
    const baseScaleRef = useRef(1);

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

interface PannableMediaProps {
  src: string;
  kind: "image" | "video";
  alt?: string;
  onZoomChange?: (zoomPct: number) => void;
}

const PannableMedia: React.FC<PannableMediaProps> = ({ src, kind, alt, onZoomChange }) => {
  const stageRef = useRef<HTMLDivElement>(null);
  const mediaRef = useRef<HTMLImageElement & HTMLVideoElement>(null as any);
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);

  const zoomRef = useRef(1);
  const positionRef = useRef({ x: 0, y: 0 });
  const lastTouchDistance = useRef<number | null>(null);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const lastTapRef = useRef(0);

  useEffect(() => {
    onZoomChange?.(Math.round(zoom * 100));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom]);

  const clampPosition = (pos: { x: number; y: number }, zoomLevel: number) => {
    const container = stageRef.current;
    const media = mediaRef.current;
    if (!container || !media) return pos;

    const containerRect = container.getBoundingClientRect();
    const baseW = media.offsetWidth;
    const baseH = media.offsetHeight;

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

  const resetZoom = () => {
    zoomRef.current = 1;
    positionRef.current = { x: 0, y: 0 };
    setZoom(1);
    setPosition({ x: 0, y: 0 });
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      const el = stageRef.current;
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
        if (e.touches.length === 2 || isDraggingRef.current) {
          e.preventDefault();
        } else {
          return;
        }

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoomRef.current > 1) {
      setIsDragging(true);
      isDraggingRef.current = true;
      dragStartRef.current = { x: e.clientX - positionRef.current.x, y: e.clientY - positionRef.current.y };
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

  return (
    <div className="pannable-wrapper">
      <div
        ref={stageRef}
        className="pannable-stage"
        style={{ cursor: zoom > 1 ? (isDragging ? "grabbing" : "grab") : "default" }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onDoubleClick={handleDoubleClick}
      >
        {kind === "image" ? (
          <img
            ref={mediaRef as any}
            src={src}
            alt={alt}
            draggable={false}
            className="pannable-media pannable-image"
            style={{
              transform: `translate(${position.x}px, ${position.y}px) scale(${zoom})`,
              transition: isDragging ? "none" : "transform 0.2s ease",
            }}
          />
        ) : (
          <video
            ref={mediaRef as any}
            src={src}
            controls
            playsInline
            className="pannable-media pannable-video"
            style={{
              transform: `translate(${position.x}px, ${position.y}px) scale(${zoom})`,
              transition: isDragging ? "none" : "transform 0.2s ease",
            }}
          />
        )}

        {zoom === 1 && (
          <div className="zoom-hint">
            {kind === "image" ? "Pinch or double-tap to zoom" : "Pinch or double-tap the frame to zoom"}
          </div>
        )}
      </div>

      <div className={`zoom-toolbar ${kind === "video" ? "zoom-toolbar-video" : ""}`}>
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
  );
};

const DicomThumbnail: React.FC<{ creds: any; remotePath: string }> = ({ creds, remotePath }) => {
  const [imageId, setImageId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!creds || !remotePath) return;

    (async () => {
      try {
        const webviewUri = await getThumbUri(creds, remotePath);
        if (cancelled) return;
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

const ImageThumbnail: React.FC<{ creds: any; remotePath: string }> = ({ creds, remotePath }) => {
  const [uri, setUri] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!creds || !remotePath) return;

    (async () => {
      try {
        const webviewUri = await getThumbUri(creds, remotePath);
        if (cancelled) return;
        setUri(webviewUri);
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
        const webviewUri = await getThumbUri(creds, remotePath);
        if (cancelled) return;
        setUri(webviewUri);
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

const pdfPageThumbCache = new Map<string, string>();

const PdfThumbnail: React.FC<{ creds: any; remotePath: string }> = ({ creds, remotePath }) => {
  const [pageUrl, setPageUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!creds || !remotePath) return;

    const pageCacheKey = `${creds?.ip}|${creds?.share}|${remotePath}`;
    const cachedPage = pdfPageThumbCache.get(pageCacheKey);
    if (cachedPage) {
      setPageUrl(cachedPage);
      return;
    }

    (async () => {
      try {
        const webviewUri = await getThumbUri(creds, remotePath);
        if (cancelled) return;

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
        const dataUrl = canvas.toDataURL("image/jpeg", 0.75);
        pdfPageThumbCache.set(pageCacheKey, dataUrl);
        setPageUrl(dataUrl);
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

const SmbImages: React.FC = () => {
  const isNative = Capacitor.isNativePlatform();
  const location = useLocation();
const history = useHistory();
  const [cfg, setCfg] = useState<any>(null);
  const [cfgChecked, setCfgChecked] = useState(false); // NEW — distinguishes "still checking" from "no cfg found"
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("Loading SMB...");
  const [toast, setToast] = useState("");


  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewType, setPreviewType] = useState<
    "image" | "video" | "pdf" | "dicom" | "other"
  >("other");
  const [previewUri, setPreviewUri] = useState<string>("");
  const [previewName, setPreviewName] = useState<string>("");

  const [mediaZoom, setMediaZoom] = useState(100);
  const [dicomZoom, setDicomZoom] = useState(100);
  const dicomViewerRef = useRef<DicomViewerHandle>(null);

  const [showConfirm, setShowConfirm] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any | null>(null);

  const params = new URLSearchParams(location.search);
  const path = normalizePath(params.get("path"));

  const shareName = useMemo(() => cfg?.share || "WiFiShare", [cfg]);

  const credsOf = (c: any) => ({
    ip: c.ip,
    username: c.username,
    password: c.password,
    share: shareName,
  });

  // ✅ Folders first, then newest first within each group.
  const sortedItems = useMemo(() => sortItems(items), [items]);

  useEffect(() => {
    const selected = localStorage.getItem("sbmSelected");
    if (selected) {
      try {
        setCfg(JSON.parse(selected));
      } catch (err) {
        console.error("❌ Failed to parse stored SMB config:", err);
        setToast("Saved SMB config is corrupted — please reselect a server.");
      }
    } else {
      setToast("No SMB network selected");
    }
    setCfgChecked(true);
  }, []);



  useEffect(() => {
    if (!cfgChecked) return; // wait until we've actually checked localStorage 
    if (!cfg) return; // no server selected — nothing to load
    if (!isNative) return; // SMB only works in the native app

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setLoadingMessage("Loading SMB...");
      try {
        const res = await smbListDir(credsOf(cfg), path);
        if (cancelled) return;
        setItems(res || []);
      } catch (e: any) {
        console.error("❌ smbListDir failed:", e, { path, share: shareName });
        if (!cancelled) {
          setItems([]);
          setToast(e?.message || `Failed to load "${path}" from SMB share.`);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfgChecked, cfg, path, isNative, shareName]);

  const resetZoom = () => {
    setMediaZoom(100);
    setDicomZoom(100);
  };

  const handlePreviewDismiss = () => {
    setPreviewOpen(false);
    resetZoom();
  };

  const openFolder = (it: any) => {
    window.location.href = `/smbImages?path=${encodeURIComponent(it.path)}`;
  };

  const openFile = async (it: any) => {
    const type = fileType(it.name);

    try {
      setLoading(true);

      const { localUri } = await smbDownloadToCache(credsOf(cfg), it.path);

      if (type === "pdf") {
        await FileOpener.open({
          filePath: localUri,
          contentType: "application/pdf",
        });
        return;
      }

      if (type === "dicom") {
        const webviewUri = Capacitor.convertFileSrc(localUri);

        resetZoom();
        setPreviewType("dicom");
        setPreviewName(it.name);
        setPreviewUri(`wadouri:${webviewUri}`);
        setPreviewOpen(true);
        return;
      }

      const webviewUri = Capacitor.convertFileSrc(localUri);

      resetZoom();
      setPreviewType(type as any);
      setPreviewUri(webviewUri);
      setPreviewName(it.name);
      setPreviewOpen(true);
    } catch (e: any) {
      console.error("❌ openFile failed:", e);
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

  const confirmDelete = () => {
    if (!selectedItem) return;
    setItems((prev) => prev.filter((i) => i.path !== selectedItem.path));
    setToast(`"${selectedItem.name}" removed from list.`);
    setShowConfirm(false);
    setSelectedItem(null);
  };
  const goToUploadPage = () => {
    history.push("/sbmUploads");
  };


  return (
    <IonPage>
      <IonHeader>
        <IonToolbar className="custom-toolbar">
          <IonButtons slot="start">
            <IonBackButton defaultHref="/sbm" color="light" />
          </IonButtons>
          <IonTitle className="text-white text-center">SMB Browser</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={goToUploadPage}>
              <IonIcon icon={cloudUploadOutline} slot="start" />
              Upload
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>

      <IonContent className="dicom-bg">
        <IonLoading isOpen={loading} message={loadingMessage} />

        {!isNative && (
          <IonCard color="warning">
            <IonCardContent>
              <strong>SMB is not supported in Web browser.</strong>
              <br />
              Please run on Android/iOS build.
            </IonCardContent>
          </IonCard>
        )}

        {isNative && cfgChecked && !cfg && (
          <IonCard color="warning">
            <IonCardContent>
              <strong>No SMB server selected.</strong>
              <br />
              Please go back and choose a server first.
            </IonCardContent>
          </IonCard>
        )}

        {isNative && cfg && (
          <div className="image-grid">
            {!loading && sortedItems.length === 0 ? (
              <div className="w-full text-center text-gray-500 py-8">
                No files or folders
              </div>
            ) : (
              sortedItems.map((it: any) => {
                const type = it.isDir ? "folder" : fileType(it.name);
                return (
                  <div key={it.path} className="image-card">
                    <div
                      className="preview-container"
                      onClick={() => handleViewClick(it)}
                    >
                      {it.isDir ? (
                        <IonIcon icon={folderOutline} className="file-type-icon" />
                      ) : (
                        <FileThumbnail creds={credsOf(cfg)} item={it} />
                      )}
                    </div>

                    <div className="file-name-row">
                      <span className="file-name-text">{it.name}</span>
                      <span className="file-type-text">
                        {it.isDir ? "Folder" : type.toUpperCase()}
                      </span>
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
                  {mediaZoom}%
                </div>
              )}
              {previewType === "video" && (
                <div className="header-zoom-badge" slot="end">
                  {mediaZoom}%
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
              <PannableMedia
                key={previewUri}
                src={previewUri}
                kind="image"
                alt={previewName}
                onZoomChange={setMediaZoom}
              />
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
              <PannableMedia
                key={previewUri}
                src={previewUri}
                kind="video"
                alt={previewName}
                onZoomChange={setMediaZoom}
              />
            ) : (
              <IonCard>
                <IonCardContent>
                  Preview not supported for this file type.
                </IonCardContent>
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

        <IonToast
          isOpen={!!toast}
          message={toast}
          duration={2500}
          onDidDismiss={() => setToast("")}
        />
      </IonContent>
<AppFooter/>
    </IonPage>
  );
};

export default SmbImages;
