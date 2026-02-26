import { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Search, RefreshCw, AlertTriangle } from "lucide-react";

interface CheckRule {
  rule_id: string;
  category: string;
  description: string;
  severity: string;
  process_type: string;
  title?: string;
  [key: string]: unknown;
}

const PROCESS_FILTERS = [
  { key: "all", label: "全て" },
  { key: "script", label: "スクリプト" },
  { key: "styleframe", label: "SF" },
  { key: "video_horizontal", label: "動画横" },
  { key: "video_vertical", label: "動画縦" },
  { key: "vcon", label: "Vコン" },
  { key: "narration", label: "ナレーション" },
  { key: "bgm", label: "BGM" },
  { key: "na_script", label: "NA原稿" },
  { key: "storyboard", label: "絵コンテ" },
] as const;

const SEVERITY_CONFIG: Record<string, { class: string; label: string }> = {
  high: { class: "bg-red-100 text-red-700 border-red-200", label: "高" },
  medium: { class: "bg-yellow-100 text-yellow-700 border-yellow-200", label: "中" },
  low: { class: "bg-green-100 text-green-700 border-green-200", label: "低" },
};

const PROCESS_LABELS: Record<string, string> = {
  script: "スクリプト",
  styleframe: "SF",
  video_horizontal: "動画横",
  video_vertical: "動画縦",
  vcon: "Vコン",
  narration: "ナレーション",
  bgm: "BGM",
  na_script: "NA原稿",
  storyboard: "絵コンテ",
};

interface Props {
  externalProductId: string | null | undefined;
}

export default function CheckRulesTab({ externalProductId }: Props) {
  const [rules, setRules] = useState<CheckRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [processFilter, setProcessFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedRule, setSelectedRule] = useState<CheckRule | null>(null);

  const fetchRules = useCallback(async () => {
    if (!externalProductId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("https://offbeat-inc.app.n8n.cloud/webhook/rules-list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: externalProductId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setRules(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }, [externalProductId]);

  useEffect(() => { fetchRules(); }, [fetchRules]);

  if (!externalProductId) {
    return (
      <div className="border border-dashed border-border rounded-lg p-8 text-center space-y-2">
        <p className="text-sm text-muted-foreground">外部商材IDが設定されていません</p>
        <p className="text-xs text-muted-foreground">設定タブで external_product_id を登録してください</p>
      </div>
    );
  }

  const filtered = rules.filter((r) => {
    if (processFilter !== "all" && r.process_type !== processFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.rule_id?.toLowerCase().includes(q) || r.description?.toLowerCase().includes(q) || r.title?.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Process filter tabs */}
      <div className="flex flex-wrap gap-1.5">
        {PROCESS_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setProcessFilter(f.key)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              processFilter === f.key
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="ルールIDまたは説明文で検索..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Count */}
      {!loading && !error && (
        <p className="text-xs text-muted-foreground">
          全{rules.length}件（表示中: {filtered.length}件）
        </p>
      )}

      {/* Loading */}
      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="border border-destructive/30 rounded-lg p-6 text-center space-y-3">
          <AlertTriangle className="h-6 w-6 text-destructive mx-auto" />
          <p className="text-sm text-destructive">{error}</p>
          <Button size="sm" variant="outline" onClick={fetchRules}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            リトライ
          </Button>
        </div>
      )}

      {/* Table */}
      {!loading && !error && (
        <div className="border border-border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[120px]">ルールID</TableHead>
                <TableHead className="w-[100px]">カテゴリ</TableHead>
                <TableHead>説明</TableHead>
                <TableHead className="w-[80px]">重要度</TableHead>
                <TableHead className="w-[100px]">工程</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    該当するルールがありません
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((r, i) => {
                  const sev = SEVERITY_CONFIG[r.severity] ?? SEVERITY_CONFIG.medium;
                  return (
                    <TableRow
                      key={`${r.rule_id}-${i}`}
                      className="cursor-pointer"
                      onClick={() => setSelectedRule(r)}
                    >
                      <TableCell className="font-mono text-xs">{r.rule_id}</TableCell>
                      <TableCell className="text-xs">{r.category}</TableCell>
                      <TableCell className="text-xs max-w-md truncate">{r.title || r.description}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] ${sev.class}`}>
                          {sev.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{PROCESS_LABELS[r.process_type] ?? r.process_type}</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Detail dialog */}
      <Dialog open={!!selectedRule} onOpenChange={(o) => !o && setSelectedRule(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-mono text-sm">{selectedRule?.rule_id}</DialogTitle>
          </DialogHeader>
          {selectedRule && (
            <div className="space-y-3 text-sm">
              <div>
                <label className="text-xs font-medium text-muted-foreground">タイトル</label>
                <p>{selectedRule.title || "—"}</p>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">カテゴリ</label>
                <p>{selectedRule.category}</p>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">説明</label>
                <p className="whitespace-pre-wrap">{selectedRule.description}</p>
              </div>
              <div className="flex gap-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">重要度</label>
                  <div className="mt-0.5">
                    <Badge variant="outline" className={SEVERITY_CONFIG[selectedRule.severity]?.class ?? ""}>
                      {SEVERITY_CONFIG[selectedRule.severity]?.label ?? selectedRule.severity}
                    </Badge>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">工程</label>
                  <p>{PROCESS_LABELS[selectedRule.process_type] ?? selectedRule.process_type}</p>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
