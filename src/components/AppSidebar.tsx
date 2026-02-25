import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useProjectTree } from "@/hooks/useProjectTree";
import {
  Home, Zap, Settings, LogOut, ChevronDown, ChevronRight, Plus, FolderOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AppSidebarProps {
  onCreateProject?: () => void;
}

export default function AppSidebar({ onCreateProject }: AppSidebarProps) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { clients, products, projects } = useProjectTree();

  // Collapsible state persisted in localStorage
  const [openClients, setOpenClients] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem("sb_open_clients") || "[]")); }
    catch { return new Set<string>(); }
  });
  const [openProducts, setOpenProducts] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem("sb_open_products") || "[]")); }
    catch { return new Set<string>(); }
  });
  const [projectsOpen, setProjectsOpen] = useState(true);

  useEffect(() => {
    localStorage.setItem("sb_open_clients", JSON.stringify([...openClients]));
  }, [openClients]);
  useEffect(() => {
    localStorage.setItem("sb_open_products", JSON.stringify([...openProducts]));
  }, [openProducts]);

  // Auto-open if only one client
  useEffect(() => {
    if (clients.length === 1 && openClients.size === 0) {
      setOpenClients(new Set([clients[0].id]));
    }
  }, [clients]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  const toggleClient = (id: string) => {
    setOpenClients((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleProduct = (id: string) => {
    setOpenProducts((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const productColorMap: Record<string, string> = {
    "product-ltr": "hsl(193, 100%, 50%)",
    "product-cta": "hsl(264, 100%, 58%)",
    "product-tmd": "hsl(166, 100%, 39%)",
  };

  const navItems = [
    { icon: Home, label: "ホーム", path: "/dashboard" },
    { icon: Zap, label: "クイックチェック", path: "/check" },
  ];

  const activeProjectId = location.pathname.match(/\/project\/([^/]+)/)?.[1];

  return (
    <aside className="w-[260px] min-w-[260px] h-screen bg-sidebar border-r border-sidebar-border flex flex-col overflow-hidden">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-sidebar-border">
        <h1 className="text-lg font-bold flex items-center gap-2">
          <span>♟</span>
          <span className="gradient-text">CheckMate AI</span>
        </h1>
        <p className="text-[11px] text-muted-foreground mt-0.5">v3.0 — Creative Review</p>
      </div>

      {/* User */}
      <div className="px-5 py-3 border-b border-sidebar-border flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">
          {user?.email?.charAt(0).toUpperCase() || "U"}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{user?.email || "User"}</p>
          <p className="text-[11px] text-muted-foreground">Off Beat</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-2">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={cn(
                "w-full flex items-center gap-3 px-5 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground border-l-[3px] border-primary"
                  : "text-muted-foreground hover:bg-muted/50 border-l-[3px] border-transparent"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </button>
          );
        })}

        {/* Projects tree */}
        <div className="mt-1">
          <button
            onClick={() => setProjectsOpen(!projectsOpen)}
            className="w-full flex items-center gap-3 px-5 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted/50 border-l-[3px] border-transparent"
          >
            <FolderOpen className="h-4 w-4" />
            プロジェクト
            <button
              onClick={(e) => { e.stopPropagation(); onCreateProject?.(); }}
              className="ml-auto p-0.5 rounded hover:bg-muted"
              title="新規案件作成"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
            {projectsOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>

          {projectsOpen && clients.map((client) => (
            <div key={client.id}>
              <button
                onClick={() => toggleClient(client.id)}
                className="w-full flex items-center gap-2 px-7 py-2 text-sm text-muted-foreground hover:bg-muted/50"
              >
                {openClients.has(client.id) ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                <span className="font-medium">{client.name}</span>
              </button>

              {openClients.has(client.id) && products
                .filter((p) => p.client_id === client.id)
                .map((product) => (
                  <div key={product.id}>
                    <button
                      onClick={() => toggleProduct(product.id)}
                      className="w-full flex items-center gap-2 px-9 py-1.5 text-sm text-muted-foreground hover:bg-muted/50"
                    >
                      {openProducts.has(product.id) ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: productColorMap[product.color || ""] || "hsl(193, 100%, 50%)" }}
                      />
                      <span className="truncate">{product.name}</span>
                    </button>

                    {openProducts.has(product.id) && projects
                      .filter((pr) => pr.product_id === product.id)
                      .map((project) => (
                        <button
                          key={project.id}
                          onClick={() => navigate(`/project/${project.id}`)}
                          className={cn(
                            "w-full flex items-center gap-2 px-12 py-1.5 text-xs transition-colors truncate",
                            activeProjectId === project.id
                              ? "bg-sidebar-accent text-primary font-medium border-l-2 border-primary"
                              : "text-muted-foreground hover:bg-muted/50"
                          )}
                        >
                          <span className="truncate">• {project.name}</span>
                        </button>
                      ))
                    }
                    {openProducts.has(product.id) && projects.filter((pr) => pr.product_id === product.id).length === 0 && (
                      <p className="px-12 py-1 text-[10px] text-muted-foreground/50 italic">案件なし</p>
                    )}
                  </div>
                ))
              }
            </div>
          ))}
        </div>

        <button
          className="w-full flex items-center gap-3 px-5 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted/50 border-l-[3px] border-transparent"
        >
          <Settings className="h-4 w-4" />
          設定
        </button>
      </nav>

      {/* Sign out */}
      <div className="border-t border-sidebar-border p-3">
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 px-3 py-2 text-sm text-muted-foreground hover:bg-muted/50 rounded-lg transition-colors"
        >
          <LogOut className="h-4 w-4" />
          ログアウト
        </button>
      </div>
    </aside>
  );
}
