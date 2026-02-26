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
  'storyboard':       { accept: '.jpg,.jpeg,.png,.pdf,.psd', allowTextInput: false, label: '絵コンテ' },
  'video_horizontal': { accept: '.mp4,.mov,.webm', allowTextInput: false, label: '横動画' },
  'video_vertical':   { accept: '.mp4,.mov,.webm', allowTextInput: false, label: '縦動画' },
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
  client_review:  { label: '先方確認中', color: 'purple', dotClass: 'bg-[hsl(264,100%,58%)]', badgeClass: 'bg-[hsl(264,100%,58%)]/10 text-[hsl(264,100%,58%)]' },
  completed:      { label: '完了',       color: 'green',  dotClass: 'bg-status-ok',           badgeClass: 'bg-status-ok/10 text-status-ok' },
};

// Process status config
export const PROCESS_STATUS_CONFIG: Record<string, { label: string; dotClass: string; badgeClass: string }> = {
  not_started:  { label: '未着手', dotClass: 'bg-muted-foreground/30', badgeClass: 'bg-muted text-muted-foreground' },
  in_progress:  { label: '進行中', dotClass: 'bg-primary',             badgeClass: 'bg-primary/10 text-primary' },
  review:       { label: '確認中', dotClass: 'bg-[hsl(264,100%,58%)]', badgeClass: 'bg-[hsl(264,100%,58%)]/10 text-[hsl(264,100%,58%)]' },
  revision:     { label: '修正中', dotClass: 'bg-status-warning',      badgeClass: 'bg-status-warning/10 text-status-warning' },
  completed:    { label: '完了',   dotClass: 'bg-status-ok',           badgeClass: 'bg-status-ok/10 text-status-ok' },
};

// Helper to get Japanese label for a process key
const PROCESS_LABEL_MAP: Record<string, string> = Object.fromEntries(
  DEFAULT_PROCESSES.map(p => [p.process_key, p.process_label])
);

export function getProcessLabel(processKey: string): string {
  return PROCESS_LABEL_MAP[processKey] || processKey;
}
