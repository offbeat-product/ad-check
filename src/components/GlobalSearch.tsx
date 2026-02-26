import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Search, FolderOpen, Package, Building2, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

interface SearchResult {
  id: string;
  type: "project" | "product" | "client";
  name: string;
  subtitle?: string;
  path: string;
}

export default function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // Cmd+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setSelectedIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Search
  const search = useCallback(async (q: string) => {
    if (q.length < 1) { setResults([]); return; }
    const pattern = `%${q}%`;

    const [clients, products, projects] = await Promise.all([
      supabase.from("clients").select("id, name").ilike("name", pattern).limit(5),
      supabase.from("products").select("id, name, label").ilike("name", pattern).limit(5),
      supabase.from("projects").select("id, name, product_id").ilike("name", pattern).limit(10),
    ]);

    const items: SearchResult[] = [];
    (clients.data ?? []).forEach((c) =>
      items.push({ id: c.id, type: "client", name: c.name, path: `/client/${c.id}` })
    );
    (products.data ?? []).forEach((p) =>
      items.push({ id: p.id, type: "product", name: p.name, subtitle: p.label, path: `/product/${p.id}` })
    );
    (projects.data ?? []).forEach((p) =>
      items.push({ id: p.id, type: "project", name: p.name, path: `/project/${p.id}` })
    );
    setResults(items);
    setSelectedIdx(0);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => search(query), 200);
    return () => clearTimeout(timer);
  }, [query, search]);

  const handleSelect = (result: SearchResult) => {
    setOpen(false);
    navigate(result.path);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[selectedIdx]) {
      e.preventDefault();
      handleSelect(results[selectedIdx]);
    }
  };

  const iconMap = {
    client: Building2,
    product: Package,
    project: FolderOpen,
  };

  const labelMap = {
    client: "クライアント",
    product: "商材",
    project: "案件",
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="案件名、クライアント名、商材名で検索..."
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
          />
          <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            ESC
          </kbd>
        </div>

        <div className="max-h-[320px] overflow-y-auto">
          {query.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <Search className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">検索キーワードを入力</p>
              <p className="text-xs mt-1">案件、クライアント、商材を横断検索できます</p>
            </div>
          ) : results.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <p className="text-sm">「{query}」に一致する結果はありません</p>
            </div>
          ) : (
            <div className="py-1">
              {results.map((r, idx) => {
                const Icon = iconMap[r.type];
                return (
                  <button
                    key={`${r.type}-${r.id}`}
                    onClick={() => handleSelect(r)}
                    onMouseEnter={() => setSelectedIdx(idx)}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors",
                      idx === selectedIdx ? "bg-muted" : "hover:bg-muted/50"
                    )}
                  >
                    <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{r.name}</p>
                      {r.subtitle && <p className="text-xs text-muted-foreground truncate">{r.subtitle}</p>}
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0">{labelMap[r.type]}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-4 py-2 border-t border-border flex items-center gap-4 text-[10px] text-muted-foreground">
          <span>↑↓ 移動</span>
          <span>↵ 選択</span>
          <span>esc 閉じる</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
