import SwiftUI

@main
struct ZekkiHelperApp: App {
    @State private var model = AppModel()
    var body: some Scene { WindowGroup { HomeView(model: model) } }
}

private let ink = Color(red: 0.06, green: 0.07, blue: 0.16)
private let panel = Color(red: 0.11, green: 0.13, blue: 0.25)
private let accent = Color(red: 0.96, green: 0.55, blue: 0.03)

struct NightBackground: View {
    var body: some View {
        Canvas { context, size in
            var grid = Path()
            stride(from: 0.0, through: size.width, by: 48).forEach { x in grid.move(to: CGPoint(x: x, y: 0)); grid.addLine(to: CGPoint(x: x, y: size.height)) }
            stride(from: 0.0, through: size.height, by: 48).forEach { y in grid.move(to: CGPoint(x: 0, y: y)); grid.addLine(to: CGPoint(x: size.width, y: y)) }
            context.stroke(grid, with: .color(.white.opacity(0.045)), lineWidth: 1)
        }.background(ink).ignoresSafeArea()
    }
}

struct HomeView: View {
    @Bindable var model: AppModel
    @Environment(\.scenePhase) private var scenePhase
    @State private var feature = "alarm"
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    HStack {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("絶起ヘルパー").font(.largeTitle.bold())
                            Text("解いて起きる。帰る時間は、自分で決める。")
                                .font(.subheadline).foregroundStyle(.secondary)
                        }
                        Spacer(minLength: 0)
                        Image(systemName: "moon.fill").font(.largeTitle).foregroundStyle(.orange.opacity(0.85)).accessibilityHidden(true)
                    }
                    HStack(spacing: 6) {
                        featureButton("アラーム", id: "alarm", icon: "alarm")
                        featureButton("終電アラート", id: "train", icon: "tram")
                    }.padding(6).background(.black.opacity(0.25), in: RoundedRectangle(cornerRadius: 18))
                    if let message = model.successMessage {
                        Text(message).font(.subheadline).foregroundStyle(.orange).accessibilityAddTraits(.updatesFrequently)
                    }
                    if feature == "alarm" {
                        alarmCard
                        DisclosureGroup("起床の記録を見る") {
                            if model.saved.records.isEmpty { Text("まだ起床の記録はありません").foregroundStyle(.secondary) }
                            ForEach(model.saved.records.prefix(7)) { record in
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(record.date.formatted(date: .abbreviated, time: .shortened))
                                    Text("\(record.attempts)問目で正解 · \(record.seconds)秒" + (record.eased == true ? " · 難易度を下げました" : ""))
                                        .foregroundStyle(.secondary)
                                }.font(.footnote).frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 5)
                            }
                        }
                        DisclosureGroup("動作確認") {
                            Button("10秒後に鳴らす") { Task { await model.scheduleWake(demo: true) } }
                                .disabled(model.busy || model.wakeArmed)
                            Text("OSの停止操作でも音は止められます。正解したときだけ起床ログに残します。")
                                .font(.footnote).foregroundStyle(.secondary)
                        }
                    } else {
                        if model.wakeArmed, let date = model.nextWake {
                            Text("目覚ましは \(date.formatted(date: .abbreviated, time: .shortened)) にセット中です。")
                                .font(.footnote).foregroundStyle(.secondary)
                        }
                        trainCard
                    }
                }.padding(20).frame(maxWidth: 650).frame(maxWidth: .infinity)
            }.background(NightBackground())
            .toolbar(.hidden, for: .navigationBar)
            .task { await model.observe() }
            .onChange(of: scenePhase) { _, phase in if phase == .active { model.synchronize() } }
            .fullScreenCover(isPresented: Binding(get: { model.problem != nil }, set: { _ in })) { QuizView(model: model) }
            .sheet(isPresented: $model.trainAlerting) {
                VStack(spacing: 24) {
                    Label("帰る時間です", systemImage: "tram").font(.title.bold())
                    Text("\(model.saved.origin) → \(model.saved.home)")
                    Text("列車の発車 \(model.saved.departure.formatted(date: .omitted, time: .shortened))")
                    Button("今から帰る") { model.decideTrain(going: true) }.buttonStyle(.borderedProminent)
                    Button("今日は帰らない") { model.decideTrain(going: false) }
                }.padding().presentationDetents([.medium]).interactiveDismissDisabled()
            }
            .alert("操作を完了できませんでした", isPresented: Binding(get: { model.error != nil }, set: { if !$0 { model.error = nil } })) {
                Button("閉じる") { model.error = nil }
            } message: { Text(model.error ?? "") }
        }.tint(accent).preferredColorScheme(.dark)
    }
    private func featureButton(_ title: String, id: String, icon: String) -> some View {
        Button { feature = id } label: {
            Label(title, systemImage: icon).font(.subheadline.bold()).frame(maxWidth: .infinity).padding(.vertical, 14)
                .foregroundStyle(feature == id ? .black : .white)
                .background(feature == id ? accent : .clear, in: RoundedRectangle(cornerRadius: 12))
        }.buttonStyle(.plain).accessibilityAddTraits(feature == id ? .isSelected : [])
    }
    private var alarmCard: some View {
        card {
            HStack { Text("次のアラーム").font(.headline); Spacer(); badge(model.wakeArmed ? "セット中" : "未セット") }
            Text(model.nextWake?.formatted(date: .omitted, time: .shortened) ?? "--:--")
                .font(.system(size: 58, weight: .bold, design: .rounded)).monospacedDigit().minimumScaleFactor(0.6).lineLimit(1)
                .foregroundStyle(Color(red: 0.64, green: 0.68, blue: 0.9))
            Text(model.schedule.mode.rawValue + (model.nextWake.map { " · " + $0.formatted(.dateTime.month().day().weekday()) } ?? ""))
                .font(.subheadline).foregroundStyle(.secondary)
            if model.wakeArmed {
                Text("\(model.genres.isEmpty ? "全ジャンル" : model.genres.map(\.rawValue).joined(separator: "・")) ／ \(model.saved.difficulty.rawValue)").font(.subheadline)
                TimelineView(.periodic(from: .now, by: 1)) { timeline in
                    if let next = model.nextWake { Text("あと \(remaining(until: next, now: timeline.date))").monospacedDigit() }
                }
                Text("繰り返しはiPhoneが予約を保持します。時刻や曜日の変更は解除してから行えます。")
                    .font(.footnote).foregroundStyle(.secondary)
                Button("目覚ましを解除", role: .destructive) { model.cancel(train: false) }.disabled(model.busy)
            } else {
                VStack(alignment: .leading, spacing: 18) {
                    Picker("繰り返し", selection: $model.schedule.mode) {
                        ForEach(RepeatMode.allCases) { Text($0.rawValue).tag($0) }
                    }
                    if model.schedule.mode == .weekly {
                        ForEach(Array(model.schedule.days.enumerated()), id: \.element.id) { index, day in
                            HStack {
                                Toggle(day.label, isOn: Binding(get: { model.schedule.days[index].enabled }, set: { model.schedule.days[index].enabled = $0 }))
                                DatePicker(day.label + "の時刻", selection: dayBinding(index), displayedComponents: .hourAndMinute)
                                    .labelsHidden().disabled(!day.enabled).opacity(day.enabled ? 1 : 0.4)
                            }
                        }
                        Text("チェックした曜日だけ鳴らします。").font(.footnote).foregroundStyle(.secondary)
                    } else { DatePicker("鳴らす時刻", selection: $model.wakeTime, displayedComponents: .hourAndMinute) }
                    Divider()
                    Text("出題ジャンル").font(.headline)
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], alignment: .leading) {
                        ForEach(Genre.allCases) { genre in
                            Toggle(genre.rawValue, isOn: Binding(get: { model.genres.contains(genre) }, set: { selected in
                                if selected { model.genres.append(genre) } else { model.genres.removeAll { $0 == genre } }
                            })).toggleStyle(.button).frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                    Text("未選択なら全ジャンル。文字・記号は専門知識なしで解けます。")
                        .font(.footnote).foregroundStyle(.secondary)
                    Picker("難易度", selection: $model.saved.difficulty) {
                        ForEach(Difficulty.allCases) { Text($0.rawValue).tag($0) }
                    }.pickerStyle(.segmented)
                    Text("5分正解できなければ難易度を1段階下げ、起床ログに残します。音量はiPhone本体で調整してください。")
                        .font(.footnote).foregroundStyle(.secondary)
                }.disabled(model.busy)
                Button { Task { await model.scheduleWake() } } label: {
                    Text(model.busy ? "セットしています…" : "この予定でセットする").frame(maxWidth: .infinity).padding(.vertical, 10)
                }.buttonStyle(.borderedProminent).foregroundStyle(.black).disabled(model.busy)
            }
        }
    }
    private func dayBinding(_ index: Int) -> Binding<Date> {
        Binding(get: {
            let day = model.schedule.days[index]
            return Calendar.current.date(from: DateComponents(hour: day.hour, minute: day.minute)) ?? .now
        }, set: {
            model.schedule.days[index].hour = Calendar.current.component(.hour, from: $0)
            model.schedule.days[index].minute = Calendar.current.component(.minute, from: $0)
        })
    }
    private var trainCard: some View {
        card {
            HStack { Text("終電アラート").font(.headline); Spacer(); badge(model.saved.trainID == nil ? "未セット" : "セット中") }
            Text("\(model.saved.origin.isEmpty ? "出発駅を選択" : model.saved.origin) → \(model.saved.home.isEmpty ? "到着駅を選択" : model.saved.home)")
                .font(.title2.bold())
            if model.saved.trainID == nil {
                VStack(alignment: .leading, spacing: 12) {
                    Text("出発：今いる駅").font(.subheadline)
                    TextField("例：新宿", text: $model.saved.origin).textFieldStyle(.roundedBorder)
                    Image(systemName: "arrow.down").foregroundStyle(.secondary)
                    Text("到着：自宅の最寄り駅").font(.subheadline)
                    TextField("例：調布", text: $model.saved.home).textFieldStyle(.roundedBorder)
                    Text("公式時刻表で確認した発車日時を入力してください。自動検索は準備中です。")
                        .font(.footnote).foregroundStyle(.secondary)
                    DatePicker("発車日時", selection: $model.saved.departure, displayedComponents: [.date, .hourAndMinute])
                    Picker("何分前に知らせるか", selection: $model.saved.leadMinutes) {
                        ForEach([10,15,20,30], id: \.self) { Text("\($0)分前").tag($0) }
                    }
                }.disabled(model.busy)
                Button("入力した時刻で通知をセット") { Task { await model.scheduleTrain() } }
                    .buttonStyle(.borderedProminent).disabled(model.busy)
            } else {
                TimelineView(.periodic(from: .now, by: 1)) { timeline in
                    Text("出発まで \(remaining(until: model.saved.departure, now: timeline.date))")
                        .font(.title2.monospacedDigit())
                }
                Text("\(model.saved.departure.formatted(date: .abbreviated, time: .shortened))発 · \(model.saved.leadMinutes)分前に通知")
                Button("解除", role: .destructive) { model.cancel(train: true) }.disabled(model.busy)
            }
            if let decision = model.saved.trainDecision { Text(decision).foregroundStyle(.secondary) }
        }
    }
    private func remaining(until: Date, now: Date) -> String {
        let seconds = max(0, Int(until.timeIntervalSince(now)))
        return seconds >= 3600 ? "\(seconds / 3600)時間 \(seconds % 3600 / 60)分" : "\(seconds / 60)分 \(seconds % 60)秒"
    }
    private func badge(_ text: String) -> some View {
        Text(text).font(.caption).padding(.horizontal, 10).padding(.vertical, 5).background(.white.opacity(0.08), in: Capsule())
    }
    private func card<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 18, content: content)
            .padding(20).frame(maxWidth: .infinity, alignment: .leading)
            .background(panel, in: RoundedRectangle(cornerRadius: 22))
            .overlay(RoundedRectangle(cornerRadius: 22).stroke(.white.opacity(0.12), lineWidth: 1))
    }
}

