# 絶起ヘルパー iOS 初版

Swift 6 / SwiftUI / AlarmKit、iOS 26以降向け。Web版とは独立したネイティブアプリです。ユーザーのSwift版着手指示により、このios/配下だけWeb版のHTML/CSS/JS制約の例外として追加しています。サーバー・外部パッケージは使いません。

## 今ある機能

- 目覚ましと終電の2カード、カード内の設定開閉。
- UserDefaultsへの設定・予約ID・起床ログ保存（WebのlocalStorageとは別）。
- AlarmKitの権限要求、次の指定時刻と10秒後デモの予約、解除。
- OSのアラーム更新とアプリ復帰時の状態同期。
- 鳴動中にアプリを開くと問題を表示。正解後の停止と起床ログ。不正解で再出題。
- 数学の微分、物理のオームの法則、Pythonループの出力予測。難易度で値の範囲を変更。
- 終電は手動入力した発車日時の10/15/20/30分前に予約。通知時刻が過去なら予約しない。「帰る／帰らない」を人が選ぶ。

## Xcodeで開く

`ZekkiHelper.xcodeproj` を開き、ZekkiHelper schemeを選びます。実機に入れるときはSigning & CapabilitiesのTeamを自身のものに設定してください。Teamは固定していません。

プロジェクト再生成が必要な場合だけ、リポジトリ直下で `xcodegen generate --spec ios/project.yml` を実行します。生成済みプロジェクトから通常ビルドする場合はXcodeGen不要。

署名なしのコンパイル確認:

```sh
xcodebuild -project ios/ZekkiHelper.xcodeproj -scheme ZekkiHelper -sdk iphoneos -destination 'generic/platform=iOS' -derivedDataPath /tmp/zekki-native-build CODE_SIGNING_ALLOWED=NO build
```

日付・回答正規化・保存モデルの確認:

```sh
swiftc ios/ZekkiHelper/Models.swift ios/Tests/CoreChecks.swift -o /tmp/zekki-core-checks
/tmp/zekki-core-checks
```

## 未移植・未確認

- ODPTの自動探索は未移植。トークンの取得と京王線データ確認後に着手。却下済みAPIは再検討しない。
- Web版15種類すべての問題、複数ジャンル選択、音4種類、段階音量、5分後の難易度低下は未移植。OSの標準アラーム音を使用。
- OSの停止ボタンを禁止する設計にはしていない。「正解しないとOS側でも絶対止められない」とは保証しない。OSで停止しても起床成功ログは追加しない。
- ロック画面から問題へ進む導線、同時鳴動、アプリ終了・端末再起動後、権限拒否・取り消し、音・通知の実機確認が必要。
- 起床の所要秒数はアプリ内の問題を開いてから計測する。アプリ終了中の問題セッションは復元しない。
- 専用アプリアイコン、Live Activity拡張、App Store配信設定は未実装。

## 実機QAの順番

1. 権限を許可し10秒デモを予約→ロック→OSの鳴動を確認。
2. アプリに戻る→不正解→再出題→正解→停止とログを確認。
3. 再度予約してOS側で停止→アプリ復帰→成功ログが増えないことを確認。
4. 予約した状態でアプリ終了・再起動→予約の維持と表示を確認。
5. 終電の手動日時を設定→鳴動→帰る／帰らないの両方を確認。
6. 目覚ましと終電の同時刻予約、およびエラー発生時の表示・操作を確認。

参考: https://developer.apple.com/documentation/alarmkit/alarmmanager

## 今回の検証結果

Xcode 27でiPhoneOS向けの署名なしビルド成功。最終生成物にAlarmKit権限説明文が含まれることも確認済み。CoreChecksは通過。シミュレーター・iPhoneでの起動と鳴動はまだ確認していません。
