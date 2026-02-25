import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { CheckRecord, CheckItem, CheckStatus, Comment } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import CommentsPanel from "@/components/CommentsPanel";
import CompareView from "@/components/CompareView";
import { ArrowLeft, RefreshCw, Download, GitCompare, MessageCircle, Check, Pin } from "lucide-react";
import { cn } from "@/lib/utils";

const statusConfig: Record<string, { label: string; class: string }> = {
  pending: { label: "チェック済", class: "bg-muted text-muted-foreground" },
  in_progress: { label: "修正中", class: "bg-primary/10 text-primary" },
  resolved: { label: "修正完了", class: "bg-status-ok/10 text-status-ok" },
  approved: { label: "承認済", class: "bg-product-cta/10 text-product-cta" },
};

const gradeColors: Record<string, string> = {
  A: "bg-[hsl(var(--grade-a))] text-white",
  B: "bg-[hsl(var(--grade-b))] text-white",
  C: "bg-[hsl(var(--grade-c))] text-white",
  D: "bg-[hsl(var(--grade-d))] text-white",
};

const borderColors: Record<string, string> = {
  NG: "border-l-[hsl(var(--status-ng))]",
  WARNING: "border-l-[hsl(var(--status-warning))]",
  OK: "border-l-[hsl(var(--status-ok))]",
};

const severityBadge: Record<string, string> = {
  high: "bg-status-ng/10 text-status-ng",
  medium: "bg-status-warning/10 text-status-warning",
  low: "bg-muted text-muted-foreground",
};

const statusOrder: Record<string, number> = { NG: 0, WARNING: 1, OK: 2 };

