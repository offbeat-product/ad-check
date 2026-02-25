import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { CheckRecord, CheckItem, CheckStatus } from "@/lib/types";
import { getCheckMarkers, type CheckMarker } from "@/lib/marker-positions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import CommentsPanel from "@/components/CommentsPanel";
import CompareView from "@/components/CompareView";
import AnnotationCanvas from "@/components/AnnotationCanvas";
import ShareLinkModal from "@/components/ShareLinkModal";
import { CorrectionPatternCard } from "@/components/CorrectionPatterns";
import {
  ArrowLeft, Download, GitCompare, Check, Pin, Link2, CheckCircle2,
  MessageCircle, Lightbulb,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const statusConfig: Record<string, { label: string; class: string }> = {
  pending: { label: "チェック済", class: "bg-muted text-muted-foreground" },
  in_progress: { label: "修正中", class: "bg-primary/10 text-primary" },
  resolved: { label: "修正完了", class: "bg-status-ok/10 text-status-ok" },
  approved: { label: "承認済", class: "bg-product-cta/10 text-product-cta" },
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
  const { user } = useAuth();
  const { toast } = useToast();
  const [record, setRecord] = useState<CheckRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [compareOpen, setCompareOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [resolvedItems, setResolvedItems] = useState<Set<string>>(new Set());
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const [paintMode, setPaintMode] = useState(false);
  const [highlightCard, setHighlightCard] = useState<string | null>(null);
  const [rightTab, setRightTab] = useState<string>("ai-check");
  const [commentFilter, setCommentFilter] = useState<string | null>(null);
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

  const handleDownload = () => {
    if (!record) return;
    const inputData = record.input_data as { image_base64?: string; script_text?: string } | null;
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");

    if (record.process_type === "sf" && inputData?.image_base64) {
      const a = document.createElement("a");
      a.href = inputData.image_base64;
      a.download = `${record.product_code}_${record.process_type}_${date}.jpg`;
      a.click();
    } else {
      const text = inputData?.script_text || record.input_text || "";
      const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${record.product_code}_${record.process_type}_${date}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    }
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
    setRightTab("ai-check");
    setTimeout(() => {
      cardRefs.current[patternId]?.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightCard(patternId);
      setTimeout(() => setHighlightCard(null), 2000);
    }, 100);
  };

  const handleAnnotationSave = async (annotations: any[], comment: string) => {
    if (!id || !user) return;
    await supabase.from("comments").insert({
      check_result_id: id,
      author_name: user.email?.split("@")[0] || "User",
      author_email: user.email || "",
      content: comment || "アノテーション追加",
      annotation_data: { annotations } as any,
      status: "open",
    } as any);
  };

  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    setImageSize({ width: e.currentTarget.clientWidth, height: e.currentTarget.clientHeight });
  }, []);

  const handleApplyCorrections = async () => {
    if (!record || !user || selectedItems.size === 0) return;
    const items = (record.check_items || []) as CheckItem[];
    
    for (const patternId of selectedItems) {
      const item = items.find((i) => i.pattern_id === patternId);
      if (!item) continue;

      // Check if pattern exists
      const { data: existing } = await supabase
        .from("correction_patterns")
        .select("id, frequency")
        .eq("product_code", record.product_code)
        .eq("rule_id", item.pattern_id)
        .limit(1);

      if (existing && existing.length > 0) {
        await supabase
          .from("correction_patterns")
          .update({ frequency: (existing[0] as any).frequency + 1, updated_at: new Date().toISOString() } as any)
          .eq("id", (existing[0] as any).id);
      } else {
        await supabase.from("correction_patterns").insert({
          user_id: user.id,
          product_code: record.product_code,
          rule_id: item.pattern_id,
          rule_title: item.item,
          original_content: item.detail,
          corrected_content: item.suggestion || "",
          category: item.severity,
        } as any);
      }

      setResolvedItems((s) => new Set(s).add(patternId));
    }

    toast({ title: "保存しました", description: `${selectedItems.size}件の修正パターンを保存しました` });
    setSelectedItems(new Set());
  };

  const toggleSelectItem = (id: string) => {
    setSelectedItems((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    const items = ((record?.check_items || []) as CheckItem[]).filter((i) => i.status !== "OK");
    setSelectedItems(new Set(items.map((i) => i.pattern_id)));
  };

  if (loading) return <div className="flex items-center justify-center h-full text-muted-foreground py-20">読み込み中...</div>;
  if (!record) return <div className="flex items-center justify-center h-full text-muted-foreground py-20">結果が見つかりません</div>;

  const items = ((record.check_items || []) as CheckItem[]).sort(
    (a, b) => (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3)
  );
  const isSf = record.process_type === "sf";
  const currentStatus = record.status || "pending";
  const sc = statusConfig[currentStatus] || statusConfig.pending;
  const markers = getCheckMarkers(items);
  const inputData = record.input_data as { image_base64?: string; script_text?: string } | null;
  const fileName = `${record.product_code.toUpperCase()}_${record.process_type.toUpperCase()}_${new Date(record.created_at).toISOString().slice(0, 10)}`;

  return (
    <div className="flex h-[calc(100vh-0px)] overflow-hidden">
      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Top action bar */}
        <header className="border-b border-border px-4 py-2 flex items-center gap-3 bg-card shrink-0">
          <button onClick={() => navigate("/dashboard")} className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-medium truncate">{fileName}</span>

          {/* Status badge */}
          <Popover>
            <PopoverTrigger asChild>
              <button className={cn("px-3 py-1 rounded-full text-xs font-medium border shrink-0", sc.class)}>
                {sc.label}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-40 p-2" align="start">
              {Object.entries(statusConfig).map(([key, cfg]) => (
                <button
                  key={key}
                  onClick={() => handleStatusChange(key as CheckStatus)}
                  className={cn("w-full text-left px-3 py-1.5 rounded text-xs font-medium transition-colors", currentStatus === key ? "bg-muted" : "hover:bg-muted/50")}
                >
                  {cfg.label}
                </button>
              ))}
            </PopoverContent>
          </Popover>

          <div className="ml-auto flex items-center gap-1.5">
            <Button size="sm" variant="outline" className="text-xs h-8" onClick={() => { setRightTab("ai-check"); }}>
              <CheckCircle2 className="h-3 w-3 mr-1" />
              AIチェック結果
            </Button>
            <Button size="sm" variant="outline" className="text-xs h-8" onClick={() => setShareOpen(true)}>
              <Link2 className="h-3 w-3 mr-1" />
              共有リンク
            </Button>
            <Button size="sm" variant="outline" className="text-xs h-8" onClick={handleDownload}>
              <Download className="h-3 w-3 mr-1" />
              DL
            </Button>
            <Button size="sm" variant="outline" className="text-xs h-8" onClick={handleExportCsv}>
              CSV
            </Button>
            <Button size="sm" variant="outline" className="text-xs h-8" onClick={() => setCompareOpen(true)}>
              <GitCompare className="h-3 w-3 mr-1" />
              比較
            </Button>
          </div>
        </header>

        {/* Creative preview area */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-4">
            {isSf ? (
              <div className="relative">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground">{record.client_name} / {record.product_name} / スタイルフレーム</span>
                  <Button
                    size="sm"
                    variant={paintMode ? "default" : "outline"}
                    onClick={() => setPaintMode(!paintMode)}
                    className="text-xs h-7"
                  >
                    <Pin className="h-3 w-3 mr-1" />
                    ペイントモード
                  </Button>
                </div>
                <div ref={imageContainerRef} className="relative rounded-lg overflow-hidden border border-border bg-muted/30">
                  {inputData?.image_base64 ? (
                    <img src={inputData.image_base64} alt="SF Preview" className="w-full" onLoad={handleImageLoad} />
                  ) : (
                    <div className="h-64 flex items-center justify-center text-muted-foreground text-sm px-4 text-center">
                      プレビュー不可（旧バージョン）。再チェックしてください。
                    </div>
                  )}

                  {/* Auto-generated check markers */}
                  <TooltipProvider>
                    {markers.map((m) => (
                      <Tooltip key={m.item.pattern_id}>
                        <TooltipTrigger asChild>
                          <div
                            className={cn(
                              "absolute w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold cursor-pointer -translate-x-1/2 -translate-y-1/2 transition-all hover:scale-125 z-10",
                              m.item.status === "NG" ? "check-marker-ng" : "check-marker-warning",
                              paintMode && "opacity-40"
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

                  <AnnotationCanvas
                    active={paintMode}
                    width={imageSize.width || 800}
                    height={imageSize.height || 400}
                    onSaveAnnotations={handleAnnotationSave}
                  />
                </div>
              </div>
            ) : (
              <div>
                <span className="text-xs text-muted-foreground mb-2 block">{record.client_name} / {record.product_name} / 字コンテ</span>
                <ScriptDisplay
                  text={inputData?.script_text || record.input_text || ""}
                  items={items}
                  markers={markers}
                  onItemClick={scrollToCard}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right panel - 380px */}
      <div className="w-[380px] shrink-0 h-full border-l border-border flex flex-col bg-card">
        <Tabs value={rightTab} onValueChange={setRightTab} className="flex flex-col h-full">
          <TabsList className="w-full shrink-0 rounded-none border-b border-border bg-transparent h-10 p-0">
            <TabsTrigger value="ai-check" className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-xs h-10">
              AIチェック結果
            </TabsTrigger>
            <TabsTrigger value="comments" className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-xs h-10">
              コメント
            </TabsTrigger>
          </TabsList>

          <TabsContent value="ai-check" className="flex-1 flex flex-col overflow-hidden mt-0 ring-0 focus-visible:ring-0">
            {/* AI Check items */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {items.map((item, i) => {
                const isResolved = resolvedItems.has(item.pattern_id);
                const marker = markers.find((m) => m.item.pattern_id === item.pattern_id);
                const isHighlighted = highlightCard === item.pattern_id;
                const isSelected = selectedItems.has(item.pattern_id);

                return (
                  <div
                    key={i}
                    ref={(el) => { cardRefs.current[item.pattern_id] = el; }}
                    className={cn(
                      "border-l-4 rounded-lg border border-border p-3 space-y-2 transition-all bg-card",
                      borderColors[item.status] || "",
                      isResolved && "opacity-50",
                      isHighlighted && "ring-2 ring-primary ring-offset-1"
                    )}
                  >
                    <div className="flex items-start gap-2">
                      {/* Marker + checkbox */}
                      <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                        {item.status !== "OK" && (
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleSelectItem(item.pattern_id)}
                            className="h-3.5 w-3.5"
                          />
                        )}
                        {marker && (
                          <div className={cn(
                            "w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold",
                            item.status === "NG" ? "bg-[hsl(var(--status-ng))]" : "bg-[hsl(var(--status-warning))]"
                          )}>
                            {marker.number}
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        {/* Header */}
                        <div className="flex items-center gap-1.5 flex-wrap mb-1">
                          <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                            AIチェック
                          </span>
                          <span className="text-[10px] font-mono text-muted-foreground">{item.pattern_id}</span>
                          <Badge variant="outline" className={cn("text-[10px] h-4 px-1.5", severityBadge[item.severity] || "")}>
                            {item.severity}
                          </Badge>
                          <Badge className={cn("text-[10px] h-4 px-1.5", item.status === "NG" ? "status-ng" : item.status === "WARNING" ? "status-warning" : "status-ok")}>
                            {item.status}
                          </Badge>
                        </div>

                        <p className="text-sm font-medium">{item.item}</p>
                        {item.location && <p className="text-xs text-muted-foreground">📍 {item.location}</p>}
                        <p className="text-xs text-foreground/80 mt-1">{item.detail}</p>

                        {/* Suggestion */}
                        {item.suggestion && item.status !== "OK" && (
                          <div className="text-xs text-primary bg-primary/5 rounded-md p-2 mt-2 flex items-start gap-1.5">
                            <Lightbulb className="h-3 w-3 shrink-0 mt-0.5" />
                            <span>修正案: {item.suggestion}</span>
                          </div>
                        )}

                        {/* Correction pattern */}
                        {item.status !== "OK" && (
                          <div className="mt-2">
                            <CorrectionPatternCard
                              ruleId={item.pattern_id}
                              productCode={record.product_code}
                            />
                          </div>
                        )}
                      </div>

                      {/* Right actions */}
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <button
                          onClick={() => { setCommentFilter(item.pattern_id); setRightTab("comments"); }}
                          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary"
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
                            "flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border",
                            isResolved ? "border-status-ok/30 text-status-ok bg-status-ok/10" : "border-border text-muted-foreground hover:border-status-ok/30"
                          )}
                        >
                          <Check className="h-3 w-3" />
                          修正済
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Bottom sticky - selection actions */}
            <div className="shrink-0 border-t border-border p-3 space-y-2 bg-card">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{selectedItems.size}件選択済み</span>
                <div className="flex gap-2">
                  <button onClick={selectAll} className="text-primary hover:underline text-xs">全て選択</button>
                  <button onClick={() => setSelectedItems(new Set())} className="text-muted-foreground hover:underline text-xs">クリア</button>
                </div>
              </div>
              <Button
                size="sm"
                className="w-full text-xs bg-status-warning text-black hover:bg-status-warning/90"
                disabled={selectedItems.size === 0}
                onClick={handleApplyCorrections}
              >
                チェックしたコメントを反映 ({selectedItems.size})
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="comments" className="flex-1 overflow-hidden mt-0 ring-0 focus-visible:ring-0">
            <CommentsPanel checkResultId={id!} filterItemId={commentFilter} />
          </TabsContent>
        </Tabs>
      </div>

      {/* Modals */}
      <CompareView
        checkResultId={id!}
        processType={record.process_type}
        originalText={record.input_text}
        open={compareOpen}
        onOpenChange={setCompareOpen}
      />
      <ShareLinkModal
        checkResultId={id!}
        open={shareOpen}
        onOpenChange={setShareOpen}
      />
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
  const sectionKeywords = ["冒頭", "前半", "中盤", "後半", "締め"];
  const ngItems = items.filter((i) => i.status === "NG" && i.location);
  const warnItems = items.filter((i) => i.status === "WARNING" && i.location);
  const lines = text.split("\n");

  return (
    <div className="space-y-1 font-mono text-sm border border-border rounded-lg p-3 bg-card">
      {lines.map((line, i) => {
        const ngMatch = ngItems.find((n) => {
          const loc = n.location!.replace(/^📍\s*/, "");
          return sectionKeywords.some((kw) => loc.includes(kw) && line.includes(kw));
        });
        const warnMatch = !ngMatch ? warnItems.find((w) => {
          const loc = w.location!.replace(/^📍\s*/, "");
          return sectionKeywords.some((kw) => loc.includes(kw) && line.includes(kw));
        }) : null;
        const match = ngMatch || warnMatch;
        const marker = match ? markers.find((m) => m.item.pattern_id === match.pattern_id) : null;

        return (
          <div
            key={i}
            className={cn(
              "px-3 py-1.5 rounded-md flex items-center gap-2",
              ngMatch && "bg-destructive/5 border-l-2 border-status-ng cursor-pointer hover:bg-destructive/10",
              warnMatch && "bg-status-warning/5 border-l-2 border-status-warning cursor-pointer hover:bg-status-warning/10",
              !match && "text-foreground/80"
            )}
            onClick={() => match && onItemClick(match.pattern_id)}
          >
            {marker && (
              <span className={cn(
                "w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0",
                match?.status === "NG" ? "bg-[hsl(var(--status-ng))]" : "bg-[hsl(var(--status-warning))]"
              )}>
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
