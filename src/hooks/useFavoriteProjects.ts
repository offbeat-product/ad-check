import { useCallback, useEffect, useState } from "react";

export const FAVORITE_PROJECTS_KEY = "favorite_projects";

const FAVORITES_CHANGED = "favorite-projects-changed";

function readFavorites(): string[] {
  try {
    const raw = localStorage.getItem(FAVORITE_PROJECTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string");
  } catch {
    return [];
  }
}

function writeFavorites(ids: string[]): void {
  localStorage.setItem(FAVORITE_PROJECTS_KEY, JSON.stringify(ids.slice(0, 10)));
  window.dispatchEvent(new Event(FAVORITES_CHANGED));
}

export function useFavoriteProjects(): {
  ids: string[];
  isFavorite: (projectId: string) => boolean;
  toggleFavorite: (projectId: string) => void;
  refresh: () => void;
} {
  const [ids, setIds] = useState<string[]>(() => readFavorites());

  const refresh = useCallback(() => {
    setIds(readFavorites());
  }, []);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === FAVORITE_PROJECTS_KEY || e.key === null) refresh();
    };
    const onCustom = () => refresh();
    window.addEventListener("storage", onStorage);
    window.addEventListener(FAVORITES_CHANGED, onCustom);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(FAVORITES_CHANGED, onCustom);
    };
  }, [refresh]);

  const isFavorite = useCallback(
    (projectId: string) => ids.includes(projectId),
    [ids]
  );

  const toggleFavorite = useCallback((projectId: string) => {
    const cur = readFavorites();
    const has = cur.includes(projectId);
    const next = has ? cur.filter((id) => id !== projectId) : [projectId, ...cur.filter((id) => id !== projectId)].slice(0, 10);
    writeFavorites(next);
    setIds(next);
  }, []);

  return { ids, isFavorite, toggleFavorite, refresh };
}
