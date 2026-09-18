import SwiftUI
import Observation

@MainActor @Observable
final class AppModel {
    var saved: SavedState { didSet { persist() } }
    var error: String?
    var busy = false
    var problem: Problem?
    var trainAlerting = false
    var answer = ""
    var feedback = ""
    var attempts = 1
    var eased = false
    var successMessage: String?
    private var activeWakeID: UUID?
    private var startedAt = Date()
    private let generator: ProblemGenerator
    private var easeTask: Task<Void, Never>?

    private let service: any AlarmScheduling
    private let defaults: UserDefaults
    private let key = "zekki-native-v1"
    init(defaults: UserDefaults = .standard, service: any AlarmScheduling = AlarmService(), generator: ProblemGenerator = ProblemGenerator()) {
        self.defaults = defaults
        self.service = service
        self.generator = generator
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
    var wakeArmed: Bool { !(saved.reservations ?? []).isEmpty }
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
        return requests.compactMap { $0.next() }.min()
    }
    var currentDifficulty: Difficulty {
        guard eased else { return saved.difficulty }
        return saved.difficulty == .hard ? .normal : .easy
    }
    func scheduleWake(demo: Bool = false) async {
        guard !busy, !wakeArmed else { return }
        let requests = demo ? [WakeReservation(hour: saved.hour, minute: saved.minute, date: Date().addingTimeInterval(10), demo: true)]
            : schedule.requests(hour: saved.hour, minute: saved.minute)
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
            successMessage = nil
        } catch {
            var retained: [WakeReservation] = []
            for request in installed {
                do { try service.cancel(request.id) } catch { retained.append(request) }
            }
            saved.reservations = retained
            self.error = error.localizedDescription + (retained.isEmpty ? "" : " 一部の予約が残っています。解除してください。")
        }
        busy = false
        synchronize()
    }
    func scheduleTrain() async {
        guard !busy, saved.trainID == nil else { return }
        guard !saved.origin.trimmingCharacters(in: .whitespaces).isEmpty,
              !saved.home.trimmingCharacters(in: .whitespaces).isEmpty else {
            error = "出発駅と自宅の最寄り駅を入力してください。"; return
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
            var retained: [WakeReservation] = []
            for request in saved.reservations ?? [] {
                do { try service.cancel(request.id) }
                catch { retained.append(request); self.error = error.localizedDescription }
            }
            saved.reservations = retained
            if retained.isEmpty { problem = nil; activeWakeID = nil; easeTask?.cancel() }
        }
    }
    func synchronize() {
        do { apply(try service.alarms()) }
        catch { self.error = error.localizedDescription }
    }
    func observe() async {
        synchronize()
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
        // OS-side stopping never adds a successful wake record. Recurring reservations remain registered.
        if let id = saved.trainID {
            if let alarm = alarms.first(where: { $0.id == id }) { trainAlerting = alarm.alerting }
            else { saved.trainID = nil; trainAlerting = false }
        }
    }
    private func newProblem() {
        do {
            problem = try generator.generate(genres: genres, difficulty: currentDifficulty, previous: problem?.type)
        } catch { self.error = error.localizedDescription }
    }
    func beginQuiz(id: UUID) {
        activeWakeID = id
        startedAt = .now; attempts = 1; answer = ""; feedback = ""; eased = false
        newProblem()
        easeTask?.cancel()
        if saved.difficulty != .easy {
            easeTask = Task { [weak self] in
                do { try await Task.sleep(for: .seconds(300)) } catch { return }
                guard let self, self.problem != nil else { return }
                self.eased = true
                self.feedback = "5分経過したため、難易度を1段階下げました。"
                self.answer = ""
                self.newProblem()
            }
        }
    }
    func submit() {
        guard let problem, !busy else { return }
        guard problem.accepts(answer) else {
            attempts += 1; answer = ""; feedback = "別の問題でもう一度。"
            newProblem()
            return
        }
        do {
            if let id = activeWakeID, let alarm = try service.alarms().first(where: { $0.id == id }), alarm.alerting {
                try service.stop(id)
            }
            saved.records.insert(WakeRecord(date: .now, attempts: attempts,
                seconds: max(0, Int(Date().timeIntervalSince(startedAt))), eased: eased, difficulty: saved.difficulty), at: 0)
            // stop ends today's alert; AlarmKit keeps the weekly recurrence.
            saved.reservations = (saved.reservations ?? []).filter { $0.id != activeWakeID || $0.repeats }
            easeTask?.cancel(); activeWakeID = nil; self.problem = nil
            successMessage = "起床成功！ \(attempts)問目で正解しました。" + (wakeArmed ? "次回も自動で鳴らします。" : "")
        } catch { self.error = error.localizedDescription }
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
