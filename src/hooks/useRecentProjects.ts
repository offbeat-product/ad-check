import { useCallback, useEffect, useState } from "react";

export const RECENT_PROJECTS_KEY = "recent_projects";

export interface RecentProjectEntry {
  project_id: string;
  project_name: string;
  client_name: string;
  product_name: string;
  viewed_at: string;
}

function readRecent(): RecentProjectEntry[] {
  try {
    const raw = localStorage.getItem(RECENT_PROJECTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is RecentProjectEntry =>
        typeof e === "object" &&
        e !== null &&
        typeof (e as RecentProjectEntry).project_id === "string" &&
        typeof (e as RecentProjectEntry).project_name === "string"
    );
  } catch {
    return [];
  }
}

export function pushRecentProject(entry: RecentProjectEntry): void {
  const prev = readRecent().filter((e) => e.project_id !== entry.project_id);
  const next = [{ ...entry, viewed_at: entry.viewed_at || new Date().toISOString() }, ...prev].slice(0, 10);
  localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event("recent-projects-changed"));
}

export function useRecentProjects(): { entries: RecentProjectEntry[]; refresh: () => void } {
  const [entries, setEntries] = useState<RecentProjectEntry[]>(() => readRecent());

  const refresh = useCallback(() => {
    setEntries(readRecent());
  }, []);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === RECENT_PROJECTS_KEY || e.key === null) refresh();
    };
    const onCustom = () => refresh();
    window.addEventListener("storage", onStorage);
    window.addEventListener("recent-projects-changed", onCustom);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("recent-projects-changed", onCustom);
    };
  }, [refresh]);

  return { entries, refresh };
}
