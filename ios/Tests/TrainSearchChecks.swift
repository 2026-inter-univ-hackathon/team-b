import Foundation

@MainActor private final class FixtureState { var failed = false; var cap = false; var count = 0 }

@main struct TrainSearchChecks {
    @MainActor static func main() async throws {
        let source = try String(contentsOfFile: "js/odpt.js", encoding: .utf8)
        let adapter = try String(contentsOfFile: "ios/ZekkiHelper/ODPTBridge.js", encoding: .utf8)
        if CommandLine.arguments.contains("--live") {
            let config = try String(contentsOfFile: "js/config.js", encoding: .utf8)
            let search = TrainSearch(source: source, adapter: adapter, config: config)
            let stations = try await search.stations()
            print("LIVE stations: \(stations.count)")
            for (from, to) in [("新宿", "調布"), ("新宿", "三鷹"), ("調布", "国領"), ("国領", "外苑前")] {
                let plan = try await search.search(from: from, to: to, now: .now)
                print("LIVE \(from) → \(to): \(plan.leaveAt.ISO8601Format()) / \(plan.legs.map(\.line).joined(separator: " → "))")
            }
            return
        }
        let config = "window.APP_CONFIG = {ODPT_ACCESS_TOKEN: 'regular-test', ODPT_CHALLENGE_ACCESS_TOKEN: 'challenge-test'};"
        let r1 = "odpt.Railway:Keio.Test", r2 = "odpt.Railway:TokyoMetro.Test"
        func railway(_ id: String, _ names: [String], _ ids: [String]) -> [String: Any] {
            ["owl:sameAs": id, "odpt:operator": id == r1 ? "odpt.Operator:Keio" : "odpt.Operator:TokyoMetro",
             "dc:title": id, "odpt:stationOrder": zip(names, ids).enumerated().map { index, pair in
                ["odpt:index": index, "odpt:station": pair.1, "odpt:stationTitle": ["ja": pair.0]] as [String: Any]
             }]
        }
        func train(_ from: String, _ to: String, _ dep: String, _ arr: String) -> [String: Any] {
            ["owl:sameAs": from + to, "odpt:trainTimetableObject": [
                ["odpt:departureStation": from, "odpt:departureTime": dep],
                ["odpt:arrivalStation": to, "odpt:arrivalTime": arr]]]
        }
        let fixture = FixtureState()
        let search = TrainSearch(source: source, adapter: adapter, config: config) { url in
            fixture.count += 1
            if fixture.failed { fixture.failed = false; throw URLError(.notConnectedToInternet) }
            let query = Dictionary(uniqueKeysWithValues: URLComponents(url: url, resolvingAgainstBaseURL: false)!.queryItems!.map { ($0.name, $0.value!) })
            let regular = url.host == "api.odpt.org"
            precondition(query["acl:consumerKey"] == (regular ? "regular-test" : "challenge-test"))
            let rows: [[String: Any]]
            if url.path.hasSuffix("odpt:Railway") {
                rows = regular ? [railway(r2, ["B", "C"], ["b2", "c"])] : [railway(r1, ["A", "B"], ["a", "b"])]
            } else if url.path.hasSuffix("odpt:Station") { rows = [] }
            else {
                precondition(query["odpt:calendar"] == "odpt.Calendar:Holiday")
                precondition(query["odpt:railway"] == (regular ? r2 : r1))
                let row = regular ? train("b2", "c", "00:35", "00:55") : train("a", "b", "00:10", "00:25")
                rows = fixture.cap ? Array(repeating: row, count: 1000) : [row]
            }
            return try JSONSerialization.data(withJSONObject: rows)
        }
        let stations = try await search.stations()
        precondition(stations == ["A", "B", "C"])
        let now = ISO8601DateFormatter().date(from: "2026-09-20T15:00:00Z")! // Sep 21 00:00 JST; Sunday operating day.
        let plan = try await search.search(from: "A駅", to: "C", now: now)
        precondition(plan.origin == "A" && plan.home == "C" && plan.legs.count == 2)
        precondition(plan.leaveAt == now.addingTimeInterval(600))
        precondition(plan.arriveAt == now.addingTimeInterval(3300))
        precondition(plan.legs[1].departAt.timeIntervalSince(plan.legs[0].arriveAt) == 600)
        let before = fixture.count
        _ = try await search.search(from: "A", to: "B", now: now)
        precondition(fixture.count > before) // New explicit search refreshes timetable data.
        func expectFailure(_ from: String, _ to: String, _ date: Date = now, containing: String) async {
            do { _ = try await search.search(from: from, to: to, now: date); preconditionFailure("Expected failure") }
            catch { precondition(error.localizedDescription.contains(containing), error.localizedDescription) }
        }
        await expectFailure("A", "A", containing: "同じ")
        await expectFailure("X", "B", containing: "対応データ")
        await expectFailure("C", "A", containing: "確認できません")
        await expectFailure("A", "B", now.addingTimeInterval(1800), containing: "出発")
        fixture.cap = true
        await expectFailure("A", "B", containing: "取得上限")
        fixture.cap = false; fixture.failed = true
        await expectFailure("A", "B", containing: "通信")
        _ = try await search.search(from: "A", to: "B", now: now) // Rejected cache entries recover.
        var saved = SavedState(); saved.trainPlan = plan
        let restored = try JSONDecoder().decode(SavedState.self, from: JSONEncoder().encode(saved))
        precondition(restored.trainPlan == plan)
        let noKey = TrainSearch(source: source, adapter: adapter, config: "") { url in
            precondition(url.host == "api-public.odpt.org")
            let rows: [[String: Any]] = url.path.contains("Railway") ? [railway(r1, ["A", "B"], ["a", "b"])] : []
            return try JSONSerialization.data(withJSONObject: rows)
        }
        let publicStations = try await noKey.stations()
        precondition(publicStations == ["A", "B"])
        // Exercise three actual rides through the same native adapter shipped in the app.
        let r3 = "odpt.Railway:TokyoMetro.Last", r4 = "odpt.Railway:TokyoMetro.Beyond"
        let multi = TrainSearch(source: source, adapter: adapter, config: config) { url in
            let query = Dictionary(uniqueKeysWithValues: URLComponents(url: url, resolvingAgainstBaseURL: false)!.queryItems!.map { ($0.name, $0.value!) })
            let rows: [[String: Any]]
            if url.path.hasSuffix("odpt:Railway") {
                rows = url.host == "api-challenge.odpt.org" ? [railway(r1, ["A", "B"], ["a", "b"])] : [
                    railway(r2, ["B", "C"], ["b2", "c"]), railway(r3, ["C", "D"], ["c2", "d"]), railway(r4, ["D", "E"], ["d2", "e"])]
            } else if url.path.hasSuffix("odpt:Station") { rows = [] }
            else {
                switch query["odpt:railway"] {
                case r1: rows = [train("a", "b", "00:10", "00:25")]
                case r2: rows = [train("b2", "c", "00:35", "00:55")]
                case r3: rows = [train("c2", "d", "01:00", "01:15")]
                case r4: rows = [train("d2", "e", "01:20", "01:30")]
                default: preconditionFailure("Unexpected railway")
                }
            }
            return try JSONSerialization.data(withJSONObject: rows)
        }
        let threeRides = try await multi.search(from: "A", to: "D", now: now)
        precondition(threeRides.legs.count == 3 && threeRides.leaveAt == now.addingTimeInterval(600))
        precondition(threeRides.arriveAt == now.addingTimeInterval(4500))
        for i in 1..<threeRides.legs.count {
            precondition(threeRides.legs[i].departAt.timeIntervalSince(threeRides.legs[i-1].arriveAt) >= 300)
        }
        do { _ = try await multi.search(from: "A", to: "E", now: now); preconditionFailure("Three transfers must be rejected") }
        catch { precondition(error.localizedDescription.contains("乗り換え2回")) }
        saved.trainPlan = threeRides
        let multiRestored = try JSONDecoder().decode(SavedState.self, from: JSONEncoder().encode(saved))
        precondition(multiRestored.trainPlan == threeRides)
        print("PASS: native two transfers, both connection margins, maximum limit, three-leg persistence")
        print("PASS: native JS/HTTP bridge, dual hosts/keys, station normalization, one transfer, Tokyo midnight/holiday, expired/no route, truncation, offline retry, refresh, persistence, public fallback")
    }
}
