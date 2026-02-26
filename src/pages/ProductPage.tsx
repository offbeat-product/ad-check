import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { handleSupabaseError } from "@/lib/supabase-helpers";
import type { Product, Client, Project } from "@/lib/db-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import ReferenceMaterialsSection from "@/components/reference/ReferenceMaterialsSection";
import CheckRulesTab from "@/components/product/CheckRulesTab";
import { FolderOpen, Pencil, Trash2, Check, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function ProductPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [product, setProduct] = useState<Product | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editExternalId, setEditExternalId] = useState("");

  const fetchData = useCallback(async () => {
    if (!id) return;
    const { data: prod, error: prodErr } = await supabase.from("products").select("*").eq("id", id).maybeSingle();
    if (handleSupabaseError(prodErr, "product") || !prod) { setLoading(false); return; }
    setProduct(prod);
    setEditExternalId(prod.external_product_id ?? "");

    const [clRes, prRes] = await Promise.all([
      prod.client_id ? supabase.from("clients").select("*").eq("id", prod.client_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
      supabase.from("projects").select("*").eq("product_id", id).order("created_at", { ascending: false }),
    ]);
    handleSupabaseError(clRes.error, "client");
    handleSupabaseError(prRes.error, "projects");
    setClient(clRes.data);
    setProjects(prRes.data ?? []);
    setLoading(false);
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleRename = async () => {
    if (!product || !editName.trim()) return;
    const { error } = await supabase.from("products").update({ name: editName.trim() }).eq("id", product.id);
    if (error) {
      toast({ title: "エラー", description: error.message, variant: "destructive" });
    } else {
      setProduct({ ...product, name: editName.trim() });
      toast({ title: "商材名を更新しました" });
    }
    setEditing(false);
  };

  const handleDelete = async () => {
    if (!product) return;
    if (projects.length > 0) {
      toast({ title: "削除できません", description: "先に配下の案件を全て削除してください。", variant: "destructive" });
      return;
    }
    await Promise.all([
      supabase.from("check_rules").delete().eq("product_id", product.id),
      supabase.from("reference_materials").delete().eq("scope_id", product.id),
    ]);
    const { error } = await supabase.from("products").delete().eq("id", product.id);
    if (error) {
      toast({ title: "削除エラー", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "商材を削除しました" });
      navigate(client ? `/client/${client.id}` : "/dashboard");
    }
  };

  if (loading) return <div className="flex items-center justify-center h-full text-muted-foreground py-20">読み込み中...</div>;
  if (!product) return <div className="flex items-center justify-center h-full text-muted-foreground py-20">商材が見つかりません</div>;

  return (
    <div className="min-h-screen">
      <header className="border-b border-border px-6 py-3 flex items-center justify-between bg-card">
        <div>
          <div className="text-xs text-muted-foreground">{client?.name} &gt; {product.name}</div>
          <div className="flex items-center gap-2 mt-0.5">
            {editing ? (
              <div className="flex items-center gap-2">
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="h-8 text-lg font-bold w-64"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter") handleRename(); if (e.key === "Escape") setEditing(false); }}
                />
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleRename}>
                  <Check className="h-4 w-4 text-status-ok" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <>
                <h1 className="text-lg font-bold">{product.name}</h1>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={() => { setEditName(product.name); setEditing(true); }}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">{product.code}</Badge>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 w-8 p-0">
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>商材を削除</AlertDialogTitle>
                <AlertDialogDescription>
                  「{product.name}」を削除します。{projects.length > 0 ? `配下に${projects.length}件の案件があるため、先に案件を削除してください。` : "関連するチェックルールと参考資料も削除されます。この操作は元に戻せません。"}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>キャンセル</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  disabled={projects.length > 0}
                >
                  削除する
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </header>

      <div className="p-6 max-w-6xl mx-auto">
        <Tabs defaultValue="projects">
          <TabsList className="mb-6">
            <TabsTrigger value="projects">案件一覧</TabsTrigger>
            <TabsTrigger value="materials">参考資料（商材ベース）</TabsTrigger>
            <TabsTrigger value="rules">チェックルール</TabsTrigger>
            <TabsTrigger value="settings">設定</TabsTrigger>
          </TabsList>

          <TabsContent value="projects" className="space-y-4">
            {projects.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-12">案件はまだありません</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {projects.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => navigate(`/project/${p.id}`)}
                    className="glass-card p-4 text-left hover:border-primary/30 transition-colors"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <FolderOpen className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium truncate">{p.name}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline" className="text-[10px] h-4">{p.status === "active" ? "進行中" : p.status}</Badge>
                      {p.project_code && <span>{p.project_code}</span>}
                      <span>{new Date(p.created_at || "").toLocaleDateString("ja-JP")}</span>
                    </div>
                    {p.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{p.description}</p>}
                  </button>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="materials">
            <div className="mb-4 p-3 rounded-lg bg-primary/5 border border-primary/20 text-xs text-primary">
              ここで登録した資料は、この商材の全案件のAIチェックに自動で反映されます
            </div>
            <ReferenceMaterialsSection
              projectId=""
              productId={id!}
              productName={product.name}
              projectName=""
            />
          </TabsContent>

          <TabsContent value="rules">
            <CheckRulesTab externalProductId={product.external_product_id} />
          </TabsContent>

          <TabsContent value="settings" className="space-y-4">
            <div className="glass-card p-4 space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">商材名</label>
                <p className="text-sm">{product.name}</p>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">コード</label>
                <p className="text-sm">{product.code}</p>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">ラベル</label>
                <p className="text-sm">{product.label}</p>
              </div>
              {product.rules_desc && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground">ルール説明</label>
                  <p className="text-sm whitespace-pre-wrap">{product.rules_desc}</p>
                </div>
              )}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">外部商材ID（n8n側）</label>
                <div className="flex items-center gap-2">
                  <Input
                    value={editExternalId}
                    onChange={(e) => setEditExternalId(e.target.value)}
                    placeholder="例: b0000000-0000-0000-0000-000000000003"
                    className="h-8 text-sm font-mono max-w-md"
                  />
                  <Button
                    size="sm"
                    className="h-8"
                    disabled={editExternalId === (product.external_product_id ?? "")}
                    onClick={async () => {
                      const val = editExternalId.trim() || null;
                      const { error } = await supabase.from("products").update({ external_product_id: val }).eq("id", product.id);
                      if (error) {
                        toast({ title: "エラー", description: error.message, variant: "destructive" });
                      } else {
                        setProduct({ ...product, external_product_id: val });
                        toast({ title: "外部商材IDを更新しました" });
                      }
                    }}
                  >
                    保存
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
