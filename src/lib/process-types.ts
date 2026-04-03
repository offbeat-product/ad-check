import type { Tables } from "@/integrations/supabase/types";
import { DEFAULT_PROCESSES } from "@/lib/process-config";

export type ProcessTypeRow = Tables<"process_types">;

export type ProjectCreativeType = "video" | "banner" | "mixed";

const MIXED_MASTER_CREATIVE_TYPES = new Set(["common", "video", "banner"]);

const COMMON_PATTERN_KEYS = new Set(["na_script", "bgm", "narration"]);

export function isCommonPatternProcessKey(code: string): boolean {
  return COMMON_PATTERN_KEYS.has(code);
}

export function filterProcessTypesForProject(
  rows: ProcessTypeRow[],
  creativeType: string
): ProcessTypeRow[] {
  if (creativeType === "mixed") {
    return rows.filter((r) => MIXED_MASTER_CREATIVE_TYPES.has(r.creative_type));
  }
  return rows.filter(
    (r) => r.creative_type === "common" || r.creative_type === creativeType
  );
}

/** Mixed projects: common + video + banner master rows, ordered common → video → banner (then sort_order). */
export function buildMixedProjectProcessRowsFromMaster(rows: ProcessTypeRow[]): {
  process_key: string;
  process_label: string;
  sort_order: number;
  is_common: boolean;
}[] {
  const filtered = filterProcessTypesForProject(rows, "mixed");
  const tier = (t: string) => (t === "common" ? 0 : t === "video" ? 1 : 2);
  const sorted = [...filtered].sort((a, b) => {
    const d = tier(a.creative_type) - tier(b.creative_type);
    if (d !== 0) return d;
    return a.sort_order - b.sort_order;
  });
  return sorted.map((r, i) => ({
    process_key: r.code,
    process_label: r.name,
    sort_order: i + 1,
    is_common: isCommonPatternProcessKey(r.code),
  }));
}

function mergeVideoBannerFallbackRows(): {
  process_key: string;
  process_label: string;
  sort_order: number;
  is_common: boolean;
}[] {
  const video = buildDefaultProcessInsertsWithFallback([], "video");
  const banner = buildDefaultProcessInsertsWithFallback([], "banner");
  const seen = new Set<string>();
  const out: typeof video = [];
  for (const row of [...video, ...banner]) {
    if (seen.has(row.process_key)) continue;
    seen.add(row.process_key);
    out.push(row);
  }
  return out.map((p, i) => ({ ...p, sort_order: i + 1 }));
}

export function buildProjectProcessRowsFromMaster(
  rows: ProcessTypeRow[],
  creativeType: string
): { process_key: string; process_label: string; sort_order: number; is_common: boolean }[] {
  const filtered = filterProcessTypesForProject(rows, creativeType);
  const sorted = [...filtered].sort((a, b) => a.sort_order - b.sort_order);
  return sorted.map((r) => ({
    process_key: r.code,
    process_label: r.name,
    sort_order: r.sort_order,
    is_common: isCommonPatternProcessKey(r.code),
  }));
}

/** When process_types is empty (e.g. query error / migration pending), fall back to legacy defaults. */
export function buildDefaultProcessInsertsWithFallback(
  master: ProcessTypeRow[],
  creativeType: string
): { process_key: string; process_label: string; sort_order: number; is_common: boolean }[] {
  if (creativeType === "mixed") {
    const mixedBuilt = buildMixedProjectProcessRowsFromMaster(master);
    if (mixedBuilt.length > 0) return mixedBuilt;
    return mergeVideoBannerFallbackRows();
  }
  const built = buildProjectProcessRowsFromMaster(master, creativeType);
  if (built.length > 0) return built;
  if (creativeType === "banner") {
    return [
      { process_key: "script", process_label: "構成/字コンテ", sort_order: 1, is_common: false },
      { process_key: "banner_design", process_label: "バナーデザイン", sort_order: 2, is_common: false },
    ];
  }
  return DEFAULT_PROCESSES.map((p) => ({
    ...p,
    is_common: isCommonPatternProcessKey(p.process_key),
  }));
}

export function buildProcessLabelLookup(rows: ProcessTypeRow[]): Record<string, string> {
  return Object.fromEntries(rows.map((r) => [r.code, r.name]));
}
