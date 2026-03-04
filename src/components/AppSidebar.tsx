import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useProjectTree } from "@/hooks/useProjectTree";
import {
  Home, Settings, LogOut, ChevronDown, ChevronRight, Plus, FolderOpen, GripVertical, Search, Rocket, PanelLeftClose, PanelLeftOpen, Sparkles, BarChart3, X, EyeOff, Eye,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import NotificationBell from "@/components/NotificationBell";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { usePrefetch } from "@/hooks/usePrefetch";

interface AppSidebarProps {
  onCreateProject?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export default function AppSidebar({ onCreateProject, collapsed = false, onToggleCollapse }: AppSidebarProps) {
  const { user, signOut, role, isAdmin, canEdit } = useAuth();
  const { profile } = useProfile();
  const navigate = useNavigate();
  const location = useLocation();
  const { clients, products, projects, updateProjectOrder, updateClientOrder, updateProductOrder } = useProjectTree() as ReturnType<typeof useProjectTree>;

  const [openClients, setOpenClients] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem("sb_open_clients") || "[]")); }
    catch { return new Set<string>(); }
  });
  const [openProducts, setOpenProducts] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem("sb_open_products") || "[]")); }
    catch { return new Set<string>(); }
  });
  const [projectsOpen, setProjectsOpen] = useState(true);
  const [pendingRuleCount, setPendingRuleCount] = useState(0);

  // New: inline search & active filter
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [hideCompleted, setHideCompleted] = useState(() => {
    try { return localStorage.getItem("sb_hide_completed") === "true"; }
    catch { return false; }
  });
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    localStorage.setItem("sb_hide_completed", String(hideCompleted));
  }, [hideCompleted]);

  useEffect(() => {
    supabase.from("rule_candidates").select("*", { count: "exact", head: true }).eq("status", "pending")
      .then(({ count }) => setPendingRuleCount(count || 0));
  }, []);

  // Drag state for reordering
  const dragItem = useRef<{ id: string; productId: string } | null>(null);
  const [dragOverProjectId, setDragOverProjectId] = useState<string | null>(null);
  const dragClientItem = useRef<string | null>(null);
  const [dragOverClientId, setDragOverClientId] = useState<string | null>(null);
  const dragProductItem = useRef<{ id: string; clientId: string } | null>(null);
  const [dragOverProductId, setDragOverProductId] = useState<string | null>(null);

  useEffect(() => { localStorage.setItem("sb_open_clients", JSON.stringify([...openClients])); }, [openClients]);
  useEffect(() => { localStorage.setItem("sb_open_products", JSON.stringify([...openProducts])); }, [openProducts]);

  useEffect(() => {
    if (clients.length === 1 && openClients.size === 0) setOpenClients(new Set([clients[0].id]));
  }, [clients]);

  const handleSignOut = async () => { await signOut(); navigate("/login"); };

  const toggleClient = (id: string) => {
    setOpenClients((s) => { const next = new Set(s); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };
  const toggleProduct = (id: string) => {
    setOpenProducts((s) => { const next = new Set(s); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };

  const DEFAULT_PRODUCT_COLOR = "#3B82F6";
  const legacyColorMap: Record<string, string> = {
    "product-ltr": "#06B6D4",
    "product-cta": "#8B5CF6",
    "product-tmd": "#14B8A6",
  };
  const getProductColor = (color: string | null) => {
    if (!color) return DEFAULT_PRODUCT_COLOR;
    if (color.startsWith("#") || color.startsWith("hsl") || color.startsWith("rgb")) return color;
    return legacyColorMap[color] || DEFAULT_PRODUCT_COLOR;
  };

  const ROLE_LABELS: Record<string, { label: string; color: string }> = {
    admin: { label: "管理者", color: "text-red-600 bg-red-100 dark:bg-red-900/30" },
    member: { label: "メンバー", color: "text-blue-600 bg-blue-100 dark:bg-blue-900/30" },
    viewer: { label: "閲覧者", color: "text-muted-foreground bg-muted" },
  };

  const navItems = [
    { icon: Home, label: "ホーム", path: "/dashboard" },
  ];

  const activeProjectId = location.pathname.match(/\/project\/([^/]+)/)?.[1];

  // --- Filtered tree based on search & hide completed ---
  const searchLower = sidebarSearch.toLowerCase().trim();
  const isSearching = searchLower.length > 0;

  const filteredTree = useMemo(() => {
    const sortedClients = [...clients].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name, "ja"));

    return sortedClients.map((client) => {
      const clientProducts = [...products]
        .filter((p) => p.client_id === client.id)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name, "ja"));

      const mappedProducts = clientProducts.map((product) => {
        let productProjects = projects
          .filter((pr) => pr.product_id === product.id)
          .sort((a, b) => {
            const orderDiff = (a.sort_order ?? 0) - (b.sort_order ?? 0);
            if (orderDiff !== 0) return orderDiff;
            return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
          });

        // Filter completed
        if (hideCompleted) {
          productProjects = productProjects.filter((pr) => pr.status !== "completed");
        }

        // Filter by search
        if (isSearching) {
          productProjects = productProjects.filter((pr) =>
            pr.name.toLowerCase().includes(searchLower) ||
            (pr.project_code && pr.project_code.toLowerCase().includes(searchLower))
          );
        }

        return { product, projects: productProjects };
      });

      // Filter products: keep if product name matches or has matching projects
      const filteredProducts = isSearching
        ? mappedProducts.filter((mp) =>
            mp.product.name.toLowerCase().includes(searchLower) ||
            mp.product.code.toLowerCase().includes(searchLower) ||
            mp.projects.length > 0
          )
        : hideCompleted
          ? mappedProducts.filter((mp) => mp.projects.length > 0)
          : mappedProducts;

      return { client, products: filteredProducts };
    }).filter((entry) => {
      // Filter clients: keep if client name matches or has matching products
      if (isSearching) {
        return entry.client.name.toLowerCase().includes(searchLower) || entry.products.length > 0;
      }
      if (hideCompleted) {
        return entry.products.length > 0;
      }
      return true;
    });
  }, [clients, products, projects, searchLower, isSearching, hideCompleted]);

  // Auto-expand all when searching
  const effectiveOpenClients = isSearching
    ? new Set(filteredTree.map((e) => e.client.id))
    : openClients;
  const effectiveOpenProducts = isSearching
    ? new Set(filteredTree.flatMap((e) => e.products.map((p) => p.product.id)))
    : openProducts;

  // Count filtered projects for display
  const totalFilteredProjects = filteredTree.reduce((sum, c) => sum + c.products.reduce((s, p) => s + p.projects.length, 0), 0);

  // --- Drag handlers (unchanged) ---
  const handleProjectDragStart = (projectId: string, productId: string) => {
    dragItem.current = { id: projectId, productId };
  };
  const handleProjectDragEnter = (projectId: string) => { setDragOverProjectId(projectId); };
  const handleProjectDragEnd = () => {
    if (!dragItem.current || !dragOverProjectId || dragItem.current.id === dragOverProjectId) {
      setDragOverProjectId(null); dragItem.current = null; return;
    }
    const productId = dragItem.current.productId;
    const productProjects = projects.filter((p) => p.product_id === productId).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const draggedIdx = productProjects.findIndex((p) => p.id === dragItem.current!.id);
    const targetIdx = productProjects.findIndex((p) => p.id === dragOverProjectId);
    if (draggedIdx === -1 || targetIdx === -1) { setDragOverProjectId(null); dragItem.current = null; return; }
    const targetProject = projects.find((p) => p.id === dragOverProjectId);
    if (targetProject?.product_id !== productId) { setDragOverProjectId(null); dragItem.current = null; return; }
    const reordered = [...productProjects];
    const [removed] = reordered.splice(draggedIdx, 1);
    reordered.splice(targetIdx, 0, removed);
    if (updateProjectOrder) updateProjectOrder(productId, reordered.map((p) => p.id));
    setDragOverProjectId(null); dragItem.current = null;
  };

  const handleClientDragStart = (clientId: string) => { dragClientItem.current = clientId; };
  const handleClientDragEnter = (clientId: string) => { setDragOverClientId(clientId); };
  const handleClientDragEnd = () => {
    if (!dragClientItem.current || !dragOverClientId || dragClientItem.current === dragOverClientId) {
      setDragOverClientId(null); dragClientItem.current = null; return;
    }
    const sorted = [...clients].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const fromIdx = sorted.findIndex((c) => c.id === dragClientItem.current);
    const toIdx = sorted.findIndex((c) => c.id === dragOverClientId);
    if (fromIdx === -1 || toIdx === -1) { setDragOverClientId(null); dragClientItem.current = null; return; }
    const reordered = [...sorted];
    const [removed] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, removed);
    if (updateClientOrder) updateClientOrder(reordered.map((c) => c.id));
    setDragOverClientId(null); dragClientItem.current = null;
  };

  const handleProductDragStart = (productId: string, clientId: string) => { dragProductItem.current = { id: productId, clientId }; };
  const handleProductDragEnter = (productId: string) => { setDragOverProductId(productId); };
  const handleProductDragEnd = () => {
    if (!dragProductItem.current || !dragOverProductId || dragProductItem.current.id === dragOverProductId) {
      setDragOverProductId(null); dragProductItem.current = null; return;
    }
    const clientId = dragProductItem.current.clientId;
    const clientProducts = products.filter((p) => p.client_id === clientId).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const fromIdx = clientProducts.findIndex((p) => p.id === dragProductItem.current!.id);
    const toIdx = clientProducts.findIndex((p) => p.id === dragOverProductId);
    const target = products.find((p) => p.id === dragOverProductId);
    if (fromIdx === -1 || toIdx === -1 || target?.client_id !== clientId) {
      setDragOverProductId(null); dragProductItem.current = null; return;
    }
    const reordered = [...clientProducts];
    const [removed] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, removed);
    if (updateProductOrder) updateProductOrder(clientId, reordered.map((p) => p.id));
    setDragOverProductId(null); dragProductItem.current = null;
  };

  return (
    <aside className={cn(
      "h-screen bg-sidebar border-r border-sidebar-border flex flex-col overflow-hidden transition-all duration-200",
      collapsed ? "w-[60px] min-w-[60px]" : "w-[260px] min-w-[260px]"
    )}>
      <div className={cn("px-5 py-5 border-b border-sidebar-border", collapsed && "px-3 py-4 flex flex-col items-center")}>
        <h1 className={cn("text-lg font-bold flex items-center gap-2", collapsed && "justify-center")}>
          <Rocket className="h-5 w-5 shrink-0" fill="currentColor" />
          {!collapsed && <span className="gradient-text">CheckGo AI</span>}
        </h1>
        {!collapsed && (
          <div className="flex items-center justify-between mt-0.5">
            <p className="text-[11px] text-muted-foreground">制作現場に、最速の「GO」を。</p>
            <button
              onClick={onToggleCollapse}
              className="p-1 rounded hover:bg-muted/50 text-muted-foreground transition-colors"
              title="サイドバーを閉じる"
            >
              <PanelLeftClose className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        {collapsed && onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            className="mt-2 p-1 rounded hover:bg-muted/50 text-muted-foreground transition-colors"
            title="サイドバーを開く"
          >
            <PanelLeftOpen className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Search shortcut hint */}
      {!collapsed ? (
        <button
          onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
          className="mx-4 mt-3 mb-1 flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-muted/30 text-muted-foreground hover:bg-muted/50 transition-colors"
        >
          <Search className="h-3.5 w-3.5" />
          <span className="text-xs flex-1 text-left">検索...</span>
          <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px]">⌘K</kbd>
        </button>
      ) : (
        <button
          onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
          className="mx-auto mt-3 mb-1 p-2 rounded-lg text-muted-foreground hover:bg-muted/50 transition-colors"
          title="検索 (⌘K)"
        >
          <Search className="h-4 w-4" />
        </button>
      )}

      <nav className="flex-1 overflow-y-auto py-2">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <button key={item.path} onClick={() => navigate(item.path)}
              title={collapsed ? item.label : undefined}
              className={cn("w-full flex items-center gap-3 py-2.5 text-sm font-medium press-feedback",
                collapsed ? "justify-center px-0" : "px-5",
                isActive ? "bg-sidebar-accent text-sidebar-accent-foreground border-l-[3px] border-primary"
                  : "text-muted-foreground hover:bg-muted/50 border-l-[3px] border-transparent nav-item-interactive")}>
              <item.icon className="h-4 w-4 shrink-0" />
              {!collapsed && item.label}
            </button>
          );
        })}

        {collapsed ? (
          <button
            onClick={() => navigate("/dashboard")}
            title="プロジェクト"
            className="w-full flex items-center justify-center py-2.5 text-muted-foreground hover:bg-muted/50 border-l-[3px] border-transparent"
          >
            <FolderOpen className="h-4 w-4" />
          </button>
        ) : (
        <div className="mt-1">
          <button onClick={() => setProjectsOpen(!projectsOpen)}
            className="w-full flex items-center gap-3 px-5 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted/50 border-l-[3px] border-transparent">
            <FolderOpen className="h-4 w-4" />プロジェクト
            <button onClick={(e) => { e.stopPropagation(); onCreateProject?.(); }}
              className="ml-auto p-0.5 rounded hover:bg-muted" title="新規案件作成">
              <Plus className="h-3.5 w-3.5" />
            </button>
            {projectsOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>

          {projectsOpen && (
            <>
              {/* Inline search + active filter */}
              <div className="px-4 pb-2 space-y-1.5">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/60" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={sidebarSearch}
                    onChange={(e) => setSidebarSearch(e.target.value)}
                    placeholder="案件を絞り込み..."
                    className="w-full pl-7 pr-7 py-1.5 text-xs rounded-md border border-border bg-muted/20 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/40"
                  />
                  {sidebarSearch && (
                    <button
                      onClick={() => setSidebarSearch("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
                <button
                  onClick={() => setHideCompleted(!hideCompleted)}
                  className={cn(
                    "flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-md transition-colors w-full",
                    hideCompleted
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted/50"
                  )}
                >
                  {hideCompleted ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  {hideCompleted ? "完了済みを非表示中" : "完了済みも表示中"}
                  {isSearching && (
                    <span className="ml-auto text-muted-foreground">{totalFilteredProjects}件</span>
                  )}
                </button>
              </div>

              {/* No results */}
              {filteredTree.length === 0 && (
                <div className="px-5 py-4 text-center">
                  <p className="text-xs text-muted-foreground">該当する案件がありません</p>
                  {isSearching && (
                    <button
                      onClick={() => setSidebarSearch("")}
                      className="mt-1 text-[10px] text-primary hover:underline"
                    >
                      検索をクリア
                    </button>
                  )}
                </div>
              )}

              {filteredTree.map(({ client, products: clientProducts }) => (
            <div key={client.id}
              draggable={!isSearching}
              onDragStart={() => handleClientDragStart(client.id)}
              onDragEnter={() => handleClientDragEnter(client.id)}
              onDragEnd={handleClientDragEnd}
              onDragOver={(e) => e.preventDefault()}
            >
              <div className={cn("flex items-center w-full group", dragOverClientId === client.id && "bg-primary/5")}>
                {!isSearching && <GripVertical className="h-3 w-3 text-muted-foreground/30 ml-3 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab shrink-0" />}
                <button onClick={() => toggleClient(client.id)}
                  className={cn("flex items-center gap-1 py-2 text-sm text-muted-foreground hover:bg-muted/50 shrink-0", isSearching ? "px-3 ml-1" : "px-2")}>
                  {effectiveOpenClients.has(client.id) ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                </button>
                <button onClick={() => navigate(`/client/${client.id}`)}
                  className="flex-1 py-2 pr-3 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors truncate text-left">
                  {client.name}
                </button>
                {isSearching && (
                  <span className="text-[10px] text-muted-foreground/60 pr-3">
                    {clientProducts.reduce((s, p) => s + p.projects.length, 0)}
                  </span>
                )}
              </div>

              {effectiveOpenClients.has(client.id) && clientProducts.map(({ product, projects: productProjects }) => (
                    <div key={product.id}
                      draggable={!isSearching}
                      onDragStart={(e) => { e.stopPropagation(); handleProductDragStart(product.id, client.id); }}
                      onDragEnter={() => handleProductDragEnter(product.id)}
                      onDragEnd={handleProductDragEnd}
                      onDragOver={(e) => e.preventDefault()}
                    >
                      <div className={cn("flex items-center w-full group", dragOverProductId === product.id && "bg-primary/5")}>
                        {!isSearching && <GripVertical className="h-3 w-3 text-muted-foreground/30 ml-7 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab shrink-0" />}
                        <button onClick={() => toggleProduct(product.id)}
                          className={cn("flex items-center gap-1 py-1.5 text-sm text-muted-foreground hover:bg-muted/50 shrink-0", isSearching ? "px-2 ml-5" : "px-2")}>
                          {effectiveOpenProducts.has(product.id) ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                        </button>
                        <button
                          onClick={() => navigate(`/product/${product.id}`)}
                          className="flex-1 flex items-center gap-2 py-1.5 pr-3 text-sm text-muted-foreground hover:text-foreground transition-colors truncate"
                        >
                          <span className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: getProductColor(product.color) }} />
                          <span className="truncate font-medium">{product.name}</span>
                        </button>
                      </div>

                      {effectiveOpenProducts.has(product.id) && productProjects.map((project) => {
                        const productColor = getProductColor(product.color);
                        const isCompleted = project.status === "completed";

                        return (
                          <div
                            key={project.id}
                            draggable={!isSearching}
                            onDragStart={() => handleProjectDragStart(project.id, product.id)}
                            onDragEnter={() => handleProjectDragEnter(project.id)}
                            onDragEnd={handleProjectDragEnd}
                            onDragOver={(e) => e.preventDefault()}
                            className={cn(
                              "group flex items-center",
                              dragOverProjectId === project.id && "bg-primary/5"
                            )}
                          >
                            {!isSearching && <GripVertical className="h-3 w-3 text-muted-foreground/30 ml-10 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab shrink-0" />}
                            <button
                              onClick={() => navigate(`/project/${project.id}`)}
                              className={cn("flex-1 flex items-center gap-2 px-1 py-1.5 text-xs transition-all truncate press-feedback",
                                isSearching ? "ml-9" : "",
                                activeProjectId === project.id
                                  ? "bg-sidebar-accent text-primary font-medium border-l-2 border-primary"
                                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                                isCompleted && "opacity-60"
                              )}
                            >
                              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: productColor }} />
                              <span className="truncate">{project.name}</span>
                            </button>
                          </div>
                        );
                      })}
                      {effectiveOpenProducts.has(product.id) && productProjects.length === 0 && !isSearching && (
                        <button
                          onClick={() => onCreateProject?.()}
                          className="px-12 py-1.5 text-[10px] text-primary/70 hover:text-primary transition-colors flex items-center gap-1"
                        >
                          <Plus className="h-3 w-3" />案件を追加
                        </button>
                      )}
                    </div>
                  ))
              }
            </div>
              ))}
            </>
          )}
        </div>
        )}

        <button onClick={() => navigate("/rule-candidates")}
          title={collapsed ? "ルール学習" : undefined}
          className={cn("w-full flex items-center gap-3 py-2.5 text-sm font-medium press-feedback",
            collapsed ? "justify-center px-0" : "px-5",
            location.pathname === "/rule-candidates" ? "bg-sidebar-accent text-sidebar-accent-foreground border-l-[3px] border-primary"
              : "text-muted-foreground hover:bg-muted/50 border-l-[3px] border-transparent nav-item-interactive")}>
          <Sparkles className="h-4 w-4 shrink-0" />
          {!collapsed && (
            <span className="flex items-center gap-2">
              ルール学習
              {pendingRuleCount > 0 && (
                <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-medium">
                  {pendingRuleCount}
                </Badge>
              )}
            </span>
          )}
        </button>

        <button onClick={() => navigate("/report")}
          title={collapsed ? "レポート" : undefined}
          className={cn("w-full flex items-center gap-3 py-2.5 text-sm font-medium press-feedback",
            collapsed ? "justify-center px-0" : "px-5",
            location.pathname === "/report" ? "bg-sidebar-accent text-sidebar-accent-foreground border-l-[3px] border-primary"
              : "text-muted-foreground hover:bg-muted/50 border-l-[3px] border-transparent nav-item-interactive")}>
          <BarChart3 className="h-4 w-4 shrink-0" />
          {!collapsed && "レポート"}
        </button>

        <button onClick={() => navigate("/settings")}
          title={collapsed ? "設定" : undefined}
          className={cn("w-full flex items-center gap-3 py-2.5 text-sm font-medium press-feedback",
            collapsed ? "justify-center px-0" : "px-5",
            location.pathname === "/settings" ? "bg-sidebar-accent text-sidebar-accent-foreground border-l-[3px] border-primary"
              : "text-muted-foreground hover:bg-muted/50 border-l-[3px] border-transparent nav-item-interactive")}>
          <Settings className="h-4 w-4 shrink-0" />
          {!collapsed && "設定"}
        </button>
      </nav>

      <div className={cn("border-t border-sidebar-border p-3 flex items-center", collapsed ? "justify-center flex-col gap-2" : "gap-2")}>
        <Popover>
          <PopoverTrigger asChild>
            <button className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold hover:bg-primary/20 transition-colors shrink-0" title={profile?.display_name || user?.email || "User"}>
              {(profile?.display_name || user?.email || "U").charAt(0).toUpperCase()}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-3" side="top" align="start">
            <div className="space-y-2">
              <p className="text-sm font-medium truncate">{profile?.display_name || user?.email || "User"}</p>
              <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
              <Badge className={cn("text-[10px] h-4 px-1.5", ROLE_LABELS[role]?.color)}>
                {ROLE_LABELS[role]?.label || role}
              </Badge>
            </div>
          </PopoverContent>
        </Popover>
        {!collapsed && <div className="flex-1" />}
        <button onClick={handleSignOut}
          className="p-2 text-muted-foreground hover:bg-muted/50 rounded-lg transition-colors" title="ログアウト">
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </aside>
  );
}
