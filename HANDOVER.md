HANDOVER.md
# CheckGo AI — 引き継ぎドキュメント

最終更新: 2026年3月13日

## 1. プロダクト概要

### CheckGo AIとは
広告クリエイティブの制作過程で発生する「検品」作業をAIで自動化するプロダクト。
台本→SF（絵コンテ）→音声→動画の各工程で、チェックルールに基づいた自動検品を実行し、修正指示を生成する。

### 解決する課題
- 広告制作における修正発生率の高さ（業界平均60%以上）
- 人手によるチェックの見落とし・属人化
- チェック工数の削減

### 主要機能
| 機能 | 説明 |
|------|------|
| AIチェック（4工程） | 台本・SF・音声・動画をAIが自動検品 |
| チェックルール管理 | クライアント×商材×工程ごとにルールを設定 |
| 参考資料からの自動ルール生成 | ガイドライン等をアップロード→AIがルール候補を生成 |
| ファイルレビュー | チェック結果の確認・コメント・アノテーション |
| 外部共有 | クライアントへのパスワード付き共有リンク |
| レポート | チェック実績の集計・可視化 |

## 2. システムアーキテクチャ

### 全体構成
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

### データフロー（AIチェック実行時）
1. ユーザーがファイルをアップロード
   → Supabase Storage に保存
   → check_files テーブルにレコード作成

2. 「チェック実行」ボタンを押す
   → フロントエンドが n8n Webhook に POST
   → リクエストボディ: file_id, project_id, process_type, file_url, rules[]

3. n8n ワークフローが実行
   → 動画の場合: Gemini File API にアップロード → ACTIVE まで待機
   → Gemini 2.5 Pro/Flash にルール + ファイルを送信
   → チェック結果（JSON）を生成

4. n8n が Supabase に結果を書き込み
   → check_results テーブルに保存

5. フロントエンドがポーリングで結果を取得
   → useCheckProgress / useVideoCheckPolling フック
   → FileReviewPage に結果を表示

## 3. Supabase 詳細

### プロジェクト情報
- Project ID: itdwxycecvdamarubpww
- URL: https://itdwxycecvdamarubpww.supabase.co
- Dashboard: https://supabase.com/dashboard/project/itdwxycecvdamarubpww

### 主要テーブル
| テーブル | 用途 |
|---------|------|
| organizations | 組織 |
| clients | クライアント |
| products | 商材 |
| projects | プロジェクト |
| project_processes | プロジェクト内の工程（script/storyboard/audio/video） |
| check_files | アップロードファイル |
| check_rules | チェックルール（クライアント×商材×工程ごと） |
| check_results | AIチェック結果 |
| check_result_items | チェック結果の個別指摘事項 |
| rule_candidates | AI自動生成されたルール候補 |
| reference_materials | 参考資料（ガイドライン等） |
| correction_patterns | 修正パターン（過去の修正履歴から学習） |
| share_links | 外部共有リンク |
| shared_comments | 共有ビュー上のコメント |
| profiles | ユーザープロフィール |
| notifications | 通知 |

### Storage バケット
| バケット名 | 用途 | 備考 |
|-----------|------|------|
| check-files | チェック対象ファイル | |
| videos | 動画ファイル | 上限500MB |
| reference-materials | 参考資料 | |

### Edge Functions（5つ）
| 関数名 | 用途 | 呼び出し元 |
|--------|------|-----------|
| create-share-link | 共有リンク生成 | ProjectPage |
| extract-text | ファイルからテキスト抽出 | アップロード時 |
| fetch-external-rules | 外部ルール取得 | SettingsPage |
| shared-comments | 共有コメント操作 | SharedViewPage |
| verify-share-password | 共有パスワード検証 | SharedViewPage |

### Edge Functions のデプロイ方法
# Supabase CLIが必要
npm install -g supabase

# ログイン
supabase login

# 各Edge Functionをデプロイ
supabase functions deploy create-share-link --project-ref itdwxycecvdamarubpww
supabase functions deploy extract-text --project-ref itdwxycecvdamarubpww
supabase functions deploy fetch-external-rules --project-ref itdwxycecvdamarubpww
supabase functions deploy shared-comments --project-ref itdwxycecvdamarubpww
supabase functions deploy verify-share-password --project-ref itdwxycecvdamarubpww

## 4. n8n ワークフロー詳細

