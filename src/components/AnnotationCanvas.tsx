import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import MentionInput, { type MentionMember } from "@/components/comments/MentionInput";
import { Square, Circle, ArrowUpRight, Pencil, Type, MapPin, Undo2, Trash2, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type ToolType = "rect" | "ellipse" | "arrow" | "freehand" | "text" | "pin";

interface Annotation {
  id: string;
  type: ToolType;
  points: { x: number; y: number }[];
  color: string;
  strokeWidth: number;
  text?: string;
}

interface AnnotationCanvasProps {
  active: boolean;
  width: number;
  height: number;
  onSaveAnnotations?: (annotations: Annotation[], comment: string, mentionedUserIds?: string[], isCorrection?: boolean) => void;
  members?: MentionMember[];
  /** For video: returns current playback time in seconds */
  getMediaCurrentTime?: () => number;
}

const COLORS = [
  { value: "#EF4444", label: "Red" },
  { value: "#3B82F6", label: "Blue" },
  { value: "#22C55E", label: "Green" },
  { value: "#EAB308", label: "Yellow" },
  { value: "#1E293B", label: "Black" },
  { value: "#FFFFFF", label: "White" },
];

const STROKE_WIDTHS = [
  { value: 2, label: "細" },
  { value: 4, label: "中" },
  { value: 6, label: "太" },
];

const TOOLS: { type: ToolType; icon: typeof Square; label: string }[] = [
  { type: "rect", icon: Square, label: "矩形" },
  { type: "ellipse", icon: Circle, label: "円" },
  { type: "arrow", icon: ArrowUpRight, label: "矢印" },
  { type: "freehand", icon: Pencil, label: "フリーハンド" },
  { type: "text", icon: Type, label: "テキスト" },
  { type: "pin", icon: MapPin, label: "ピン" },
];

export default function AnnotationCanvas({ active, width, height, onSaveAnnotations, members = [], getMediaCurrentTime }: AnnotationCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tool, setTool] = useState<ToolType>("rect");
  const [color, setColor] = useState("#EF4444");
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [undoStack, setUndoStack] = useState<Annotation[][]>([]);
  const [drawing, setDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [currentPoints, setCurrentPoints] = useState<{ x: number; y: number }[]>([]);
  const [textInput, setTextInput] = useState<{ x: number; y: number; value: string } | null>(null);
  const [pinInput, setPinInput] = useState<{ x: number; y: number; value: string } | null>(null);

  // Mandatory comment popup state
  const [pendingAnnotation, setPendingAnnotation] = useState<Annotation | null>(null);
  const [commentText, setCommentText] = useState("");
  const [commentError, setCommentError] = useState(false);
  const [mentionedUserIds, setMentionedUserIds] = useState<string[]>([]);

  const showingPopup = !!pendingAnnotation;

  // Clear all drawing state when paint mode is deactivated
  useEffect(() => {
    if (!active) {
      setAnnotations([]);
      setUndoStack([]);
      setPendingAnnotation(null);
      setCommentText("");
      setCommentError(false);
      setTextInput(null);
      setPinInput(null);
      setDrawing(false);
      setStartPoint(null);
      setCurrentPoints([]);
    }
  }, [active]);

  const getPos = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const allAnns = pendingAnnotation ? [...annotations, pendingAnnotation] : annotations;

    for (const ann of allAnns) {
      const isPending = ann.id === pendingAnnotation?.id;
      ctx.globalAlpha = isPending ? 0.5 : 1;
      ctx.strokeStyle = ann.color;
      ctx.fillStyle = ann.color;
      ctx.lineWidth = ann.strokeWidth;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      if (ann.type === "rect" && ann.points.length === 2) {
        const [p1, p2] = ann.points;
        ctx.strokeRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
      } else if (ann.type === "ellipse" && ann.points.length === 2) {
        const [p1, p2] = ann.points;
        const cx = (p1.x + p2.x) / 2;
        const cy = (p1.y + p2.y) / 2;
        const rx = Math.abs(p2.x - p1.x) / 2;
        const ry = Math.abs(p2.y - p1.y) / 2;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else if (ann.type === "arrow" && ann.points.length === 2) {
        const [from, to] = ann.points;
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
        const angle = Math.atan2(to.y - from.y, to.x - from.x);
        const headLen = 12;
        ctx.beginPath();
        ctx.moveTo(to.x, to.y);
        ctx.lineTo(to.x - headLen * Math.cos(angle - Math.PI / 6), to.y - headLen * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(to.x - headLen * Math.cos(angle + Math.PI / 6), to.y - headLen * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fill();
      } else if (ann.type === "freehand" && ann.points.length > 1) {
        ctx.beginPath();
        ctx.moveTo(ann.points[0].x, ann.points[0].y);
        for (let i = 1; i < ann.points.length; i++) {
          ctx.lineTo(ann.points[i].x, ann.points[i].y);
        }
        ctx.stroke();
      } else if (ann.type === "text" && ann.points.length >= 1 && ann.text) {
        const p = ann.points[0];
        ctx.font = "bold 14px 'Noto Sans JP', sans-serif";
        const metrics = ctx.measureText(ann.text);
        const pad = 4;
        ctx.globalAlpha = isPending ? 0.4 : 0.85;
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.fillRect(p.x - pad, p.y - 16, metrics.width + pad * 2, 22);
        ctx.fillStyle = ann.color;
        ctx.globalAlpha = isPending ? 0.5 : 1;
        ctx.fillText(ann.text, p.x, p.y);
      } else if (ann.type === "pin" && ann.points.length >= 1) {
        const p = ann.points[0];
        ctx.beginPath();
        ctx.arc(p.x, p.y, 14, 0, Math.PI * 2);
        ctx.fillStyle = ann.color;
        ctx.fill();
        ctx.fillStyle = "#FFFFFF";
        ctx.font = "bold 12px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("📌", p.x, p.y);
        ctx.textAlign = "start";
        ctx.textBaseline = "alphabetic";
      }
      ctx.globalAlpha = 1;
    }
  }, [annotations, pendingAnnotation]);

  useEffect(() => { redraw(); }, [annotations, pendingAnnotation, redraw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = width;
    canvas.height = height;
    redraw();
  }, [width, height, redraw]);

  // Calculate annotation bounding box as percentage of canvas
  const getAnnotationImagePosition = (ann: Annotation) => {
    if (ann.points.length < 2 && ann.type !== "pin" && ann.type !== "text") return undefined;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of ann.points) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    // Add some padding for pins/text
    if (ann.type === "pin" || ann.type === "text") {
      minX -= 20; minY -= 20; maxX += 20; maxY += 20;
    }
    return {
      x: (minX / width) * 100,
      y: (minY / height) * 100,
      width: ((maxX - minX) / width) * 100,
      height: ((maxY - minY) / height) * 100,
    };
  };

  const formatTimestamp = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.round((seconds % 1) * 1000);
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
    return `${m}:${String(s).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
  };

  const triggerCommentPopup = (ann: Annotation) => {
    setPendingAnnotation(ann);
    // Auto-insert timestamp prefix for video annotations
    if (getMediaCurrentTime) {
      const t = getMediaCurrentTime();
      setCommentText(`[${formatTimestamp(t)}] `);
    } else {
      setCommentText("");
    }
    setCommentError(false);
  };

  const handleConfirmComment = () => {
    if (!commentText.trim()) {
      setCommentError(true);
      return;
    }
    if (!pendingAnnotation) return;

    // Add the annotation permanently
    setUndoStack((s) => [...s, annotations]);
    setAnnotations((a) => [...a, pendingAnnotation]);

    // Save with comment and mentions
    const imagePosition = getAnnotationImagePosition(pendingAnnotation);
    const annotationWithPosition = { ...pendingAnnotation, imagePosition };
    onSaveAnnotations?.([annotationWithPosition] as unknown as Annotation[], commentText, mentionedUserIds.length > 0 ? mentionedUserIds : undefined);

    setPendingAnnotation(null);
    setCommentText("");
    setMentionedUserIds([]);
    setIsCorrection(false);
  };

  const handleCancelComment = () => {
    // Remove the pending annotation completely (undo)
    setPendingAnnotation(null);
    setCommentText("");
    setCommentError(false);
    setMentionedUserIds([]);
    setIsCorrection(false);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!active || showingPopup) return;
    const pos = getPos(e);

    if (tool === "text") {
      setTextInput({ x: pos.x, y: pos.y, value: "" });
      return;
    }
    if (tool === "pin") {
      setPinInput({ x: pos.x, y: pos.y, value: "" });
      return;
    }

    setDrawing(true);
    setStartPoint(pos);
    if (tool === "freehand") {
      setCurrentPoints([pos]);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!drawing || !active || showingPopup) return;
    const pos = getPos(e);
    if (tool === "freehand") {
      setCurrentPoints((p) => [...p, pos]);
    }
    const canvas = canvasRef.current;
    if (!canvas || !startPoint) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    redraw();
    ctx.strokeStyle = color;
    ctx.lineWidth = strokeWidth;
    ctx.setLineDash([5, 5]);

    if (tool === "rect") {
      ctx.strokeRect(startPoint.x, startPoint.y, pos.x - startPoint.x, pos.y - startPoint.y);
    } else if (tool === "ellipse") {
      const cx = (startPoint.x + pos.x) / 2;
      const cy = (startPoint.y + pos.y) / 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, Math.abs(pos.x - startPoint.x) / 2, Math.abs(pos.y - startPoint.y) / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (tool === "arrow") {
      ctx.beginPath();
      ctx.moveTo(startPoint.x, startPoint.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
    } else if (tool === "freehand") {
      ctx.setLineDash([]);
      ctx.beginPath();
      const pts = currentPoints;
      if (pts.length > 0) {
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.lineTo(pos.x, pos.y);
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (!drawing || !active || !startPoint || showingPopup) return;
    const pos = getPos(e);
    setDrawing(false);

    const newAnn: Annotation = {
      id: crypto.randomUUID(),
      type: tool,
      points: tool === "freehand" ? [...currentPoints, pos] : [startPoint, pos],
      color,
      strokeWidth,
    };

    setStartPoint(null);
    setCurrentPoints([]);

    // Trigger mandatory comment popup
    triggerCommentPopup(newAnn);
  };

  const confirmText = () => {
    if (!textInput || !textInput.value.trim()) {
      setTextInput(null);
      return;
    }
    const newAnn: Annotation = {
      id: crypto.randomUUID(),
      type: "text",
      points: [{ x: textInput.x, y: textInput.y }],
      color,
      strokeWidth,
      text: textInput.value,
    };
    setTextInput(null);
    triggerCommentPopup(newAnn);
  };

  const confirmPin = () => {
    if (!pinInput) return;
    const newAnn: Annotation = {
      id: crypto.randomUUID(),
      type: "pin",
      points: [{ x: pinInput.x, y: pinInput.y }],
      color,
      strokeWidth,
      text: pinInput.value || undefined,
    };
    setPinInput(null);
    triggerCommentPopup(newAnn);
  };

  const handleUndo = () => {
    if (showingPopup) return;
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setUndoStack((s) => s.slice(0, -1));
    setAnnotations(prev);
  };

  const handleClear = () => {
    if (showingPopup) return;
    setUndoStack((s) => [...s, annotations]);
    setAnnotations([]);
  };

  // Calculate popup position
  const getPopupPosition = () => {
    if (!pendingAnnotation) return { left: "50%", top: "50%" };
    const pts = pendingAnnotation.points;
    let cx = 0, cy = 0;
    for (const p of pts) { cx += p.x; cy += p.y; }
    cx /= pts.length;
    cy /= pts.length;
    // Place below annotation, or above if too close to bottom
    const popupY = cy + 40 < height - 120 ? cy + 40 : cy - 160;
    const popupX = Math.max(20, Math.min(cx - 150, width - 320));
    return { left: `${popupX}px`, top: `${popupY}px` };
  };

  if (!active) {
    return (
      <canvas
        ref={canvasRef}
        className="absolute inset-0 pointer-events-none"
        style={{ width: "100%", height: "100%" }}
      />
    );
  }

  return (
    <>
      {/* Canvas overlay */}
      <canvas
        ref={canvasRef}
        className={cn("absolute inset-0 z-20", showingPopup ? "pointer-events-none" : "cursor-crosshair")}
        style={{ width: "100%", height: "100%" }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      />

      {/* Mandatory comment popup overlay */}
      {showingPopup ? <>
          {/* Semi-transparent overlay to block canvas interaction */}
          <div className="absolute inset-0 z-[35] bg-black/20" onClick={(e) => e.stopPropagation()} />
          
          {/* Comment popup */}
          <div
            className="absolute z-[40] bg-card border border-border rounded-xl shadow-xl p-4 w-[300px]"
            style={getPopupPosition()}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold mb-2">修正指示を入力</h3>
            <div className={cn("mb-2", commentError && "[&_textarea]:border-destructive")}>
              <MentionInput
                value={commentText}
                onChange={(v) => {
                  setCommentText(v);
                  setCommentError(false);
                }}
                members={members}
                onMentions={setMentionedUserIds}
                placeholder="修正内容を入力... (@でメンション)"
                className="min-h-[70px] text-sm"
                onKeyDown={(e) => { if (e.key === "Enter" && e.metaKey) handleConfirmComment(); }}
              />
            </div>
            {commentError ? <p className="text-[10px] text-destructive mb-2">コメントを入力してください</p> : null}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" className="text-xs" onClick={handleCancelComment}>取消（削除）</Button>
              <Button size="sm" className="text-xs" onClick={handleConfirmComment}>保存して投稿</Button>
            </div>
          </div>
        </> : null}

      {/* Text input popover */}
      {textInput && !showingPopup ? <div
          className="absolute z-30 bg-card border border-border rounded-lg shadow-lg p-2 w-48"
          style={{ left: textInput.x, top: textInput.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="text"
            autoFocus
            value={textInput.value}
            onChange={(e) => setTextInput({ ...textInput, value: e.target.value })}
            onKeyDown={(e) => { if (e.key === "Enter") confirmText(); if (e.key === "Escape") setTextInput(null); }}
            className="w-full text-sm border border-border rounded px-2 py-1 bg-background"
            placeholder="テキストを入力..."
          />
          <div className="flex gap-1 mt-1">
            <Button size="sm" onClick={confirmText} className="text-xs flex-1 h-7">確定</Button>
            <Button size="sm" variant="outline" onClick={() => setTextInput(null)} className="text-xs h-7">取消</Button>
          </div>
        </div> : null}

      {/* Pin input popover */}
      {pinInput && !showingPopup ? <div
          className="absolute z-30 bg-card border border-border rounded-lg shadow-lg p-2 w-52"
          style={{ left: pinInput.x, top: pinInput.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <Textarea
            autoFocus
            value={pinInput.value}
            onChange={(e) => setPinInput({ ...pinInput, value: e.target.value })}
            placeholder="修正コメントを入力"
            className="min-h-[50px] text-xs mb-1"
          />
          <div className="flex gap-1">
            <Button size="sm" onClick={confirmPin} className="text-xs flex-1 h-7">保存</Button>
            <Button size="sm" variant="outline" onClick={() => setPinInput(null)} className="text-xs h-7">取消</Button>
          </div>
        </div> : null}

      {/* Toolbar */}
      <div className="absolute bottom-0 left-0 right-0 z-30 bg-card/95 backdrop-blur-sm border-t border-border shadow-lg px-3 py-2 flex items-center gap-1 flex-wrap" style={{ transform: "translateY(100%)" }} onClick={(e) => e.stopPropagation()}>
        {TOOLS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.type}
              onClick={() => setTool(t.type)}
              disabled={showingPopup}
              className={cn(
                "w-9 h-9 rounded-lg border flex items-center justify-center transition-colors",
                tool === t.type
                  ? "bg-primary/10 border-primary text-primary"
                  : "border-border text-muted-foreground hover:bg-muted",
                showingPopup && "opacity-40 pointer-events-none"
              )}
              title={t.label}
            >
              <Icon className="h-4 w-4" />
            </button>
          );
        })}

        <div className="w-px h-7 bg-border mx-1" />

        {COLORS.map((c) => (
          <button
            key={c.value}
            onClick={() => setColor(c.value)}
            disabled={showingPopup}
            className={cn(
              "w-6 h-6 rounded-full border-2 transition-transform",
              color === c.value ? "scale-125 border-foreground" : "border-border",
              showingPopup && "opacity-40 pointer-events-none"
            )}
            style={{ backgroundColor: c.value }}
            title={c.label}
          />
        ))}

        <div className="w-px h-7 bg-border mx-1" />

        {STROKE_WIDTHS.map((sw) => (
          <button
            key={sw.value}
            onClick={() => setStrokeWidth(sw.value)}
            disabled={showingPopup}
            className={cn(
              "px-2 py-1 rounded text-[10px] font-medium border transition-colors",
              strokeWidth === sw.value
                ? "bg-primary/10 border-primary text-primary"
                : "border-border text-muted-foreground hover:bg-muted",
              showingPopup && "opacity-40 pointer-events-none"
            )}
          >
            {sw.label}
          </button>
        ))}

        <div className="w-px h-7 bg-border mx-1" />

        <button onClick={handleUndo} disabled={showingPopup} className="w-9 h-9 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:bg-muted disabled:opacity-40" title="元に戻す">
          <Undo2 className="h-4 w-4" />
        </button>
        <button onClick={handleClear} disabled={showingPopup} className="w-9 h-9 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:bg-muted disabled:opacity-40" title="全削除">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </>
  );
}
