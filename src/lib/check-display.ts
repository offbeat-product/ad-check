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
    ? "bg-[#10B981] text-white border-[#10B981]"
    : "bg-[#EF4444] text-white border-[#EF4444]";
}

/** Japanese labels for check item statuses */
export const STATUS_LABEL: Record<string, string> = {
  NG: "修正必須",
  WARNING: "要確認",
  OK: "問題なし",
  MANUAL: "手動確認",
};

export const STATUS_FILTER_OPTIONS = [
  { key: "NG", label: "修正必須", color: "bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/30" },
  { key: "WARNING", label: "要確認", color: "bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/30" },
  { key: "OK", label: "問題なし", color: "bg-[#10B981]/10 text-[#10B981] border-[#10B981]/30" },
  { key: "MANUAL", label: "手動確認", color: "bg-[#6B7280]/10 text-[#6B7280] border-[#6B7280]/30" },
] as const;