### ワークフロー一覧
| ワークフロー名 | 種別 | トリガー | AI API | 説明 |
|--------------|------|---------|--------|------|
| check-script-v2 | チェック | Webhook POST | Gemini 2.5 Flash | 台本テキストのルールベースチェック |
| check-sf-v2 | チェック | Webhook POST | Gemini 2.5 Pro | 画像（SF/絵コンテ）のビジュアルチェック |
| check-audio-v2 | チェック | Webhook POST | Gemini 2.5 Flash | 音声ファイルの内容チェック |
| check-video-v2 | チェック | Webhook POST | Gemini 2.5 Pro | 動画のフレーム分析チェック |
| parse-reference | ルール生成 | Webhook POST | Gemini 2.5 Pro | 参考資料からチェックルール候補を自動生成 |

### n8n側の注意事項

CORS設定（必須）:
各WebhookノードとRespond to Webhookノードに以下を設定
- Webhook Options → Allowed Origins: *
- Respond to Webhook → Header: Access-Control-Allow-Origin: *

動画チェック（check-video-v2）の特殊処理:
1. Gemini File API に動画をアップロード（Resumable Upload）
2. ステータスが PROCESSING → ACTIVE になるまでポーリング（Wait + Loop）
3. ACTIVE になったらAI分析を実行
4. 大きなファイルは処理に数分かかる

n8n Code ノードの制限:
- fetch() が使えない → HTTP Request ノードを使用する
- 外部ライブラリのインポート不可

## 5. 認証・ロール設計

### ロール
| ロール | 説明 | 権限 |
|--------|------|------|
| manager | 管理者（井手さん等） | 全機能アクセス、設定変更、メンバー管理 |
| operator | オペレーター（チームメンバー） | チェック実行、結果確認、コメント |

### 認証フロー
- Supabase Auth（Email/Password）
- src/hooks/useAuth.tsx で管理
- ロール判定: profiles テーブルの role カラム
- 井手さんのアカウント（daiki.ide@offbeat-inc.co.jp）は常に manager として扱う

### メンバー追加方法
1. SettingsPage → メンバー管理 → 招待リンク生成
2. 新メンバーが招待リンクにアクセス → AcceptInvitePage でアカウント作成
3. profiles テーブルにレコード自動作成

## 6. 既知の課題・残タスク

### 動画チェックのポーリング安定性
- Gemini File APIのステータスポーリングが固定Wait（60秒）の箇所あり
- 大容量ファイルでタイムアウトする可能性
- useVideoCheckPolling.ts の改善が必要

### Lovable依存の除去
- src/integrations/lovable/ がまだ残っている
- .lovable/ ディレクトリも残っている
- 動作に影響はないが、クリーンアップ推奨

### Edge Functions の本番デプロイ
- 5つのEdge Functionsをデプロイする必要あり（上記の手順参照）

### Vercel デプロイ（任意）
- 現在はローカル開発のみ
- 本番公開する場合は Vercel にデプロイ
- 環境変数を Vercel の Settings → Environment Variables に設定

## 7. 運用・メンテナンス

### 日常運用
| 作業 | 頻度 | 担当 |
|------|------|------|
| n8n ワークフロー実行履歴の確認 | 週1回 | オペレーター |
| Supabase Storage の容量確認 | 月1回 | 管理者 |
| チェックルールの更新・追加 | 随時 | オペレーター |
| ユーザーからのフィードバック反映 | 随時 | 管理者 |

### コスト
| サービス | 月額目安 | プラン |
|---------|---------|--------|
| Supabase | $25 | Pro |
| n8n Cloud | $24 | Starter |
| Gemini API | $10〜50 | 従量課金 |
| Claude API | $5〜20 | 従量課金 |
| Vercel（任意） | $0〜20 | Hobby or Pro |

### 緊急時の連絡先
- システム全般: 井手 大貴（daiki.ide@offbeat-inc.co.jp）
- Supabase障害: https://status.supabase.com/
- n8n障害: n8n Cloud ダッシュボードで確認

## 8. 将来的な開発ロードマップ

### AdLoop統合
CheckGo AIの CHECK 機能は、将来的に AdLoop（広告自動化AIエージェント）の一部として統合される予定。
AdLoop側に cg_ プレフィックス付きテーブルが作成済み（チェックルール1,110件移行済み）。

### 機能拡張候補
- チェック精度のフィードバックループ（指摘の的確さを評価→プロンプト改善）
- クライアント別AIスコア表示
- Slack通知連携
- API公開（外部システムからチェック実行）
