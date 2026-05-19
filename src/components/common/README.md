# 共通 UI（`src/components/common/`）

## SectionErrorBoundary

データ層（Zod parse 等）だけに頼らず、**独立して描画されるユニット**（右パネル・スクリプト・プレビュー・チェック項目 1 行）には `SectionErrorBoundary` でセクション単位の境界を入れる。

- 1 箇所のレンダー例外で画面全体を白くしない
- 壊れた箇所だけ「○○を表示できませんでした」と縮退
- App 直下の `ErrorBoundary` は最後の砦として残す（削除・置換しない）
