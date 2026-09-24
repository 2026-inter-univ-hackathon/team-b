# Zekki ヘルパー iOS版

Swift 6 / SwiftUI / AlarmKit、iOS 26以降向け。Web版を参考にしたネイティブアプリです。ユーザーのSwift版着手指示により、この `ios/` 配下のみHTML/CSS/JS制約の例外です。サーバー・外部パッケージは使いません。

## Web版から反映したもの

- 濃紺・方眼背景・オレンジの操作ボタン。目覚まし／終電をタブで切り替え、目覚ましを初期表示。
- 未セット時に設定を直接表示。セット中は時刻・ジャンルの編集を止め、解除すると再編集可能。
- 1回だけ／毎日／曜日ごとの予約。曜日別の時刻とオフを指定でき、次回日時と残り時間を表示。
- 文字・記号／数学／物理／プログラミングの複数選択、3段階の難易度、同じ問題型の連続回避。
- Webと同じ `js/problems.js` をビルド時に同梱。JavaScriptCoreで純粋な問題生成のみを実行し、SwiftUIで描画する。通信やCDNは不要。19種類の問題を共有する。
- 積分の上下限、組合せの添字、行列の整列を専用表示にし、長い数式・コードは横スクロールで保持。
- 5分正解できなければ難易度を1段階下げ、ログに記録。正解後の成功表示と起床ログ。
- 終電は出発→到着の入力順、駅名の即時反映、発車までのカウントダウン。「帰る／帰らない」は人が選ぶ。

## iOS側の予約と保存

繰り返しはAlarmKitの `relative` / `weekly` を使い、毎日なら1件、曜日別なら有効な曜日ごとに1件をOSへ予約します。正解時は `stop` で今回の鳴動を停止し、繰り返し予約は残します。「目覚ましを解除」は全予約を `cancel` します。単発・10秒デモは繰り返しません。

複数曜日のセットが途中で失敗した場合は作成済みの予約を取り消します。取り消せなかった予約はIDを保持して再解除可能にします。OSの予約一覧・更新をアプリへ反映します。OS側で止めたことだけでは起床成功ログを追加しません。

設定・予約ID・ログはUserDefaultsの `zekki-native-v1` に保存します。旧版の単発予約・ジャンル・ログは読み継ぎます。Web版のlocalStorageとは別で、端末間の同期はありません。

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
swiftc -swift-version 6 ios/ZekkiHelper/Models.swift ios/ZekkiHelper/ProblemGenerator.swift ios/ZekkiHelper/AlarmScheduling.swift ios/ZekkiHelper/AppModel.swift ios/Tests/LifecycleChecks.swift -o /tmp/zekki-lifecycle-checks
/tmp/zekki-lifecycle-checks
```

LifecycleChecksはAlarmKitを偽物に置き換えて実際のAppModelを検証します。OSの許可や鳴動を検証するものではありません。

## 今回の検証結果と残る範囲

- iPhoneOS・iOS Simulator向け署名なしビルドを確認。
- CoreChecks: 1,800問・19種類、連続回避、構造化数式、曜日/休日/年越し計算、旧形式と現形式の保存を確認。
- LifecycleChecks: 毎日/曜日/単発/デモ、再起動復元、不正解/正解、停止・解除の失敗、予約途中失敗の復旧、OS側停止、旧予約移行を確認。
- 画面操作ツールの起動失敗により、シミュレーターの画面操作・見た目と実機の鳴動は未確認。
- 終電のODPT自動探索は未移植。公式時刻表で確認した発車日時を手動入力する。却下済みAPIは再検討しない。
- 音はOS標準アラーム音。Webの4種類の音・段階音量・音量上限は未移植。音量はiPhone本体で調整する。
- OSの停止ボタンは禁止できない。「正解しないとOS側でも絶対止められない」とは保証しない。
- 所要秒数と5分の判定はアプリで問題を開いてから計測する。アプリ終了中の問題セッションは復元しない。
- 専用アプリアイコン、Live Activity拡張、App Store配信設定は未実装。

## 実機QA

1. 権限を許可し10秒デモを予約→ロック→OS鳴動→アプリで不正解→正解→停止とログを確認。
2. 毎日・曜日別の異なる時刻を予約。正解後/OS側停止後の翌回予約、全解除、再編集を確認。
3. 土日オフ、日曜→月曜、タイムゾーン変更、端末再起動後の予約と次回表示を確認。
4. 積分・行列・長い数式、文字列問題を小さい画面/大きい文字/VoiceOverで確認。
5. アプリを開いたまま5分経過→難易度低下→正解→ログを確認。
6. 終電の手動日時を予約し、帰る／帰らない、目覚ましとの同時鳴動、権限拒否・取り消しを確認。

参考: https://developer.apple.com/documentation/alarmkit/scheduling-an-alarm-with-alarmkit
