# PWAの実装と確認手順

## 実装済み

- `manifest.webmanifest`: standalone表示、相対URLの起動先・スコープ、192/512pxアイコン、maskableアイコン。
- `icons/`: 時計のアイコン。iPhone用180pxアイコンも用意。
- `js/pwa.js`: HTTPSまたは安全なlocalhostでService Workerを登録。file://と通常のHTTPでは登録せず、従来の目覚ましとして動く。
- 対応ブラウザでは「アプリとして使う」内にインストールボタンを表示。iPhoneは共有メニューから「ホーム画面に追加」。
- `sw.js`: HTML/CSS/JS/アイコンのみをバージョン付きキャッシュに保存。初回のオンライン準備完了後はオフラインで再起動できる設計。
- config.jsはネットワークのみ・no-store。ODPT通信と任意のURLはキャッシュしない。オフライン時の終電再検索は案内を表示し、保存済み結果には検索日時を表示。
- 更新は全アセットの取得成功後に待機。旧版を開いている画面がすべて閉じられるまで適用しない。skipWaiting、clients.claim、自動リロードは使わない。

## 起動と配信

通常利用は引き続きindex.htmlを直接開ける。PWAのインストールにはHTTPSの静的配信が必要（開発時はlocalhostでも可）。バックエンドやビルドツールは不要。公開先の選定・デプロイは未実施。

ローカルでPWAを検証するときだけ、プロジェクト直下で以下を実行する。

```sh
python3 -m http.server 8080 --bind 127.0.0.1
```

ブラウザで http://localhost:8080/index.html を開く。終了はCtrl+C。このサーバーは開発確認専用であり、通常のfile://利用には不要。スマホでインストールを試す場合はHTTPS配信先を使う。

file://とHTTPSは保存先が異なるため、既存localStorage設定は自動で引き継がれない。config.jsを公開配信するとブラウザから読めるので、トークンの利用条件を確認し、公開配信物に含めるか別途決める。

## 更新時

公開アセットを変更するときはsw.jsのVERSIONを上げる。スクリプトとHTMLが異なる版で混在しないようキャッシュ優先。古いアプリ用キャッシュは、新版の有効化時に同一スコープ分だけ削除する。localStorageは削除しない。

## 検証結果と残り

`node tests/pwa.cjs`でManifest/PNG寸法、キャッシュ対象、サブディレクトリ配信、オフライン応答、外部通信・config除外、インストール失敗、登録条件、更新待機表示、追加ボタン、接続状態の案内を模擬環境で確認済み。

9/11: MacのChromeでlocalhost:8080からインストールし、専用ウィンドウでの起動を確認。確認用サーバー停止後の通常再読み込みでも、ホーム画面と設定項目が表示されることを確認した（Wi-Fi切断試験ではなく、配信元停止試験）。スマホ・音・更新の実機試験は未実施。以下を引き続き確認する。

- Chromeで初回準備完了→インストール→オフライン再起動→目覚ましデモ。
- iPhoneのホーム画面追加→単独ウィンドウ起動→音の有効化。
- 新版を配信しても監視中の画面が再読み込みされない。全画面を閉じて開き直すと新版になる。
- 終電のオフライン検索案内と保存済み検索日時。
- file://で通常起動し、目覚ましをセット・解除できる。

## 通知の境界

PWA化だけでは画面を閉じた後の定刻アラームを保証できない。Service Workerは常駐タイマーではなく、ブラウザに停止され得る。アラームは画面を開いた状態で使う。画面ロック中・バックグラウンド動作は実機で別途確認する。

参考:
- https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable
- https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers
- https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Offline_and_background_operation
