# 絶起絶帰ヘルパー iOS版

Swift 6 / SwiftUI / AlarmKit、iOS 26以降向け。Web版を参考にしたネイティブアプリです。ユーザーのSwift版着手指示により、この `ios/` 配下のみHTML/CSS/JS制約の例外です。サーバー・外部パッケージは使いません。

## Web版から反映したもの

- 濃紺・方眼背景・オレンジの操作ボタン。目覚まし／終電をタブで切り替え、目覚ましを初期表示。
- 未セット時に設定を直接表示。セット中は時刻・ジャンルの編集を止め、解除すると再編集可能。
- 1回だけ／毎日／曜日ごとの予約。曜日別の時刻とオフを指定でき、次回日時と残り時間を表示。
- 文字・記号／数学／物理／プログラミングの複数選択、3段階の難易度、同じ問題型の連続回避。
- Webと同じ `js/problems.js` をビルド時に同梱。JavaScriptCoreで純粋な問題生成のみを実行し、SwiftUIで描画する。通信やCDNは不要。19種類の問題を共有する。
- 積分の上下限、組合せの添字、行列の整列を専用表示にし、長い数式・コードは横スクロールで保持。
- 5分正解できなければ難易度を1段階下げ、ログに記録。正解後の成功表示と起床ログ。
- 終電は出発→到着の入力順、駅名候補、ODPT終電検索、乗り換え経路、発車までのカウントダウン。検索結果を見て通知をセットし、「帰る／帰らない」は人が選ぶ。

## iOS側の予約と保存

繰り返しはAlarmKitの `relative` / `weekly` を使い、毎日なら1件、曜日別なら有効な曜日ごとに1件をOSへ予約します。正解時は `stop` で今回の鳴動を停止し、繰り返し予約は残します。「目覚ましを解除」は全予約を `cancel` します。単発・10秒デモは繰り返しません。

複数曜日のセットが途中で失敗した場合は作成済みの予約を取り消します。取り消せなかった予約はIDを保持して再解除可能にします。OSの予約一覧・更新をアプリへ反映します。OS側で止めたことだけでは起床成功ログを追加しません。

設定・予約ID・ログはUserDefaultsの `zekki-native-v1` に保存します。旧版の単発予約・ジャンル・ログは読み継ぎます。Web版のlocalStorageとは別で、端末間の同期はありません。

## 起床確認（任意）

「起床確認あり」を有効にしてセットすると、次回の起床時刻に加えて2分後・5分後をAlarmKitへ事前予約します。追加は2回までで、自動で無限に予約しません。既存の利用者は初期状態でオフです。予約済みの場合は一度解除してから有効にします。10秒デモでも追加時刻は最初の鳴動の2分後・5分後です。

アラームの「問題を解く」ボタンからアプリを開けます。正解すると、その回の残りの確認アラームを取り消して成功ログを残します。「今日は中止」も残りを取り消しますが成功ログは追加せず、毎日・曜日別の通常予約は維持します。「目覚ましを解除」は通常予約と追加予約をすべて取り消します。取り消しに失敗したIDは保持し、失敗を表示します。

問題・入力途中の答え・試行回数・開始時刻・難易度低下をUserDefaultsに保存します。再起動時も同じ問題を再開し、5分経過の判定にアプリを閉じていた時間を含めます。OS側で音を止めても、起床確認が未完了ならアプリを開いたときに問題を出します。

追加予約は各通常予約の次回分だけです。正解・中止・アプリ再開時に次回分へ更新します。問題を解かず何日もアプリを開かない場合、通常の繰り返し予約は続きますが、追加2回は補充されません。UIに予約対象の起床日時を表示します。これはスヌーズではなく、利用者が事前に選ぶ起床確認です。

強制終了・ロック中のOS鳴動、ロック解除から問題への導線は実機未確認です。AlarmKitの停止操作や権限取り消しを禁止するものではありません。

## 終電検索とAPIキー

Web版の `js/odpt.js` を同梱し、経路探索をJavaScriptCore、HTTPS通信をURLSessionで実行します。首都圏の提供されている列車時刻表を使い、乗り換えは2回までです。端末のタイムゾーンによらず日本時間の運行日で検索します。運休・遅延の情報は反映しません。祝日一覧と対応路線の制限はWeb版と共通です。

ビルド時に `ios/Scripts/copy-odpt-config.sh` が、Git対象外の `js/config.js` をアプリ内の `odpt-config.js` へコピーします。通常キーは `ODPT_ACCESS_TOKEN`、チャレンジキーは `ODPT_CHALLENGE_ACCESS_TOKEN` を設定してください。キーの変更後は再ビルド・再インストールが必要です。未設定の場合は公開データの都営線のみを検索します。ビルド済みアプリにはキーが含まれるため、その配布時はキーの利用範囲も確認してください。ソースやログへキーを書き出す処理はありません。

検索結果は経路・取得日時とともにUserDefaultsへ保存します。明示的な再検索では時刻表を再取得し、入力変更や検索失敗後に古い結果から予約することはできません。通知予定時刻を過ぎた結果は予約しません。公式時刻表で確認した日時を使う手入力も残しています。

