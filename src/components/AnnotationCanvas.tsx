import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Square, Circle, ArrowUpRight, Pencil, Type, MapPin, Undo2, Redo2, Trash2, MessageCircle } from "lucide-react";
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
  onSaveAnnotations?: (annotations: Annotation[], comment: string) => void;
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

export default function AnnotationCanvas({ active, width, height, onSaveAnnotations }: AnnotationCanvasProps) {
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
  const [commentText, setCommentText] = useState("");
  const [showComment, setShowComment] = useState(false);

  const getPos = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  // Redraw canvas
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const ann of annotations) {
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
        // Arrowhead
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
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.fillRect(p.x - pad, p.y - 16, metrics.width + pad * 2, 22);
        ctx.fillStyle = ann.color;
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
    }
  }, [annotations]);

  useEffect(() => {
    redraw();
  }, [annotations, redraw]);

  // Resize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = width;
    canvas.height = height;
    redraw();
  }, [width, height, redraw]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!active) return;
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
    if (!drawing || !active) return;
    const pos = getPos(e);
    if (tool === "freehand") {
      setCurrentPoints((p) => [...p, pos]);
    }
    // For rect/ellipse/arrow: preview on canvas
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
    if (!drawing || !active || !startPoint) return;
    const pos = getPos(e);
    setDrawing(false);

    const newAnn: Annotation = {
      id: crypto.randomUUID(),
      type: tool,
      points: tool === "freehand" ? [...currentPoints, pos] : [startPoint, pos],
      color,
      strokeWidth,
    };

    setUndoStack((s) => [...s, annotations]);
    setAnnotations((a) => [...a, newAnn]);
    setStartPoint(null);
    setCurrentPoints([]);
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
    setUndoStack((s) => [...s, annotations]);
    setAnnotations((a) => [...a, newAnn]);
    setTextInput(null);
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
    setUndoStack((s) => [...s, annotations]);
    setAnnotations((a) => [...a, newAnn]);
    setPinInput(null);
  };

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setUndoStack((s) => s.slice(0, -1));
    setAnnotations(prev);
  };

  const handleClear = () => {
    setUndoStack((s) => [...s, annotations]);
    setAnnotations([]);
  };

  const handleSave = () => {
    if (annotations.length === 0 && !commentText.trim()) return;
    onSaveAnnotations?.(annotations, commentText);
    setAnnotations([]);
    setCommentText("");
    setShowComment(false);
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
        className="absolute inset-0 z-20 cursor-crosshair"
        style={{ width: "100%", height: "100%" }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      />

      {/* Text input popover */}
      {textInput && (
        <div
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
        </div>
      )}

      {/* Pin input popover */}
      {pinInput && (
        <div
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
        </div>
      )}

      {/* Save+Comment form */}
      {showComment && (
        <div
          className="absolute bottom-16 left-4 right-4 z-30 bg-card border border-border rounded-lg shadow-lg p-3"
          onClick={(e) => e.stopPropagation()}
        >
          <Textarea
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder="アノテーションのコメントを入力..."
            className="min-h-[60px] text-sm mb-2"
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSave} className="text-xs">保存して投稿</Button>
            <Button size="sm" variant="outline" onClick={() => setShowComment(false)} className="text-xs">取消</Button>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="absolute bottom-0 left-0 right-0 z-30 bg-card border-t border-border shadow-sm px-3 py-2 flex items-center gap-1 flex-wrap" onClick={(e) => e.stopPropagation()}>
        {/* Tools */}
        {TOOLS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.type}
              onClick={() => setTool(t.type)}
              className={cn(
                "w-9 h-9 rounded-lg border flex items-center justify-center transition-colors",
                tool === t.type
                  ? "bg-primary/10 border-primary text-primary"
                  : "border-border text-muted-foreground hover:bg-muted"
              )}
              title={t.label}
            >
              <Icon className="h-4 w-4" />
            </button>
          );
        })}

        <div className="w-px h-7 bg-border mx-1" />

        {/* Colors */}
        {COLORS.map((c) => (
          <button
            key={c.value}
            onClick={() => setColor(c.value)}
            className={cn(
              "w-6 h-6 rounded-full border-2 transition-transform",
              color === c.value ? "scale-125 border-foreground" : "border-border"
            )}
            style={{ backgroundColor: c.value }}
            title={c.label}
          />
        ))}

        <div className="w-px h-7 bg-border mx-1" />

        {/* Stroke widths */}
        {STROKE_WIDTHS.map((sw) => (
          <button
            key={sw.value}
            onClick={() => setStrokeWidth(sw.value)}
            className={cn(
              "px-2 py-1 rounded text-[10px] font-medium border transition-colors",
              strokeWidth === sw.value
                ? "bg-primary/10 border-primary text-primary"
                : "border-border text-muted-foreground hover:bg-muted"
            )}
          >
            {sw.label}
          </button>
        ))}

        <div className="w-px h-7 bg-border mx-1" />

        {/* Actions */}
        <button onClick={handleUndo} className="w-9 h-9 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:bg-muted" title="元に戻す">
          <Undo2 className="h-4 w-4" />
        </button>
        <button onClick={handleClear} className="w-9 h-9 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:bg-muted" title="全削除">
          <Trash2 className="h-4 w-4" />
        </button>
        <button
          onClick={() => setShowComment(true)}
          className="ml-auto flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90"
        >
          <MessageCircle className="h-3 w-3" />
          保存+コメント
        </button>
      </div>
    </>
  );
}
