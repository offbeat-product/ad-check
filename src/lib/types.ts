export interface CheckItem {
  item: string;
  pattern_id: string;
  status: "NG" | "WARNING" | "OK";
  severity: "high" | "medium" | "low";
  location?: string;
  detail: string;
  suggestion?: string;
  confidence?: number;
}

export interface CheckResult {
  detected_case?: string;
  design_variant?: string;
  check_items: CheckItem[];
  overall_status: "A" | "B" | "C" | "D";
  ng_count: number;
  warning_count: number;
  ok_count: number;
  total_checks: number;
}

export interface CheckRecord {
  id: string;
  created_at: string;
  user_id: string;
  client_name: string;
  product_code: string;
  product_name: string;
  process_type: string;
  input_type: string;
  input_text?: string;
  overall_status: string;
  detected_case?: string;
  ng_count: number;
  warning_count: number;
  ok_count: number;
  total_checks: number;
  check_items: CheckItem[];
  raw_response: any;
  status?: string;
}

export type CheckStatus = "pending" | "in_progress" | "resolved" | "approved";

export interface Comment {
  id: string;
  check_result_id: string;
  check_item_id?: string;
  author_name: string;
  author_email: string;
  content: string;
  annotation_data?: { x: number; y: number } | null;
  status: "open" | "resolved";
  parent_id?: string | null;
  created_at: string;
}

export interface FileVersion {
  id: string;
  check_result_id: string;
  version_number: number;
  file_type: string;
  content_text?: string | null;
  image_url?: string | null;
  created_at: string;
}

export type ProductCode = "ltr_expo" | "cta_agent" | "tmd_aga";
export type ProcessType = "script" | "sf" | "ekonte" | "master";

export interface ProductConfig {
  code: ProductCode;
  name: string;
  label: string;
  rules: string;
  meta: string;
  color: string;
  warning?: string;
  sfEnabled: boolean;
  webhookPaths: Record<string, string>;
  sampleText: string;
  infoLines: string[];
}

export const PRODUCTS: ProductConfig[] = [
  {
    code: "ltr_expo",
    name: "LTR EXPO",
    label: "LTR EXPO",
    rules: "LIVE・20 rules",
    meta: "イベント告知",
    color: "product-ltr",
    sfEnabled: false,
    webhookPaths: { script: "check-script" },
    sampleText: `冒頭：IT就活 "優秀層"はもう始めてる\n前半：出遅れたくない... 取り残されたくない... 行きたい企業が決まっていない...\n中盤：就活サポート内定率85%以上 内定獲得まで最短2週間 19年のサポート実績\n後半：人気メーカー厳選○社が集結！\n締め：IT就活、乗り遅れるな（CTA：ENTRYはこちら）`,
    infoLines: [
      "商材：レバテックルーキー EXPO（イベント告知型）",
      "ルール：20項目（3案件自動判別: 27卒/28卒/リメイク）",
      "重点：ターゲット限定表現NG / 定型句回避 / LP数値整合",
    ],
  },
  {
    code: "cta_agent",
    name: "CTA Agent",
    label: "CTA Agent",
    rules: "LIVE・15 rules",
    meta: "サービス登録型",
    color: "product-cta",
    sfEnabled: false,
    webhookPaths: { script: "cta-script-check" },
    sampleText: `冒頭：27卒 就活はもう本格化している。あなたはまだ何もしていない？\n前半：やりたい仕事が見つからない。何から始めたらいいのかわからない。\n後半：キャリアチケットなら、自己分析から企業選びまで全部サポート。あなたに合う企業を平均5社厳選。\n締め：27卒就活、始めるなら今。キャリアチケット（CTA：プロと最短ルートで内定へ）`,
    infoLines: [
      "商材：キャリアチケット就職エージェント",
      "ルール：15項目",
      "重点：保証表現NG / テック表現NG / LP数値整合",
    ],
  },
  {
    code: "tmd_aga",
    name: "TMD AGA",
    label: "TMD AGA",
    rules: "18+12 rules",
    meta: "医療広告 ⚠薬事",
    color: "product-tmd",
    warning: "⚠ 医療系案件：薬機法・景表法・医療広告GL チェック対応",
    sfEnabled: true,
    webhookPaths: {
      script: "tmdaga-script-check",
      sf: "tmdaga-sf-check",
    },
    sampleText: `冒頭：市販のAGA薬で薄毛治療している40代以降の方、必見。\n中盤：レバクリなら、業界最安のフィナステリドとミノキシジルのセットが月々1,650円。髪が確実に生えてくる。発毛実感率91%。\n後半：オンライン診療だから自宅から気軽に診察、最短即日発送で届く。\n締め：賢く続けやすいAGA治療なら、レバクリ。詳細はこちら。`,
    infoLines: [
      "商材：レバクリAGA（オンラインAGA治療）",
      "ルール：18項目（うち薬事6項目が最優先）",
      "重点：発毛効果断言NG / 最安値誤認NG / 注釈必須",
    ],
  },
];

export const PROCESSES = [
  { id: "script" as ProcessType, label: "字コンテ / NA原稿", enabledFor: "all" as const },
  { id: "sf" as ProcessType, label: "スタイルフレーム", enabledFor: "tmd_aga" as const },
  { id: "ekonte" as ProcessType, label: "絵コンテ", enabledFor: "none" as const },
  { id: "master" as ProcessType, label: "動画マスター", enabledFor: "none" as const },
];
