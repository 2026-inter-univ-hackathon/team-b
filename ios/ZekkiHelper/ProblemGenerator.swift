import Foundation
import JavaScriptCore

// The bundled source is also used by the offline Web app; no downloaded code or CDN.
@MainActor
final class ProblemGenerator {
    private let context: JSContext?
    init(source: String? = nil) {
        context = JSContext()
        let code = source ?? Bundle.main.url(forResource: "problems", withExtension: "js")
            .flatMap { try? String(contentsOf: $0, encoding: .utf8) }
        if let code { context?.evaluateScript(code + "\nvar nativeGenerate = (genres, level, previous) => Problems.generate(genres, level, previous);") }
    }
    func generate(genres: [Genre], difficulty: Difficulty, previous: String? = nil) throws -> Problem {
        let level = difficulty == .easy ? "easy" : difficulty == .normal ? "normal" : "hard"
        guard let context else { throw Failure.unavailable }
        context.exception = nil
        guard let value = context.objectForKeyedSubscript("nativeGenerate")?.call(withArguments: [genres.map(\.webKey), level, previous ?? ""]),
              context.exception == nil, let data = value.toDictionary(),
              let answer = data["answer"] as? Int, let type = data["type"] as? String else { throw Failure.unavailable }
        let genre = Genre.allCases.first { $0.webKey == data["genre"] as? String } ?? .math
        var problem = Problem(text: data["text"] as? String ?? "", answer: answer, type: type, genre: genre)
        if let parts = data["text"] as? [String: Any] {
            problem.suffix = parts["suffix"] as? String ?? ""
            if let matrix = parts["matrix"] as? [[Int]] { problem.matrix = matrix }
            if let code = parts["pre"] as? String { problem.text = code; problem.code = true }
            if let integral = parts["integral"] as? [String: Any],
               let lower = integral["lower"] as? Int, let upper = integral["upper"] as? Int,
               let integrand = integral["integrand"] as? String {
                problem.integral = .init(lower: lower, upper: upper, integrand: integrand)
            }
            if let combination = parts["combination"] as? [String: Any],
               let n = combination["n"] as? Int, let k = combination["k"] as? Int {
                problem.combination = .init(n: n, k: k)
            }
        }
        guard !problem.text.isEmpty || problem.matrix != nil || problem.integral != nil || problem.combination != nil else { throw Failure.unavailable }
        return problem
    }
    enum Failure: LocalizedError {
        case unavailable
        var errorDescription: String? { "問題データを読み込めませんでした。アプリを再起動してください。" }
    }
}
