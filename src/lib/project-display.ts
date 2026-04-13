/** Match 【ID405】 style IDs in project names */
const BRACKET_ID_RE = /【ID(\d+)】/;

/** Strip leading ◆YYYY年M月D日納品分【IDnnn】_商材名_ prefix when present */
const PREFIX_RE =
  /^◆\d{4}年\d{1,2}月\d{1,2}日納品分【ID\d+】_[^_]+_(.+)$/;

export function extractBracketProjectId(name: string): string | null {
  const m = BRACKET_ID_RE.exec(name);
  return m?.[1] ?? null;
}

export function stripProjectListNamePrefix(name: string): string {
  const m = PREFIX_RE.exec(name.trim());
  if (m?.[1]) return m[1].trim();
  const withoutBracket = name.replace(BRACKET_ID_RE, "").trim();
  return withoutBracket.replace(/^◆\d{4}年\d{1,2}月\d{1,2}日納品分_?/, "").replace(/^_\s*/, "").trim() || name;
}

const TERMINAL = new Set(["completed", "cancelled", "on_hold"]);

export function isProjectActiveForCount(status: string | null | undefined): boolean {
  return !TERMINAL.has((status || "").toLowerCase());
}

const DONE_FILE = new Set([
  "checked",
  "client_review",
  "fixed",
  "internal_revision",
  "approved",
]);

export function isFileDoneForProgress(status: string | null | undefined): boolean {
  return DONE_FILE.has((status || "").toLowerCase());
}

export function effectiveProjectDeadline(
  deadline: string | null | undefined,
  overallDeadline: string | null | undefined
): string | null {
  return deadline || overallDeadline || null;
}
