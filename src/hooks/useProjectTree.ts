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
      supabase.from("clients").select("*").order("name"),
      supabase.from("products").select("*").order("name"),
      supabase.from("projects").select("*").order("created_at", { ascending: false }),
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

  return { clients, products, projects, loading, refetch: fetch };
}
