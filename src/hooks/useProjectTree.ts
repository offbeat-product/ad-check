import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Client, Product, Project } from "@/lib/db-types";
import { handleSupabaseError } from "@/lib/supabase-helpers";

export const PROJECT_TREE_QUERY_KEY = ["project-tree"];

export interface TreeData {
  clients: Client[];
  products: Product[];
  projects: Project[];
  loading: boolean;
  refetch: () => void;
}

async function fetchTreeData() {
  const [c, p, pr] = await Promise.all([
    supabase.from("clients").select("*").order("sort_order").order("name"),
    supabase.from("products").select("*").order("sort_order").order("name"),
    supabase.from("projects").select("*").order("sort_order").order("created_at", { ascending: false }),
  ]);
  handleSupabaseError(c.error, "clients");
  handleSupabaseError(p.error, "products");
  handleSupabaseError(pr.error, "projects");
  return {
    clients: c.data ?? [],
    products: p.data ?? [],
    projects: pr.data ?? [],
  };
}

export function useProjectTree(): TreeData & {
  updateProjectOrder: (productId: string, orderedIds: string[]) => Promise<void>;
  updateClientOrder: (orderedIds: string[]) => Promise<void>;
  updateProductOrder: (clientId: string, orderedIds: string[]) => Promise<void>;
} {
  const queryClient = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: PROJECT_TREE_QUERY_KEY,
    queryFn: fetchTreeData,
    staleTime: 30_000,
  });

  const clients = data?.clients ?? [];
  const products = data?.products ?? [];
  const projects = data?.projects ?? [];

  const updateProjectOrder = useCallback(async (productId: string, orderedIds: string[]) => {
    // Optimistic update
    queryClient.setQueryData(PROJECT_TREE_QUERY_KEY, (old: any) => {
      if (!old) return old;
      const updated = old.projects.map((p: Project) => {
        const idx = orderedIds.indexOf(p.id);
        return idx !== -1 ? { ...p, sort_order: idx + 1 } : p;
      });
      return { ...old, projects: updated };
    });
    for (let i = 0; i < orderedIds.length; i++) {
      await supabase.from("projects").update({ sort_order: i + 1 }).eq("id", orderedIds[i]);
    }
  }, [queryClient]);

  const updateClientOrder = useCallback(async (orderedIds: string[]) => {
    queryClient.setQueryData(PROJECT_TREE_QUERY_KEY, (old: any) => {
      if (!old) return old;
      const updated = old.clients.map((c: Client) => {
        const idx = orderedIds.indexOf(c.id);
        return idx !== -1 ? { ...c, sort_order: idx + 1 } : c;
      });
      return { ...old, clients: updated };
    });
    for (let i = 0; i < orderedIds.length; i++) {
      await supabase.from("clients").update({ sort_order: i + 1 }).eq("id", orderedIds[i]);
    }
  }, [queryClient]);

  const updateProductOrder = useCallback(async (clientId: string, orderedIds: string[]) => {
    queryClient.setQueryData(PROJECT_TREE_QUERY_KEY, (old: any) => {
      if (!old) return old;
      const updated = old.products.map((p: Product) => {
        const idx = orderedIds.indexOf(p.id);
        return idx !== -1 ? { ...p, sort_order: idx + 1 } : p;
      });
      return { ...old, products: updated };
    });
    for (let i = 0; i < orderedIds.length; i++) {
      await supabase.from("products").update({ sort_order: i + 1 }).eq("id", orderedIds[i]);
    }
  }, [queryClient]);

  return {
    clients,
    products,
    projects,
    loading: isLoading,
    refetch: () => { refetch(); },
    updateProjectOrder,
    updateClientOrder,
    updateProductOrder,
  };
}
