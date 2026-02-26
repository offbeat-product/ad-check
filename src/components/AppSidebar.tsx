import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useProjectTree } from "@/hooks/useProjectTree";
import {
  Home, Zap, Settings, LogOut, ChevronDown, ChevronRight, Plus, FolderOpen, GripVertical, Search, Users,
} from "lucide-react";
import NotificationBell from "@/components/NotificationBell";
import { Badge } from "@/components/ui/badge";
// NotificationBell is also rendered in AppLayout header for desktop
import { cn } from "@/lib/utils";

interface AppSidebarProps {
  onCreateProject?: () => void;
}

export default function AppSidebar({ onCreateProject }: AppSidebarProps) {
  const { user, signOut, role, isAdmin, canEdit } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const tree = useProjectTree();
  const { clients, products, projects } = tree;
  const updateProjectOrder = (tree as any).updateProjectOrder as ((productId: string, orderedIds: string[]) => Promise<void>) | undefined;
  const updateClientOrder = (tree as any).updateClientOrder as ((orderedIds: string[]) => Promise<void>) | undefined;
  const updateProductOrder = (tree as any).updateProductOrder as ((clientId: string, orderedIds: string[]) => Promise<void>) | undefined;

  const [openClients, setOpenClients] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem("sb_open_clients") || "[]")); }
    catch { return new Set<string>(); }
  });
  const [openProducts, setOpenProducts] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem("sb_open_products") || "[]")); }
    catch { return new Set<string>(); }
  });
  const [projectsOpen, setProjectsOpen] = useState(true);

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
    ...(canEdit ? [{ icon: Zap, label: "クイックチェック", path: "/check" }] : []),
  ];

  const activeProjectId = location.pathname.match(/\/project\/([^/]+)/)?.[1];

  const handleProjectDragStart = (projectId: string, productId: string) => {
    dragItem.current = { id: projectId, productId };
  };

  const handleProjectDragEnter = (projectId: string) => {
    setDragOverProjectId(projectId);
  };

  const handleProjectDragEnd = () => {
    if (!dragItem.current || !dragOverProjectId || dragItem.current.id === dragOverProjectId) {
      setDragOverProjectId(null);
      dragItem.current = null;
      return;
    }

    const productId = dragItem.current.productId;
    const productProjects = projects
      .filter((p) => p.product_id === productId)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

    const draggedIdx = productProjects.findIndex((p) => p.id === dragItem.current!.id);
    const targetIdx = productProjects.findIndex((p) => p.id === dragOverProjectId);

    if (draggedIdx === -1 || targetIdx === -1) {
      setDragOverProjectId(null);
      dragItem.current = null;
      return;
    }

    // Check same product group
    const targetProject = projects.find((p) => p.id === dragOverProjectId);
    if (targetProject?.product_id !== productId) {
      setDragOverProjectId(null);
      dragItem.current = null;
      return;
    }

    const reordered = [...productProjects];
    const [removed] = reordered.splice(draggedIdx, 1);
    reordered.splice(targetIdx, 0, removed);

    if (updateProjectOrder) {
      updateProjectOrder(productId, reordered.map((p) => p.id));
    }

    setDragOverProjectId(null);
    dragItem.current = null;
  };

  // Client drag handlers
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

  // Product drag handlers
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
    <aside className="w-[260px] min-w-[260px] h-screen bg-sidebar border-r border-sidebar-border flex flex-col overflow-hidden">
      <div className="px-5 py-5 border-b border-sidebar-border">
        <h1 className="text-lg font-bold flex items-center gap-2">
          <span>♟</span>
          <span className="gradient-text">CheckMate AI</span>
        </h1>
        <p className="text-[11px] text-muted-foreground mt-0.5">終わらないリテイクに、終止符を。</p>
      </div>

      {/* Search shortcut hint */}
      <button
        onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
        className="mx-4 mt-3 mb-1 flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-muted/30 text-muted-foreground hover:bg-muted/50 transition-colors"
      >
        <Search className="h-3.5 w-3.5" />
        <span className="text-xs flex-1 text-left">検索...</span>
        <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px]">⌘K</kbd>
      </button>

      <div className="px-5 py-3 border-b border-sidebar-border flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">
          {user?.email?.charAt(0).toUpperCase() || "U"}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{user?.email || "User"}</p>
          <Badge className={cn("text-[10px] h-4 px-1.5", ROLE_LABELS[role]?.color)}>
            {ROLE_LABELS[role]?.label || role}
          </Badge>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <button key={item.path} onClick={() => navigate(item.path)}
              className={cn("w-full flex items-center gap-3 px-5 py-2.5 text-sm font-medium transition-colors",
                isActive ? "bg-sidebar-accent text-sidebar-accent-foreground border-l-[3px] border-primary"
                  : "text-muted-foreground hover:bg-muted/50 border-l-[3px] border-transparent")}>
              <item.icon className="h-4 w-4" />{item.label}
            </button>
          );
        })}

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

          {projectsOpen && [...clients].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name, "ja")).map((client) => (
            <div key={client.id}
              draggable
              onDragStart={() => handleClientDragStart(client.id)}
              onDragEnter={() => handleClientDragEnter(client.id)}
              onDragEnd={handleClientDragEnd}
              onDragOver={(e) => e.preventDefault()}
            >
              <div className={cn("flex items-center w-full group", dragOverClientId === client.id && "bg-primary/5")}>
                <GripVertical className="h-3 w-3 text-muted-foreground/30 ml-3 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab shrink-0" />
                <button onClick={() => toggleClient(client.id)}
                  className="flex items-center gap-1 px-2 py-2 text-sm text-muted-foreground hover:bg-muted/50 shrink-0">
                  {openClients.has(client.id) ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                </button>
                <button onClick={() => navigate(`/client/${client.id}`)}
                  className="flex-1 py-2 pr-3 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors truncate text-left">
                  {client.name}
                </button>
              </div>

              {openClients.has(client.id) && [...products]
                .filter((p) => p.client_id === client.id)
                .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name, "ja"))
                .map((product) => {
                  const productProjects = projects
                    .filter((pr) => pr.product_id === product.id)
                    .sort((a, b) => {
                      const orderDiff = (a.sort_order ?? 0) - (b.sort_order ?? 0);
                      if (orderDiff !== 0) return orderDiff;
                      return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
                    });

                  return (
                    <div key={product.id}
                      draggable
                      onDragStart={(e) => { e.stopPropagation(); handleProductDragStart(product.id, client.id); }}
                      onDragEnter={() => handleProductDragEnter(product.id)}
                      onDragEnd={handleProductDragEnd}
                      onDragOver={(e) => e.preventDefault()}
                    >
                      <div className={cn("flex items-center w-full group", dragOverProductId === product.id && "bg-primary/5")}>
                        <GripVertical className="h-3 w-3 text-muted-foreground/30 ml-7 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab shrink-0" />
                        <button onClick={() => toggleProduct(product.id)}
                          className="flex items-center gap-1 px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted/50 shrink-0">
                          {openProducts.has(product.id) ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
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

                      {openProducts.has(product.id) && productProjects.map((project) => {
                        const productColor = getProductColor(product.color);
                        const isCompleted = project.status === "completed";

                        return (
                          <div
                            key={project.id}
                            draggable
                            onDragStart={() => handleProjectDragStart(project.id, product.id)}
                            onDragEnter={() => handleProjectDragEnter(project.id)}
                            onDragEnd={handleProjectDragEnd}
                            onDragOver={(e) => e.preventDefault()}
                            className={cn(
                              "group flex items-center",
                              dragOverProjectId === project.id && "bg-primary/5"
                            )}
                          >
                            <GripVertical className="h-3 w-3 text-muted-foreground/30 ml-10 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab shrink-0" />
                            <button
                              onClick={() => navigate(`/project/${project.id}`)}
                              className={cn("flex-1 flex items-center gap-2 px-1 py-1.5 text-xs transition-colors truncate",
                                activeProjectId === project.id
                                  ? "bg-sidebar-accent text-primary font-medium border-l-2 border-primary"
                                  : "text-muted-foreground hover:bg-muted/50",
                                isCompleted && "opacity-60"
                              )}
                            >
                              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: productColor }} />
                              <span className="truncate">{project.name}</span>
                            </button>
                          </div>
                        );
                      })}
                      {openProducts.has(product.id) && productProjects.length === 0 && (
                        <button
                          onClick={() => onCreateProject?.()}
                          className="px-12 py-1.5 text-[10px] text-primary/70 hover:text-primary transition-colors flex items-center gap-1"
                        >
                          <Plus className="h-3 w-3" />案件を追加
                        </button>
                      )}
                    </div>
                  );
                })
              }
            </div>
          ))}
        </div>

        {isAdmin && (
          <button onClick={() => navigate("/team")}
            className={cn("w-full flex items-center gap-3 px-5 py-2.5 text-sm font-medium transition-colors",
              location.pathname === "/team" ? "bg-sidebar-accent text-sidebar-accent-foreground border-l-[3px] border-primary"
                : "text-muted-foreground hover:bg-muted/50 border-l-[3px] border-transparent")}>
            <Users className="h-4 w-4" />チームメンバー
          </button>
        )}

        <button onClick={() => navigate("/settings")}
          className={cn("w-full flex items-center gap-3 px-5 py-2.5 text-sm font-medium transition-colors",
            location.pathname === "/settings" ? "bg-sidebar-accent text-sidebar-accent-foreground border-l-[3px] border-primary"
              : "text-muted-foreground hover:bg-muted/50 border-l-[3px] border-transparent")}>
          <Settings className="h-4 w-4" />設定
        </button>
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <button onClick={handleSignOut}
          className="w-full flex items-center gap-3 px-3 py-2 text-sm text-muted-foreground hover:bg-muted/50 rounded-lg transition-colors">
          <LogOut className="h-4 w-4" />ログアウト
        </button>
      </div>
    </aside>
  );
}
