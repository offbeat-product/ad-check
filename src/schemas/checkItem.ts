import { z } from 'zod';

// 非文字列が来ても文字列か null に倒す前処理
const SafeNullableString = z.preprocess(
  (v) => (v == null ? null : typeof v === 'string' ? v : String(v)),
  z.string().nullable(),
);

export const CheckItemSchema = z
  .object({
    item: z.string().catch(''),
    status: z.string().catch('N/A'), // OK / NG / WARNING / N/A / MANUAL
    severity: SafeNullableString.catch(null), // high / medium / low / null
    detail: SafeNullableString.catch(null),
    location: SafeNullableString.catch(null),
    suggestion: SafeNullableString.catch(null),
    pattern_id: SafeNullableString.catch(null),
    confidence: z.number().nullable().catch(null),
    bounding_box: z.unknown().nullable().catch(null),
    timestamp_start: z.number().nullable().catch(null),
    timestamp_end: z.number().nullable().catch(null),
  })
  .passthrough(); // 未知のキーが増えても壊さない

export type CheckItem = z.infer<typeof CheckItemSchema>;

// 1 要素が壊れても配列全体を巻き込まないためのフォールバック
const FALLBACK_ITEM: CheckItem = {
  item: '',
  status: 'N/A',
  severity: null,
  detail: null,
  location: null,
  suggestion: null,
  pattern_id: null,
  confidence: null,
  bounding_box: null,
  timestamp_start: null,
  timestamp_end: null,
};

export const CheckItemsSchema = z
  .array(CheckItemSchema.catch(FALLBACK_ITEM))
  .catch([]);

/** Supabase / webhook 取得境界で check_items をパースする */
export function parseCheckItems(value: unknown): CheckItem[] {
  return CheckItemsSchema.parse(value ?? []);
}
