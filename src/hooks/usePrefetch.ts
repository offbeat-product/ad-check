/**
 * Prefetch utilities for hover-based route prefetching
 * Preloads page chunks and query data on hover to eliminate navigation delay
 */
import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { handleSupabaseError } from "@/lib/supabase-helpers";

// Chunk prefetch cache to avoid duplicate imports
const prefetchedChunks = new Set<string>();

function prefetchChunk(loader: () => Promise<unknown>, key: string) {
  if (prefetchedChunks.has(key)) return;
  prefetchedChunks.add(key);
  loader().catch(() => prefetchedChunks.delete(key));
}

export function usePrefetch() {
  const queryClient = useQueryClient();

  const prefetchProject = useCallback((projectId: string) => {
    // Prefetch the ProjectPage chunk
    prefetchChunk(() => import("@/pages/ProjectPage"), "ProjectPage");

    // Prefetch project data
    queryClient.prefetchQuery({
      queryKey: ["project", projectId],
      queryFn: async () => {
        const { data, error } = await supabase
          .from("projects")
          .select("*")
          .eq("id", projectId)
          .single();
        handleSupabaseError(error, "project");
        return data;
      },
      staleTime: 60_000,
    });
  }, [queryClient]);

  const prefetchFileReview = useCallback((projectId: string, fileId: string) => {
    prefetchChunk(() => import("@/pages/FileReviewPage"), "FileReviewPage");
  }, []);

  const prefetchDashboard = useCallback(() => {
    prefetchChunk(() => import("@/pages/Dashboard"), "Dashboard");
  }, []);

  return { prefetchProject, prefetchFileReview, prefetchDashboard };
}
