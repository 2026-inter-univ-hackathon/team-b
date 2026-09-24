import SwiftUI
import Observation

@MainActor @Observable
final class AppModel {
    var saved: SavedState { didSet { persist() } }
    var error: String?
    var busy = false
    var problem: Problem?
    var trainAlerting = false
    var trainLoading = false
    var stationNames: [String] = []
    var trainStatus = ""
    private let trainSearch: any TrainSearching
    var answer = "" { didSet { saveQuiz() } }
    var feedback = ""
    var attempts = 1
    var eased = false
    var successMessage: String?
    private var activeWakeID: UUID?
    private var activeConfirmationID: UUID?
    private var activeDemo = false
    private let clock: () -> Date
    private var restoringQuiz = false
    private var startedAt = Date()
    private let generator: ProblemGenerator
    private var easeTask: Task<Void, Never>?

    private let service: any AlarmScheduling
    private let defaults: UserDefaults
    private let key = "zekki-native-v1"
    init(defaults: UserDefaults = .standard, service: any AlarmScheduling = AlarmService(), generator: ProblemGenerator = ProblemGenerator(), trainSearch: any TrainSearching = TrainSearch(), clock: @escaping () -> Date = Date.init) {
        self.clock = clock
        self.defaults = defaults
        self.service = service
        self.generator = generator
        self.trainSearch = trainSearch
        if let data = defaults.data(forKey: key), let value = try? JSONDecoder().decode(SavedState.self, from: data) {
            saved = value
        } else { saved = SavedState() }
        if saved.wakeSchedule == nil { saved.wakeSchedule = WakeSchedule() }
        if saved.genres == nil { saved.genres = [saved.genre] }
        if saved.reservations == nil {
            if let id = saved.wakeID, let date = saved.wakeDate {
                saved.reservations = [WakeReservation(id: id, hour: saved.hour, minute: saved.minute, date: date)]
            } else { saved.reservations = [] }
        }
        saved.wakeID = nil; saved.wakeDate = nil
        persist()
        if let session = saved.quizSession {
            restoringQuiz = true
            activeWakeID = session.primaryID; activeConfirmationID = session.confirmationID
            activeDemo = session.demo ?? false
            startedAt = session.startedAt; problem = session.problem; answer = session.answer
            attempts = session.attempts; eased = session.eased; feedback = session.feedback
            restoringQuiz = false
            scheduleEasing()
        }
    }
    private func persist() {
        if let data = try? JSONEncoder().encode(saved) { defaults.set(data, forKey: key) }
    }
    var wakeTime: Date {
        get { Calendar.current.date(from: DateComponents(hour: saved.hour, minute: saved.minute)) ?? .now }
        set {
            saved.hour = Calendar.current.component(.hour, from: newValue)
            saved.minute = Calendar.current.component(.minute, from: newValue)
        }
    }
    var wakeArmed: Bool { !(saved.reservations ?? []).isEmpty || !(saved.confirmations ?? []).flatMap(\.backups).isEmpty }
    var confirmationEnabled: Bool {
        get { saved.wakeConfirmationEnabled ?? false }
        set { saved.wakeConfirmationEnabled = newValue }
    }
    var confirmationUntil: Date? { (saved.confirmations ?? []).filter { !$0.resolved }.map(\.scheduledAt).max() }
    var schedule: WakeSchedule {
        get { saved.wakeSchedule ?? WakeSchedule() }
        set { saved.wakeSchedule = newValue }
    }
    var genres: [Genre] {
        get { saved.genres ?? [saved.genre] }
        set { saved.genres = newValue }
    }
    var nextWake: Date? {
        let requests = wakeArmed ? (saved.reservations ?? []) : schedule.requests(hour: saved.hour, minute: saved.minute)
        let backups = wakeArmed ? (saved.confirmations ?? []).flatMap(\.backups) : []
        return (requests + backups).compactMap { $0.next(now: clock()) }.min()
    }
    var currentDifficulty: Difficulty {
        guard eased else { return saved.difficulty }
        return saved.difficulty == .hard ? .normal : .easy
    }
    func scheduleWake(demo: Bool = false) async {
        guard !busy, !wakeArmed, problem == nil else { return }
        let requests = demo ? [WakeReservation(hour: saved.hour, minute: saved.minute, date: clock().addingTimeInterval(10), demo: true)]
            : schedule.requests(hour: saved.hour, minute: saved.minute, now: clock())
        guard !requests.isEmpty else { error = "鳴らす曜日を1つ以上選んでください。"; return }
        busy = true
        var installed: [WakeReservation] = []
        do {
            for request in requests {
                try await service.schedule(request)
                installed.append(request)
                // Persist each successful OS registration for recovery after interruption.
                saved.reservations = installed
            }
            if confirmationEnabled {
                for request in requests {
                    if let date = request.next(now: clock()) { try await installConfirmation(for: request, at: date) }
                }
            }
            successMessage = nil
        } catch {
            var retained: [WakeReservation] = []
            let backups = (saved.confirmations ?? []).flatMap(\.backups)
            for request in installed + backups {
                do { try service.cancel(request.id) } catch { retained.append(request) }
            }
            saved.reservations = retained.filter { $0.followUp != true }
            saved.confirmations = (saved.confirmations ?? []).compactMap { batch in
                var batch = batch
                batch.backups = batch.backups.filter { backup in retained.contains { $0.id == backup.id } }
                return batch.backups.isEmpty ? nil : batch
            }
            self.error = error.localizedDescription + (retained.isEmpty ? "" : " 一部の予約が残っています。解除してください。")
        }
        busy = false
        synchronize()
    }
    func loadStations() async {
        guard stationNames.isEmpty, !trainLoading else { return }
        trainLoading = true; defer { trainLoading = false }
        trainStatus = "駅のデータを読み込んでいます…"
        do {
            stationNames = try await trainSearch.stations()
            trainStatus = ""
        } catch { trainStatus = error.localizedDescription }
    }
    func searchTrain() async {
        guard !trainLoading, !busy, saved.trainID == nil else { return }
        let origin = saved.origin.trimmingCharacters(in: .whitespacesAndNewlines)
        let home = saved.home.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !origin.isEmpty, !home.isEmpty else { error = "出発駅と到着駅を入力してください。"; return }
        trainLoading = true; defer { trainLoading = false }
        saved.trainPlan = nil
        trainStatus = "時刻表から終電を探しています…"
        do {
            let plan = try await trainSearch.search(from: origin, to: home, now: .now)
            // Discard a response if inputs changed while the request was in flight.
            guard saved.origin.trimmingCharacters(in: .whitespacesAndNewlines) == origin,
                  saved.home.trimmingCharacters(in: .whitespacesAndNewlines) == home else { trainStatus = "駅名を変更したため、再検索してください。"; return }
            saved.origin = plan.origin
            saved.home = plan.home
            saved.departure = plan.leaveAt
            saved.trainDecision = nil
            saved.trainPlan = plan
            trainStatus = ""
        } catch { trainStatus = error.localizedDescription }
    }
    func trainInputChanged() {
        guard saved.trainID == nil else { return }
        if let plan = saved.trainPlan, plan.origin != saved.origin || plan.home != saved.home { saved.trainPlan = nil }
        if !trainLoading { trainStatus = "" }
    }
    var matchingTrainPlan: TrainPlan? {
        guard let plan = saved.trainPlan, plan.origin == saved.origin, plan.home == saved.home,
              plan.leaveAt == saved.departure else { return nil }
        return plan
    }
    func scheduleTrain(useSearchResult: Bool = false) async {
        guard !busy, !trainLoading, saved.trainID == nil else { return }
        guard !saved.origin.trimmingCharacters(in: .whitespaces).isEmpty,
              !saved.home.trimmingCharacters(in: .whitespaces).isEmpty else {
            error = "出発駅と自宅の最寄り駅を入力してください。"; return
        }
        if useSearchResult {
            guard let plan = matchingTrainPlan, plan.leaveAt > .now else {
                error = "有効な検索結果がありません。終電を再検索してください。"; return
            }
        }
        guard let date = AlarmDates.trainAlert(departure: saved.departure, lead: saved.leadMinutes) else {
            error = "通知時刻が過ぎています。発車日時か通知の余裕時間を変更してください。"; return
        }
        busy = true; defer { busy = false }
        do {
            let id = UUID()
            try await service.schedule(id: id, date: date, train: true)
            saved.trainID = id; saved.trainDecision = nil
        } catch { self.error = error.localizedDescription }
    }
    func cancel(train: Bool) {
        guard !busy else { return }
        if train {
            guard let id = saved.trainID else { return }
            do { try service.cancel(id); saved.trainID = nil; trainAlerting = false }
            catch { self.error = error.localizedDescription }
        } else {
            let present: Set<UUID>
            do { present = Set(try service.alarms().map(\.id)) }
            catch { self.error = error.localizedDescription; return }
            var failed = Set<UUID>()
            for request in (saved.reservations ?? []) + (saved.confirmations ?? []).flatMap(\.backups) {
                do { if present.contains(request.id) { try service.cancel(request.id) } }
                catch { failed.insert(request.id); self.error = "解除できない予約が残っています。もう一度解除してください。" }
            }
            saved.reservations = (saved.reservations ?? []).filter { failed.contains($0.id) }
            saved.confirmations = (saved.confirmations ?? []).compactMap { batch in
                var batch = batch; batch.backups = batch.backups.filter { failed.contains($0.id) }
                return batch.backups.isEmpty ? nil : batch
            }
            if failed.isEmpty { clearQuiz() }

        }
    }
    func synchronize() {
        do {
            let alarms = try service.alarms()
            consumeOpenRequest()
            apply(alarms)
            scheduleEasing()
        }
        catch { self.error = error.localizedDescription }
    }
    func observe() async {
        synchronize()
        await refreshConfirmations()
        for await alarms in service.updates() {
            if Task.isCancelled { return }
            apply(alarms)
        }
    }
    private func apply(_ alarms: [AlarmSnapshot]) {
        // 予約処理の途中に届いたOS更新で、保存直前の状態を上書きしない。
        guard !busy else { return }
        let requests = saved.reservations ?? []
        saved.reservations = requests.filter { request in alarms.contains { $0.id == request.id } }
        if problem == nil, let alarm = alarms.first(where: { alarm in
            alarm.alerting && requests.contains { $0.id == alarm.id }
        }) { beginQuiz(id: alarm.id) }
        // OS stopping a one-shot must not erase its unfinished confirmation batch.
        if problem == nil, let batch = (saved.confirmations ?? []).first(where: { !$0.resolved && $0.scheduledAt <= clock() }) {
            beginQuiz(id: batch.primaryID)
        }
        // OS-side stopping never adds a successful wake record. Recurring reservations remain registered.
        if let id = saved.trainID {
            if let alarm = alarms.first(where: { $0.id == id }) { trainAlerting = alarm.alerting }
            else { saved.trainID = nil; trainAlerting = false }
        }
    }
    private func newProblem() {
        do {
            let preferEasier = currentDifficulty != .easy && attempts % 4 == 0
            problem = try generator.generate(genres: genres, difficulty: currentDifficulty, previous: problem?.type,
                stats: saved.problemStats ?? [:], preferEasier: preferEasier)
        } catch { self.error = error.localizedDescription }
    }
    private func saveQuiz() {
        guard !restoringQuiz, let id = activeWakeID, let problem else { return }
        saved.quizSession = WakeQuizSession(primaryID: id, confirmationID: activeConfirmationID,
            startedAt: startedAt, problem: problem, answer: answer, attempts: attempts, eased: eased, feedback: feedback, demo: activeDemo)
    }
    private func clearQuiz() {
        easeTask?.cancel(); activeWakeID = nil; activeConfirmationID = nil; activeDemo = false
        problem = nil; saved.quizSession = nil
    }
    func beginQuiz(id: UUID) {
        guard problem == nil else { return }
        let matching = (saved.confirmations ?? []).filter { $0.primaryID == id || $0.backups.contains { $0.id == id } }
        // Delayed OS updates from today's stopped alarm must not open tomorrow's quiz.
        if matching.contains(where: { !$0.resolved && $0.scheduledAt > clock() }) { return }
        if matching.contains(where: { $0.resolved && clock().timeIntervalSince($0.finishedAt ?? .distantPast) < 60 }) { return }
        let batch = matching.first { !$0.resolved }
        activeWakeID = batch?.primaryID ?? id
        activeConfirmationID = batch?.id
        activeDemo = (saved.reservations ?? []).first { $0.id == id }?.demo ?? false
        startedAt = clock(); attempts = 1; answer = ""; feedback = ""; eased = false
        newProblem(); saveQuiz(); scheduleEasing()
    }
    private func scheduleEasing() {
        easeTask?.cancel()
        guard problem != nil, !eased, saved.difficulty != .easy else { return }
        let remaining = max(0, 300 - clock().timeIntervalSince(startedAt))
        if remaining == 0 { easeQuiz(); return }
        easeTask = Task { [weak self] in
            do { try await Task.sleep(for: .seconds(remaining)) } catch { return }
            self?.easeQuiz()
        }
    }
    private func easeQuiz() {
        guard problem != nil, !eased else { return }
        eased = true; feedback = "5分経過したため、難易度を1段階下げました。"; answer = ""
        newProblem(); saveQuiz()
    }
    func submit() async {
        guard let problem, !busy else { return }
        guard problem.accepts(answer) else {
            recordProblemResult(type: problem.type, correct: false)
            attempts += 1; answer = ""; feedback = "別の問題でもう一度。"
            newProblem(); saveQuiz(); return
        }
        await finishWake(success: true)
    }
    private func recordProblemResult(type: String, correct: Bool) {
        guard !activeDemo, !type.isEmpty else { return }
        var stats = saved.problemStats ?? [:]
        var row = stats[type] ?? ProblemStat()
        if correct { row.correct += 1 } else { row.wrong += 1 }
        stats[type] = row
        saved.problemStats = stats
    }
    func stopToday() async { await finishWake(success: false) }
    private func finishWake(success: Bool) async {
        guard !busy, let id = activeWakeID else { return }
        busy = true; error = nil
        do {
            let alarms = try service.alarms()
            if let alarm = alarms.first(where: { $0.id == id }) {
                if alarm.alerting { try service.stop(id) }
                else if !(saved.reservations ?? []).contains(where: { $0.id == id && $0.repeats }) { try service.cancel(id) }
            }
            if let batchID = activeConfirmationID, let index = saved.confirmations?.firstIndex(where: { $0.id == batchID }) {
                var failed: [WakeReservation] = []
                for backup in saved.confirmations![index].backups {
                    do { if alarms.contains(where: { $0.id == backup.id }) { try service.cancel(backup.id) } }
                    catch { failed.append(backup) }
                }
                saved.confirmations![index].backups = failed
                guard failed.isEmpty else { throw WakeConfirmation.Failure.cancellation(failed.count) }
                saved.confirmations![index].resolved = true
                saved.confirmations![index].finishedAt = clock()
            }
            if success {
                if let type = problem?.type { recordProblemResult(type: type, correct: true) }
                saved.records.insert(WakeRecord(date: clock(), attempts: attempts,
                    seconds: max(0, Int(clock().timeIntervalSince(startedAt))), eased: eased, difficulty: saved.difficulty), at: 0)
            }
            saved.reservations = (saved.reservations ?? []).filter { $0.id != id || $0.repeats }
            clearQuiz()
            successMessage = success ? "起床成功！残りの確認アラームを取り消しました。" : "今日は中止しました。起床成功には記録しません。"
        } catch { self.error = error.localizedDescription }
        busy = false
        if problem == nil { await refreshConfirmations() }
    }
    private func installConfirmation(for primary: WakeReservation, at date: Date) async throws {
        let planned = WakeConfirmation.make(for: primary, at: date)
        var installed = planned; installed.backups = []
        saved.confirmations = (saved.confirmations ?? []) + [installed]
        do {
            for backup in planned.backups {
                try await service.schedule(backup)
                if let index = saved.confirmations?.firstIndex(where: { $0.id == planned.id }) {
                    saved.confirmations![index].backups.append(backup)
                }
            }
        } catch {
            if let index = saved.confirmations?.firstIndex(where: { $0.id == planned.id }) {
                var retained: [WakeReservation] = []
                for backup in saved.confirmations![index].backups {
                    do { try service.cancel(backup.id) } catch { retained.append(backup) }
                }
                if retained.isEmpty { saved.confirmations!.remove(at: index) }
                else { saved.confirmations![index].backups = retained }
            }
            throw error
        }
    }

