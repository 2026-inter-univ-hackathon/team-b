import AlarmKit
import SwiftUI

struct ZekkiMetadata: AlarmMetadata {
    var purpose: String
}
@MainActor
struct AlarmService: AlarmScheduling {
    var manager: AlarmManager { AlarmManager.shared }
    func schedule(id: UUID, date: Date, train: Bool) async throws {
        try await schedule(id: id, schedule: .fixed(date), train: train)
    }
    func schedule(_ reservation: WakeReservation) async throws {
        let schedule: Alarm.Schedule
        if let date = reservation.date { schedule = .fixed(date) }
        else {
            let days: [Locale.Weekday] = [.sunday, .monday, .tuesday, .wednesday, .thursday, .friday, .saturday]
            schedule = .relative(.init(time: .init(hour: reservation.hour, minute: reservation.minute),
                repeats: .weekly(reservation.weekdays.map { days[$0 - 1] })))
        }
        try await self.schedule(id: reservation.id, schedule: schedule, train: false)
    }
    private func schedule(id: UUID, schedule: Alarm.Schedule, train: Bool) async throws {
        let authorization = try await AlarmManager.shared.requestAuthorization()
        guard authorization == .authorized else { throw Failure.denied }
        let title: LocalizedStringResource = train ? "帰る時間です" : "起きる時間です"
        let openButton: AlarmButton? = train ? nil : AlarmButton(text: "問題を解く", textColor: .white, systemImageName: "pencil")
        let alert: AlarmPresentation.Alert
        if #available(iOS 26.1, *) {
            alert = AlarmPresentation.Alert(title: title, secondaryButton: openButton, secondaryButtonBehavior: train ? nil : .custom)
        } else {
            alert = AlarmPresentation.Alert(title: title,
                stopButton: AlarmButton(text: "停止", textColor: .white, systemImageName: "stop.fill"),
                secondaryButton: openButton, secondaryButtonBehavior: train ? nil : .custom)
        }
        let attributes = AlarmAttributes(presentation: AlarmPresentation(alert: alert),
            metadata: ZekkiMetadata(purpose: train ? "train" : "wake"), tintColor: .orange)
        let configuration = AlarmManager.AlarmConfiguration<ZekkiMetadata>.alarm(
            schedule: schedule, attributes: attributes, secondaryIntent: train ? nil : OpenWakeIntent(alarmID: id.uuidString))
        _ = try await AlarmManager.shared.schedule(id: id, configuration: configuration)
    }
    func cancel(_ id: UUID) throws { try manager.cancel(id: id) }
    func stop(_ id: UUID) throws { try manager.stop(id: id) }
    func alarms() throws -> [AlarmSnapshot] {
        try manager.alarms.map { AlarmSnapshot(id: $0.id, alerting: $0.state == .alerting) }
    }
    func updates() -> AsyncStream<[AlarmSnapshot]> {
        AsyncStream { continuation in
            let task = Task {
                for await alarms in manager.alarmUpdates {
                    if Task.isCancelled { break }
                    continuation.yield(alarms.map { AlarmSnapshot(id: $0.id, alerting: $0.state == .alerting) })
                }
                continuation.finish()
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }
    enum Failure: LocalizedError {
        case denied
        var errorDescription: String? { "アラームが許可されていません。iPhoneの設定で許可してください。" }
    }
}
