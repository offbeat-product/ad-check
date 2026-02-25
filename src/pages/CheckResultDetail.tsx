import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { CheckRecord, CheckItem, CheckStatus, Comment } from "@/lib/types";
import { getCheckMarkers, type CheckMarker } from "@/lib/marker-positions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import CommentsPanel from "@/components/CommentsPanel";
import CompareView from "@/components/CompareView";
import AnnotationCanvas from "@/components/AnnotationCanvas";
import { ArrowLeft, Download, GitCompare, MessageCircle, Check, Pin } from "lucide-react";
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
  const [highlightCard, setHighlightCard] = useState<string | null>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
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
  }, [id]);

  const handleStatusChange = async (newStatus: CheckStatus) => {
    if (!id) return;
    await supabase.from("check_results").update({ status: newStatus } as any).eq("id", id);
    setRecord((r) => (r ? { ...r, status: newStatus } : r));
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

  const scrollToCard = (patternId: string) => {
    cardRefs.current[patternId]?.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightCard(patternId);
    setTimeout(() => setHighlightCard(null), 2000);
  };

  const handleAnnotationSave = async (annotations: any[], comment: string) => {
    if (!id) return;
    const { data: userData } = await supabase.auth.getUser();
    const email = userData?.user?.email || "";
    await supabase.from("comments").insert({
      check_result_id: id,
      author_name: email.split("@")[0] || "User",
      author_email: email,
      content: comment || "アノテーション追加",
      annotation_data: { annotations } as any,
      status: "open",
    } as any);
  };

  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setImageSize({ width: img.clientWidth, height: img.clientHeight });
  }, []);

  if (loading) return <div className="flex items-center justify-center h-full text-muted-foreground py-20">読み込み中...</div>;
  if (!record) return <div className="flex items-center justify-center h-full text-muted-foreground py-20">結果が見つかりません</div>;

  const items = ((record.check_items || []) as CheckItem[]).sort(
    (a, b) => (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3)
  );
  const isSf = record.process_type === "sf";
  const currentStatus = record.status || "pending";
  const sc = statusConfig[currentStatus] || statusConfig.pending;
  const markers = getCheckMarkers(items);
  const inputData = (record as any).input_data as { image_base64?: string; script_text?: string } | null;

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
                ref={imageContainerRef}
                className="relative rounded-lg overflow-hidden border border-border"
              >
                {inputData?.image_base64 ? (
                  <img
                    src={inputData.image_base64}
                    alt="SF Preview"
                    className="w-full"
                    onLoad={handleImageLoad}
                  />
                ) : (
                  <div className="bg-muted h-64 flex items-center justify-center text-muted-foreground text-sm px-4 text-center">
                    この結果は旧バージョンで実行されたため、プレビューがありません。再チェックしてください。
                  </div>
                )}

                {/* Auto-generated check markers */}
                <TooltipProvider>
                  {markers.map((m) => (
                    <Tooltip key={m.item.pattern_id}>
                      <TooltipTrigger asChild>
                        <div
                          className={cn(
                            "absolute w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold cursor-pointer -translate-x-1/2 -translate-y-1/2 transition-all hover:scale-130 z-10",
                            m.item.status === "NG" ? "check-marker-ng" : "check-marker-warning",
                            paintMode && "opacity-50"
                          )}
                          style={{ left: `${m.position.x}%`, top: `${m.position.y}%` }}
                          onClick={(e) => { e.stopPropagation(); scrollToCard(m.item.pattern_id); }}
                        >
                          {m.number}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs max-w-[200px]">
                        <span className="font-bold">{m.item.pattern_id}</span>: {m.item.item}
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </TooltipProvider>

                {/* Annotation canvas */}
                <AnnotationCanvas
                  active={paintMode}
                  width={imageSize.width || 800}
                  height={imageSize.height || 400}
                  onSaveAnnotations={handleAnnotationSave}
                />
              </div>
            </div>
          ) : (
            <div className="glass-card p-4">
              <div className="text-sm font-semibold mb-3">原稿テキスト</div>
              <ScriptDisplay
                text={inputData?.script_text || record.input_text || ""}
                items={items}
                markers={markers}
                onItemClick={scrollToCard}
              />
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
              const marker = markers.find((m) => m.item.pattern_id === item.pattern_id);
              const isHighlighted = highlightCard === item.pattern_id;
              return (
                <div
                  key={i}
                  ref={(el) => { cardRefs.current[item.pattern_id] = el; }}
                  className={cn(
                    "glass-card border-l-4 p-4 space-y-2 transition-all",
                    borderColors[item.status] || "",
                    isResolved && "opacity-60",
                    isHighlighted && "ring-2 ring-primary ring-offset-2 animate-pulse"
                  )}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Marker number badge */}
                    {marker && (
                      <div
                        className={cn(
                          "w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0",
                          item.status === "NG" ? "bg-[hsl(var(--status-ng))]" : "bg-[hsl(var(--status-warning))]"
                        )}
                      >
                        {marker.number}
                      </div>
                    )}
                    <span className="text-xs font-mono text-muted-foreground">{item.pattern_id}</span>
                    <Badge variant="outline" className={severityBadge[item.severity] || ""}>
                      {item.severity}
                    </Badge>
                    <Badge className={`${item.status === "NG" ? "status-ng" : item.status === "WARNING" ? "status-warning" : "status-ok"} text-xs font-bold`}>
                      {item.status}
                    </Badge>
                    <div className="ml-auto flex items-center gap-2">
                      <button
                        onClick={() => setCommentFilter(item.pattern_id)}
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

function ScriptDisplay({
  text, items, markers, onItemClick,
}: {
  text: string;
  items: CheckItem[];
  markers: CheckMarker[];
  onItemClick: (id: string) => void;
}) {
  const ngLocations = items.filter((i) => i.status === "NG" && i.location).map((i) => ({ loc: i.location!, id: i.pattern_id, status: i.status }));
  const warnLocations = items.filter((i) => i.status === "WARNING" && i.location).map((i) => ({ loc: i.location!, id: i.pattern_id, status: i.status }));

  const lines = text.split("\n");

  return (
    <div className="space-y-1 font-mono text-sm">
      {lines.map((line, i) => {
        const ngMatch = ngLocations.find((n) => line.includes(n.loc));
        const warnMatch = !ngMatch ? warnLocations.find((w) => line.includes(w.loc)) : null;
        const match = ngMatch || warnMatch;
        const marker = match ? markers.find((m) => m.item.pattern_id === match.id) : null;

        return (
          <div
            key={i}
            className={cn(
              "px-3 py-1.5 rounded-md flex items-center gap-2",
              ngMatch && "bg-destructive/5 border-l-2 border-status-ng cursor-pointer hover:bg-destructive/10",
              warnMatch && "bg-status-warning/5 border-l-2 border-status-warning cursor-pointer hover:bg-status-warning/10",
              !match && "text-foreground/80"
            )}
            onClick={() => match && onItemClick(match.id)}
          >
            {marker && (
              <span
                className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0",
                  match?.status === "NG" ? "bg-[hsl(var(--status-ng))]" : "bg-[hsl(var(--status-warning))]"
                )}
              >
                {marker.number}
              </span>
            )}
            <span>{line || "\u00A0"}</span>
          </div>
        );
      })}
    </div>
  );
}
