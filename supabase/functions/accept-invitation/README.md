# accept-invitation

招待トークンでユーザーを作成/更新し、`email_confirm: true` で即ログイン可能にする Edge Function。

- **呼び出し元**: `src/pages/AcceptInvitePage.tsx`（`supabase.functions.invoke`）
- **認証**: `verify_jwt = false`（`supabase/config.toml`）。未ログイン状態から POST するため。
- **本番**: 2026-05-19 にデプロイ済み。ソースの正は本リポジトリの `index.ts`。

## デプロイ

Vercel のフロントデプロイには **含まれません**。変更後は別途:

```bash
supabase functions deploy accept-invitation --project-ref itdwxycecvdamarubpww
```

## リクエスト / レスポンス

**POST** body (JSON):

| フィールド | 必須 | 説明 |
|-----------|------|------|
| `token` | ✓ | 招待トークン |
| `password` | ✓ | 6 文字以上 |
| `display_name` | | 表示名（省略時は招待の display_name またはメールのローカル部） |

**200** body: `{ "ok": true, "email": "..." }` または `{ "ok": false, "error": "..." }`

成功後、クライアントは `signInWithPassword` でセッションを取得する。
