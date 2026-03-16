# Ad Check

広告クリエイティブのAI自動検品プラットフォーム

## 概要

Ad Checkは、広告制作物（台本・絵コンテ・音声・動画）をAIが自動でチェックし、薬機法・景表法・入稿規定・ブランドガイドラインへの違反を検出するSaaSプロダクトです。

## セットアップ手順

### 前提条件
- Node.js 18以上
- npm または bun
- Git

### 1. リポジトリをクローン
git clone https://github.com/daikiide-offbeat/checkgo-ai.git
cd checkgo-ai

### 2. 依存パッケージをインストール
npm install

### 3. 環境変数を設定
.env ファイルをプロジェクトルートに作成:

VITE_SUPABASE_URL=https://itdwxycecvdamarubpww.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=（Supabase anon keyをチームリーダーに確認）
VITE_SUPABASE_PROJECT_ID=itdwxycecvdamarubpww

⚠️ .env はGitにコミットしない（.gitignore に含まれている）。
anon keyは井手さんまたはチームリーダーに確認してください。

### 4. 開発サーバーを起動
npm run dev
→ http://localhost:8080/ で開きます

### 5. ログイン
| メールアドレス | 初期パスワード | ロール |
|--------------|--------------|--------|
| daiki.ide@offbeat-inc.co.jp | （管理者に確認） | manager |
| その他メンバー | TestCursor2026! | operator |

初回ログイン後、必ずパスワードを変更してください。

## 開発フロー

### ブランチ運用
# 作業ブランチを作成
git checkout -b feature/機能名

# 作業後、コミット
git add .
git commit -m "〇〇機能を追加"

# pushしてPR作成
git push origin feature/機能名

→ GitHubでPull Requestを作成 → レビュー後にmainへマージ

### Cursorでの開発
1. Cursorでプロジェクトフォルダを開く
2. .cursorrules が自動で読み込まれ、AIがプロジェクト構成を理解する
3. Cmd + L（Chat）で改修内容を指示

Cursorへの指示例:

新しいページを追加したい場合:
「/settings にチェックルールの一括インポート機能を追加してください。
CSVファイルをアップロードして、check_rulesテーブルに挿入する機能です。」

バグ修正したい場合:
「ProjectPage.tsx でチェック実行ボタンを押してもn8n Webhookが呼ばれません。
src/lib/webhook.ts のURLとリクエスト形式を確認して修正してください。」

## 主要コマンド

| コマンド | 説明 |
|---------|------|
| npm run dev | 開発サーバー起動（http://localhost:8080） |
| npm run build | プロダクションビルド |
| npm run preview | ビルド済みファイルのプレビュー |
| npm run lint | ESLintチェック |
| npm test | テスト実行 |

## システム構成

[ユーザー（ブラウザ）]
    │
    ▼
[フロントエンド: Vite + React + TypeScript]
    │                          │
    ▼                          ▼
[Supabase]                [n8n Cloud（Webhook）]
 ├─ PostgreSQL（DB）          │
 ├─ Auth（認証）              ▼
 ├─ Storage（ファイル）    [Gemini API]
 └─ Edge Functions         [Claude API]

## 外部サービスのアクセス先

| サービス | URL | 用途 |
|---------|-----|------|
| Supabase Dashboard | https://supabase.com/dashboard/project/itdwxycecvdamarubpww | DB管理・Storage・Edge Functions |
| n8n Cloud | （チームリーダーに確認） | AIチェックワークフローの管理 |
| GitHub | https://github.com/daikiide-offbeat/checkgo-ai | ソースコード管理 |

## トラブルシューティング

### npm run dev でエラーが出る
# node_modulesを削除して再インストール
rm -rf node_modules package-lock.json
npm install
npm run dev

### ログインできない
- .env のSupabase URLとanon keyが正しいか確認
- Supabaseダッシュボードでユーザーが auth.users に存在するか確認
- パスワードが正しいか確認（初期: TestCursor2026!）

### AIチェックが実行されない
1. ブラウザのDevTools（F12）→ Networkタブで Webhook のリクエストを確認
2. n8n Cloudのワークフロー実行履歴を確認
3. src/lib/webhook.ts のURLが正しいか確認
4. n8nのWebhookノードのCORS設定を確認

### 動画チェックがタイムアウトする
動画チェックはGemini File APIへのアップロード後、PROCESSING → ACTIVE のステータス変化を待つ必要があります。
大きなファイル（100MB超）は処理に数分かかる場合があります。
src/hooks/useVideoCheckPolling.ts のポーリング間隔・タイムアウト値を確認してください。

## 関連ドキュメント
- HANDOVER.md — システム全体像と引き継ぎ情報
- .cursorrules — Cursor AI向け指示書
