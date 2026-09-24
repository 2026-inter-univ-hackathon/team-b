import Foundation
import JavaScriptCore

@MainActor
protocol TrainSearching {
    func stations() async throws -> [String]
    func search(from: String, to: String, now: Date) async throws -> TrainPlan
}

@MainActor
final class TrainSearch: TrainSearching {
    typealias Transport = @MainActor (URL) async throws -> Data
    private let context: JSContext
    private let transport: Transport
    private var pending: [String: CheckedContinuation<String, Error>] = [:]
    private var ready = false
    private var running = false

    init(source: String? = nil, adapter: String? = nil, config: String? = nil, transport: Transport? = nil) {
        context = JSContext()!
        self.transport = transport ?? Self.download
        let http: @convention(block) (String, String) -> Void = { [weak self] url, id in
            guard let self else { return }
            Task { @MainActor in
                do {
                    guard let url = URL(string: url), url.scheme == "https",
                          ["api.odpt.org", "api-challenge.odpt.org", "api-public.odpt.org"].contains(url.host ?? "") else {
                        throw Failure("時刻表の接続先が不正です。")
                    }
                    let data = try await self.transport(url)
                    guard let json = String(data: data, encoding: .utf8) else { throw Failure("時刻表の文字コードを読み込めませんでした。") }
                    self.context.objectForKeyedSubscript("nativeHTTPResult")?.call(withArguments: [id, json, ""])
                } catch {
                    // Never include URLSession's URL or query string (contains the API key).
                    let message = (error as? Failure)?.message ?? "通信に失敗しました。接続を確認して再検索してください。"
                    self.context.objectForKeyedSubscript("nativeHTTPResult")?.call(withArguments: [id, "", message])
                }
            }
        }
        let done: @convention(block) (String, String, String) -> Void = { [weak self] id, json, error in
            guard let continuation = self?.pending.removeValue(forKey: id) else { return }
            if error.isEmpty { continuation.resume(returning: json) }
            else { continuation.resume(throwing: Failure(error)) }
        }
        context.setObject(http, forKeyedSubscript: "nativeHTTP" as NSString)
        context.setObject(done, forKeyedSubscript: "nativeDone" as NSString)
        context.evaluateScript("var window = { APP_CONFIG: {} };")
        if let config = config ?? Self.bundled("odpt-config") { context.evaluateScript(config) }
        guard let source = source ?? Self.bundled("odpt"), let adapter = adapter ?? Self.bundled("ODPTBridge") else { return }
        context.evaluateScript(source)
        context.evaluateScript(adapter)
        ready = context.exception == nil
    }
    private static func bundled(_ name: String) -> String? {
        Bundle.main.url(forResource: name, withExtension: "js").flatMap { try? String(contentsOf: $0, encoding: .utf8) }
    }
    private static func download(_ url: URL) async throws -> Data {
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 30)
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let response = response as? HTTPURLResponse, response.statusCode == 200 else {
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            throw Failure(status == 429 ? "時刻表のアクセスが集中しています。少し待って再検索してください。" : "ODPTから時刻表を取得できませんでした（HTTP \(status)）。")
        }
        return data
    }
    private func run<T: Decodable>(_ operation: String, input: [String: Any] = [:]) async throws -> T {
        guard ready else { throw Failure("終電検索データを読み込めませんでした。アプリを入れ直してください。") }
        guard !running else { throw Failure("検索が終わるまでお待ちください。") }
        running = true; defer { running = false }
        let data = try JSONSerialization.data(withJSONObject: input)
        let json = try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<String, Error>) in
            let id = UUID().uuidString
            pending[id] = continuation
            context.exception = nil
            context.objectForKeyedSubscript("nativeRun")?.call(withArguments: [id, operation, String(decoding: data, as: UTF8.self)])
            if context.exception != nil, let pending = pending.removeValue(forKey: id) {
                pending.resume(throwing: Failure("終電検索を開始できませんでした。"))
            }
        }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .millisecondsSince1970
        return try decoder.decode(T.self, from: Data(json.utf8))
    }
    func stations() async throws -> [String] { try await run("stations") }
    func search(from: String, to: String, now: Date = .now) async throws -> TrainPlan {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Asia/Tokyo")!
        let date = calendar.component(.hour, from: now) < 4 ? calendar.date(byAdding: .day, value: -1, to: now)! : now
        let day = calendar.startOfDay(for: date)
        let parts = calendar.dateComponents([.year, .month, .day], from: day)
        let plan: TrainPlan = try await run("search", input: ["from": from, "to": to,
            "now": now.timeIntervalSince1970 * 1000, "dayMillis": day.timeIntervalSince1970 * 1000,
            "year": parts.year!, "month": parts.month!, "day": parts.day!])
        guard plan.leaveAt > now else { throw Failure("この運行日の終電はすでに出発しています。公式時刻表をご確認ください。") }
        return plan
    }
    struct Failure: LocalizedError {
        let message: String
        init(_ message: String) { self.message = message }
        var errorDescription: String? { message }
    }
}
