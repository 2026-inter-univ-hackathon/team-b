import AlarmKit
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
    private var startedAt = Date()
    private let service = AlarmService()
    private let defaults: UserDefaults
    private let key = "zekki-native-v1"
    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        if let data = defaults.data(forKey: key), let value = try? JSONDecoder().decode(SavedState.self, from: data) {
            saved = value
        } else { saved = SavedState() }
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
    func scheduleWake(demo: Bool = false) async {
        guard !busy, saved.wakeID == nil else { return }
        guard let date = demo ? Date().addingTimeInterval(10) : AlarmDates.next(hour: saved.hour, minute: saved.minute) else { return }
        busy = true; defer { busy = false }
        let id = UUID()
        do {
            try await service.schedule(id: id, date: date, train: false)
            saved.wakeID = id; saved.wakeDate = date
        } catch { self.error = error.localizedDescription }
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
        guard !busy, let id = train ? saved.trainID : saved.wakeID else { return }
        do {
            try service.cancel(id)
            if train { saved.trainID = nil; trainAlerting = false }
            else { saved.wakeID = nil; saved.wakeDate = nil; problem = nil }
        } catch { self.error = error.localizedDescription }
    }
    func synchronize() {
        do { apply(try service.manager.alarms) }
        catch { self.error = error.localizedDescription }
    }
    func observe() async {
        synchronize()
        for await alarms in service.manager.alarmUpdates {
            if Task.isCancelled { return }
            apply(alarms)
        }
    }
    private func apply(_ alarms: [Alarm]) {
        // 予約処理の途中に届いたOS更新で、保存直前の状態を上書きしない。
        guard !busy else { return }
        if let id = saved.wakeID {
            if let alarm = alarms.first(where: { $0.id == id }) {
                if alarm.state == .alerting && problem == nil { beginQuiz() }
            } else {
                saved.wakeID = nil; saved.wakeDate = nil
                // OS側で停止しても正解扱いにしない。開いている問題は続けられる。
            }
        }
        if let id = saved.trainID {
            if let alarm = alarms.first(where: { $0.id == id }) { trainAlerting = alarm.state == .alerting }
            else { saved.trainID = nil; trainAlerting = false }
        }
    }
    func beginQuiz() {
        startedAt = .now; attempts = 1; answer = ""; feedback = ""
        problem = Problem.generate(genre: saved.genre, difficulty: saved.difficulty)
    }
    func submit() {
        guard let problem else { return }
        guard problem.accepts(answer) else {
            attempts += 1; answer = ""; feedback = "別の問題でもう一度。"
            self.problem = Problem.generate(genre: saved.genre, difficulty: saved.difficulty)
            return
        }
        do {
            if let id = saved.wakeID { try service.stop(id) }
            saved.records.insert(WakeRecord(date: .now, attempts: attempts,
                seconds: max(0, Int(Date().timeIntervalSince(startedAt)))), at: 0)
            saved.wakeID = nil; saved.wakeDate = nil; self.problem = nil
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
