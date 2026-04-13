import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Project } from "@/lib/db-types";
import { isFileDoneForProgress } from "@/lib/project-display";

export const ALL_PROJECTS_QUERY_KEY = ["all-projects"] as const;

type RawProduct = {
  id: string;
  name: string;
  clients?: { id: string; name: string } | { id: string; name: string }[] | null;
} | null;

type RawProjectRow = Project & {
  products?: RawProduct | RawProduct[] | null;
  project_files?: { id: string; status: string | null }[] | null;
  ob_pm?: string | null;
};

function singleProduct(p: RawProduct | RawProduct[] | null | undefined): RawProduct {
  if (!p) return null;
  return Array.isArray(p) ? p[0] ?? null : p;
}

function singleClient(
  c: { id: string; name: string } | { id: string; name: string }[] | null | undefined
): { id: string; name: string } | null {
  if (!c) return null;
  return Array.isArray(c) ? c[0] ?? null : c;
}

export interface EnrichedProjectRow {
  project: Project;
  clientId: string;
  clientName: string;
  productId: string;
  productName: string;
  obPm: string | null;
  progress: { total: number; done: number };
}

function mapRow(r: RawProjectRow): EnrichedProjectRow {
  const prod = singleProduct(r.products);
  const cli = singleClient(prod?.clients ?? null);
  const files = r.project_files ?? [];
  const total = files.length;
  const done = files.filter((f) => isFileDoneForProgress(f.status)).length;
  const { project_files: _pf, products: _pr, ...proj } = r;
  return {
    project: proj as Project,
    clientId: cli?.id ?? "",
    clientName: cli?.name ?? "（未紐付）",
    productId: prod?.id ?? "",
    productName: prod?.name ?? "（未紐付）",
    obPm: r.ob_pm?.trim() ? r.ob_pm.trim() : null,
    progress: { total, done },
  };
}

export function useAllProjects() {
  return useQuery({
    queryKey: ALL_PROJECTS_QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select(
          `
          *,
          products (
            id,
            name,
            clients (
              id,
              name
            )
          ),
          project_files (id, status)
        `
        )
        .order("deadline", { ascending: true, nullsFirst: false });

      if (error) throw error;
      const rows = (data ?? []) as RawProjectRow[];
      return rows.map(mapRow);
    },
  });
}
