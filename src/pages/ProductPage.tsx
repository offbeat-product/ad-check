import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { handleSupabaseError } from "@/lib/supabase-helpers";
import type { Product, Client, Project } from "@/lib/db-types";
import { AD_BRAIN_URL } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import CheckRulesTab from "@/components/product/CheckRulesTab";
import CreateProjectModal from "@/components/CreateProjectModal";
import { ProjectTable, type ProjectProgress } from "@/components/ProjectTable";
import { isFileDoneForProgress } from "@/lib/project-display";
import { Plus, ExternalLink } from "lucide-react";

const HIDE_COMPLETED_KEY = "product_table_hide_completed";

export default function ProductPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [product, setProduct] = useState<Product | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [progressByProjectId, setProgressByProjectId] = useState<Record<string, ProjectProgress>>({});
  const [loading, setLoading] = useState(true);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [hideCompleted, setHideCompleted] = useState(() => {
    try { return localStorage.getItem(HIDE_COMPLETED_KEY) !== "false"; }
    catch { return true; }
  });

  useEffect(() => {
    localStorage.setItem(HIDE_COMPLETED_KEY, String(hideCompleted));
  }, [hideCompleted]);

  const fetchData = useCallback(async () => {
    if (!id) return;
    const { data: prod, error: prodErr } = await supabase.from("products_with_check_settings").select("*").eq("id", id).maybeSingle();
    if (handleSupabaseError(prodErr, "product") || !prod) { setLoading(false); return; }
    setProduct(prod);

    const [clRes, prRes] = await Promise.all([
      prod.client_id ? supabase.from("clients").select("*").eq("id", prod.client_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
      supabase.from("projects").select("*").eq("product_id", id).order("created_at", { ascending: false }),
    ]);
    handleSupabaseError(clRes.error, "client");
    handleSupabaseError(prRes.error, "projects");
    setClient(clRes.data);
    const list = prRes.data ?? [];
    setProjects(list);

    const ids = list.map((p) => p.id);
    if (ids.length === 0) {
      setProgressByProjectId({});
    } else {
      const { data: files, error: fe } = await supabase.from("project_files").select("project_id, status").in("project_id", ids);
      if (!handleSupabaseError(fe, "project_files progress")) {
        const map: Record<string, ProjectProgress> = {};
        (files ?? []).forEach((f) => {
          const pid = f.project_id;
          if (!pid) return;
          if (!map[pid]) map[pid] = { total: 0, done: 0 };
          map[pid].total += 1;
          if (isFileDoneForProgress(f.status)) map[pid].done += 1;
        });
        setProgressByProjectId(map);
      }
    }
    setLoading(false);
  }, [id]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  if (loading) return <div className="flex items-center justify-center h-full text-muted-foreground py-20">読み込み中...</div>;
  if (!product) return <div className="flex items-center justify-center h-full text-muted-foreground py-20">商材が見つかりません</div>;

  return (
    <div className="min-h-screen">
      <header className="border-b border-border px-6 py-3 flex items-center justify-between bg-card">
        <div>
          <div className="text-xs text-muted-foreground">{client?.name} &gt; {product.name}</div>
          <h1 className="text-lg font-bold mt-0.5">{product.name}</h1>
        </div>
        <a
          href={`${AD_BRAIN_URL}/products/${product.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Ad Brain で編集
        </a>
      </header>

      <div className="p-6 max-w-6xl mx-auto">
        <Tabs defaultValue="projects">
          <div className="flex items-center justify-between mb-6">
            <TabsList>
              <TabsTrigger value="projects">案件一覧</TabsTrigger>
              <TabsTrigger value="rules">チェックルール</TabsTrigger>
            </TabsList>
            <Button size="sm" className="h-8 text-xs" onClick={() => setCreateProjectOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" />案件登録
            </Button>
          </div>

          <TabsContent value="projects" className="space-y-4">
            {projects.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-12">案件はまだありません</p>
            ) : (
              <ProjectTable
                projects={projects}
                progressByProjectId={progressByProjectId}
                hideCompleted={hideCompleted}
                onHideCompletedChange={setHideCompleted}
                onRowNavigate={(projectId) => navigate(`/project/${projectId}`)}
                onProjectUpdated={(projectId, patch) => {
                  setProjects((prev) => prev.map((x) => (x.id === projectId ? { ...x, ...patch } : x)));
                }}
              />
            )}
          </TabsContent>

          <TabsContent value="rules">
            <div className="mb-4 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-xs text-blue-700 dark:text-blue-300 flex items-center justify-between">
              <span>ルールの追加・編集は Ad Brain で行えます</span>
              <a
                href={`${AD_BRAIN_URL}/products/${product.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 dark:text-blue-400 hover:underline font-medium flex items-center gap-1"
              >
                Ad Brain を開く
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <CheckRulesTab productId={product.id} readOnly />
          </TabsContent>
        </Tabs>
      </div>

      <CreateProjectModal
        open={createProjectOpen}
        onOpenChange={setCreateProjectOpen}
        onCreated={(projectId) => {
          setCreateProjectOpen(false);
          navigate(`/project/${projectId}`);
        }}
        defaultClientId={client?.id}
        defaultProductId={product?.id}
      />
    </div>
  );
}
