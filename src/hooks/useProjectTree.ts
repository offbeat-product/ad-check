import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Client, Product, Project } from "@/lib/db-types";
import { handleSupabaseError } from "@/lib/supabase-helpers";

export interface TreeData {
  clients: Client[];
  products: Product[];
  projects: Project[];
  loading: boolean;
  refetch: () => void;
}

export function useProjectTree(): TreeData {
  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async (cancelled = false) => {
    const [c, p, pr] = await Promise.all([
      supabase.from("clients").select("*").order("sort_order").order("name"),
      supabase.from("products").select("*").order("sort_order").order("name"),
      supabase.from("projects").select("*").order("sort_order").order("created_at", { ascending: false }),
    ]);
    if (cancelled) return;
    handleSupabaseError(c.error, "clients");
    handleSupabaseError(p.error, "products");
    handleSupabaseError(pr.error, "projects");
    setClients(c.data ?? []);
    setProducts(p.data ?? []);
    setProjects(pr.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(cancelled);
    return () => { cancelled = true; };
  }, [fetch]);

  const updateProjectOrder = useCallback(async (productId: string, orderedIds: string[]) => {
    setProjects((prev) => {
      const updated = [...prev];
      orderedIds.forEach((id, i) => {
        const idx = updated.findIndex((p) => p.id === id);
        if (idx !== -1) updated[idx] = { ...updated[idx], sort_order: i + 1 };
      });
      return updated;
    });
    for (let i = 0; i < orderedIds.length; i++) {
      await supabase.from("projects").update({ sort_order: i + 1 }).eq("id", orderedIds[i]);
    }
  }, []);

  const updateClientOrder = useCallback(async (orderedIds: string[]) => {
    setClients((prev) => {
      const updated = [...prev];
      orderedIds.forEach((id, i) => {
        const idx = updated.findIndex((c) => c.id === id);
        if (idx !== -1) updated[idx] = { ...updated[idx], sort_order: i + 1 };
      });
      return updated;
    });
    for (let i = 0; i < orderedIds.length; i++) {
      await supabase.from("clients").update({ sort_order: i + 1 }).eq("id", orderedIds[i]);
    }
  }, []);

  const updateProductOrder = useCallback(async (clientId: string, orderedIds: string[]) => {
    setProducts((prev) => {
      const updated = [...prev];
      orderedIds.forEach((id, i) => {
        const idx = updated.findIndex((p) => p.id === id);
        if (idx !== -1) updated[idx] = { ...updated[idx], sort_order: i + 1 };
      });
      return updated;
    });
    for (let i = 0; i < orderedIds.length; i++) {
      await supabase.from("products").update({ sort_order: i + 1 }).eq("id", orderedIds[i]);
    }
  }, []);

  return { clients, products, projects, loading, refetch: fetch, updateProjectOrder, updateClientOrder, updateProductOrder } as TreeData & { updateProjectOrder: (productId: string, orderedIds: string[]) => Promise<void>; updateClientOrder: (orderedIds: string[]) => Promise<void>; updateProductOrder: (clientId: string, orderedIds: string[]) => Promise<void> };
}
