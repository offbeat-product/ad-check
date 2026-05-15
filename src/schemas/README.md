# JSONB スキーマ（Ad Check）

`check_results` などの jsonb カラムは、**スキーマを定義してから**アプリ内で扱う。

## ルール

1. スキーマは `src/schemas/` に置く（例: `checkItem.ts`）。
2. **データ取得の境界**（Supabase クエリ直後・webhook 応答の正規化）で `parse()` を **1 回だけ** 通す。
3. コンポーネント内で再度 `as` キャストしない。描画時の `checkItemStr` 等の防御は残してよい。
4. 新しい jsonb カラムを触るときは、同じパターンでスキーマファイルを追加する。

## 再生成

DB 型全体: `npm run gen:types`（`src/types/database.types.ts`）。

jsonb の中身は Phase ごとに Zod スキーマを追加する（Phase 2: `check_items` のみ）。
