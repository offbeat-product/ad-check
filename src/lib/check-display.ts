// Shared helpers for check result display labels & colors

/** Derive GO/NG from overall_status (A/B = GO, C/D = NG). This is the primary source of truth. */
export function getSubmitLabel(status: string | null | undefined): { label: string; isOk: boolean } {
  const s = (status || "").toUpperCase();
  const isOk = s === "A" || s === "B";
  return { label: isOk ? "GO" : "NG", isOk };
}

export function getSubmitBadgeClass(status: string | null | undefined): string {
  const { isOk } = getSubmitLabel(status);
  return isOk
    ? "bg-status-ok text-white border-status-ok"
    : "bg-status-ng text-white border-status-ng";
}

/** Fallback: derive GO/NG from ng_count when overall_status is not available */
export function getSubmitLabelFromCounts(ngCount: number | null | undefined): { label: string; isOk: boolean } {
  const isOk = (ngCount ?? 0) === 0;
  return { label: isOk ? "GO" : "NG", isOk };
}

export function getSubmitBadgeClassFromCounts(ngCount: number | null | undefined): string {
  const { isOk } = getSubmitLabelFromCounts(ngCount);
  return isOk
    ? "bg-status-ok text-white border-status-ok"
    : "bg-status-ng text-white border-status-ng";
}

/**
 * Compute effective GO/NG considering resolved items.
 * If the original status is NG (C/D) but ALL NG check items have been resolved, return GO.
 */
export function getEffectiveSubmitLabel(
  overallStatus: string | null | undefined,
  checkItems: Array<{ status: string; pattern_id: string; item?: string }> | null | undefined,
  resolvedItems: string[] | null | undefined,
): { label: string; isOk: boolean } {
  const base = getSubmitLabel(overallStatus);
  if (base.isOk) return base; // Already GO
  if (!checkItems || !resolvedItems || resolvedItems.length === 0) return base;

  const resolvedSet = new Set(resolvedItems);
  const ngItems = checkItems.filter(i => i.status === "NG");
  if (ngItems.length > 0 && ngItems.every(i => {
    // Use pattern_id if available, otherwise fall back to item text as identifier
    const id = i.pattern_id || i.item || "";
    return id ? resolvedSet.has(id) : false;
  })) {
    return { label: "GO", isOk: true };
  }
  return base;
}

export function getEffectiveSubmitBadgeClass(
  overallStatus: string | null | undefined,
  checkItems: Array<{ status: string; pattern_id: string }> | null | undefined,
  resolvedItems: string[] | null | undefined,
): string {
  const { isOk } = getEffectiveSubmitLabel(overallStatus, checkItems, resolvedItems);
  return isOk
    ? "bg-status-ok text-white border-status-ok"
    : "bg-status-ng text-white border-status-ng";
}

/** Japanese labels for check item statuses */
export const STATUS_LABEL: Record<string, string> = {
  NG: "修正必須",
  WARNING: "要確認",
  OK: "問題なし",
  MANUAL: "手動確認",
};

export const STATUS_FILTER_OPTIONS = [
  { key: "NG", label: "修正必須", color: "bg-status-ng/10 text-status-ng border-status-ng/30" },
  { key: "WARNING", label: "要確認", color: "bg-status-warning/10 text-status-warning border-status-warning/30" },
  { key: "OK", label: "問題なし", color: "bg-status-ok/10 text-status-ok border-status-ok/30" },
  { key: "MANUAL", label: "手動確認", color: "bg-status-manual/10 text-status-manual border-status-manual/30" },
] as const;
