import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { handleSupabaseError } from "@/lib/supabase-helpers";
import { isProjectActiveForCount, isFileDoneForProgress, effectiveProjectDeadline } from "@/lib/project-display";
import { startOfDay, addDays, isSameDay, isAfter, isBefore, parseISO } from "date-fns";

export interface DeadlineProjectRow {
  id: string;
  name: string;
  status: string | null;
  deadline: string | null;
  overall_deadline: string | null;
  product_id: string | null;
  client_name: string;
  product_name: string;
  total_files: number;
  completed_files: number;
}

async function fetchDeadlineProjects(): Promise<DeadlineProjectRow[]> {
  const { data: projects, error } = await supabase.from("projects").select("id, name, status, deadline, overall_deadline, product_id");
  if (handleSupabaseError(error, "projects deadlines")) return [];

  const active = (projects ?? []).filter((p) => isProjectActiveForCount(p.status));
  const productIds = [...new Set(active.map((p) => p.product_id).filter(Boolean))] as string[];
  if (productIds.length === 0) return [];

  const { data: products, error: pe } = await supabase
    .from("products")
    .select("id, name, client_id")
    .in("id", productIds);
  if (handleSupabaseError(pe, "products deadlines")) return [];

  const clientIds = [...new Set((products ?? []).map((p) => p.client_id).filter(Boolean))] as string[];
  const { data: clients, error: ce } = await supabase.from("clients").select("id, name").in("id", clientIds);
  if (handleSupabaseError(ce, "clients deadlines")) return [];

  const clientMap = new Map((clients ?? []).map((c) => [c.id, c.name]));
  const productMap = new Map(
    (products ?? []).map((p) => [
      p.id,
      { name: p.name, clientName: (p.client_id && clientMap.get(p.client_id)) || "" },
    ])
  );

  const projectIds = active.map((p) => p.id);
  const { data: files, error: fe } = await supabase
    .from("project_files")
    .select("project_id, status")
    .in("project_id", projectIds);
  if (handleSupabaseError(fe, "project_files deadlines")) return [];

  const fileAgg = new Map<string, { total: number; done: number }>();
  (files ?? []).forEach((f) => {
    const pid = f.project_id;
    if (!pid) return;
    const cur = fileAgg.get(pid) || { total: 0, done: 0 };
    cur.total += 1;
    if (isFileDoneForProgress(f.status)) cur.done += 1;
    fileAgg.set(pid, cur);
  });

  const today = startOfDay(new Date());
  const horizon = startOfDay(addDays(today, 7));

  const rows: DeadlineProjectRow[] = [];
  for (const p of active) {
    const eff = effectiveProjectDeadline(p.deadline, p.overall_deadline);
    if (!eff) continue;
    let d: Date;
    try {
      d = startOfDay(parseISO(eff.length > 10 ? eff : `${eff}T00:00:00`));
    } catch {
      continue;
    }
    if (isBefore(d, today)) continue;
    if (isAfter(d, horizon)) continue;
    const pinfo = p.product_id ? productMap.get(p.product_id) : undefined;
    const agg = fileAgg.get(p.id) || { total: 0, done: 0 };
    rows.push({
      id: p.id,
      name: p.name,
      status: p.status,
      deadline: p.deadline,
      overall_deadline: p.overall_deadline,
      product_id: p.product_id,
      client_name: pinfo?.clientName ?? "",
      product_name: pinfo?.name ?? "",
      total_files: agg.total,
      completed_files: agg.done,
    });
  }

  rows.sort((a, b) => {
    const da = effectiveProjectDeadline(a.deadline, a.overall_deadline) || "";
    const db = effectiveProjectDeadline(b.deadline, b.overall_deadline) || "";
    return da.localeCompare(db);
  });

  return rows;
}

export function useUpcomingDeadlines() {
  return useQuery({
    queryKey: ["upcoming-deadlines"],
    queryFn: fetchDeadlineProjects,
    staleTime: 60_000,
  });
}

/**
 * 本日締切（納期が今日）と今週の締切（明日〜7日後、本日分は除外・期限超過は fetch 時点で除外済み）
 */
export function splitTodayAndWeek(rows: DeadlineProjectRow[]): { today: DeadlineProjectRow[]; weekRest: DeadlineProjectRow[] } {
  const today = startOfDay(new Date());
  const horizon = startOfDay(addDays(today, 7));
  const todayList: DeadlineProjectRow[] = [];
  const weekRest: DeadlineProjectRow[] = [];
  for (const r of rows) {
    const eff = effectiveProjectDeadline(r.deadline, r.overall_deadline);
    if (!eff) continue;
    let d: Date;
    try {
      d = startOfDay(parseISO(eff.length > 10 ? eff : `${eff}T00:00:00`));
    } catch {
      continue;
    }
    if (isSameDay(d, today)) todayList.push(r);
    else if (isAfter(d, today) && !isAfter(d, horizon)) weekRest.push(r);
  }
  weekRest.sort((a, b) => {
    const da = effectiveProjectDeadline(a.deadline, a.overall_deadline) || "";
    const db = effectiveProjectDeadline(b.deadline, b.overall_deadline) || "";
    return da.localeCompare(db);
  });
  return { today: todayList, weekRest };
}
