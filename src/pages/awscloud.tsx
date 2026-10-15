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
  IonAlert,
  IonLoading,
  IonModal,
  IonImg,
} from "@ionic/react";
import {
  eyeOutline,
  trashOutline,
  downloadOutline,
  documentTextOutline,
  documentOutline,
  removeOutline,
  addOutline,
  refreshOutline,
  cloudUploadOutline,
  folderOutline,
  chevronBackOutline,
} from "ionicons/icons";
import {
  DeleteObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
  ListObjectsV2CommandOutput,
} from "@aws-sdk/client-s3";
import * as cornerstone from "cornerstone-core";
import * as cornerstoneWADOImageLoader from "cornerstone-wado-image-loader";
import dicomParser from "dicom-parser";
import axios from "axios";
import { useHistory, useLocation } from "react-router-dom";
import {
  getS3Client,
  listFolderContents,
  getFileKind,
  KIND_META,
  S3FileItem,
} from "../utils/s3Utils";
import "../css/s3pages.css";
import AppFooter from "../components/AppFooter";

// Cornerstone setup
cornerstoneWADOImageLoader.external.cornerstone = cornerstone;
cornerstoneWADOImageLoader.external.dicomParser = dicomParser;
cornerstoneWADOImageLoader.configure({
  useWebWorkers: true,
  decodeConfig: { convertFloatPixelDataToInt: false },
});

const IMG_MIN_ZOOM = 1;
const IMG_MAX_ZOOM = 4;
const DOUBLE_TAP_ZOOM = 2.5;
const DOUBLE_TAP_DELAY = 280; // ms

const DICOM_MIN_SCALE_MULT = 0.25;
const DICOM_MAX_SCALE_MULT = 8;
const DICOM_DOUBLE_TAP_SCALE_MULT = 2.5;
const DICOM_DOUBLE_TAP_DELAY = 280;

/**
 * Ionic components accept CSS custom properties (e.g. "--color") in their
 * `style` prop, which aren't part of the standard React.CSSProperties type.
 * This type lets us pass those without resorting to `as any`.
 */
type IonicStyle = React.CSSProperties & {
  [customVar: string]: string | number | undefined;
};

/** Minimal shape of the cornerstone viewport object we actually touch. */
interface CornerstoneViewport {
  scale: number;
  translation: { x: number; y: number };
  [key: string]: unknown;
}

/* ======================================================================
   DICOM Viewer — cornerstone-driven pinch/pan/wheel/double-tap zoom.
   ====================================================================== */
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

    const getViewport = useCallback((): CornerstoneViewport | null => {
      if (!elementRef.current || !enabledRef.current) return null;
      try {
        return cornerstone.getViewport(elementRef.current) as CornerstoneViewport;
      } catch {
        return null;
      }
    }, []);

    const applyViewport = useCallback(
      (vp: CornerstoneViewport) => {
        if (!elementRef.current || !enabledRef.current) return;
        try {
          cornerstone.setViewport(elementRef.current, vp);
          const pct = Math.round((vp.scale / baseScaleRef.current) * 100);
          onZoomChange?.(pct);
        } catch {
          // element may not be enabled yet — ignore
        }
      },
      [onZoomChange]
    );

    const clampScale = useCallback(
      (scale: number) =>
        Math.min(
          Math.max(scale, baseScaleRef.current * DICOM_MIN_SCALE_MULT),
          baseScaleRef.current * DICOM_MAX_SCALE_MULT
        ),
      []
    );

    const zoomTo = useCallback(
      (scale: number) => {
        const vp = getViewport();
        if (!vp) return;
        vp.scale = clampScale(scale);
        if (vp.scale <= baseScaleRef.current) {
          vp.translation = { x: 0, y: 0 };
        }
        applyViewport(vp);
      },
      [getViewport, clampScale, applyViewport]
    );

    useImperativeHandle(
      ref,
      () => ({
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
      }),
      [getViewport, zoomTo]
    );

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
        const vp = cornerstone.getViewport(el) as CornerstoneViewport;
        baseScaleRef.current = vp.scale || 1;
        onZoomChange?.(100);
      } catch (err) {
        console.error("DICOM load failed:", err);
      }
    }, [imageId, onZoomChange]);

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
    }, [imageId, getViewport, zoomTo, applyViewport]);

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

