import Foundation

enum Genre: String, Codable, CaseIterable, Identifiable {
    case math = "数学", physics = "物理", code = "プログラミング"
    var id: String { rawValue }
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
}
struct SavedState: Codable {
    var hour = 7
    var minute = 30
    var genre = Genre.math
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
}
struct Problem {
    let text: String
    let answer: Int
    static func generate(genre: Genre, difficulty: Difficulty) -> Problem {
        let maximum = difficulty == .easy ? 4 : difficulty == .normal ? 9 : 15
        let a = Int.random(in: 1...maximum), b = Int.random(in: 1...maximum)
        switch genre {
        case .math:
            return Problem(text: "f(x) = \(a)x² + \(b)x\nf′(2) は？", answer: 4 * a + b)
        case .physics:
            return Problem(text: "抵抗 \(a) Ω に電流 \(b) A。\n電圧は何 V？", answer: a * b)
        case .code:
            return Problem(text: "s = 0\nfor i in range(1, \(a + 1)):\n    s += i * \(b)\nprint(s)", answer: a * (a + 1) / 2 * b)
        }
    }
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
