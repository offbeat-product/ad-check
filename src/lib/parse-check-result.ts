import type { CheckResultRow } from '@/lib/db-types';
import type { Json } from '@/integrations/supabase/types';
import { parseCheckItems, type CheckItem } from '@/schemas/checkItem';

/** check_results 行の check_items をパース済みにした型 */
export type CheckResultWithParsedItems = Omit<CheckResultRow, 'check_items'> & {
  check_items: CheckItem[] | null;
};

/** Supabase 取得直後に check_items を 1 回だけパースする */
export function parseCheckResultRow<T extends { check_items?: Json | null }>(
  row: T,
): Omit<T, 'check_items'> & { check_items: CheckItem[] | null } {
  if (row.check_items == null) {
    return { ...row, check_items: null };
  }
  return {
    ...row,
    check_items: parseCheckItems(row.check_items),
  };
}