export default function CheckResultDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [record, setRecord] = useState<CheckRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [commentFilter, setCommentFilter] = useState<string | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [resolvedItems, setResolvedItems] = useState<Set<string>>(new Set());
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const [paintMode, setPaintMode] = useState(false);
  const [annotations, setAnnotations] = useState<Comment[]>([]);
  const [annotationPopover, setAnnotationPopover] = useState<{ x: number; y: number } | null>(null);
  const [annotationText, setAnnotationText] = useState("");
  const imageRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    if (!id) return;
    supabase
      .from("check_results")
      .select("*")
      .eq("id", id)
      .single()
      .then(({ data }) => {
        setRecord(data as any as CheckRecord);
        setLoading(false);
      });

    // Fetch comment counts per item
    supabase
      .from("comments")
      .select("check_item_id")
      .eq("check_result_id", id)
      .then(({ data }) => {
        const counts: Record<string, number> = {};
        (data || []).forEach((c: any) => {
          if (c.check_item_id) counts[c.check_item_id] = (counts[c.check_item_id] || 0) + 1;
        });
        setCommentCounts(counts);
      });

    // Fetch annotations
    supabase
      .from("comments")
      .select("*")
      .eq("check_result_id", id)
      .not("annotation_data", "is", null)
      .then(({ data }) => {
        setAnnotations((data as any as Comment[]) || []);
      });
  }, [id]);

  const handleStatusChange = async (newStatus: CheckStatus) => {
    if (!id) return;
    await supabase.from("check_results").update({ status: newStatus } as any).eq("id", id);
    setRecord((r) => r ? { ...r, status: newStatus } : r);
  };

  const handleExportCsv = () => {
    if (!record) return;
    const items = (record.check_items || []) as CheckItem[];
    const header = "pattern_id,item,status,severity,location,detail,suggestion";
    const rows = items.map((ci) =>
      [ci.pattern_id, ci.item, ci.status, ci.severity, ci.location || "", ci.detail, ci.suggestion || ""]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",")
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `checkmate_${record.product_code}_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImageClick = async (e: React.MouseEvent) => {
    if (!paintMode || !imageRef.current || !id) return;
    const rect = imageRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setAnnotationPopover({ x, y });
  };

  const handleSaveAnnotation = async () => {
    if (!annotationText.trim() || !annotationPopover || !id) return;
    const { data: userData } = await supabase.auth.getUser();
    const email = userData?.user?.email || "";
    await supabase.from("comments").insert({
      check_result_id: id,
      author_name: email.split("@")[0] || "User",
      author_email: email,
      content: annotationText,
      annotation_data: annotationPopover,
      status: "open",
    } as any);
    setAnnotationPopover(null);
    setAnnotationText("");
    // Refresh annotations
    const { data } = await supabase
      .from("comments")
      .select("*")
      .eq("check_result_id", id)
      .not("annotation_data", "is", null);
    setAnnotations((data as any as Comment[]) || []);
  };

  const scrollToCard = (patternId: string) => {
    cardRefs.current[patternId]?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  if (loading) return <div className="flex items-center justify-center h-full text-muted-foreground py-20">読み込み中...</div>;
  if (!record) return <div className="flex items-center justify-center h-full text-muted-foreground py-20">結果が見つかりません</div>;

  const items = ((record.check_items || []) as CheckItem[]).sort(
    (a, b) => (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3)
  );
  const isSf = record.process_type === "sf";
  const currentStatus = record.status || "pending";
  const sc = statusConfig[currentStatus] || statusConfig.pending;

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="border-b border-border px-4 py-2.5 flex items-center gap-3 bg-card shrink-0">
          <button onClick={() => navigate("/dashboard")} className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <span className="text-sm text-muted-foreground">
            {record.client_name} / {record.product_name} / {record.process_type === "sf" ? "スタイルフレーム" : "字コンテ"}
          </span>

          <div className="ml-auto flex items-center gap-2">
            {/* Status dropdown */}
            <Popover>
              <PopoverTrigger asChild>
                <button className={cn("px-3 py-1 rounded-full text-xs font-medium border", sc.class)}>
                  {sc.label}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-40 p-2" align="end">
                {Object.entries(statusConfig).map(([key, cfg]) => (
                  <button
                    key={key}
                    onClick={() => handleStatusChange(key as CheckStatus)}
                    className={cn(
                      "w-full text-left px-3 py-1.5 rounded text-xs font-medium transition-colors",
                      currentStatus === key ? "bg-muted" : "hover:bg-muted/50"
                    )}
                  >
                    {cfg.label}
                  </button>
                ))}
              </PopoverContent>
            </Popover>

            <Button size="sm" variant="outline" onClick={() => setCompareOpen(true)} className="text-xs">
              <GitCompare className="h-3 w-3 mr-1" />
              比較
            </Button>
            <Button size="sm" variant="outline" onClick={handleExportCsv} className="text-xs">
              <Download className="h-3 w-3 mr-1" />
              CSV
            </Button>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Preview area */}
          {isSf ? (
            <div className="glass-card p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold">スタイルフレーム</span>
                <Button
                  size="sm"
                  variant={paintMode ? "default" : "outline"}
                  onClick={() => setPaintMode(!paintMode)}
                  className="text-xs"
                >
                  <Pin className="h-3 w-3 mr-1" />
                  ペイントモード
                </Button>
              </div>
              <div
                ref={imageRef}
                className={cn("relative rounded-lg overflow-hidden border border-border", paintMode && "cursor-crosshair")}
                onClick={handleImageClick}
              >
                {/* Placeholder image - in production would come from file_versions */}
                <div className="bg-muted h-64 flex items-center justify-center text-muted-foreground text-sm">
                  SF画像プレビュー
                </div>
                {/* Annotation pins */}
                {annotations.map((ann, i) => {
                  const pos = ann.annotation_data as { x: number; y: number } | null;
                  if (!pos) return null;
                  return (
                    <div
                      key={ann.id}
                      className="absolute w-6 h-6 rounded-full bg-status-ng text-white text-[10px] font-bold flex items-center justify-center cursor-pointer -translate-x-1/2 -translate-y-1/2 shadow-md hover:scale-110 transition-transform"
                      style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                      title={ann.content}
                    >
                      {i + 1}
                    </div>
                  );
                })}
                {/* Annotation popover form */}
                {annotationPopover && (
                  <div
                    className="absolute z-10 bg-card border border-border rounded-lg shadow-lg p-3 w-56"
                    style={{ left: `${annotationPopover.x}%`, top: `${annotationPopover.y}%` }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Textarea
                      value={annotationText}
                      onChange={(e) => setAnnotationText(e.target.value)}
                      placeholder="修正コメントを入力"
                      className="min-h-[60px] text-xs mb-2"
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleSaveAnnotation} className="text-xs flex-1">保存</Button>
                      <Button size="sm" variant="outline" onClick={() => setAnnotationPopover(null)} className="text-xs">取消</Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="glass-card p-4">
              <div className="text-sm font-semibold mb-3">原稿テキスト</div>
              <ScriptDisplay text={record.input_text || ""} items={items} onItemClick={scrollToCard} />
            </div>
          )}

          {/* Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <SummaryCard label="Grade" value={record.overall_status || "-"} className={gradeColors[record.overall_status] || "bg-muted"} />
            <SummaryCard label="NG" value={record.ng_count} className="bg-status-ng/10 text-status-ng" />
            <SummaryCard label="WARNING" value={record.warning_count} className="bg-status-warning/10 text-status-warning" />
            <SummaryCard label="OK" value={record.ok_count} className="bg-status-ok/10 text-status-ok" />
          </div>

          {/* Check items */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">チェック項目 ({items.length})</h3>
            {items.map((item, i) => {
              const isResolved = resolvedItems.has(item.pattern_id);
              return (
                <div
                  key={i}
                  ref={(el) => { cardRefs.current[item.pattern_id] = el; }}
                  className={cn(
                    "glass-card border-l-4 p-4 space-y-2 transition-opacity",
                    borderColors[item.status] || "",
                    isResolved && "opacity-60"
                  )}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono text-muted-foreground">{item.pattern_id}</span>
                    <Badge variant="outline" className={severityBadge[item.severity] || ""}>
                      {item.severity}
                    </Badge>
                    <Badge className={`${item.status === "NG" ? "status-ng" : item.status === "WARNING" ? "status-warning" : "status-ok"} text-xs font-bold`}>
                      {item.status}
                    </Badge>
                    <div className="ml-auto flex items-center gap-2">
                      <button
                        onClick={() => { setCommentFilter(item.pattern_id); }}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                      >
                        <MessageCircle className="h-3 w-3" />
                        {commentCounts[item.pattern_id] || 0}
                      </button>
                      <button
                        onClick={() => setResolvedItems((s) => {
                          const next = new Set(s);
                          next.has(item.pattern_id) ? next.delete(item.pattern_id) : next.add(item.pattern_id);
                          return next;
                        })}
                        className={cn(
                          "flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded border transition-colors",
                          isResolved
                            ? "border-status-ok/30 text-status-ok bg-status-ok/10"
                            : "border-border text-muted-foreground hover:border-status-ok/30"
                        )}
                      >
                        <Check className="h-3 w-3" />
                        修正済み
                      </button>
                    </div>
                  </div>
                  <div className="font-semibold">{item.item}</div>
                  {item.location && <div className="text-sm text-muted-foreground">📍 {item.location}</div>}
                  <div className="text-sm text-foreground/80">{item.detail}</div>
                  {item.suggestion && item.status !== "OK" && (
                    <div className="text-sm text-primary bg-primary/5 rounded-md p-2">
                      💡 修正案: {item.suggestion}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Comments panel */}
      <div className="w-[320px] shrink-0 h-full">
        <CommentsPanel checkResultId={id!} filterItemId={commentFilter} />
      </div>

      {/* Compare view */}
      <CompareView
        checkResultId={id!}
        processType={record.process_type}
        originalText={record.input_text}
        open={compareOpen}
        onOpenChange={setCompareOpen}
      />
    </div>
  );
}

function SummaryCard({ label, value, className }: { label: string; value: string | number; className: string }) {
  return (
    <div className={cn("rounded-xl p-4 text-center", className)}>
      <div className="text-xs font-bold uppercase tracking-wider opacity-70 mb-1">{label}</div>
      <div className="text-2xl font-extrabold">{value}</div>
    </div>
  );
}

function ScriptDisplay({ text, items, onItemClick }: { text: string; items: CheckItem[]; onItemClick: (id: string) => void }) {
  // Highlight NG/WARNING locations in the text
  const ngLocations = items.filter((i) => i.status === "NG" && i.location).map((i) => ({ loc: i.location!, id: i.pattern_id, status: i.status }));
  const warnLocations = items.filter((i) => i.status === "WARNING" && i.location).map((i) => ({ loc: i.location!, id: i.pattern_id, status: i.status }));

  // Simple approach: split by lines and highlight if location text is found
  const lines = text.split("\n");

  return (
    <div className="space-y-1 font-mono text-sm">
      {lines.map((line, i) => {
        const ngMatch = ngLocations.find((n) => line.includes(n.loc));
        const warnMatch = !ngMatch ? warnLocations.find((w) => line.includes(w.loc)) : null;
        const match = ngMatch || warnMatch;

        return (
          <div
            key={i}
            className={cn(
              "px-3 py-1.5 rounded-md",
              ngMatch && "bg-destructive/5 border-l-2 border-status-ng cursor-pointer hover:bg-destructive/10",
              warnMatch && "bg-status-warning/5 border-l-2 border-status-warning cursor-pointer hover:bg-status-warning/10",
              !match && "text-foreground/80"
            )}
            onClick={() => match && onItemClick(match.id)}
          >
            {line || "\u00A0"}
          </div>
        );
      })}
    </div>
  );
}
