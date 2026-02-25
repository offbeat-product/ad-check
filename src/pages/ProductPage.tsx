import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { handleSupabaseError } from "@/lib/supabase-helpers";
import type { Product, Client, Project } from "@/lib/db-types";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ReferenceMaterialsSection from "@/components/reference/ReferenceMaterialsSection";
import { FolderOpen } from "lucide-react";

export default function ProductPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [product, setProduct] = useState<Product | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!id) return;
    const { data: prod, error: prodErr } = await supabase.from("products").select("*").eq("id", id).maybeSingle();
    if (handleSupabaseError(prodErr, "product") || !prod) { setLoading(false); return; }
    setProduct(prod);

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

  if (loading) return <div className="flex items-center justify-center h-full text-muted-foreground py-20">読み込み中...</div>;
  if (!product) return <div className="flex items-center justify-center h-full text-muted-foreground py-20">商材が見つかりません</div>;

  return (
    <div className="min-h-screen">
      <header className="border-b border-border px-6 py-3 flex items-center justify-between bg-card">
        <div>
          <div className="text-xs text-muted-foreground">{client?.name} &gt; {product.name}</div>
          <h1 className="text-lg font-bold mt-0.5">{product.name}</h1>
        </div>
        <Badge variant="outline" className="text-xs">{product.code}</Badge>
      </header>

      <div className="p-6 max-w-6xl mx-auto">
        <Tabs defaultValue="projects">
          <TabsList className="mb-6">
            <TabsTrigger value="projects">案件一覧</TabsTrigger>
            <TabsTrigger value="materials">参考資料（商材ベース）</TabsTrigger>
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
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
