import Foundation

struct AlarmSnapshot: Sendable {
    var id: UUID
    var alerting: Bool
}
@MainActor
protocol AlarmScheduling {
    func schedule(_ reservation: WakeReservation) async throws
    func schedule(id: UUID, date: Date, train: Bool) async throws
    func cancel(_ id: UUID) throws
    func stop(_ id: UUID) throws
    func alarms() throws -> [AlarmSnapshot]
    func updates() -> AsyncStream<[AlarmSnapshot]>
}
