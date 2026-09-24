import Foundation

// Only linked into this macOS command-line test, never into the iOS app.
@MainActor final class AlarmService: AlarmScheduling {
    var requests: [WakeReservation] = []
    var alerting = Set<UUID>()
    var failScheduleAt: Int?
    var cancelFailures = Set<UUID>()
    var stopFails = false
    var queryFails = false
    var scheduleCalls = 0
    var onSchedule: ((WakeReservation) -> Void)?
    enum Failure: Error { case expected }
    func schedule(_ reservation: WakeReservation) async throws {
        scheduleCalls += 1
        if scheduleCalls == failScheduleAt { throw Failure.expected }
        requests.append(reservation)
        onSchedule?(reservation)
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
    func alarms() throws -> [AlarmSnapshot] {
        if queryFails { throw Failure.expected }
        return requests.map { AlarmSnapshot(id: $0.id, alerting: alerting.contains($0.id)) } }
    func updates() -> AsyncStream<[AlarmSnapshot]> { AsyncStream { $0.finish() } }
}

@MainActor private final class FixtureTrainSearch: TrainSearching {
    var fail = false
    var plan = TrainPlan(origin: "新宿", home: "調布", leaveAt: .now.addingTimeInterval(3600), arriveAt: .now.addingTimeInterval(5400), checkedAt: .now, calendar: "Holiday", legs: [])
    func stations() async throws -> [String] { ["新宿", "調布"] }
    func search(from: String, to: String, now: Date) async throws -> TrainPlan {
        if fail { throw TrainSearch.Failure("通信失敗") }
        return plan
    }
}

@MainActor private final class FixtureClock { var now = Date() }

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
        let missedType = model.problem!.type
        model.answer = "invalid"; await model.submit()
        precondition(model.attempts == 2 && model.saved.records.isEmpty)
        precondition(model.saved.problemStats?[missedType]?.wrong == 1)
        let solvedType = model.problem!.type
        model.answer = String(model.problem!.answer)
        service.stopFails = true; await model.submit()
        precondition(model.saved.records.isEmpty && model.problem != nil)
        precondition(model.saved.problemStats?[solvedType]?.correct == nil)
        service.stopFails = false; await model.submit()
        precondition(model.saved.records.count == 1 && model.problem == nil && model.wakeArmed)
        precondition(model.saved.problemStats?[solvedType]?.correct == 1)
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
            model.answer = String(model.problem!.answer); await model.submit()
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
        // Search never schedules an alarm until the user explicitly accepts the route.
        defaults.removePersistentDomain(forName: name)
        let trainSearch = FixtureTrainSearch()
        service = AlarmService()
        model = AppModel(defaults: defaults, service: service, generator: ProblemGenerator(source: source), trainSearch: trainSearch)
        model.saved.origin = "新宿"; model.saved.home = "調布"
        await model.loadStations()
        precondition(model.stationNames.count == 2)
        await model.searchTrain()
        precondition(model.matchingTrainPlan == trainSearch.plan && service.requests.isEmpty)
        await model.scheduleTrain(useSearchResult: true)
        precondition(model.saved.trainID != nil && service.requests.count == 1)
        precondition(service.requests[0].date == trainSearch.plan.leaveAt.addingTimeInterval(-900))
        let trainRestored = AppModel(defaults: defaults, service: service, generator: ProblemGenerator(source: source), trainSearch: trainSearch)
        precondition(trainRestored.matchingTrainPlan == trainSearch.plan && trainRestored.saved.trainID == model.saved.trainID)
        model.cancel(train: true)
        model.saved.home = "三鷹"; model.trainInputChanged()
        precondition(model.matchingTrainPlan == nil)
        await model.scheduleTrain(useSearchResult: true)
        precondition(service.requests.isEmpty && model.saved.trainID == nil)
        model.saved.home = "調布"
        await model.searchTrain()
        trainSearch.fail = true
        await model.searchTrain()
        precondition(model.matchingTrainPlan == nil && model.trainStatus == "通信失敗")
        trainSearch.fail = false
        trainSearch.plan.leaveAt = .now.addingTimeInterval(60)
        await model.searchTrain()
        await model.scheduleTrain(useSearchResult: true)
        precondition(model.saved.trainID == nil && service.requests.isEmpty) // Lead time has elapsed.
        // Confirmation alarms are registered before the app ever enters the ringing screen.
        let clock = FixtureClock()
        func confirmed(_ repeatMode: RepeatMode = .once) -> (AppModel, AlarmService) {
            defaults.removePersistentDomain(forName: name)
            let service = AlarmService()
            let model = AppModel(defaults: defaults, service: service, generator: ProblemGenerator(source: source), clock: { clock.now })
            model.confirmationEnabled = true; model.schedule.mode = repeatMode
            return (model, service)
        }
        (model, service) = confirmed()
        await model.scheduleWake(demo: true)
        precondition(service.requests.count == 3)
        let batch = model.saved.confirmations!.first!
        precondition(batch.backups.map { $0.date!.timeIntervalSince(batch.scheduledAt) } == [120, 300])
        // The primary was stopped by iOS before the app was opened. Followups remain and the quiz opens.
        clock.now = batch.scheduledAt.addingTimeInterval(1)
        service.requests.removeAll { $0.id == batch.primaryID }
        model = AppModel(defaults: defaults, service: service, generator: ProblemGenerator(source: source), clock: { clock.now })
        model.synchronize()
        precondition(model.problem != nil && service.requests.count == 2)
        model.answer = "unfinished"
        let session = model.saved.quizSession!
        model = AppModel(defaults: defaults, service: service, generator: ProblemGenerator(source: source), clock: { clock.now })
        precondition(model.answer == "unfinished" && model.problem!.text == session.problem.text)
        precondition(model.saved.quizSession!.startedAt == session.startedAt)
        model.answer = "wrong"; await model.submit()
        precondition(model.attempts == 2 && model.saved.quizSession!.attempts == 2)
        // Both retries survive OS stop; an active backup is recognized as the same occurrence.
        service.alerting.insert(batch.backups[0].id); model.synchronize()
        precondition(model.attempts == 2)
        model.answer = String(model.problem!.answer)
        service.cancelFailures.insert(batch.backups[0].id)
        await model.submit()
        precondition(model.problem != nil && model.saved.records.isEmpty)
        precondition(model.saved.confirmations![0].backups.map(\.id) == [batch.backups[0].id])
        service.cancelFailures.removeAll(); await model.submit()
        precondition(model.problem == nil && model.saved.quizSession == nil && service.requests.isEmpty)
        precondition(model.saved.records.count == 1 && !model.wakeArmed)
        await model.submit(); precondition(model.saved.records.count == 1)
        // A repeating primary remains. Finish only this occurrence and pre-register next occurrence.
        (model, service) = confirmed(.daily)
        await model.scheduleWake()
        let dailyBatch = model.saved.confirmations![0]
        clock.now = dailyBatch.scheduledAt.addingTimeInterval(1)
        service.alerting.insert(dailyBatch.primaryID); model.synchronize()
        await model.stopToday()
        precondition(model.saved.records.isEmpty && model.problem == nil)
        precondition(service.requests.count == 3 && service.requests.contains { $0.id == dailyBatch.primaryID })
        precondition(model.saved.confirmations!.count == 1 && model.saved.confirmations![0].scheduledAt > clock.now)
        precondition(!service.requests.contains { dailyBatch.backups.map(\.id).contains($0.id) })
        service.alerting.insert(dailyBatch.primaryID); model.synchronize()
        precondition(model.problem == nil, "Delayed OS alert must not start the next occurrence early")
        service.alerting.remove(dailyBatch.primaryID)
        // Entire schedule cancellation removes backups too and retains failed cancellations for retry.
        let residual = model.saved.confirmations![0].backups[0].id
        service.cancelFailures.insert(residual); model.cancel(train: false)
        precondition(model.wakeArmed && service.requests.count == 1)
        service.cancelFailures.removeAll(); model.cancel(train: false)
        precondition(!model.wakeArmed && service.requests.isEmpty)
        // Failure at the second backup rolls back the primary and first backup.
        (model, service) = confirmed(); service.failScheduleAt = 3
        await model.scheduleWake(demo: true)
        precondition(service.requests.isEmpty && !model.wakeArmed && model.error != nil)
        // If rollback itself fails, that backup remains tracked until explicit cancellation succeeds.
        (model, service) = confirmed(); service.failScheduleAt = 3
        let rollbackService = service
        service.onSchedule = { request in if request.followUp == true { rollbackService.cancelFailures.insert(request.id) } }
        await model.scheduleWake(demo: true)
        precondition(model.wakeArmed && service.requests.count == 1 && model.saved.confirmations![0].backups.count == 1)
        service.cancelFailures.removeAll(); model.cancel(train: false)
        precondition(!model.wakeArmed && service.requests.isEmpty)
        // Failure while booking the next batch leaves the successful wake and recurring primary intact.
        (model, service) = confirmed(.daily); await model.scheduleWake()
        let nextBatch = model.saved.confirmations![0]
        clock.now = nextBatch.scheduledAt.addingTimeInterval(1)
        service.alerting.insert(nextBatch.primaryID); model.synchronize()
        service.failScheduleAt = service.scheduleCalls + 2
        model.answer = String(model.problem!.answer); await model.submit()
        precondition(model.saved.records.count == 1 && model.problem == nil && service.requests.count == 1 && model.error != nil)
        await model.refreshConfirmations()
        precondition(service.requests.count == 3 && model.saved.records.count == 1)
        model.cancel(train: false)
        // Downtime contributes to the five-minute easing clock without resetting the quiz.
        (model, service) = confirmed()
        await model.scheduleWake(demo: true)
        let persistenceBatch = model.saved.confirmations![0]
        clock.now = persistenceBatch.scheduledAt.addingTimeInterval(1)
        model.saved.difficulty = .hard
        model.synchronize(); model.answer = "123"
        clock.now = clock.now.addingTimeInterval(301)
        model = AppModel(defaults: defaults, service: service, generator: ProblemGenerator(source: source), clock: { clock.now })
        precondition(model.eased && model.answer.isEmpty && model.saved.quizSession!.eased)
        await model.stopToday(); precondition(service.requests.isEmpty && model.saved.records.isEmpty)
        // No duplicate followups on repeated app activation.
        (model, service) = confirmed(.weekly)
        await model.scheduleWake()
        precondition(service.requests.count == 15)
        await model.refreshConfirmations(); await model.refreshConfirmations()
        precondition(service.requests.count == 15)
        model.cancel(train: false)
        // Custom alarm button opens the quiz even if iOS removed the one-shot before launch.
        (model, service) = fresh(); await model.scheduleWake(demo: true)
        let openID = service.requests[0].id
        service.requests.removeAll()
        defaults.set(openID.uuidString, forKey: "zekki-open-alarm")
        model.synchronize()
        precondition(model.problem != nil && defaults.string(forKey: "zekki-open-alarm") == nil)
        await model.stopToday()
        // A failed OS query must never be interpreted as successful cancellation.
        (model, service) = confirmed(); await model.scheduleWake(demo: true)
        service.queryFails = true; model.cancel(train: false)
        precondition(model.wakeArmed && service.requests.count == 3)
        service.queryFails = false; model.cancel(train: false)
        precondition(!model.wakeArmed)
        print("PASS: pre-registered +2/+5, cold start after OS stop, quiz/input/attempt/time persistence, cancellation failure retry, no duplicate success, today stop preserving recurrence, next batch refresh, full disarm, partial scheduling rollback, elapsed easing, no duplicate followups")
        print("PASS: train search/explicit acceptance, exact alarm date, persistence, edited-input invalidation, failed-query invalidation, elapsed lead time")
        print("PASS: recurring/once/demo lifecycle, relaunch, wrong/correct answers, stop/cancel failures, batch rollback, OS stop, legacy migration")
    }
}
