// Shared helpers for check result display labels & colors

/** Map overall_status (A/B/C/D) to 提出OK / 提出NG */
export function getSubmitLabel(status: string | null | undefined): { label: string; isOk: boolean } {
  const s = (status || "").toUpperCase();
  const isOk = s === "A" || s === "B";
  return { label: isOk ? "提出OK" : "提出NG", isOk };
}

export function getSubmitBadgeClass(status: string | null | undefined): string {
  const { isOk } = getSubmitLabel(status);
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
