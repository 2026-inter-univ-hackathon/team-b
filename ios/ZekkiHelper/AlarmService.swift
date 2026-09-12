import AlarmKit
import SwiftUI

struct ZekkiMetadata: AlarmMetadata {
    var purpose: String
}
@MainActor
struct AlarmService {
    var manager: AlarmManager { AlarmManager.shared }
    func schedule(id: UUID, date: Date, train: Bool) async throws {
        let authorization = try await AlarmManager.shared.requestAuthorization()
        guard authorization == .authorized else { throw Failure.denied }
        let title: LocalizedStringResource = train ? "帰る時間です" : "起きる時間です"
        let alert: AlarmPresentation.Alert
        if #available(iOS 26.1, *) {
            alert = AlarmPresentation.Alert(title: title)
        } else {
            alert = AlarmPresentation.Alert(title: title,
                stopButton: AlarmButton(text: "停止", textColor: .white, systemImageName: "stop.fill"))
        }
        let attributes = AlarmAttributes(presentation: AlarmPresentation(alert: alert),
            metadata: ZekkiMetadata(purpose: train ? "train" : "wake"), tintColor: .orange)
        let configuration = AlarmManager.AlarmConfiguration<ZekkiMetadata>.alarm(
            schedule: .fixed(date), attributes: attributes)
        _ = try await AlarmManager.shared.schedule(id: id, configuration: configuration)
    }
    func cancel(_ id: UUID) throws { try manager.cancel(id: id) }
    func stop(_ id: UUID) throws { try manager.stop(id: id) }
    enum Failure: LocalizedError {
        case denied
        var errorDescription: String? { "アラームが許可されていません。iPhoneの設定で許可してください。" }
    }
}
