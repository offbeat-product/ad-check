import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { Client, Product, Project } from "@/lib/db-types";
import { fetchProjectTreeData, PROJECT_TREE_QUERY_KEY } from "@/hooks/useProjectTree";
import { GLOBAL_SEARCH_OPEN_EVENT } from "@/lib/global-search-events";
import { extractBracketProjectId } from "@/lib/project-display";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Building2, FolderOpen, Package } from "lucide-react";

function rowMatches(needle: string, project: Project, clientName: string, productName: string): boolean {
  const t = needle.trim().toLowerCase();
  if (!t) return true;
  const obPm = String((project as Record<string, unknown>).ob_pm ?? "").toLowerCase();
  const haystack = [project.name, clientName, productName, obPm, project.project_code ?? ""].join("\n").toLowerCase();
  if (haystack.includes(t)) return true;

  const idInName = extractBracketProjectId(project.name);
  if (idInName && /^\d+$/.test(needle.trim())) {
    if (idInName === needle.trim()) return true;
    if (idInName.includes(needle.trim())) return true;
  }
  return false;
}

export default function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const navigate = useNavigate();

  const { data: tree, isPending } = useQuery({
    queryKey: PROJECT_TREE_QUERY_KEY,
    queryFn: fetchProjectTreeData,
    enabled: open,
    staleTime: 30_000,
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(GLOBAL_SEARCH_OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(GLOBAL_SEARCH_OPEN_EVENT, onOpen);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery("");
  }, [open]);

  const filtered = useMemo(() => {
    const clients = tree?.clients ?? [];
    const products = tree?.products ?? [];
    const projects = tree?.projects ?? [];
    const q = query.trim();
    if (!q) {
      return { clients: clients.slice(0, 5), products: products.slice(0, 5), projects: projects.slice(0, 8) };
    }
    const cl = clients.filter((c) => c.name.toLowerCase().includes(q.toLowerCase())).slice(0, 8);
    const prd = products
      .filter((p) => p.name.toLowerCase().includes(q.toLowerCase()) || p.code.toLowerCase().includes(q.toLowerCase()))
      .slice(0, 8);
    const clientMap = new Map(clients.map((c) => [c.id, c.name]));
    const productMap = new Map(products.map((p) => [p.id, { name: p.name, clientId: p.client_id }]));
    const proj = projects
      .filter((p) => {
        const pinfo = p.product_id ? productMap.get(p.product_id) : undefined;
        const cn = pinfo?.clientId ? clientMap.get(pinfo.clientId) ?? "" : "";
        const pn = pinfo?.name ?? "";
        return rowMatches(q, p, cn, pn);
      })
      .slice(0, 20);
    return { clients: cl, products: prd, projects: proj };
  }, [tree, query]);

  const runNavigate = useCallback(
    (path: string) => {
      setOpen(false);
      navigate(path);
    },
    [navigate]
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="overflow-hidden p-0 shadow-lg max-w-lg gap-0">
        <Command shouldFilter={false} className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5">
          <CommandInput placeholder="案件名・ID・クライアント・商材・担当で検索…" value={query} onValueChange={setQuery} />
          <CommandList>
            {isPending ? <div className="py-8 text-center text-sm text-muted-foreground">読み込み中…</div> : null}
            {!isPending && <CommandEmpty>一致する結果がありません</CommandEmpty>}

            {!isPending && filtered.clients.length > 0 && (
              <CommandGroup heading="クライアント">
                {filtered.clients.map((c) => (
                  <CommandItem key={`c-${c.id}`} value={`client-${c.id}`} onSelect={() => runNavigate(`/client/${c.id}`)}>
                    <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="truncate">{c.name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {!isPending && filtered.products.length > 0 && (
              <>
                {filtered.clients.length > 0 && <CommandSeparator />}
                <CommandGroup heading="商材">
                  {filtered.products.map((p) => (
                    <CommandItem key={`p-${p.id}`} value={`product-${p.id}`} onSelect={() => runNavigate(`/product/${p.id}`)}>
                      <Package className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="truncate">{p.name}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}

            {!isPending && filtered.projects.length > 0 && (
              <>
                {(filtered.clients.length > 0 || filtered.products.length > 0) && <CommandSeparator />}
                <CommandGroup heading="案件">
                  {filtered.projects.map((p) => {
                    const pinfo = p.product_id ? tree?.products.find((x) => x.id === p.product_id) : undefined;
                    const cn = pinfo?.client_id ? tree?.clients.find((x) => x.id === pinfo.client_id)?.name ?? "" : "";
                    const sub = [cn, pinfo?.name].filter(Boolean).join(" · ");
                    return (
                      <CommandItem key={`j-${p.id}`} value={`project-${p.id}`} onSelect={() => runNavigate(`/project/${p.id}`)}>
                        <FolderOpen className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm">{p.name}</p>
                          {sub ? <p className="text-[11px] text-muted-foreground truncate">{sub}</p> : null}
                        </div>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