## 開発・確認

`ZekkiHelper.xcodeproj` を開き、ZekkiHelper schemeを選びます。実機に入れるときはSigning & CapabilitiesのTeamを自身のものに設定してください。

プロジェクト再生成が必要な場合だけ、リポジトリ直下で:

```sh
xcodegen generate --spec ios/project.yml
```

署名なしビルド:

```sh
xcodebuild -project ios/ZekkiHelper.xcodeproj -scheme ZekkiHelper -sdk iphoneos -destination 'generic/platform=iOS' -derivedDataPath /tmp/zekki-native-build CODE_SIGNING_ALLOWED=NO build
```

リポジトリ直下からモデル・問題生成を検証:

```sh
swiftc -swift-version 6 ios/ZekkiHelper/Models.swift ios/ZekkiHelper/ProblemGenerator.swift ios/Tests/CoreChecks.swift -o /tmp/zekki-core-checks
/tmp/zekki-core-checks
swiftc -swift-version 6 ios/ZekkiHelper/Models.swift ios/ZekkiHelper/ProblemGenerator.swift ios/ZekkiHelper/TrainSearch.swift ios/ZekkiHelper/AlarmScheduling.swift ios/ZekkiHelper/AppModel.swift ios/Tests/LifecycleChecks.swift -o /tmp/zekki-lifecycle-checks
/tmp/zekki-lifecycle-checks
swiftc -swift-version 6 ios/ZekkiHelper/Models.swift ios/ZekkiHelper/TrainSearch.swift ios/Tests/TrainSearchChecks.swift -o /tmp/zekki-train-checks
TZ=America/Los_Angeles /tmp/zekki-train-checks
# 任意: js/config.js のキーで実APIを検証（通信あり）
/tmp/zekki-train-checks --live
```

LifecycleChecksはAlarmKitを偽物に置き換えて実際のAppModelを検証します。OSの許可や鳴動を検証するものではありません。

## 今回の検証結果と残る範囲

- 2026-09-20: iPhoneOS向け署名付きビルド、接続中のiPhone 16へのインストール・起動を確認。iOS Simulator向けビルドも成功。
- CoreChecks: 1,800問・19種類、連続回避、構造化数式、曜日/休日/年越し計算、旧形式と現形式の保存を確認。
- LifecycleChecks: 毎日/曜日/単発/デモ、再起動復元、不正解/正解、停止・解除の失敗、予約途中失敗の復旧、OS側停止、旧予約移行を確認。
- 画面操作ツールがSimulatorを認識できなかったため、検索画面の操作・見た目と実機の鳴動は未確認。
- TrainSearchChecks: 通常/チャレンジ接続先、駅名正規化、最大2回の乗り換え・3回の除外・経路保存、日本時間の深夜・休日、出発済み/経路なし、件数上限、通信復旧、再検索、保存、キーなし公開データを確認。LifecycleChecksで検索と予約の分離、予約日時、復元、駅名変更・検索失敗時の結果無効化、通知時刻超過を確認。
- ODPT検索はMac上のネイティブ通信ブリッジで検証済み（新宿→調布、新宿→三鷹、調布→国領、国領→明大前→渋谷→外苑前の2回乗り換え）。APIのHTTP成功は端末の鳴動確認とは別です。却下済みAPIは使いません。
- 音はOS標準アラーム音。Webの4種類の音・段階音量・音量上限は未移植。音量はiPhone本体で調整する。
- OSの停止ボタンは禁止できない。「正解しないとOS側でも絶対止められない」とは保証しない。
- 所要秒数と5分の判定は最初に問題を開いた時刻から計測し、問題セッションの復元後も継続します。
- 専用アプリアイコン、Live Activity拡張、App Store配信設定は未実装。

## 実機QA

1. 起床確認をオンにし10秒デモを予約→ロック→OS鳴動→「問題を解く」→不正解→正解→停止とログ、追加2回の取り消しを確認。
   - OSで最初の音だけ止めてアプリを強制終了し、最初の鳴動から2分後・5分後にも鳴るか確認。
   - 問題の途中で終了→再起動し、問題・入力・回数を復元できるか確認。「今日は中止」で残りが取り消され、成功ログが付かないことを確認。
2. 毎日・曜日別の異なる時刻を予約。正解後/OS側停止後の翌回予約、全解除、再編集を確認。
3. 土日オフ、日曜→月曜、タイムゾーン変更、端末再起動後の予約と次回表示を確認。
4. 積分・行列・長い数式、文字列問題を小さい画面/大きい文字/VoiceOverで確認。
5. アプリを開いたまま5分経過→難易度低下→正解→ログを確認。
6. 終電を検索→経路確認→通知予約→帰る／帰らないを確認。手入力、目覚ましとの同時鳴動、権限拒否・取り消しも確認。

参考: https://developer.apple.com/documentation/alarmkit/scheduling-an-alarm-with-alarmkit
