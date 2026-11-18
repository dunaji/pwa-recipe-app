# pwa-recipe-app 開発メモ

## 構成
- Vanilla JS (ES modules) + IndexedDB。ビルドツールなし
- `script.js`: RecipeApp クラス骨格・初期化・イベント配線
- `recipes.js` / `shopping.js` / `custom_items.js` / `history.js` / `settings.js`: `Object.assign(RecipeApp.prototype, ...)` で合成される機能モジュール
- `utils.js`: 純粋関数、`db.js`: IndexedDBラッパー
- `style.css`: 約3,600行。重複セレクタあり（後のルールが勝つ）

## ローカル確認
```
cd C:\Users\maami\pwa-recipe-app
python -m http.server 8000
# → http://localhost:8000
```
`file://` では ES modules / Service Worker が動かないので必ず http 経由。

## Service Worker (sw.js)
- アプリシェアをキャッシュする PWA 基盤。IndexedDBデータは影響なし
- **アプリのコード（html/js/css/画像）を変更してデプロイする際は必ず `CACHE_NAME` を上げること**
  （例: natsudon-v3 → natsudon-v4）。上げないとユーザーに古いキャッシュが残る
- `APP_SHELL` に新規JSファイルを追加するのを忘れないこと

## データ保護（最重要）
- IndexedDB `RecipeAppDB` v1。スキーマ変更は原則しない
- 読み込みは新旧フォーマット両対応の寛容実装、書き込みは正規形
- 大きな変更の前に設定タブのエクスポートでバックアップ推奨

## ブランチ
- `refactor/cleanup`: 基盤整理＋機能追加を進めているブランチ