/** Thumbnail-only DICOM renderer used in the grid */
const DicomThumbnail: React.FC<{ url: string }> = ({ url }) => {
  return <DicomViewer imageId={`wadouri:${url}`} />;
};

/* ======================================================================
   PannableMedia — shared pinch-zoom / pan / double-tap / wheel / dblclick
   viewer used for BOTH images and video in the preview modal.
   ====================================================================== */
interface PannableMediaProps {
  src: string;
  kind: "image" | "video";
  alt?: string;
  onZoomChange?: (zoomPct: number) => void;
}

const PannableMedia: React.FC<PannableMediaProps> = ({ src, kind, alt, onZoomChange }) => {
  const stageRef = useRef<HTMLDivElement>(null);
  const mediaRef = useRef<HTMLImageElement & HTMLVideoElement>(null!);

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

  const clampPosition = useCallback(
    (pos: { x: number; y: number }, zoomLevel: number) => {
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
    },
    []
  );

  const applyZoom = useCallback(
    (nextZoomRaw: number, anchorPos?: { x: number; y: number }) => {
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
    },
    [clampPosition]
  );

  const toggleZoom = useCallback(() => {
    if (zoomRef.current > 1) applyZoom(1);
    else applyZoom(DOUBLE_TAP_ZOOM);
  }, [applyZoom]);

  const resetZoom = useCallback(() => {
    zoomRef.current = 1;
    positionRef.current = { x: 0, y: 0 };
    setZoom(1);
    setPosition({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
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
  }, [toggleZoom, clampPosition, applyZoom]);

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
            ref={mediaRef}
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
            ref={mediaRef}
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

/* ======================================================================
   Main List Page
   ====================================================================== */
const AWSList: React.FC = () => {
  const history = useHistory();
  const location = useLocation();

  const [currentFolder, setCurrentFolder] = useState<string>("");
  const [subFolders, setSubFolders] = useState<string[]>([]);
  const [files, setFiles] = useState<S3FileItem[]>([]);

  const [loading, setLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  const [showDeleteAlert, setShowDeleteAlert] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<string | null>(null);

  const [showDeleteFolderAlert, setShowDeleteFolderAlert] = useState(false);
  const [folderToDelete, setFolderToDelete] = useState<string | null>(null);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState<string>("");
  const [previewType, setPreviewType] = useState<"image" | "pdf" | "video" | "dicom" | null>(null);
  const [showModal, setShowModal] = useState<boolean>(false);
  const [modalZoomPct, setModalZoomPct] = useState(100);

  const dicomViewerRef = useRef<DicomViewerHandle>(null);

  const awsConfig = JSON.parse(localStorage.getItem("awsConfig") || "{}");
  const { bucketName } = awsConfig;

  // Read starting folder from ?folder= query param (e.g. after an upload)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const folderParam = params.get("folder");
    if (folderParam) setCurrentFolder(folderParam);
    // Intentionally run only on mount — we don't want to react to every
    // location change, only the initial query param.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchContents = useCallback(async (folder: string) => {
    if (!getS3Client()) {
      setToastMessage("Invalid AWS configuration.");
      return;
    }
    setLoading(true);
    try {
      const { folders, files: fileList } = await listFolderContents(folder);
      setSubFolders(folders);
      setFiles(fileList);
    } catch (err) {
      console.error("Fetch error:", err);
      setToastMessage("Failed to fetch S3 files.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchContents(currentFolder);
  }, [currentFolder, fetchContents]);

  const openFolder = (folderPath: string) => setCurrentFolder(folderPath);

  const goUp = () => {
    const parts = currentFolder.split("/").filter(Boolean);
    parts.pop();
    setCurrentFolder(parts.join("/"));
  };

  const breadcrumbs = useMemo(() => {
    const parts = currentFolder.split("/").filter(Boolean);
    return parts.map((part, idx) => ({
      label: part,
      path: parts.slice(0, idx + 1).join("/"),
    }));
  }, [currentFolder]);

  // Delete single file
  const handleDelete = async (key: string) => {
    const clientConfig = getS3Client();
    if (!clientConfig || !key) return;
    setLoading(true);
    try {
      await clientConfig.s3.send(
        new DeleteObjectCommand({ Bucket: clientConfig.BUCKET_NAME, Key: key })
      );
      setToastMessage("File deleted successfully.");
      await fetchContents(currentFolder);
    } catch (err) {
      console.error("Delete error:", err);
      setToastMessage("Failed to delete file.");
    } finally {
      setLoading(false);
    }
  };

  // Delete an entire folder (all objects under its prefix), handling pagination
  const handleDeleteFolder = async (folderPath: string) => {
    const clientConfig = getS3Client();
    if (!clientConfig || !folderPath) return;

    setLoading(true);
    try {
      const prefix = folderPath.endsWith("/") ? folderPath : `${folderPath}/`;
      let continuationToken: string | undefined = undefined;
      let totalDeleted = 0;

      do {
        const listResp: ListObjectsV2CommandOutput = await clientConfig.s3.send(
          new ListObjectsV2Command({
            Bucket: clientConfig.BUCKET_NAME,
            Prefix: prefix,
            ContinuationToken: continuationToken,
          })
        );

        const objectsToDelete = (listResp.Contents || [])
          .filter((obj) => !!obj.Key)
          .map((obj) => ({ Key: obj.Key as string }));

        if (objectsToDelete.length > 0) {
          await clientConfig.s3.send(
            new DeleteObjectsCommand({
              Bucket: clientConfig.BUCKET_NAME,
              Delete: { Objects: objectsToDelete },
            })
          );
          totalDeleted += objectsToDelete.length;
        }

        continuationToken = listResp.IsTruncated ? listResp.NextContinuationToken : undefined;
      } while (continuationToken);

      if (totalDeleted === 0) {
        setToastMessage("Folder was already empty.");
      } else {
        setToastMessage("Folder deleted successfully.");
      }
      await fetchContents(currentFolder);
    } catch (err) {
      console.error("Delete folder error:", err);
      setToastMessage("Failed to delete folder.");
    } finally {
      setLoading(false);
    }
  };

  // Preview
  const handlePreview = (item: S3FileItem) => {
    const kind = getFileKind(item.name);
    setPreviewUrl(item.url);
    setPreviewName(item.name || "");
    setModalZoomPct(100);
    if (kind === "other") setPreviewType(null);
    else setPreviewType(kind);
    setShowModal(true);
  };

  const handleModalDismiss = () => {
    setShowModal(false);
    setModalZoomPct(100);
  };

  // Download
  const handleDownload = async (url: string, filename: string) => {
    try {
      const response = await axios.get(url, { responseType: "blob" });
      const contentType = String(response.headers["content-type"] || "application/octet-stream");

      const blob = new Blob([response.data], {
        type: contentType,
      });

      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      console.error("Download error:", error);
      setToastMessage("Error downloading file.");
    }
  };

  const displayName = (key?: string) => {
    if (!key) return "Untitled";
    const raw = key.includes("-") ? key.substring(key.indexOf("-") + 1) : key;
    return raw.length > 22 ? `${raw.slice(0, 19)}…` : raw;
  };

  const folderShortName = (path: string) => path.split("/").pop() || path;

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar
          style={
            {
              "--background": "#0f766e",
              "--color": "#ffffff",
              "--border-color": "transparent",
            } as IonicStyle
          }
        >
          <IonButtons slot="start">
            <IonBackButton
              defaultHref="/awsconfiglist"
              style={{ "--color": "#ffffff" } as IonicStyle}
            />
          </IonButtons>
          <IonTitle style={{ color: "#ffffff", fontWeight: 700, textAlign: "center", fontSize: "18px" }}>
            {bucketName || "AWS S3 Files"}
          </IonTitle>
          <IonButtons slot="end">
            <IonButton
              style={{ "--color": "#ffffff" } as IonicStyle}
              onClick={() => history.push("/awsupload")}
            >
              <IonIcon icon={cloudUploadOutline} slot="start" />
              Upload
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>

      <IonContent className="dicom-bg">
        <IonLoading isOpen={loading} message="Please wait..." />

        {/* Breadcrumb / folder nav */}
        <div className="breadcrumb-bar">
          {currentFolder && (
            <IonButton fill="clear" size="small" className="breadcrumb-back" onClick={goUp}>
              <IonIcon icon={chevronBackOutline} slot="start" />
              Back
            </IonButton>
          )}
          <div className="breadcrumb-trail">
            <span className="breadcrumb-item" onClick={() => setCurrentFolder("")}>
              Root
            </span>
            {breadcrumbs.map((b) => (
              <React.Fragment key={b.path}>
                <span className="breadcrumb-sep">/</span>
                <span className="breadcrumb-item" onClick={() => setCurrentFolder(b.path)}>
                  {b.label}
                </span>
              </React.Fragment>
            ))}
          </div>
        </div>

        {subFolders.length === 0 && files.length === 0 && !loading ? (
          <div className="empty-files">
            <IonIcon icon={cloudUploadOutline} />
            <p>No files yet in this folder. Upload one to get started.</p>
            <IonButton size="small" onClick={() => history.push("/awsupload")}>
              Go to Upload
            </IonButton>
          </div>
        ) : (
          <div className="image-grid">
            {subFolders.map((folderPath) => (
              <div key={folderPath} className="image-card folder-card">
                <div className="preview-container folder-tile" onClick={() => openFolder(folderPath)}>
                  <IonIcon icon={folderOutline} className="folder-icon" />
                </div>
                <div className="file-name" title={folderShortName(folderPath)}>
                  {folderShortName(folderPath)}
                </div>
                <div
                  className="icon-group"
                  style={{ display: "flex", justifyContent: "center", width: "100%" }}
                >
                  <IonButton
                    fill="clear"
                    color="danger"
                    style={{ margin: 0, "--padding-start": "6px", "--padding-end": "6px" } as IonicStyle}
                    onClick={(e) => {
                      e.stopPropagation();
                      setFolderToDelete(folderPath);
                      setShowDeleteFolderAlert(true);
                    }}
                  >
                    <IonIcon icon={trashOutline} size="small" />
                  </IonButton>
                </div>
              </div>
            ))}

            {files
              .slice()
              .reverse()
              .map((item) => {
                const kind = getFileKind(item.name);
                const meta = KIND_META[kind];
                return (
                  <div key={item.key} className="image-card">
                    <div className="preview-container" onClick={() => handlePreview(item)}>
                      <span className="kind-pill" style={{ background: meta.tint }}>
                        {meta.label}
                      </span>

                      {kind === "image" && <IonImg src={item.url} className="preview-media" />}

                      {kind === "video" && (
                        <video className="preview-media" muted>
                          <source src={item.url} type="video/mp4" />
                        </video>
                      )}

                      {kind === "dicom" && <DicomThumbnail url={item.url} />}

                      {(kind === "pdf" || kind === "other") && (
                        <div className="icon-tile" style={{ color: meta.tint }}>
                          <IonIcon icon={kind === "pdf" ? documentTextOutline : documentOutline} />
                        </div>
                      )}
                    </div>

                    <div className="file-name" title={item.name}>
                      {displayName(item.name)}
                    </div>

                    <div
                      className="icon-group"
                      style={{
                        display: "flex",
                        flexWrap: "nowrap",
                        justifyContent: "space-between",
                        alignItems: "center",
                        width: "100%",
                      }}
                    >
                      <IonButton
                        fill="clear"
                        color="primary"
                        style={{ margin: 0, "--padding-start": "6px", "--padding-end": "6px" } as IonicStyle}
                        onClick={() => handlePreview(item)}
                      >
                        <IonIcon icon={eyeOutline} size="small" />
                      </IonButton>
                      <IonButton
                        fill="clear"
                        color="success"
                        style={{ margin: 0, "--padding-start": "6px", "--padding-end": "6px" } as IonicStyle}
                        onClick={() => handleDownload(item.url, item.name)}
                      >
                        <IonIcon icon={downloadOutline} size="small" />
                      </IonButton>
                      <IonButton
                        fill="clear"
                        color="danger"
                        style={{ margin: 0, "--padding-start": "6px", "--padding-end": "6px" } as IonicStyle}
                        onClick={() => {
                          setFileToDelete(item.key);
                          setShowDeleteAlert(true);
                        }}
                      >
                        <IonIcon icon={trashOutline} size="small" />
                      </IonButton>
                    </div>
                  </div>
                );
              })}
          </div>
        )}

        {/* Modal Preview */}
        <IonModal isOpen={showModal} onDidDismiss={handleModalDismiss}>
          <IonHeader>
            <IonToolbar style={{ "--background": "#0f766e", "--color": "#fff" } as IonicStyle}>
              <IonButtons slot="start">
                <IonButton onClick={handleModalDismiss} style={{ "--color": "#fff" } as IonicStyle}>
                  Close
                </IonButton>
              </IonButtons>
              <IonTitle className="ion-text-center" style={{ color: "#fff", fontSize: 14 }}>
                {previewName ||
                  (previewType === "pdf"
                    ? "PDF Viewer"
                    : previewType === "image"
                      ? "Image Viewer"
                      : previewType === "video"
                        ? "Video Player"
                        : previewType === "dicom"
                          ? "DICOM Viewer"
                          : "Preview")}
              </IonTitle>
              {(previewType === "image" || previewType === "video" || previewType === "dicom") && (
                <div className="header-zoom-badge" slot="end">
                  {modalZoomPct}%
                </div>
              )}
            </IonToolbar>
          </IonHeader>

          <IonContent scrollY={false} className="viewer-body">
            {previewType === "image" && previewUrl && (
              <PannableMedia key={previewUrl} src={previewUrl} kind="image" alt={previewName} onZoomChange={setModalZoomPct} />
            )}

            {previewType === "video" && previewUrl && (
              <PannableMedia key={previewUrl} src={previewUrl} kind="video" alt={previewName} onZoomChange={setModalZoomPct} />
            )}

            {previewType === "dicom" && previewUrl && (
              <div className="image-viewer-wrapper">
                <DicomViewer ref={dicomViewerRef} imageId={`wadouri:${previewUrl}`} onZoomChange={setModalZoomPct} />

                {modalZoomPct === 100 && <div className="zoom-hint">Pinch, wheel, or double-tap to zoom</div>}

                <div className="zoom-toolbar">
                  <button className="zoom-toolbar-btn" onClick={() => dicomViewerRef.current?.zoomOut()} aria-label="Zoom out">
                    <IonIcon icon={removeOutline} />
                  </button>
                  <span className="zoom-toolbar-value">{modalZoomPct}%</span>
                  <button className="zoom-toolbar-btn" onClick={() => dicomViewerRef.current?.zoomIn()} aria-label="Zoom in">
                    <IonIcon icon={addOutline} />
                  </button>
                  <div className="zoom-toolbar-divider" />
                  <button className="zoom-toolbar-btn" onClick={() => dicomViewerRef.current?.reset()} aria-label="Reset zoom">
                    <IonIcon icon={refreshOutline} />
                  </button>
                </div>
              </div>
            )}

            {previewType === "pdf" && previewUrl && (
              <iframe
                src={`https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(previewUrl)}`}
                title="PDF Viewer"
                style={{ width: "100%", height: "100%", border: "none", backgroundColor: "#0f172a" }}
              />
            )}

            {!previewType && (
              <div className="unsupported-preview">
                <IonIcon icon={documentOutline} />
                <p>Preview not supported for this file type.</p>
              </div>
            )}
          </IonContent>
        </IonModal>

        <IonToast
          isOpen={!!toastMessage}
          message={toastMessage}
          duration={2500}
          onDidDismiss={() => setToastMessage("")}
        />

        <IonAlert
          isOpen={showDeleteAlert}
          onDidDismiss={() => setShowDeleteAlert(false)}
          header="Confirm Delete"
          message="Are you sure you want to delete this file?"
          buttons={[
            { text: "Cancel", role: "cancel" },
            {
              text: "Yes",
              handler: () => {
                if (fileToDelete) handleDelete(fileToDelete);
                setFileToDelete(null);
              },
            },
          ]}
        />

        <IonAlert
          isOpen={showDeleteFolderAlert}
          onDidDismiss={() => setShowDeleteFolderAlert(false)}
          header="Delete Folder"
          message="This will permanently delete this folder and everything inside it. Continue?"
          buttons={[
            { text: "Cancel", role: "cancel" },
            {
              text: "Delete",
              role: "destructive",
              handler: () => {
                if (folderToDelete) handleDeleteFolder(folderToDelete);
                setFolderToDelete(null);
              },
            },
          ]}
        />
      </IonContent>
      <AppFooter/>
    </IonPage>
  );
};

export default AWSList;