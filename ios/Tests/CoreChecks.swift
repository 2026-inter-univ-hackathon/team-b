import Foundation

@main struct CoreChecks {
    static func main() throws {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Asia/Tokyo")!
        let now = calendar.date(from: DateComponents(year: 2026, month: 9, day: 11, hour: 8))!
        let next = AlarmDates.next(hour: 7, minute: 30, now: now, calendar: calendar)!
        precondition(calendar.component(.day, from: next) == 12)
        precondition(calendar.component(.hour, from: next) == 7)
        let later = AlarmDates.next(hour: 9, minute: 0, now: now, calendar: calendar)!
        precondition(calendar.component(.day, from: later) == 11)
        precondition(AlarmDates.trainAlert(departure: now.addingTimeInterval(600), lead: 15, now: now) == nil)
        precondition(AlarmDates.trainAlert(departure: now.addingTimeInterval(1800), lead: 15, now: now) == now.addingTimeInterval(900))
        precondition(Problem(text: "", answer: -12).accepts(" −１２ "))
        precondition(!Problem(text: "", answer: 12).accepts("12abc"))
        precondition(!Problem(text: "", answer: 12).accepts(""))
        for genre in Genre.allCases {
            for difficulty in Difficulty.allCases {
                for _ in 0..<100 {
                    let p = Problem.generate(genre: genre, difficulty: difficulty)
                    precondition(!p.text.isEmpty && p.accepts(String(p.answer)))
                }
            }
        }
        var state = SavedState()
        state.wakeID = UUID(); state.origin = "調布"; state.home = "国領"
        let restored = try JSONDecoder().decode(SavedState.self, from: JSONEncoder().encode(state))
        precondition(restored.wakeID == state.wakeID && restored.home == "国領")
        print("PASS: next-day scheduling, manual train deadlines, answer normalization, generation, persistence round-trip")
    }
}
