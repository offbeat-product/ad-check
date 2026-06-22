// Default process template for new projects
export const DEFAULT_PROCESSES = [
  { process_key: 'script',           process_label: '構成/字コンテ',      sort_order: 1 },
  { process_key: 'na_script',        process_label: 'NA原稿',            sort_order: 2 },
  { process_key: 'narration',        process_label: 'ナレーション',       sort_order: 3 },
  { process_key: 'bgm',              process_label: 'BGM',              sort_order: 4 },
  { process_key: 'vcon',             process_label: 'Vコン',             sort_order: 5 },
  { process_key: 'styleframe',       process_label: 'スタイルフレーム',    sort_order: 6 },
  { process_key: 'storyboard',       process_label: '絵コンテ',          sort_order: 7 },
  { process_key: 'video_horizontal', process_label: '横動画',            sort_order: 8 },
  { process_key: 'video_vertical',   process_label: '縦動画',            sort_order: 9 },
];

// Process file configuration
export const PROCESS_FILE_CONFIG: Record<string, { accept: string; allowTextInput: boolean; label: string }> = {
  'script':           { accept: '.txt,.docx', allowTextInput: true, label: '字コンテ' },
  'na_script':        { accept: '.txt,.docx', allowTextInput: true, label: 'NA原稿' },
  'narration':        { accept: '.mp3,.wav,.m4a', allowTextInput: false, label: 'ナレーション音声' },
  'bgm':              { accept: '.mp3,.wav,.m4a', allowTextInput: false, label: 'BGM音声' },
  'vcon':             { accept: '.mp4,.mov,.webm', allowTextInput: false, label: 'Vコン動画' },
  'styleframe':       { accept: '.jpg,.jpeg,.png,.psd,.ai', allowTextInput: false, label: 'スタイルフレーム画像' },
  'storyboard':       { accept: '.jpg,.jpeg,.png,.webp,.pdf,.psd', allowTextInput: false, label: '絵コンテ' },
  'video_horizontal': { accept: '.mp4,.mov,.webm', allowTextInput: false, label: '横動画' },
  'video_vertical':   { accept: '.mp4,.mov,.webm', allowTextInput: false, label: '縦動画' },
  'banner_design':    { accept: '.jpg,.jpeg,.png,.pdf,.psd,.webp,.ai', allowTextInput: false, label: 'バナーデザイン' },
  'banner_draft':     { accept: '.jpg,.jpeg,.png,.pdf,.psd,.webp,.ai', allowTextInput: false, label: 'バナー構成案' },
};

// AI check capability per process type
export type InputMode = 'text' | 'image' | 'audio' | 'video';

export const AI_CHECK_CONFIG: Record<string, { inputMode: InputMode; enabled: boolean }> = {
  'script':           { inputMode: 'text',  enabled: true },
  'na_script':        { inputMode: 'text',  enabled: true },
  'sf':               { inputMode: 'image', enabled: true },
  'styleframe':       { inputMode: 'image', enabled: true },
  'storyboard':       { inputMode: 'image', enabled: true },
  'vcon':             { inputMode: 'video', enabled: true },
  'narration':        { inputMode: 'audio', enabled: true },
  'bgm':              { inputMode: 'audio', enabled: true },
  'video_horizontal': { inputMode: 'video', enabled: true },
  'video_vertical':   { inputMode: 'video', enabled: true },
  'banner_design':    { inputMode: 'image', enabled: true },
  'banner_draft':     { inputMode: 'image', enabled: true },
};

// Webhook mapping per product × process
const WEBHOOK_MAP: Record<string, Record<string, string>> = {
  'ltr_expo': {
    'script': 'check-script',
    'na_script': 'check-script',
  },
  'cta_agent': {
    'script': 'cta-script-check',
    'na_script': 'cta-script-check',
  },
  'tmd_aga': {
    'script': 'tmdaga-script-check',
    'na_script': 'tmdaga-script-check',
    'styleframe': 'tmdaga-sf-check',
  },
};

export function getProcessWebhookPath(productCode: string, processKey: string): string | null {
  return WEBHOOK_MAP[productCode?.toLowerCase()]?.[processKey] || null;
}

// Project status config
export const PROJECT_STATUS_CONFIG: Record<string, { label: string; color: string; dotClass: string; badgeClass: string }> = {
  preparing:      { label: '準備中',     color: 'gray',   dotClass: 'bg-muted-foreground/50', badgeClass: 'bg-muted text-muted-foreground' },
  in_progress:    { label: '進行中',     color: 'blue',   dotClass: 'bg-primary',             badgeClass: 'bg-primary/10 text-primary' },
  revision:       { label: '修正中',     color: 'orange', dotClass: 'bg-status-warning',      badgeClass: 'bg-status-warning/10 text-status-warning' },
  internal_revision: { label: '社内修正中', color: 'orange', dotClass: 'bg-status-warning', badgeClass: 'bg-status-warning/10 text-status-warning' },
  client_review:  { label: '先方確認中', color: 'purple', dotClass: 'bg-[hsl(264,100%,58%)]', badgeClass: 'bg-[hsl(264,100%,58%)]/10 text-[hsl(264,100%,58%)]' },
  completed:      { label: '完了',       color: 'blue',   dotClass: 'bg-primary',              badgeClass: 'bg-primary/10 text-primary' },
  on_hold:        { label: '保留',       color: 'gray',   dotClass: 'bg-muted-foreground/50', badgeClass: 'bg-muted text-muted-foreground' },
  cancelled:      { label: 'キャンセル', color: 'gray',   dotClass: 'bg-muted-foreground/50', badgeClass: 'bg-muted text-muted-foreground' },
};

