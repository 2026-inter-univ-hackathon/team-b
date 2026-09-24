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
    @State private var manualTrain = false
    private enum TrainField: Hashable { case origin, home }
    @FocusState private var trainField: TrainField?
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    HStack {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Zekki ヘルパー").font(.largeTitle.bold())
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
            .onChange(of: scenePhase) { _, phase in if phase == .active { model.synchronize(); Task { await model.refreshConfirmations() } } }
            .onReceive(NotificationCenter.default.publisher(for: Notification.Name("zekki-open-alarm"))) { _ in model.synchronize() }
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
                if model.confirmationEnabled {
                    Text("起床確認あり：2分後・5分後に追加で鳴らします。正解すると残りを取り消します。")
                        .font(.footnote).foregroundStyle(.orange)
                    if let date = model.confirmationUntil {
                        Text("追加アラーム予約済み：\(date.formatted(date: .abbreviated, time: .shortened)) の起床分まで")
                            .font(.caption).foregroundStyle(.secondary)
                    }
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
                            VStack(alignment: .leading, spacing: 8) {
                                Toggle(day.label, isOn: Binding(get: { model.schedule.days[index].enabled }, set: { model.schedule.days[index].enabled = $0 }))
                                ExplicitTimePicker(hour: dayHourBinding(index), minute: dayMinuteBinding(index))
                                    .disabled(!day.enabled).opacity(day.enabled ? 1 : 0.4)
                            }
                        }
                        Text("チェックした曜日だけ鳴らします。").font(.footnote).foregroundStyle(.secondary)
                    } else {
                        Text("鳴らす時刻").font(.subheadline.weight(.semibold))
                        ExplicitTimePicker(hour: $model.saved.hour, minute: $model.saved.minute)
                    }
                    Toggle("起床確認あり", isOn: $model.confirmationEnabled)
                    Text("起床時刻の2分後・5分後も予約します。正解または『今日は中止』で残りを取り消します。追加は次回の起床分だけで、正解・中止・アプリ再開時に更新します。")
                        .font(.footnote).foregroundStyle(.secondary)
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
                    Text("正答率が低い問題を優先し、4問ごとに1問は一段やさしい問題を出します。")
                        .font(.footnote).foregroundStyle(.secondary)
                    Text("5分正解できなければ難易度を1段階下げ、起床ログに残します。音量はiPhone本体で調整してください。")
                        .font(.footnote).foregroundStyle(.secondary)
                }.disabled(model.busy)
                Button { Task { await model.scheduleWake() } } label: {
                    Text(model.busy ? "セットしています…" : "この予定でセットする").frame(maxWidth: .infinity).padding(.vertical, 10)
                }.buttonStyle(.borderedProminent).foregroundStyle(.black).disabled(model.busy)
            }
        }
    }
    private func dayHourBinding(_ index: Int) -> Binding<Int> {
        Binding(get: { model.schedule.days[index].hour }, set: { model.schedule.days[index].hour = $0 })
    }
    private func dayMinuteBinding(_ index: Int) -> Binding<Int> {
        Binding(get: { model.schedule.days[index].minute }, set: { model.schedule.days[index].minute = $0 })
    }
    private var trainCard: some View {
        card {
            HStack { Text("終電アラート").font(.headline); Spacer(); badge(model.saved.trainID == nil ? "未セット" : "セット中") }
            Text("\(model.saved.origin.isEmpty ? "出発駅を選択" : model.saved.origin) → \(model.saved.home.isEmpty ? "到着駅を選択" : model.saved.home)")
                .font(.title2.bold())
            if model.saved.trainID == nil {
                VStack(alignment: .leading, spacing: 12) {
                    stationInput("出発：今いる駅", placeholder: "例：新宿", text: $model.saved.origin, field: .origin)
                    Image(systemName: "arrow.down").font(.title2.weight(.bold)).foregroundStyle(.secondary)
                    stationInput("到着：自宅の最寄り駅", placeholder: "例：調布", text: $model.saved.home, field: .home)
                    Toggle("発車日時を手動で入力", isOn: $manualTrain)
                    if manualTrain {
                        Text("公式時刻表で確認した発車日時を入力してください。")
                            .font(.footnote).foregroundStyle(.secondary)
                        DatePicker("発車日時（日本時間）", selection: $model.saved.departure, displayedComponents: [.date, .hourAndMinute])
                            .environment(\.timeZone, TimeZone(identifier: "Asia/Tokyo")!)
                    } else {
                        Button("終電を検索") {
                            trainField = nil
                            Task { await model.searchTrain() }
                        }.buttonStyle(.borderedProminent)
                        Text("首都圏の提供時刻表から、乗り換え2回までを検索します。運休・遅延は反映されません。")
                            .font(.footnote).foregroundStyle(.secondary)
                    }
                    Picker("何分前に知らせるか", selection: $model.saved.leadMinutes) {
                        ForEach([10,15,20,30], id: \.self) { Text("\($0)分前").tag($0) }
                    }
                }.disabled(model.busy || model.trainLoading)
                if model.trainLoading { ProgressView(model.trainStatus) }
                else if !model.trainStatus.isEmpty {
                    Text(model.trainStatus).font(.footnote).foregroundStyle(.orange)
                    if model.stationNames.isEmpty {
                        Button("駅データを再読み込み") { Task { await model.loadStations() } }
                    }
                }
                if !manualTrain, let plan = model.matchingTrainPlan { trainItinerary(plan) }
                if manualTrain || model.matchingTrainPlan != nil {
                    Button(manualTrain ? "入力した時刻で通知をセット" : "この終電で通知をセット") {
                        Task { await model.scheduleTrain(useSearchResult: !manualTrain) }
                    }.buttonStyle(.borderedProminent).disabled(model.busy || model.trainLoading)
                }
            } else {
                TimelineView(.periodic(from: .now, by: 1)) { timeline in
                    Text("出発まで \(remaining(until: model.saved.departure, now: timeline.date))")
                        .font(.title2.monospacedDigit())
                }
                Text("\(trainDate(model.saved.departure))発 · \(model.saved.leadMinutes)分前に通知")
                if let plan = model.matchingTrainPlan { trainItinerary(plan) }
                Button("解除", role: .destructive) { model.cancel(train: true) }.disabled(model.busy)
            }
            if let decision = model.saved.trainDecision { Text(decision).foregroundStyle(.secondary) }
        }
        .task { if model.saved.trainID == nil { await model.loadStations() } }
        .onChange(of: model.saved.origin) { _, _ in model.trainInputChanged() }
        .onChange(of: model.saved.home) { _, _ in model.trainInputChanged() }
        .onChange(of: manualTrain) { _, _ in model.saved.trainPlan = nil; model.trainStatus = "" }
    }
    private func stationInput(_ title: String, placeholder: String, text: Binding<String>, field: TrainField) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(.subheadline)
            TextField(placeholder, text: text).textFieldStyle(.roundedBorder).focused($trainField, equals: field)
                .autocorrectionDisabled()
            if !manualTrain, trainField == field, !text.wrappedValue.isEmpty {
                ForEach(model.stationNames.filter { $0.contains(text.wrappedValue.trimmingCharacters(in: .whitespaces)) && $0 != text.wrappedValue }.prefix(6), id: \.self) { name in
                    Button(name) { text.wrappedValue = name; trainField = nil }
                        .font(.subheadline).frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
    }
    private func trainItinerary(_ plan: TrainPlan) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("\(trainDate(plan.leaveAt)) 発 → \(trainTime(plan.arriveAt)) 着").font(.headline)
            ForEach(Array(plan.legs.enumerated()), id: \.offset) { index, leg in
                VStack(alignment: .leading, spacing: 4) {
                    if index > 0 { Text("\(leg.from)で乗り換え").font(.caption).foregroundStyle(.orange) }
                    Text("\(leg.from) \(trainTime(leg.departAt)) → \(leg.to) \(trainTime(leg.arriveAt))")
                    Text([leg.line, leg.trainType, leg.headsign].filter { !$0.isEmpty }.joined(separator: "・"))
                        .font(.footnote).foregroundStyle(.secondary)
                }
            }
            Text("検索日時：\(trainDate(plan.checkedAt))（日本時間・保存済みの検索結果）")
                .font(.caption).foregroundStyle(.secondary)
            Text("出典：公共交通オープンデータセンター（ODPT）。乗車前に鉄道会社の運行情報もご確認ください。")
                .font(.caption).foregroundStyle(.secondary)
        }
    }
    private func trainDate(_ date: Date) -> String {
        date.formatted(Date.FormatStyle(date: .abbreviated, time: .shortened, locale: Locale(identifier: "ja_JP"), timeZone: TimeZone(identifier: "Asia/Tokyo")!))
    }
    private func trainTime(_ date: Date) -> String {
        date.formatted(Date.FormatStyle(date: .omitted, time: .shortened, locale: Locale(identifier: "ja_JP"), timeZone: TimeZone(identifier: "Asia/Tokyo")!))
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
                if let problem = model.problem {
                    let actual = problem.difficulty ?? model.currentDifficulty
                    Text("\(model.attempts)問目 ／ \(actual.rawValue)" + (actual != model.currentDifficulty ? "・解きやすい問題" : "") + (model.eased ? "（難易度を下げました）" : ""))
                }
                    .foregroundStyle(.secondary)
                if let problem = model.problem { NativeProblemView(problem: problem) }
                TextField("整数で答える", text: $model.answer).textFieldStyle(.roundedBorder)
                    .keyboardType(.numbersAndPunctuation).focused($answerFocused).onSubmit { Task { await model.submit() } }
                Button("解答する") { Task { await model.submit() } }.buttonStyle(.borderedProminent).disabled(model.busy)
                Button("今日は中止", role: .destructive) { Task { await model.stopToday() } }.disabled(model.busy)
                Text("中止すると残りの確認アラームも取り消します。起床成功には記録しません。繰り返しの予定は残ります。")
                    .font(.footnote).foregroundStyle(.secondary)
                Text(model.feedback).foregroundStyle(.orange)
                if let error = model.error { Text(error).foregroundStyle(.red) }
            }.padding(24)
        }.background(NightBackground()).tint(accent).interactiveDismissDisabled()
            .task { answerFocused = true }
    }
}

