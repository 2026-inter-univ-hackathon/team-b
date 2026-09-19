import Foundation

// Only linked into this macOS command-line test, never into the iOS app.
@MainActor final class AlarmService: AlarmScheduling {
    var requests: [WakeReservation] = []
    var alerting = Set<UUID>()
    var failScheduleAt: Int?
    var cancelFailures = Set<UUID>()
    var stopFails = false
    var scheduleCalls = 0
    enum Failure: Error { case expected }
    func schedule(_ reservation: WakeReservation) async throws {
        scheduleCalls += 1
        if scheduleCalls == failScheduleAt { throw Failure.expected }
        requests.append(reservation)
    }
    func schedule(id: UUID, date: Date, train: Bool) async throws {
        requests.append(WakeReservation(id: id, hour: 0, minute: 0, date: date))
    }
    func cancel(_ id: UUID) throws {
        if cancelFailures.contains(id) { throw Failure.expected }
        requests.removeAll { $0.id == id }; alerting.remove(id)
    }
    func stop(_ id: UUID) throws {
        if stopFails { throw Failure.expected }
        alerting.remove(id)
        requests.removeAll { $0.id == id && !$0.repeats }
    }
    func alarms() throws -> [AlarmSnapshot] { requests.map { AlarmSnapshot(id: $0.id, alerting: alerting.contains($0.id)) } }
    func updates() -> AsyncStream<[AlarmSnapshot]> { AsyncStream { $0.finish() } }
}

@main struct LifecycleChecks {
    @MainActor static func main() async throws {
        let source = try String(contentsOfFile: "js/problems.js", encoding: .utf8)
        let name = "zekki-test-\(UUID())"
        let defaults = UserDefaults(suiteName: name)!
        defer { defaults.removePersistentDomain(forName: name) }
        func fresh() -> (AppModel, AlarmService) {
            defaults.removePersistentDomain(forName: name)
            let service = AlarmService()
            return (AppModel(defaults: defaults, service: service, generator: ProblemGenerator(source: source)), service)
        }
        // Native recurrence stays registered after a correct answer and a relaunch.
        var (model, service) = fresh()
        model.schedule.mode = .daily
        await model.scheduleWake()
        precondition(model.wakeArmed && service.requests.count == 1)
        let dailyID = service.requests[0].id
        let restored = AppModel(defaults: defaults, service: service, generator: ProblemGenerator(source: source))
        precondition(restored.wakeArmed && restored.schedule.mode == .daily)
        service.alerting.insert(dailyID); model.synchronize()
        precondition(model.problem != nil)
        model.answer = "invalid"; model.submit()
        precondition(model.attempts == 2 && model.saved.records.isEmpty)
        model.answer = String(model.problem!.answer)
        service.stopFails = true; model.submit()
        precondition(model.saved.records.isEmpty && model.problem != nil)
        service.stopFails = false; model.submit()
        precondition(model.saved.records.count == 1 && model.problem == nil && model.wakeArmed)
        precondition(service.requests[0].id == dailyID && !service.alerting.contains(dailyID))
        model.cancel(train: false)
        precondition(!model.wakeArmed && service.requests.isEmpty)
        // Every enabled weekday is registered; disabling removes all, including partial failures.
        (model, service) = fresh()
        model.schedule.mode = .weekly
        await model.scheduleWake()
        precondition(service.requests.count == 5)
        let retained = service.requests[1].id
        service.cancelFailures.insert(retained)
        model.cancel(train: false)
        precondition(service.requests.count == 1 && model.saved.reservations?.first?.id == retained)
        service.cancelFailures.removeAll(); model.cancel(train: false)
        precondition(!model.wakeArmed)
        // Failed batch registration rolls back already created alarms.
        (model, service) = fresh()
        model.schedule.mode = .weekly; service.failScheduleAt = 3
        await model.scheduleWake()
        precondition(!model.wakeArmed && service.requests.isEmpty && model.error != nil)
        // An empty weekly schedule doesn't call the OS.
        (model, service) = fresh(); model.schedule.mode = .weekly
        for index in model.schedule.days.indices { model.schedule.days[index].enabled = false }
        await model.scheduleWake()
        precondition(service.scheduleCalls == 0 && !model.wakeArmed)
        // Once and demo do not become recurring even if the selected mode is daily.
        for demo in [false, true] {
            (model, service) = fresh()
            model.schedule.mode = demo ? .daily : .once
            await model.scheduleWake(demo: demo)
            let id = service.requests[0].id
            precondition(!service.requests[0].repeats)
            service.alerting.insert(id); model.synchronize()
            model.answer = String(model.problem!.answer); model.submit()
            precondition(!model.wakeArmed && model.saved.records.count == 1)
        }
        // OS-side stopping without answering never records a successful wake.
        (model, service) = fresh(); await model.scheduleWake()
        service.requests.removeAll(); model.synchronize()
        precondition(!model.wakeArmed && model.saved.records.isEmpty)
        // Legacy single alarm ID becomes a tracked one-shot reservation.
        defaults.removePersistentDomain(forName: name)
        var legacy = SavedState(); legacy.wakeID = UUID(); legacy.wakeDate = Date().addingTimeInterval(3600)
        legacy.genre = .math
        defaults.set(try JSONEncoder().encode(legacy), forKey: "zekki-native-v1")
        let migrated = AppModel(defaults: defaults, service: AlarmService(), generator: ProblemGenerator(source: source))
        precondition(migrated.saved.reservations?.first?.id == legacy.wakeID && migrated.genres == [.math])
        precondition(migrated.saved.wakeID == nil)
        print("PASS: recurring/once/demo lifecycle, relaunch, wrong/correct answers, stop/cancel failures, batch rollback, OS stop, legacy migration")
    }
}