    func refreshConfirmations() async {
        guard confirmationEnabled, !busy, problem == nil else { return }
        busy = true; defer { busy = false }
        do {
            for primary in saved.reservations ?? [] {
                // An unresolved occurrence stays available for the quiz, even after all alerts stopped.
                if (saved.confirmations ?? []).contains(where: { $0.primaryID == primary.id && !$0.resolved }) { continue }
                guard let date = primary.next(now: clock()) else { continue }
                try await installConfirmation(for: primary, at: date)
                saved.confirmations = (saved.confirmations ?? []).filter { $0.primaryID != primary.id || !$0.resolved || !$0.backups.isEmpty }
            }
        } catch { self.error = "次回の追加アラームを予約できませんでした。目覚ましを解除して再設定してください。" }
    }
    private func consumeOpenRequest() {
        guard let value = defaults.string(forKey: "zekki-open-alarm"), let id = UUID(uuidString: value) else { return }
        defaults.removeObject(forKey: "zekki-open-alarm")
        if let batch = (saved.confirmations ?? []).first(where: { !$0.resolved && $0.scheduledAt <= clock() && ($0.primaryID == id || $0.backups.contains { $0.id == id }) }) {
            beginQuiz(id: batch.primaryID)
        } else if (saved.reservations ?? []).contains(where: { $0.id == id }) { beginQuiz(id: id) }
    }
    func decideTrain(going: Bool) {
        do {
            if let id = saved.trainID { try service.stop(id) }
            saved.trainID = nil
            saved.trainDecision = going ? "今から帰ることにしました" : "今日は帰らないことにしました"
            trainAlerting = false
        } catch { self.error = error.localizedDescription }
    }
}
