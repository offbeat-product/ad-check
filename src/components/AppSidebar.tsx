import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useProjectTree } from "@/hooks/useProjectTree";
import { openGlobalSearch } from "@/lib/global-search-events";
import { isProjectActiveForCount } from "@/lib/project-display";
import {
  Home, Settings, LogOut, ChevronDown, ChevronRight, Plus, FolderOpen, GripVertical, Search, PanelLeftClose, PanelLeftOpen, BarChart3,
  ExternalLink, CircleCheckBig, Brain, ClipboardList,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { AD_BRAIN_URL } from "@/lib/constants";

interface AppSidebarProps {
  onCreateProject?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

function ProductNavGlyph(item: {
  icon?: string;
  iconStyle?: React.CSSProperties;
  Icon?: LucideIcon;
  iconClassName?: string;
}) {
  if (item.Icon) {
    const I = item.Icon;
    return (
      <span className="w-4 h-4 shrink-0 flex items-center justify-center">
        <I className={cn("h-4 w-4 shrink-0", item.iconClassName ?? "text-muted-foreground")} aria-hidden />
      </span>
    );
  }
  return (
    <span className="text-sm w-4 text-center" style={item.iconStyle}>
      {item.icon}
    </span>
  );
}

export default function AppSidebar({ onCreateProject, collapsed = false, onToggleCollapse }: AppSidebarProps) {
  const { user, signOut, role } = useAuth();
  const { profile } = useProfile();
  const navigate = useNavigate();
  const location = useLocation();
  const { clients, products, projects, updateClientOrder, updateProductOrder } = useProjectTree() as ReturnType<typeof useProjectTree>;

  const [openClients, setOpenClients] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem("sb_open_clients") || "[]")); }
    catch { return new Set<string>(); }
  });
  const [treeOpen, setTreeOpen] = useState(true);

  const dragClientItem = useRef<string | null>(null);
  const [dragOverClientId, setDragOverClientId] = useState<string | null>(null);
  const dragProductItem = useRef<{ id: string; clientId: string } | null>(null);
  const [dragOverProductId, setDragOverProductId] = useState<string | null>(null);

  useEffect(() => { localStorage.setItem("sb_open_clients", JSON.stringify([...openClients])); }, [openClients]);
  useEffect(() => {
    if (clients.length === 1 && openClients.size === 0) setOpenClients(new Set([clients[0].id]));
  }, [clients]);

  const handleSignOut = async () => { await signOut(); navigate("/login"); };

  const toggleClient = (id: string) => {
    setOpenClients((s) => { const next = new Set(s); next.has(id) ? next.delete(id) : next.add(id); return next; });
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
    { icon: ClipboardList, label: "全案件一覧", path: "/projects" },
  ];

  const routeProductId = location.pathname.match(/\/product\/([^/]+)/)?.[1];
  const activeProjectId = location.pathname.match(/\/project\/([^/]+)/)?.[1];
  const activeProjectProductId = activeProjectId ? projects.find((p) => p.id === activeProjectId)?.product_id : undefined;
  const highlightedProductId = routeProductId || activeProjectProductId || null;
  const routeClientId = location.pathname.match(/\/client\/([^/]+)/)?.[1];

  const sortedTree = useMemo(() => {
    const sortedClients = [...clients].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name, "ja"));
    return sortedClients.map((client) => {
      const clientProducts = [...products]
        .filter((p) => p.client_id === client.id)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name, "ja"));
      return { client, products: clientProducts };
    });
  }, [clients, products]);

  const activeCountForProduct = useCallback(
    (productId: string) => projects.filter((p) => p.product_id === productId && isProjectActiveForCount(p.status)).length,
    [projects]
  );

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
    void updateClientOrder(reordered.map((c) => c.id));
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
    void updateProductOrder(clientId, reordered.map((p) => p.id));
    setDragOverProductId(null); dragProductItem.current = null;
  };

  return (
    <aside className={cn(
      "h-screen bg-sidebar border-r border-sidebar-border flex flex-col overflow-hidden transition-all duration-200",
      collapsed ? "w-[60px] min-w-[60px]" : "w-[260px] min-w-[260px]"
    )}>
      <div className={cn("px-5 py-5 border-b border-sidebar-border", collapsed && "px-3 py-4 flex flex-col items-center")}>
        <h1 className={cn("font-bold flex items-center leading-none", collapsed ? "justify-center flex-col gap-1 text-base" : "gap-1.5 text-base")}>
          <CircleCheckBig size={22} className="shrink-0 text-primary [&_svg]:block" strokeWidth={2.25} aria-hidden />
          {!collapsed && (
            <span className="bg-gradient-to-r from-sky-500 to-violet-600 bg-clip-text text-transparent tracking-tight translate-y-[0.5px]">
              Ad Check
            </span>
          )}
        </h1>
        {!collapsed && (
          <div className="flex items-center justify-between mt-0.5">
            <p className="text-[10px] text-muted-foreground whitespace-nowrap">広告制作現場に最良・最速の「GO」を。</p>
            <button type="button" onClick={onToggleCollapse} className="p-1 rounded hover:bg-muted/50 text-muted-foreground transition-colors" title="サイドバーを閉じる">
              <PanelLeftClose className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        {collapsed && onToggleCollapse && (
          <button type="button" onClick={onToggleCollapse} className="mt-2 p-1 rounded hover:bg-muted/50 text-muted-foreground transition-colors" title="サイドバーを開く">
            <PanelLeftOpen className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <button key={item.path} type="button" onClick={() => navigate(item.path)} title={collapsed ? item.label : undefined}
              className={cn("w-full flex items-center gap-3 py-2.5 text-sm font-medium press-feedback",
                collapsed ? "justify-center px-0" : "px-5",
                isActive ? "bg-sidebar-accent text-sidebar-accent-foreground border-l-[3px] border-primary"
                  : "text-muted-foreground hover:bg-muted/50 border-l-[3px] border-transparent nav-item-interactive")}>
              <item.icon className="h-4 w-4 shrink-0" />
              {!collapsed && item.label}
            </button>
          );
        })}

        {!collapsed ? (
          <button
            type="button"
            onClick={() => openGlobalSearch()}
            className="mx-4 mt-2 mb-1 flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-muted/30 text-muted-foreground hover:bg-muted/50 transition-colors"
          >
            <Search className="h-3.5 w-3.5 shrink-0" />
            <span className="text-xs flex-1 text-left">検索</span>
            <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px]">⌘K</kbd>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => openGlobalSearch()}
            className="w-full flex items-center justify-center py-2.5 text-muted-foreground hover:bg-muted/50 border-l-[3px] border-transparent"
            title="検索 (⌘K)"
          >
            <Search className="h-4 w-4" />
          </button>
        )}

        {collapsed ? (
          <button type="button" onClick={() => navigate("/dashboard")} title="クライアント / 商材"
            className="w-full flex items-center justify-center py-2.5 text-muted-foreground hover:bg-muted/50 border-l-[3px] border-transparent">
            <FolderOpen className="h-4 w-4" />
          </button>
        ) : (
          <div className="mt-1">
            <div className="w-full flex items-center gap-3 px-5 py-2.5 text-sm font-medium text-muted-foreground border-l-[3px] border-transparent">
              <button type="button" onClick={() => setTreeOpen(!treeOpen)} className="flex items-center gap-3 flex-1 min-w-0 hover:bg-muted/50 rounded-md -ml-1 pl-1 py-0.5 text-left">
                <FolderOpen className="h-4 w-4 shrink-0" />
                <span className="truncate">クライアント</span>
                {treeOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
              </button>
              <button type="button" onClick={() => onCreateProject?.()} className="p-0.5 rounded hover:bg-muted shrink-0" title="新規案件作成">
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>

            {treeOpen && sortedTree.map(({ client, products: clientProducts }) => (
              <div key={client.id}
                draggable
                onDragStart={() => handleClientDragStart(client.id)}
                onDragEnter={() => handleClientDragEnter(client.id)}
                onDragEnd={handleClientDragEnd}
                onDragOver={(e) => e.preventDefault()}
              >
                <div className={cn("flex items-center w-full group", dragOverClientId === client.id && "bg-primary/5")}>
                  <GripVertical className="h-3 w-3 text-muted-foreground/30 ml-3 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab shrink-0" />
                  <button type="button" onClick={() => toggleClient(client.id)} className="flex items-center gap-1 py-2 text-sm text-muted-foreground hover:bg-muted/50 shrink-0 px-2">
                    {openClients.has(client.id) ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  </button>
                  <button type="button" onClick={() => navigate(`/client/${client.id}`)}
                    className={cn("flex-1 py-2 pr-3 text-sm font-medium transition-colors truncate text-left border-l-[3px]",
                      routeClientId === client.id ? "bg-sidebar-accent text-sidebar-accent-foreground border-primary" : "text-muted-foreground hover:text-foreground border-transparent")}>
                    {client.name}
                  </button>
                </div>

                {openClients.has(client.id) && clientProducts.map((product) => (
                  <div key={product.id}
                    draggable
                    onDragStart={(e) => { e.stopPropagation(); handleProductDragStart(product.id, client.id); }}
                    onDragEnter={() => handleProductDragEnter(product.id)}
                    onDragEnd={handleProductDragEnd}
                    onDragOver={(e) => e.preventDefault()}
                  >
                    <div className={cn("flex items-center w-full group", dragOverProductId === product.id && "bg-primary/5")}>
                      <GripVertical className="h-3 w-3 text-muted-foreground/30 ml-7 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab shrink-0" />
                      <button type="button" onClick={() => navigate(`/product/${product.id}`)}
                        className={cn("flex-1 flex items-center gap-2 py-1.5 pr-3 pl-2 text-sm transition-colors truncate border-l-[3px]",
                          highlightedProductId === product.id ? "bg-sidebar-accent text-sidebar-accent-foreground border-primary font-medium" : "text-muted-foreground hover:text-foreground border-transparent")}>
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: getProductColor(product.color) }} />
                        <span className="truncate">{product.name}</span>
                        <span className="text-[10px] text-muted-foreground shrink-0">({activeCountForProduct(product.id)})</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        <button type="button" onClick={() => navigate("/report")} title={collapsed ? "レポート" : undefined}
          className={cn("w-full flex items-center gap-3 py-2.5 text-sm font-medium press-feedback",
            collapsed ? "justify-center px-0" : "px-5",
            location.pathname === "/report" ? "bg-sidebar-accent text-sidebar-accent-foreground border-l-[3px] border-primary"
              : "text-muted-foreground hover:bg-muted/50 border-l-[3px] border-transparent nav-item-interactive")}>
          <BarChart3 className="h-4 w-4 shrink-0" />
          {!collapsed && "レポート"}
        </button>

        <button type="button" onClick={() => navigate("/settings")} title={collapsed ? "設定" : undefined}
          className={cn("w-full flex items-center gap-3 py-2.5 text-sm font-medium press-feedback",
            collapsed ? "justify-center px-0" : "px-5",
            location.pathname === "/settings" ? "bg-sidebar-accent text-sidebar-accent-foreground border-l-[3px] border-primary"
              : "text-muted-foreground hover:bg-muted/50 border-l-[3px] border-transparent nav-item-interactive")}>
          <Settings className="h-4 w-4 shrink-0" />
          {!collapsed && "設定"}
        </button>

        {!collapsed && (
          <div className="mt-2 pt-2 border-t border-sidebar-border">
            <p className="px-5 py-1.5 text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">プロダクト</p>
            {[
              { label: "AdLoop", href: "https://adloop-portal.lovable.app", icon: "∞", iconStyle: { background: "linear-gradient(135deg, #0EA5E9, #7C7AFF)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" } as const, comingSoon: false },
              { label: "Ad Brain", href: AD_BRAIN_URL, Icon: Brain, iconClassName: "text-primary", comingSoon: false },
              { label: "Ad Gen", href: "#", icon: "✨", iconStyle: {} as const, comingSoon: true },
              { label: "Ad Ops", href: "#", icon: "⚙️", iconStyle: {} as const, comingSoon: true },
            ].map((item) =>
              item.comingSoon ? (
                <div key={item.label} className="w-full flex items-center gap-3 px-5 py-2 text-sm border-l-[3px] border-transparent text-muted-foreground/40 cursor-default">
                  <ProductNavGlyph {...item} />
                  <span className="flex-1">{item.label}</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground/50 font-medium">Coming Soon</span>
                </div>
              ) : (
                <a key={item.label} href={item.href} target="_blank" rel="noopener noreferrer"
                  className="w-full flex items-center gap-3 px-5 py-2 text-sm border-l-[3px] border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors">
                  <ProductNavGlyph {...item} />
                  <span className="flex-1">{item.label}</span>
                  <ExternalLink className="h-3 w-3 text-muted-foreground/40" />
                </a>
              )
            )}
          </div>
        )}
      </nav>

      <div className={cn("border-t border-sidebar-border p-3 flex items-center", collapsed ? "justify-center flex-col gap-2" : "gap-2")}>
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold hover:bg-primary/20 transition-colors shrink-0" title={profile?.display_name || user?.email || "User"}>
              {(profile?.display_name || user?.email || "U").charAt(0).toUpperCase()}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-3" side="top" align="start">
            <div className="space-y-2">
              <p className="text-sm font-medium truncate">{profile?.display_name || user?.email || "User"}</p>
              <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
              <Badge className={cn("text-[10px] h-4 px-1.5", ROLE_LABELS[role]?.color)}>{ROLE_LABELS[role]?.label || role}</Badge>
            </div>
          </PopoverContent>
        </Popover>
        {!collapsed && <div className="flex-1" />}
        <button type="button" onClick={handleSignOut} className="p-2 text-muted-foreground hover:bg-muted/50 rounded-lg transition-colors" title="ログアウト">
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </aside>
  );
}
