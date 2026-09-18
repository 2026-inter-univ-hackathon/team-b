import Foundation

@main struct CoreChecks {
    @MainActor static func main() throws {
        let generator = ProblemGenerator(source: try String(contentsOfFile: "js/problems.js", encoding: .utf8))
        var seen = Set<String>()
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
                var previous: String?
                for _ in 0..<150 {
                    let p = try generator.generate(genres: [genre], difficulty: difficulty, previous: previous)
                    precondition(p.genre == genre && p.accepts(String(p.answer)))
                    precondition(p.type != previous)
                    precondition(!p.text.isEmpty || p.matrix != nil || p.integral != nil || p.combination != nil)
                    if difficulty == .easy && genre == .math { precondition(["arithmetic", "linearEquation"].contains(p.type)) }
                    if let matrix = p.matrix { precondition(matrix.count == (difficulty == .hard ? 3 : 2)) }
                    if let integral = p.integral { precondition(integral.lower == 0 && integral.upper > 0) }
                    if let combination = p.combination { precondition(combination.n >= combination.k) }
                    previous = p.type; seen.insert(p.type)
                }
            }
        }
        var state = SavedState()
        state.wakeID = UUID(); state.origin = "調布"; state.home = "国領"
        let restored = try JSONDecoder().decode(SavedState.self, from: JSONEncoder().encode(state))
        precondition(restored.wakeID == state.wakeID && restored.home == "国領")
        precondition(seen.count == 19)
        for _ in 0..<50 {
            let p = try generator.generate(genres: [], difficulty: .normal)
            precondition(p.accepts(String(p.answer)))
        }
        var weekly = WakeSchedule()
        weekly.mode = .weekly
        weekly.days = [DayTime(weekday: 2, enabled: true, hour: 7, minute: 0), DayTime(weekday: 3, enabled: true, hour: 8, minute: 30), DayTime(weekday: 7, enabled: false)]
        let friday = calendar.date(from: DateComponents(year: 2026, month: 9, day: 18, hour: 9))!
        let requests = weekly.requests(hour: 7, minute: 30, now: friday, calendar: calendar)
        precondition(requests.count == 2 && requests.allSatisfy(\.repeats))
        let monday = requests.compactMap { $0.next(now: friday, calendar: calendar) }.min()!
        precondition(calendar.component(.day, from: monday) == 21 && calendar.component(.hour, from: monday) == 7)
        let tuesday = requests.compactMap { $0.next(now: monday, calendar: calendar) }.min()!
        precondition(calendar.component(.day, from: tuesday) == 22 && calendar.component(.hour, from: tuesday) == 8)
        let nextMonday = requests[0].next(now: monday, calendar: calendar)!
        precondition(calendar.component(.day, from: nextMonday) == 28)
        weekly.days = []
        precondition(weekly.requests(hour: 7, minute: 30).isEmpty)
        weekly.mode = .daily
        let daily = weekly.requests(hour: 7, minute: 30, now: friday, calendar: calendar)
        precondition(daily.count == 1 && daily[0].weekdays.count == 7)
        let saturday = daily[0].next(now: friday, calendar: calendar)!
        precondition(calendar.component(.day, from: saturday) == 19)
        let yearEnd = calendar.date(from: DateComponents(year: 2026, month: 12, day: 31, hour: 12))!
        precondition(calendar.component(.year, from: daily[0].next(now: yearEnd, calendar: calendar)!) == 2027)
        weekly.mode = .once
        let once = weekly.requests(hour: 7, minute: 30, now: friday, calendar: calendar)[0]
        precondition(!once.repeats && once.next(now: once.date!, calendar: calendar) == nil)
        state.wakeSchedule = weekly; state.genres = [.attention, .math]; state.reservations = requests
        let updated = try JSONDecoder().decode(SavedState.self, from: JSONEncoder().encode(state))
        precondition(updated.reservations?.count == 2 && updated.genres?.count == 2)
        // Simulate exact v1 keys: new fields must not make old settings/logs undecodable.
        var old = try JSONSerialization.jsonObject(with: JSONEncoder().encode(state)) as! [String: Any]
        for key in ["wakeSchedule", "genres", "reservations"] { old.removeValue(forKey: key) }
        old["genre"] = "数学"
        let legacy = try JSONDecoder().decode(SavedState.self, from: JSONSerialization.data(withJSONObject: old))
        precondition(legacy.genre == .math && legacy.reservations == nil && legacy.wakeID == state.wakeID)
        print("PASS: 1800 shared problems / 19 types, no repeats, math structures, daily/weekly/off/year schedules, train deadlines, answers, legacy/current storage")
    }
}