struct QuizView: View {
    @Bindable var model: AppModel
    @FocusState private var answerFocused: Bool
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                Text("おはよう。問題を解こう。").font(.title.bold())
                Text("\(model.attempts)問目 ／ \(model.currentDifficulty.rawValue)" + (model.eased ? "（難易度を下げました）" : ""))
                    .foregroundStyle(.secondary)
                if let problem = model.problem { NativeProblemView(problem: problem) }
                TextField("整数で答える", text: $model.answer).textFieldStyle(.roundedBorder)
                    .keyboardType(.numbersAndPunctuation).focused($answerFocused).onSubmit { model.submit() }
                Button("解答する") { model.submit() }.buttonStyle(.borderedProminent)
                Text(model.feedback).foregroundStyle(.orange)
                if let error = model.error { Text(error).foregroundStyle(.red) }
            }.padding(24)
        }.background(NightBackground()).tint(accent).interactiveDismissDisabled()
            .task { answerFocused = true }
    }
}

struct NativeProblemView: View {
    let problem: Problem
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            if problem.genre == .math || problem.code {
                ScrollView(.horizontal) {
                    formula.font(.title2.monospaced()).fixedSize(horizontal: true, vertical: false).padding(.vertical, 8)
                }
                if !problem.suffix.isEmpty { Text(problem.suffix) }
            } else { Text(problem.text).font(.title2).fixedSize(horizontal: false, vertical: true) }
        }.padding(18).frame(maxWidth: .infinity, alignment: .leading)
            .background(panel, in: RoundedRectangle(cornerRadius: 14))
    }
    @ViewBuilder private var formula: some View {
        if let integral = problem.integral {
            HStack(spacing: 4) {
                Text("∫").font(.system(size: 48, design: .serif))
                VStack { Text("\(integral.upper)"); Spacer(minLength: 8); Text("\(integral.lower)") }.font(.caption).frame(height: 42)
                Text(" (\(integral.integrand)) dx")
            }.accessibilityElement(children: .ignore)
                .accessibilityLabel("\(integral.lower)から\(integral.upper)までの定積分、\(integral.integrand)")
        } else if let combination = problem.combination {
            HStack(alignment: .firstTextBaseline, spacing: 2) {
                Text("\(combination.n)").font(.caption).baselineOffset(-5)
                Text("C")
                Text("\(combination.k)").font(.caption).baselineOffset(-5)
            }.accessibilityElement(children: .ignore)
                .accessibilityLabel("\(combination.n)個から\(combination.k)個を選ぶ組合せ")
        } else if let matrix = problem.matrix {
            Grid(horizontalSpacing: 18, verticalSpacing: 8) {
                ForEach(matrix.indices, id: \.self) { row in
                    GridRow { ForEach(matrix[row].indices, id: \.self) { col in
                        Text(String(matrix[row][col]).replacingOccurrences(of: "-", with: "−")).frame(minWidth: 30, alignment: .trailing)
                    } }
                }
            }.padding(.horizontal, 14).padding(.vertical, 6)
                .overlay { Brackets().stroke(.primary, lineWidth: 2) }
        } else { Text(problem.text).textSelection(.enabled) }
    }
}
struct Brackets: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: 8, y: 0)); p.addLine(to: .zero); p.addLine(to: CGPoint(x: 0, y: rect.height)); p.addLine(to: CGPoint(x: 8, y: rect.height))
        p.move(to: CGPoint(x: rect.width - 8, y: 0)); p.addLine(to: CGPoint(x: rect.width, y: 0)); p.addLine(to: CGPoint(x: rect.width, y: rect.height)); p.addLine(to: CGPoint(x: rect.width - 8, y: rect.height))
        return p
    }
}
