import { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Search, RefreshCw, AlertTriangle, Plus, Pencil, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { resolveWebhookProductId } from "@/lib/resolve-product-id";

// ── Types ──
interface CheckRule {
  id?: string;
  rule_id: string;
  category: string;
  description: string;
  severity: string;
  process_type: string;
  title?: string;
  product_id?: string;
  sort_order?: number;
  is_active?: boolean;
  [key: string]: unknown;
}

interface RuleFormData {
  category: string;
  description: string;
  severity: string;
  process_type: string;
  title: string;
}

// ── Constants ──
const N8N_REST_URL = "https://vhvgnslszruyztcoikqq.supabase.co/rest/v1/check_rules";
const N8N_API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZodmduc2xzenJ1eXp0Y29pa3FxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDA1NTQyMTIsImV4cCI6MjA1NjEzMDIxMn0.TRBxSFVFpJOkzVkFbOOBbE7J3MRfRriSbN1AXBdKvKc";

const restHeaders = {
  apikey: N8N_API_KEY,
  Authorization: `Bearer ${N8N_API_KEY}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};

const PROCESS_FILTERS = [
  { key: "all", label: "全て" },
  { key: "script", label: "構成/字コンテ" },
  { key: "na_script", label: "NA原稿" },
  { key: "bgm", label: "BGM" },
  { key: "narration", label: "ナレーション" },
  { key: "vcon", label: "Vコン" },
  { key: "styleframe", label: "スタイルフレーム" },
  { key: "storyboard", label: "絵コンテ" },
  { key: "video_horizontal", label: "横動画" },
  { key: "video_vertical", label: "縦動画" },
] as const;

const SEVERITY_CONFIG: Record<string, { class: string; label: string }> = {
  high: { class: "bg-red-100 text-red-700 border-red-200", label: "高" },
  medium: { class: "bg-yellow-100 text-yellow-700 border-yellow-200", label: "中" },
  low: { class: "bg-green-100 text-green-700 border-green-200", label: "低" },
};

const PROCESS_LABELS: Record<string, string> = {
  script: "構成/字コンテ",
  na_script: "NA原稿",
  bgm: "BGM",
  narration: "ナレーション",
  vcon: "Vコン",
  styleframe: "スタイルフレーム",
  storyboard: "絵コンテ",
  video_horizontal: "横動画",
  video_vertical: "縦動画",
};

const PROCESS_OPTIONS = Object.entries(PROCESS_LABELS).map(([k, v]) => ({ value: k, label: v }));

const CATEGORIES = [
  "薬事・法規", "景表法", "表現・文言", "トンマナ",
  "デザイン", "素材・権利", "技術仕様", "その他",
];

const RULE_ID_PREFIX: Record<string, string> = {
  script: "P",
  na_script: "NA",
  bgm: "BGM",
  narration: "NR",
  vcon: "VC",
  styleframe: "SFC",
  storyboard: "SB",
  video_horizontal: "VH",
  video_vertical: "VV",
};

// ── Helpers ──
function generateRuleId(processType: string, existingRules: CheckRule[]): string {
  const prefix = RULE_ID_PREFIX[processType] ?? "R";
  const sameProcess = existingRules.filter((r) => r.process_type === processType);
  const nums = sameProcess.map((r) => {
    const m = r.rule_id.match(/(\d+)$/);
    return m ? parseInt(m[1], 10) : 0;
  });
  const next = (nums.length > 0 ? Math.max(...nums) : 0) + 1;
  return `${prefix}-${String(next).padStart(2, "0")}`;
}

const emptyForm: RuleFormData = {
  category: "その他",
  description: "",
  severity: "medium",
  process_type: "script",
  title: "",
};

// ── Component ──
interface Props {
  productId: string;
}

export default function CheckRulesTab({ productId }: Props) {
  const { toast } = useToast();
  const [rules, setRules] = useState<CheckRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [processFilter, setProcessFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  // Detail view
  const [selectedRule, setSelectedRule] = useState<CheckRule | null>(null);

  // Edit dialog
  const [editRule, setEditRule] = useState<CheckRule | null>(null);
  const [editForm, setEditForm] = useState<RuleFormData>(emptyForm);

  // Add dialog
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState<RuleFormData>(emptyForm);

  // Delete confirmation
  const [deleteRule, setDeleteRule] = useState<CheckRule | null>(null);

  // ── Fetch ──
  const fetchRules = useCallback(async () => {
    if (!productId) return;
    setLoading(true);
    setError(null);
    try {
      const webhookProductId = await resolveWebhookProductId(productId);
      const res = await fetch("https://offbeat-inc.app.n8n.cloud/webhook/rules-list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: webhookProductId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setRules(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => { fetchRules(); }, [fetchRules]);

  // ── CRUD handlers ──
  const handleUpdate = async () => {
    if (!editRule?.id) return;
    setSaving(true);
    try {
      const res = await fetch(`${N8N_REST_URL}?id=eq.${editRule.id}`, {
        method: "PATCH",
        headers: restHeaders,
        body: JSON.stringify({
          category: editForm.category,
          description: editForm.description,
          severity: editForm.severity,
          process_type: editForm.process_type,
          title: editForm.title,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast({ title: "ルールを更新しました" });
      setEditRule(null);
      await fetchRules();
    } catch (e) {
      toast({ title: "更新エラー", description: e instanceof Error ? e.message : "不明なエラー", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteRule?.id) return;
    setSaving(true);
    try {
      const res = await fetch(`${N8N_REST_URL}?id=eq.${deleteRule.id}`, {
        method: "DELETE",
        headers: restHeaders,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast({ title: "ルールを削除しました" });
      setDeleteRule(null);
      await fetchRules();
    } catch (e) {
      toast({ title: "削除エラー", description: e instanceof Error ? e.message : "不明なエラー", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleAdd = async () => {
    if (!productId) return;
    setSaving(true);
    try {
      const ruleId = generateRuleId(addForm.process_type, rules);
      const webhookProductId = await resolveWebhookProductId(productId);
      const res = await fetch(N8N_REST_URL, {
        method: "POST",
        headers: restHeaders,
        body: JSON.stringify({
          product_id: webhookProductId,
          process_type: addForm.process_type,
          rule_id: ruleId,
          category: addForm.category,
          title: addForm.title,
          description: addForm.description,
          severity: addForm.severity,
          sort_order: 999,
          is_active: true,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast({ title: `ルール ${ruleId} を追加しました` });
      setAddOpen(false);
      setAddForm(emptyForm);
      await fetchRules();
    } catch (e) {
      toast({ title: "追加エラー", description: e instanceof Error ? e.message : "不明なエラー", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // ── Empty state ──
  // No guard needed — productId (internal UUID) is always available

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

      {/* Search + Add button */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="ルールIDまたは説明文で検索..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button size="sm" onClick={() => { setAddForm({ ...emptyForm, process_type: processFilter !== "all" ? processFilter : "script" }); setAddOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" />
          新規追加
        </Button>
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
                <TableHead className="w-[110px]">ルールID</TableHead>
                <TableHead className="w-[100px]">カテゴリ</TableHead>
                <TableHead>説明</TableHead>
                <TableHead className="w-[70px]">重要度</TableHead>
                <TableHead className="w-[100px]">工程</TableHead>
                <TableHead className="w-[90px] text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    該当するルールがありません
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((r, i) => {
                  const sev = SEVERITY_CONFIG[r.severity] ?? SEVERITY_CONFIG.medium;
                  return (
                    <TableRow
                      key={`${r.rule_id}-${i}`}
                      className="cursor-pointer group"
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
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditForm({
                                category: r.category,
                                description: r.description,
                                severity: r.severity,
                                process_type: r.process_type,
                                title: r.title ?? "",
                              });
                              setEditRule(r);
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={(e) => { e.stopPropagation(); setDeleteRule(r); }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* ── Detail dialog ── */}
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

      {/* ── Edit dialog ── */}
      <Dialog open={!!editRule} onOpenChange={(o) => !o && setEditRule(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>ルール編集 — <span className="font-mono">{editRule?.rule_id}</span></DialogTitle>
          </DialogHeader>
          <RuleForm form={editForm} onChange={setEditForm} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditRule(null)}>キャンセル</Button>
            <Button onClick={handleUpdate} disabled={saving || !editForm.description.trim()}>
              {saving ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add dialog ── */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>新規ルール追加</DialogTitle>
          </DialogHeader>
          <RuleForm form={addForm} onChange={setAddForm} />
          <p className="text-xs text-muted-foreground">
            ルールID: <span className="font-mono">{generateRuleId(addForm.process_type, rules)}</span>（自動採番）
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>キャンセル</Button>
            <Button onClick={handleAdd} disabled={saving || !addForm.description.trim()}>
              {saving ? "追加中..." : "追加"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirmation ── */}
      <AlertDialog open={!!deleteRule} onOpenChange={(o) => !o && setDeleteRule(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ルールを削除</AlertDialogTitle>
            <AlertDialogDescription>
              「{deleteRule?.rule_id}」を削除します。この操作は元に戻せません。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={saving}
            >
              {saving ? "削除中..." : "削除する"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Shared form component ──
function RuleForm({ form, onChange }: { form: RuleFormData; onChange: (f: RuleFormData) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">タイトル</label>
        <Input value={form.title} onChange={(e) => onChange({ ...form, title: e.target.value })} placeholder="ルールのタイトル（任意）" />
      </div>
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">カテゴリ</label>
        <Select value={form.category} onValueChange={(v) => onChange({ ...form, category: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">説明</label>
        <Textarea
          value={form.description}
          onChange={(e) => onChange({ ...form, description: e.target.value })}
          placeholder="ルールの説明..."
          rows={3}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">重要度</label>
          <Select value={form.severity} onValueChange={(v) => onChange({ ...form, severity: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="high">高（high）</SelectItem>
              <SelectItem value="medium">中（medium）</SelectItem>
              <SelectItem value="low">低（low）</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">工程</label>
          <Select value={form.process_type} onValueChange={(v) => onChange({ ...form, process_type: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {PROCESS_OPTIONS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
