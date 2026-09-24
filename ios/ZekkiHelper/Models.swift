import Foundation

enum Genre: String, Codable, CaseIterable, Identifiable {
    case attention = "文字・記号", math = "数学", physics = "物理", code = "プログラミング"
    var id: String { rawValue }
    var webKey: String {
        switch self { case .attention: "attention"; case .math: "math"; case .physics: "physics"; case .code: "code" }
    }
}
enum Difficulty: String, Codable, CaseIterable, Identifiable {
    case easy = "やさしい", normal = "ふつう", hard = "むずかしい"
    var id: String { rawValue }
}
struct WakeRecord: Codable, Identifiable {
    var id = UUID()
    var date: Date
    var attempts: Int
    var seconds: Int
    var eased: Bool?
    var difficulty: Difficulty?
}
struct SavedState: Codable {
    var hour = 7
    var minute = 30
    var genre = Genre.attention
    var difficulty = Difficulty.normal
    var wakeID: UUID?
    var wakeDate: Date?
    var origin = "調布"
    var home = "国領"
    var leadMinutes = 15
    var departure = Date().addingTimeInterval(3600)
    var trainID: UUID?
    var trainDecision: String?
    var trainPlan: TrainPlan?
    var records: [WakeRecord] = []
    // Optional additions keep existing v1 UserDefaults readable.
    var wakeSchedule: WakeSchedule?
    var genres: [Genre]?
    var reservations: [WakeReservation]?
    var wakeConfirmationEnabled: Bool?
    var confirmations: [WakeConfirmation]?
    var quizSession: WakeQuizSession?
    var problemStats: [String: ProblemStat]?

}
struct ProblemStat: Codable, Equatable {
    var correct = 0
    var wrong = 0
}
enum RepeatMode: String, Codable, CaseIterable, Identifiable {
    case once = "1回だけ", daily = "毎日", weekly = "曜日ごと"
    var id: String { rawValue }
}
struct DayTime: Codable, Identifiable, Equatable {
    var weekday: Int // Calendar weekday: Sunday = 1
    var enabled: Bool
    var hour: Int = 7
    var minute: Int = 30
    var id: Int { weekday }
    var label: String { ["日", "月", "火", "水", "木", "金", "土"][weekday - 1] + "曜日" }
}
struct WakeSchedule: Codable {
    var mode: RepeatMode = .once
    var days: [DayTime] = [2, 3, 4, 5, 6, 7, 1].map { DayTime(weekday: $0, enabled: (2...6).contains($0)) }
    func requests(hour: Int, minute: Int, now: Date = .now, calendar: Calendar = .current) -> [WakeReservation] {
        switch mode {
        case .once:
            guard let date = AlarmDates.next(hour: hour, minute: minute, now: now, calendar: calendar) else { return [] }
            return [WakeReservation(hour: hour, minute: minute, date: date)]
        case .daily:
            return [WakeReservation(hour: hour, minute: minute, weekdays: Array(1...7))]
        case .weekly:
            return days.filter(\.enabled).map { WakeReservation(hour: $0.hour, minute: $0.minute, weekdays: [$0.weekday]) }
        }
    }
}
struct WakeReservation: Codable, Identifiable {
    var id = UUID()
    var hour: Int
    var minute: Int
    var weekdays: [Int] = []
    var date: Date?
    var demo = false
    var followUp: Bool?
    var repeats: Bool { !weekdays.isEmpty }
    func next(now: Date = .now, calendar: Calendar = .current) -> Date? {
        if let date { return date > now ? date : nil }
        return weekdays.compactMap { weekday in
            calendar.nextDate(after: now, matching: DateComponents(hour: hour, minute: minute, weekday: weekday), matchingPolicy: .nextTime)
        }.min()
    }
}
struct Problem: Codable {
    var text: String
    let answer: Int
    var type: String = ""
    var genre: Genre = .math
    var matrix: [[Int]]?
    var integral: Integral?
    var combination: Combination?
    var suffix: String = ""
    var code: Bool = false
    var difficulty: Difficulty?
    struct Integral: Codable { let lower: Int; let upper: Int; let integrand: String }
    struct Combination: Codable { let n: Int; let k: Int }
    func accepts(_ text: String) -> Bool {
        let normalized = text.precomposedStringWithCompatibilityMapping
            .replacingOccurrences(of: "−", with: "-")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return Int(normalized) == answer
    }
}
enum AlarmDates {
    static func next(hour: Int, minute: Int, now: Date = .now, calendar: Calendar = .current) -> Date? {
        calendar.nextDate(after: now, matching: DateComponents(hour: hour, minute: minute), matchingPolicy: .nextTime)
    }
    static func trainAlert(departure: Date, lead: Int, now: Date = .now) -> Date? {
        let alert = departure.addingTimeInterval(-Double(lead) * 60)
        return alert > now ? alert : nil
    }
}

struct TrainPlan: Codable, Equatable {
    var origin: String
    var home: String
    var leaveAt: Date
    var arriveAt: Date
    var checkedAt: Date
    var calendar: String
    var legs: [TrainLeg]
}
struct TrainLeg: Codable, Equatable {
    var line: String
    var from: String
    var to: String
    var departAt: Date
    var arriveAt: Date
    var trainType: String
    var headsign: String
}

// Each batch belongs to one occurrence, not the entire repeating alarm.
struct WakeConfirmation: Codable, Identifiable {
    var id = UUID()
    var primaryID: UUID
    var scheduledAt: Date
    var backups: [WakeReservation]
    var resolved = false
    var finishedAt: Date?
    enum Failure: LocalizedError {
        case cancellation(Int)
        var errorDescription: String? {
            switch self { case .cancellation(let count): "追加アラームを取り消せませんでした。残り\(count)件。もう一度操作してください。" }
        }
    }
    static func make(for primary: WakeReservation, at date: Date) -> WakeConfirmation {
        WakeConfirmation(primaryID: primary.id, scheduledAt: date, backups: [120.0, 300.0].map { offset in
            WakeReservation(hour: 0, minute: 0, date: date.addingTimeInterval(offset), followUp: true)
        })
    }
}
struct WakeQuizSession: Codable {
    var primaryID: UUID
    var confirmationID: UUID?
    var startedAt: Date
    var problem: Problem
    var answer: String
    var attempts: Int
    var eased: Bool
    var feedback: String
    var demo: Bool?
}