private struct ExplicitTimePicker: View {
    @Binding var hour: Int
    @Binding var minute: Int
    private var period: Int { hour < 12 ? 0 : 1 }
    private var hour12: Int { hour % 12 == 0 ? 12 : hour % 12 }
    var body: some View {
        VStack(spacing: 10) {
            HStack(spacing: 8) {
                periodButton("午前", value: 0)
                periodButton("午後", value: 1)
            }
            HStack(spacing: 10) {
                Picker("時", selection: Binding(get: { hour12 }, set: { hour = $0 % 12 + period * 12 })) {
                    ForEach(1...12, id: \.self) { Text("\($0)時").tag($0) }
                }
                .pickerStyle(.menu).frame(maxWidth: .infinity)
                Picker("分", selection: $minute) {
                    ForEach(0..<60, id: \.self) { Text(String(format: "%02d分", $0)).tag($0) }
                }
                .pickerStyle(.menu).frame(maxWidth: .infinity)
            }
            .font(.title3.monospacedDigit().weight(.semibold))
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("時刻")
    }
    private func periodButton(_ title: String, value: Int) -> some View {
        Button {
            hour = hour % 12 + value * 12
        } label: {
            Text(title).fontWeight(.bold).frame(maxWidth: .infinity).padding(.vertical, 10)
                .foregroundStyle(period == value ? .black : .primary)
                .background(period == value ? Color.orange : Color.secondary.opacity(0.14), in: RoundedRectangle(cornerRadius: 10))
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(period == value ? Color.orange : Color.secondary.opacity(0.35)))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(period == value ? .isSelected : [])
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
