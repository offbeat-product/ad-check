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
      { process_key: "banner_draft", process_label: "バナー構成案", sort_order: 2, is_common: false },
      { process_key: "banner_design", process_label: "バナーデザイン", sort_order: 3, is_common: false },
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

/** Mixed 案件の「静止画バナー」「動画」タブ切り替え用 */
export type MixedProcessTab = "banner" | "video";

/** process_types から banner レーンのキー集合（マスタ欠損時も既知キーを補完） */
export function buildMixedBannerProcessKeys(rows: ProcessTypeRow[]): Set<string> {
  const s = new Set<string>();
  rows.forEach((r) => {
    if (r.creative_type === "banner") s.add(r.code);
  });
  s.add("banner_draft");
  s.add("banner_design");
  return s;
}

/** process_types から動画タブ（common + video）のキー集合 */
export function buildMixedVideoLaneProcessKeys(rows: ProcessTypeRow[]): Set<string> {
  const s = new Set<string>();
  rows.forEach((r) => {
    if (r.creative_type === "common" || r.creative_type === "video") s.add(r.code);
  });
  s.add("script");
  return s;
}

/**
 * Mixed 案件: タブごとに表示する project_processes を切り替え。
 * - 静止画バナー: creative_type === banner のみ
 * - 動画: creative_type が common または video（構成/字コンテ〜縦動画）
 * カスタム: custom_banner_* / custom_video_* は各レーン専用。従来の custom_* は動画タブのみ。
 */
export function projectProcessMatchesMixedTab<T extends { process_key: string }>(
  proc: T,
  tab: MixedProcessTab,
  creativeByCode: Map<string, string>,
  bannerKeys: Set<string>,
  videoLaneKeys: Set<string>
): boolean {
  const k = proc.process_key;
  if (k.startsWith("custom_banner_")) return tab === "banner";
  if (k.startsWith("custom_video_")) return tab === "video";
  if (k.startsWith("custom_")) return tab === "video";

  if (bannerKeys.has(k)) return tab === "banner";
  if (videoLaneKeys.has(k)) return tab === "video";
  const ct = creativeByCode.get(k);
  if (ct === "banner") return tab === "banner";
  if (ct === "common" || ct === "video") return tab === "video";
  return false;
}

/** 工程管理モーダルでレーン内だけ並べ替えた後、全体の sort_order を再採番する */
export function mergeMixedProcessesAfterLaneReorder<T extends { process_key: string; sort_order: number }>(
  allProcesses: ReadonlyArray<T>,
  reorderedLane: T[],
  activeTab: MixedProcessTab,
  creativeByCode: Map<string, string>,
  bannerKeys: Set<string>,
  videoLaneKeys: Set<string>
): T[] {
  const inBanner = (p: T) =>
    projectProcessMatchesMixedTab(p, "banner", creativeByCode, bannerKeys, videoLaneKeys);
  const inVideo = (p: T) =>
    projectProcessMatchesMixedTab(p, "video", creativeByCode, bannerKeys, videoLaneKeys);

  const bannerProcs = allProcesses.filter(inBanner).sort((a, b) => a.sort_order - b.sort_order);
  const videoProcs = allProcesses.filter(inVideo).sort((a, b) => a.sort_order - b.sort_order);
  const orphans = allProcesses
    .filter((p) => !inBanner(p) && !inVideo(p))
    .sort((a, b) => a.sort_order - b.sort_order);

  if (activeTab === "banner") {
    const newVideo = videoProcs;
    const newBanner = reorderedLane;
    return [...newVideo, ...newBanner, ...orphans].map((p, i) => ({ ...p, sort_order: i + 1 }));
  }
  const newVideo = reorderedLane;
  const newBanner = bannerProcs;
  return [...newVideo, ...newBanner, ...orphans].map((p, i) => ({ ...p, sort_order: i + 1 }));
}
