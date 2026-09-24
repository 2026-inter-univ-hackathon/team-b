import AppIntents
import Foundation

struct OpenWakeIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "問題を解く"
    static let openAppWhenRun: Bool = true
    @Parameter(title: "アラームID") var alarmID: String
    init() {}
    init(alarmID: String) { self.alarmID = alarmID }
    @MainActor func perform() async throws -> some IntentResult {
        UserDefaults.standard.set(alarmID, forKey: "zekki-open-alarm")
        NotificationCenter.default.post(name: Notification.Name("zekki-open-alarm"), object: nil)
        return .result()
    }
}