/** DBに英語・日本語が混在する前提の完了扱い */
export function isProjectStatusCompletedLike(status: string | null | undefined): boolean {
  const s = (status || "").trim();
  const l = s.toLowerCase();
  return l === "completed" || l === "done" || s === "完了";
}

export function isProjectStatusCancelledLike(status: string | null | undefined): boolean {
  const s = (status || "").trim();
  const l = s.toLowerCase();
  return l === "cancelled" || l === "canceled" || s === "キャンセル";
}

export function isProjectStatusOnHoldLike(status: string | null | undefined): boolean {
  const s = (status || "").trim();
  const l = s.toLowerCase();
  return l === "on_hold" || s === "保留";
}

/** サマリー「進行中」相当: 完了・キャンセル・保留以外 */
export function isProjectOpenForSummaryKpi(status: string | null | undefined): boolean {
  return (
    !isProjectStatusCompletedLike(status) &&
    !isProjectStatusCancelledLike(status) &&
    !isProjectStatusOnHoldLike(status)
  );
}

const IN_PROGRESS_MOOD_KEYS = new Set([
  "preparing",
  "in_progress",
  "revision",
  "internal_revision",
  "client_review",
  "review",
  "準備中",
  "進行中",
]);

/**
 * 仕様の「進行中系」: 明示リスト + 上記以外で完了/キャンセル/保留でもないもの
 */
export function isProjectStatusInProgressMood(status: string | null | undefined): boolean {
  const s = (status || "").trim();
  if (!s) return true;
  if (IN_PROGRESS_MOOD_KEYS.has(s) || IN_PROGRESS_MOOD_KEYS.has(s.toLowerCase())) return true;
  if (isProjectStatusCompletedLike(s) || isProjectStatusCancelledLike(s) || isProjectStatusOnHoldLike(s)) return false;
  return true;
}

/** Select / フィルタ用に DB の生値を canonical キーへ寄せる */
export function canonicalProjectStatusForSelect(raw: string | null | undefined): string {
  const s = (raw || "").trim();
  if (!s) return "in_progress";
  const l = s.toLowerCase();
  if (s === "準備中" || l === "preparing") return "preparing";
  if (s === "進行中" || l === "in_progress" || l === "active") return "in_progress";
  if (s === "完了" || l === "completed" || l === "done") return "completed";
  if (l === "review" || l === "revision") return "revision";
  if (l === "internal_revision") return "internal_revision";
  if (l === "client_review") return "client_review";
  if (l === "on_hold") return "on_hold";
  if (l === "cancelled" || l === "canceled") return "cancelled";
  if (l in PROJECT_STATUS_CONFIG) return l;
  return "in_progress";
}

// Process status config (aligned with PROJECT_STATUS_CONFIG)
export const PROCESS_STATUS_CONFIG: Record<string, { label: string; dotClass: string; badgeClass: string }> = {
  preparing:      { label: '準備中',     dotClass: 'bg-muted-foreground/50', badgeClass: 'bg-muted text-muted-foreground' },
  in_progress:    { label: '進行中',     dotClass: 'bg-primary',             badgeClass: 'bg-primary/10 text-primary' },
  revision:       { label: '修正中',     dotClass: 'bg-status-warning',      badgeClass: 'bg-status-warning/10 text-status-warning' },
  internal_revision: { label: '社内修正中', dotClass: 'bg-status-warning', badgeClass: 'bg-status-warning/10 text-status-warning' },
  client_review:  { label: '先方確認中', dotClass: 'bg-[hsl(264,100%,58%)]', badgeClass: 'bg-[hsl(264,100%,58%)]/10 text-[hsl(264,100%,58%)]' },
  completed:      { label: '完了',       dotClass: 'bg-status-ok',           badgeClass: 'bg-status-ok/10 text-status-ok' },
  on_hold:        { label: '保留',       dotClass: 'bg-muted-foreground/50', badgeClass: 'bg-muted text-muted-foreground' },
  cancelled:      { label: 'キャンセル', dotClass: 'bg-muted-foreground/50', badgeClass: 'bg-muted text-muted-foreground' },
};

// Helper to get Japanese label for a process key
const PROCESS_LABEL_MAP: Record<string, string> = {
  ...Object.fromEntries(DEFAULT_PROCESSES.map((p) => [p.process_key, p.process_label])),
  banner_design: "バナーデザイン",
  banner_draft: "バナー構成案",
};

export function getProcessLabel(processKey: string, labelByKey?: Record<string, string>): string {
  if (labelByKey?.[processKey]) return labelByKey[processKey];
  return PROCESS_LABEL_MAP[processKey] || processKey;
}

/** Upload UI: known keys use PROCESS_FILE_CONFIG; others use heuristics (banner / unknown). */
export function getProcessFileUploadConfig(processKey: string): { accept: string; allowTextInput: boolean; label: string } {
  const known = PROCESS_FILE_CONFIG[processKey];
  if (known) return known;
  const kl = processKey.toLowerCase();
  if (kl.includes("video") || kl === "vcon") return PROCESS_FILE_CONFIG.video_horizontal;
  if (kl.includes("narration") || kl.includes("bgm") || kl.endsWith("_audio")) return PROCESS_FILE_CONFIG.narration;
  if (kl.includes("script")) return PROCESS_FILE_CONFIG.script;
  if (kl.includes("banner") || kl.includes("design") || kl.includes("static") || kl.includes("layout")) {
    return { accept: ".jpg,.jpeg,.png,.pdf,.psd,.webp,.ai", allowTextInput: false, label: processKey };
  }
  return { accept: ".jpg,.jpeg,.png,.pdf,.psd,.webp,.txt,.docx", allowTextInput: false, label: processKey };
}
