import React, { useCallback, useRef, useState } from "react";
import { IonButton, IonIcon } from "@ionic/react";
import { cropOutline, refreshOutline, alertCircleOutline } from "ionicons/icons";

interface Point {
  x: number;
  y: number;
}

interface MeasurementRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

type HandleType = "nw" | "ne" | "sw" | "se" | "move" | "new-rect";

export interface MeasurementResult {
  width: number;
  height: number;
  /** Always "px" — kept so callers that already read measurement.unit
   *  (added when cm support existed) don't need to change. */
  unit: "px";
}

interface ImageMeasurementToolProps {
  /** Source image to measure (data URL or remote URL). */
  imageUrl: string;
  /**
   * Called automatically every time the user finishes drawing/resizing/
   * moving the rectangle (on pointer release). dataUrl is the original
   * image with the rectangle + pixel-size labels burned in.
   */
  onAnnotatedImage: (dataUrl: string, measurement: MeasurementResult) => void;
  /** Called whenever the user resets/clears the measurement. */
  onClearMeasurement?: () => void;
  /** Use the smaller viewer treatment inside the mobile upload preview. */
  compact?: boolean;
}

const HANDLE_SIZE = 16;

// A box smaller than this (in displayed CSS pixels, either dimension) is
// treated as an accidental tap/drag rather than a real box.
const MIN_RECT_PX = 6;

