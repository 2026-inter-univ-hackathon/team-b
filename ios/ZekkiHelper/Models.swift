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
    var records: [WakeRecord] = []
    // Optional additions keep existing v1 UserDefaults readable.
    var wakeSchedule: WakeSchedule?
    var genres: [Genre]?
    var reservations: [WakeReservation]?

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
    var repeats: Bool { !weekdays.isEmpty }
    func next(now: Date = .now, calendar: Calendar = .current) -> Date? {
        if let date { return date > now ? date : nil }
        return weekdays.compactMap { weekday in
            calendar.nextDate(after: now, matching: DateComponents(hour: hour, minute: minute, weekday: weekday), matchingPolicy: .nextTime)
        }.min()
    }
}
struct Problem {
    var text: String
    let answer: Int
    var type: String = ""
    var genre: Genre = .math
    var matrix: [[Int]]?
    var integral: Integral?
    var combination: Combination?
    var suffix: String = ""
    var code: Bool = false
    struct Integral { let lower: Int; let upper: Int; let integrand: String }
    struct Combination { let n: Int; let k: Int }
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
