# Ad Check 引き継ぎドキュメント
更新日: 2026-03-23

## プロダクト概要

Ad Check は Off Beat株式会社が開発する広告クリエイティブAI検品ツール。AdLoop（広告自動化AIエージェント）の4プロダクトの1つ。

- タグライン: 「広告制作現場に最良・最速の「GO」を。」
- ブランドカラー: Sky Blue (#0EA5E9) + Periwinkle (#7C7AFF)
- ロゴ: 「∞ Ad Check」グラデーション（linear-gradient(135deg, #0EA5E9, #7C7AFF)）

---

## 技術スタック

| レイヤー | 技術 |
|---------|------|
| フロントエンド | Vite + React + TypeScript + Tailwind CSS + shadcn/ui |
| DB & Auth | Supabase（外部プロジェクト） |
| Storage | Supabase Storage（外部プロジェクト） |
| ワークフロー | n8n Cloud |
| AI | Gemini 2.5 Pro（動画/SF）+ Claude API（スクリプト） |
| ホスティング | Vercel |
| ソース管理 | GitHub |

---

## 接続情報

### GitHub
- リポジトリ: https://github.com/offbeat-product/ad-check
- ブランチ: main

### Vercel
- URL: https://ad-check-phi.vercel.app
- 自動デプロイ: main ブランチへの push で自動実行
- 環境変数（3つ設定済み）:
  - `VITE_SUPABASE_PROJECT_ID` = `vhvgnslszruyztcoikqq`
  - `VITE_SUPABASE_URL` = `https://vhvgnslszruyztcoikqq.supabase.co`
  - `VITE_SUPABASE_PUBLISHABLE_KEY` = （anon key）

### Supabase（外部DB — 全AdLoopプロダクト共有）
- プロジェクト名: Ad Check
- Project ID: `vhvgnslszruyztcoikqq`
- URL: `https://vhvgnslszruyztcoikqq.supabase.co`
- ダッシュボード: https://supabase.com/dashboard/project/vhvgnslszruyztcoikqq
- Storage バケット: videos（Public, 5GB）, deliverables（Public）, reference-files, audios（Public）, comment-attachments
- Storage グローバル上限: 5GB（Proプラン）

### n8n Cloud
- URL: https://offbeat-inc.app.n8n.cloud

---

## DBテーブル構成（主要テーブル）

### Ad Check 固有
- `check_rules` — チェックルール（9工程分）
- `check_results` — チェック結果
- `check_result_items` — チェック結果明細
- `project_files` — プロジェクトファイル（file_dataに外部DB StorageのURL）
- `project_processes` — プロジェクト工程
- `correction_patterns` — 修正パターン（columns: rule_title, original_content, corrected_content, category, frequency）
- `correction_logs` — 修正ログ
- `rule_candidates` — ルール候補
- `comments` — コメント
- `share_links` — 共有リンク

### 共通テーブル（AdLoop全プロダクト共有）
- `clients` — クライアント
- `products` — 商材
- `projects` — プロジェクト/案件
- `patterns` — パターン
- `profiles` — ユーザープロフィール
- `organizations` — 組織
- `workspace_members` — ワークスペースメンバー
- `reference_materials` — 参考資料（6種: orientation, brand_guideline, correction_history, media_regulation, legal_rule, wcheck）
- `notifications` — 通知

### Ad Gen 固有（同じDB内）
- `gen_jobs` — 生成ジョブ
- `gen_steps` — 生成ステップ（step_key: appeal_axis/copy/composition/narration_script）
- `gen_patterns` — 生成パターン

---

## n8n ワークフロー一覧

### Ad Check 系（全て外部DB接続済み）
| WF名 | Webhook Path | 用途 |
|------|-------------|------|
| check-script-v2 | /webhook/check-script-v2 | 構成/字コンテチェック |
| check-sf-v2 | /webhook/check-sf-v2 | SF/絵コンテチェック |
| check-audio-v2 | /webhook/check-audio-v2 | ナレーション・BGMチェック |
| check-video-v2 | /webhook/check-video-v2 | 動画チェック |
| rules-list | /webhook/rules-list | ルール管理API |
| parse-reference | /webhook/parse-reference | 参考資料→ルール自動生成 |

### Ad Gen 系（外部DB接続済み）
| WF名 | 用途 |
|------|------|
| WF1 | 訴求軸生成 |
| WF2 | コピー生成 |
| WF3 | 構成案生成 |
| WF4 | NA原稿生成 |
| WF5 | ナレーション音声生成（ElevenLabs TTS） |

### n8n技術メモ
- Code ノードでは `fetch()` が使えない → HTTP Request ノードを使う
- Supabase Update ノードは Must Match: **All** にする（Anyだと全行更新される）
- result カラムは JSON → `{{ JSON.stringify($json.result) }}`（fx モード ON）
- reference_materials の取得は **5件** に制限（content_textが大きく502エラーになる）
- HTTP Request で Supabase REST API を叩く場合:
  - URL: `https://vhvgnslszruyztcoikqq.supabase.co/rest/v1/{テーブル名}`
  - Header: `apikey` + `Authorization: Bearer` に anon key

---

## ローカル開発環境

### セットアップ
```bash
cd ~/Documents/ad-check
npm install
npm run dev
# → http://localhost:8080/
```

### 環境変数（.env）
```
VITE_SUPABASE_PROJECT_ID="vhvgnslszruyztcoikqq"
VITE_SUPABASE_URL="https://vhvgnslszruyztcoikqq.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="（anon key）"
```

### 開発→デプロイフロー
```bash
# 1. Cursorで修正
# 2. ローカルで動作確認（npm run dev）
# 3. コミット＆プッシュ（Vercelが自動デプロイ）
git add -A
git commit -m "変更内容の説明"
git push origin main
# 4. 1〜2分後に https://ad-check-phi.vercel.app に反映
```

### Cursorでの開発
- `.cursorrules` が自動で読み込まれ、AIがプロジェクト構成を理解する
- `Cmd + L`（Chat）で改修内容を指示
- 変更提案が出たら「Accept」で反映

### Cursorへの指示例
```
# 新機能追加
「/settings にチェックルールの一括インポート機能を追加してください。
CSVファイルをアップロードして、check_rulesテーブルに挿入する機能です。」

# バグ修正
「ProjectPage.tsx でチェック実行ボタンを押してもn8n Webhookが呼ばれません。
src/lib/webhook.ts のURLとリクエスト形式を確認して修正してください。」

# UI変更
「ダッシュボードのサイドバーに『ルール候補』メニューを追加してください。
/rule-candidates にルーティングして、rule_candidatesテーブルの一覧を表示します。」
```

---

## 認証情報

### ログインアカウント
- URL: https://ad-check-phi.vercel.app
- 初期パスワード: `TestCursor2026!`
- パスワード変更: ログイン後 → 左サイドバー「設定」→ パスワード変更

### Supabase Auth 設定
- Site URL: `https://ad-check-phi.vercel.app`
- Redirect URLs（許可済み）:
  - `https://ad-check-phi.vercel.app/**`
  - `http://localhost:8080/**`
  - `https://ad-brain.lovable.app/**`
  - `https://ad-gen-creative.lovable.app/**`
  - `https://preview--ad-brain.lovable.app/**`
  - `https://preview--ad-gen-creative.lovable.app/**`

---

## システム構成図

```
[ユーザー]
    ↓
[Vercel: ad-check-phi.vercel.app]
    ↓
[外部Supabase: vhvgnslszruyztcoikqq]
    DB（PostgreSQL）+ Auth + Storage
    ↑
[n8n Cloud: offbeat-inc.app.n8n.cloud]
    check-script-v2 / check-sf-v2 / check-audio-v2 / check-video-v2
    rules-list / parse-reference
    ↓
[AI API]
    Gemini 2.5 Pro（動画/SF） + Claude API（スクリプト）
```

---

## AdLoop 全体のDB設計ルール

- 全4プロダクト（Ad Brain / Ad Gen / Ad Check / Ad Ops）が同じ Supabase インスタンス（vhvgnslszruyztcoikqq）を共有
- 新テーブルは統一命名規則に従う
- RLSポリシー変更はクロスプロダクト影響に注意
- ファイルは Supabase Storage に保存し、公開URLを project_files.file_data に格納
- Lovable内部DB（itdwxycecvdamarubpww）は使用しない（完全廃止）

---

## 主要コマンド一覧

| コマンド | 説明 |
|---------|------|
| `npm run dev` | 開発サーバー起動（http://localhost:8080） |
| `npm run build` | プロダクションビルド |
| `npm run preview` | ビルド済みファイルのプレビュー |
| `npm run lint` | ESLintチェック |
| `git add -A && git commit -m "msg" && git push origin main` | デプロイ（Vercel自動） |

---

## トラブルシューティング

### npm run dev でエラー
```bash
rm -rf node_modules package-lock.json
npm install
npm run dev
```

### ログインできない
- `.env` の Supabase URL と anon key が正しいか確認
- Supabase ダッシュボード → Authentication → Users でユーザーが存在するか確認

### AIチェックが実行されない
1. ブラウザ DevTools（F12）→ Network タブで Webhook リクエストを確認
2. n8n Cloud のワークフロー実行履歴を確認
3. n8n の HTTP Request ノードの URL が `vhvgnslszruyztcoikqq` を指しているか確認

### Vercelデプロイが Blocked になる
- Git の committer email が GitHub アカウントと一致していない
- `git config --global user.email "GitHubに登録したメール"` で設定
- `git commit --amend --reset-author --no-edit && git push origin main --force`

### 404 NOT_FOUND（Vercel）
- `vercel.json` がプロジェクトルートに存在するか確認
- 中身: `{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }`

---

## 井手さんの作業スタイル（Claudeへの補足）

- ステップバイステップのガイドを好む（設計書より実行重視）
- Claudeが勝手に作業を止めたり複数選択肢を出すのは避ける
- 技術的な判断の理由を説明する
- 初稿合格率 =「初稿合格率」（「初稿承認率」ではない）
- Cursorでは日本語の自然言語プロンプトを使用