const ImageMeasurementTool: React.FC<ImageMeasurementToolProps> = ({
  imageUrl,
  onAnnotatedImage,
  onClearMeasurement,
  compact = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);

  const [rect, setRect] = useState<MeasurementRect | null>(null);
  const [saved, setSaved] = useState<MeasurementResult | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Mirrors `rect` synchronously. React state updates are async, so on
  // pointer-up we can't rely on the `rect` state value being current yet —
  // this ref always has the latest box the user just drew/resized.
  const rectRef = useRef<MeasurementRect | null>(null);

  const draggingRef = useRef<{
    handle: HandleType;
    start: Point;
    original: MeasurementRect | null;
  } | null>(null);

  // Wrapper around setRect that also keeps rectRef in sync, so pointer-up
  // handlers can read the just-drawn/resized box immediately.
  const updateRect = (r: MeasurementRect | null) => {
    rectRef.current = r;
    setRect(r);
  };

  const getRelativePoint = (clientX: number, clientY: number): Point => {
    const rectBox = containerRef.current?.getBoundingClientRect();
    if (!rectBox) return { x: 0, y: 0 };
    return {
      x: Math.min(Math.max(clientX - rectBox.left, 0), rectBox.width),
      y: Math.min(Math.max(clientY - rectBox.top, 0), rectBox.height),
    };
  };

  const clampRectToContainer = (r: MeasurementRect): MeasurementRect => {
    const bounds = containerRef.current?.getBoundingClientRect();
    const maxW = bounds?.width ?? r.x + r.w;
    const maxH = bounds?.height ?? r.y + r.h;

    let { x, y, w, h } = r;
    x = Math.max(0, Math.min(x, maxW));
    y = Math.max(0, Math.min(y, maxH));
    w = Math.max(0, Math.min(w, maxW - x));
    h = Math.max(0, Math.min(h, maxH - y));
    return { x, y, w, h };
  };

  // ---- Draw a brand new measurement box ----
  const handleOverlayPointerDown = (e: React.PointerEvent<Element>) => {
    if ((e.target as HTMLElement).dataset.handle) return;

    const point = getRelativePoint(e.clientX, e.clientY);
    (e.currentTarget as Element & { setPointerCapture: (id: number) => void }).setPointerCapture(
      e.pointerId
    );

    draggingRef.current = { handle: "new-rect", start: point, original: null };
    updateRect({ x: point.x, y: point.y, w: 0, h: 0 });
    setSaved(null);
    setSaveError(null);
  };

  const handleOverlayPointerMove = (e: React.PointerEvent<Element>) => {
    const drag = draggingRef.current;
    if (!drag || drag.handle !== "new-rect") return;
    const point = getRelativePoint(e.clientX, e.clientY);
    const x = Math.min(drag.start.x, point.x);
    const y = Math.min(drag.start.y, point.y);
    const w = Math.abs(point.x - drag.start.x);
    const h = Math.abs(point.y - drag.start.y);
    updateRect(clampRectToContainer({ x, y, w, h }));
  };

  // ---- Resize/move handles for the finalized measurement rectangle ----
  const startHandleDrag = (handle: HandleType) => (e: React.PointerEvent<Element>) => {
    e.stopPropagation();
    if (!rect) return;
    (e.currentTarget as Element & { setPointerCapture: (id: number) => void }).setPointerCapture(
      e.pointerId
    );
    draggingRef.current = {
      handle,
      start: getRelativePoint(e.clientX, e.clientY),
      original: { ...rect },
    };
  };

  const handleGlobalPointerMove = (e: React.PointerEvent<Element>) => {
    const drag = draggingRef.current;
    if (!drag || !drag.original) return;
    const point = getRelativePoint(e.clientX, e.clientY);
    const dx = point.x - drag.start.x;
    const dy = point.y - drag.start.y;
    const orig = drag.original;

    if (drag.handle === "move") {
      updateRect(clampRectToContainer({ ...orig, x: orig.x + dx, y: orig.y + dy }));
      return;
    }

    let { x, y, w, h } = orig;
    if (drag.handle === "nw") { x = orig.x + dx; y = orig.y + dy; w = orig.w - dx; h = orig.h - dy; }
    if (drag.handle === "ne") { y = orig.y + dy; w = orig.w + dx; h = orig.h - dy; }
    if (drag.handle === "sw") { x = orig.x + dx; w = orig.w - dx; h = orig.h + dy; }
    if (drag.handle === "se") { w = orig.w + dx; h = orig.h + dy; }

    // Normalize negative widths/heights so the box never inverts.
    if (w < 0) { x += w; w = Math.abs(w); }
    if (h < 0) { y += h; h = Math.abs(h); }

    updateRect(clampRectToContainer({ x, y, w, h }));
  };

  // ---- Get the actual rendered image box vs its natural pixel size ----
  // Independent X/Y scale factors (natural px per displayed CSS px) so the
  // burned-in canvas box lines up correctly regardless of the image's
  // aspect ratio, even if it's ever displayed letterboxed/cropped.
  const getRenderScaleFactors = (): { scaleX: number; scaleY: number } | null => {
    if (!imgRef.current) return null;
    const naturalW = naturalSize?.w || imgRef.current.naturalWidth;
    const naturalH = naturalSize?.h || imgRef.current.naturalHeight;
    const renderedBox = imgRef.current.getBoundingClientRect();
    if (!naturalW || !naturalH || !renderedBox.width || !renderedBox.height) {
      return null;
    }
    return {
      scaleX: naturalW / renderedBox.width,
      scaleY: naturalH / renderedBox.height,
    };
  };

  // ---- Burn the measurement box + labels into the source image ----
  // Takes the box explicitly (rather than reading the `rect` state) so it
  // always uses the latest value, even when called right on pointer-up
  // before React has re-rendered. Always saves — in natural image pixels,
  // no scale/calibration step required.
  const performSave = useCallback(
    (box: MeasurementRect) => {
      if (!containerRef.current || !imgRef.current) return;

      if (box.w < MIN_RECT_PX || box.h < MIN_RECT_PX) {
        // Too small to be a real measurement (accidental tap/micro-drag) —
        // don't auto-save noise.
        return;
      }

      const renderScale = getRenderScaleFactors();
      if (!renderScale) {
        setSaveError("Could not read the image dimensions on this device.");
        return;
      }
      const { scaleX, scaleY } = renderScale;

      // Convert the displayed-space box into natural image pixels — this
      // is what keeps things correct for the image's own aspect ratio,
      // regardless of how large/small it's shown on screen.
      const width = box.w * scaleX;
      const height = box.h * scaleY;

      const naturalW = naturalSize?.w || imgRef.current.naturalWidth;
      const naturalH = naturalSize?.h || imgRef.current.naturalHeight;

      const canvas = document.createElement("canvas");
      canvas.width = naturalW;
      canvas.height = naturalH;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        setSaveError("Could not save the measurement on this device.");
        return;
      }

      ctx.drawImage(imgRef.current, 0, 0, canvas.width, canvas.height);

      const boxX = box.x * scaleX;
      const boxY = box.y * scaleY;
      const boxW = box.w * scaleX;
      const boxH = box.h * scaleY;

      ctx.strokeStyle = "#22d3ee";
      ctx.lineWidth = Math.max(2, canvas.width / 400);
      ctx.strokeRect(boxX, boxY, boxW, boxH);

      const fontSize = Math.max(18, canvas.width / 30);
      ctx.font = `bold ${fontSize}px sans-serif`;
      ctx.fillStyle = "#0f172a";
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = fontSize / 6;

      const wLabel = `W: ${Math.round(width)} px`;
      const hLabel = `H: ${Math.round(height)} px`;

      // Width label: default above the box, flip below if it would go off the top.
      const wx = Math.min(Math.max(boxX + boxW / 2, fontSize * 3), canvas.width - fontSize * 3);
      const wy = boxY - fontSize / 2 >= fontSize ? boxY - fontSize / 2 : boxY + boxH + fontSize * 1.2;

      ctx.textAlign = "center";
      ctx.strokeText(wLabel, wx, wy);
      ctx.fillText(wLabel, wx, wy);

      // Height label: default to the right of the box, flip inside/left if
      // it would run past the right edge of the canvas.
      const hLabelWidth = ctx.measureText(hLabel).width;
      const fitsOnRight = boxX + boxW + fontSize / 2 + hLabelWidth < canvas.width;
      ctx.textAlign = fitsOnRight ? "left" : "right";
      const hx = fitsOnRight ? boxX + boxW + fontSize / 2 : boxX - fontSize / 2;
      const hy = boxY + boxH / 2;

      ctx.strokeText(hLabel, hx, hy);
      ctx.fillText(hLabel, hx, hy);

      const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
      const result: MeasurementResult = { width, height, unit: "px" };
      setSaved(result);
      setSaveError(null);
      onAnnotatedImage(dataUrl, result);
    },
    [naturalSize, onAnnotatedImage]
  );

  // ---- Single pointer-up handler for the whole overlay ----
  // Always saves — no scale/calibration step to gate on.
  const handlePointerUp = () => {
    const drag = draggingRef.current;
    draggingRef.current = null;
    if (!drag) return;

    const finishedRect = rectRef.current;
    if (!finishedRect) return;

    if (finishedRect.w < MIN_RECT_PX || finishedRect.h < MIN_RECT_PX) {
      // Accidental tap/micro-drag — ignore it.
      updateRect(null);
      return;
    }

    performSave(finishedRect);
  };

  const resetAll = () => {
    updateRect(null);
    setSaved(null);
    setSaveError(null);
    onClearMeasurement?.();
  };

  // Live label values shown while dragging/resizing, before pointer-up.
  const renderScale = getRenderScaleFactors();
  const liveWidthPx = rect && renderScale ? Math.round(rect.w * renderScale.scaleX) : null;
  const liveHeightPx = rect && renderScale ? Math.round(rect.h * renderScale.scaleY) : null;

  const widthLabel = liveWidthPx !== null ? `W: ${liveWidthPx} px` : "";
  const heightLabel = liveHeightPx !== null ? `H: ${liveHeightPx} px` : "";

  // Live label positions in the editing overlay, clamped the same way as
  // the burned-in canvas so what you see while dragging matches the saved file.
  const containerWidth = containerRef.current?.clientWidth ?? 0;
  const hLabelFitsRight = rect ? rect.x + rect.w + 90 < containerWidth : true;

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: compact ? 5 : 10,
        }}
      >
        <IonButton size="small" fill="solid" disabled>
          <IonIcon icon={cropOutline} slot="start" />
          Measure
        </IonButton>

        <IonButton
          size="small"
          fill="clear"
          onClick={resetAll}
          aria-label="Reset"
          style={{ marginLeft: "auto", "--padding-start": "8px", "--padding-end": "8px" } as React.CSSProperties}
        >
          <IonIcon icon={refreshOutline} slot="icon-only" />
        </IonButton>
      </div>

      <div
        style={{
          fontSize: compact ? 10 : 13,
          color: "#0e7490",
          background: "#ecfeff",
          borderRadius: 8,
          padding: compact ? "5px 8px" : "8px 12px",
          marginBottom: compact ? 5 : 10,
        }}
      >
        Draw a box around the wound — it measures and saves automatically. Drag the corner handles to adjust.
      </div>

      {saveError && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            fontWeight: 700,
            color: "#9a3412",
            background: "#fff7ed",
            border: "1px solid #fed7aa",
            borderRadius: 8,
            padding: "6px 10px",
            marginBottom: 8,
          }}
        >
          <IonIcon icon={alertCircleOutline} />
          {saveError}
        </div>
      )}

      <div
        ref={containerRef}
        onPointerDown={handleOverlayPointerDown}
        onPointerMove={(e) => {
          handleOverlayPointerMove(e);
          handleGlobalPointerMove(e);
        }}
        onPointerUp={handlePointerUp}
        style={{
          position: "relative",
          width: "100%",
          lineHeight: 0,
          touchAction: "none",
          borderRadius: 12,
          overflow: "hidden",
          border: "1px solid #e5e7eb",
          maxHeight: compact ? "34vh" : undefined,
        }}
      >
        <img
          ref={imgRef}
          src={imageUrl}
          alt="Measure"
          draggable={false}
          onLoad={(e) => {
            const target = e.currentTarget;
            setNaturalSize({ w: target.naturalWidth, h: target.naturalHeight });
          }}
          style={{
            width: "100%",
            height: compact ? "34vh" : "auto",
            display: "block",
            // Explicitly preserve the source image's true aspect ratio so
            // the X/Y render-scale factors above stay accurate.
            aspectRatio: naturalSize ? `${naturalSize.w} / ${naturalSize.h}` : undefined,
            objectFit: "contain",
          }}
        />

        <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
          {rect && (
            <>
              <rect
                x={rect.x}
                y={rect.y}
                width={rect.w}
                height={rect.h}
                fill="rgba(34,211,238,0.15)"
                stroke="#22d3ee"
                strokeWidth={2}
                pointerEvents="auto"
                onPointerDown={startHandleDrag("move")}
                style={{ cursor: "move" }}
              />
              {widthLabel && (
                <text
                  x={rect.x + rect.w / 2}
                  y={rect.y - 8 >= 12 ? rect.y - 8 : rect.y + rect.h + 18}
                  textAnchor="middle"
                  fontSize={13}
                  fontWeight={700}
                  fill="#0f172a"
                  stroke="#fff"
                  strokeWidth={3}
                  paintOrder="stroke"
                >
                  {widthLabel}
                </text>
              )}
              {heightLabel && (
                <text
                  x={hLabelFitsRight ? rect.x + rect.w + 8 : rect.x - 8}
                  y={rect.y + rect.h / 2}
                  textAnchor={hLabelFitsRight ? "start" : "end"}
                  fontSize={13}
                  fontWeight={700}
                  fill="#0f172a"
                  stroke="#fff"
                  strokeWidth={3}
                  paintOrder="stroke"
                >
                  {heightLabel}
                </text>
              )}
            </>
          )}
        </svg>

        {rect &&
          (["nw", "ne", "sw", "se"] as HandleType[]).map((h) => {
            const left = h.includes("w") ? rect.x : rect.x + rect.w;
            const top = h.includes("n") ? rect.y : rect.y + rect.h;
            return (
              <div
                key={h}
                data-handle={h}
                onPointerDown={startHandleDrag(h)}
                style={{
                  position: "absolute",
                  left: left - HANDLE_SIZE / 2,
                  top: top - HANDLE_SIZE / 2,
                  width: HANDLE_SIZE,
                  height: HANDLE_SIZE,
                  borderRadius: "50%",
                  background: "#fff",
                  border: "3px solid #0891b2",
                  cursor: `${h}-resize`,
                  touchAction: "none",
                }}
              />
            );
          })}
      </div>

      {saved && (
        <div style={{ marginTop: 8, fontSize: 13, color: "#166534", fontWeight: 600, textAlign: "center", }}>
           {Math.round(saved.width)} px × {Math.round(saved.height)} px
        </div>
      )}
    </div>
  );
};

export default ImageMeasurementTool;