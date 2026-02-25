import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Client, Product, Project } from "@/lib/db-types";

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

  const fetch = useCallback(async () => {
    const [c, p, pr] = await Promise.all([
      supabase.from("clients").select("*").order("name"),
      supabase.from("products").select("*").order("name"),
      supabase.from("projects").select("*").order("created_at", { ascending: false }),
    ]);
    setClients((c.data as any as Client[]) || []);
    setProducts((p.data as any as Product[]) || []);
    setProjects((pr.data as any as Project[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  return { clients, products, projects, loading, refetch: fetch };
}
