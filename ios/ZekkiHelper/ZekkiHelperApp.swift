import SwiftUI

@main
struct ZekkiHelperApp: App {
    @State private var model = AppModel()
    var body: some Scene {
        WindowGroup { HomeView(model: model) }
    }
}

struct HomeView: View {
    @Bindable var model: AppModel
    @Environment(\.scenePhase) private var scenePhase
    @State private var alarmExpanded = false
    @State private var trainExpanded = true
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    Text("明日の朝と、今日の帰り道。")
                        .foregroundStyle(.secondary)
                    card {
                        HStack { Label("目覚まし", systemImage: "alarm"); Spacer(); badge(model.saved.wakeID == nil ? "未セット" : "セット中") }
                        Text(model.wakeTime, style: .time).font(.system(size: 52, weight: .bold, design: .rounded))
                        Text("\(model.saved.genre.rawValue) ／ \(model.saved.difficulty.rawValue)").foregroundStyle(.secondary)
                        if let date = model.saved.wakeDate { Text("次のアラーム: \(date.formatted(date: .abbreviated, time: .shortened))") }
                        DisclosureGroup("時刻・問題を変更", isExpanded: $alarmExpanded) {
                            DatePicker("鳴らす時刻", selection: $model.wakeTime, displayedComponents: .hourAndMinute)
                            Picker("ジャンル", selection: $model.saved.genre) { ForEach(Genre.allCases) { Text($0.rawValue).tag($0) } }
                            Picker("難易度", selection: $model.saved.difficulty) { ForEach(Difficulty.allCases) { Text($0.rawValue).tag($0) } }
                        }.disabled(model.saved.wakeID != nil || model.busy)
                        if model.saved.wakeID == nil {
                            Button("セットする") { Task { await model.scheduleWake(); if model.saved.wakeID != nil { alarmExpanded = false } } }
                                .buttonStyle(.borderedProminent).disabled(model.busy)
                        } else {
                            Button("解除", role: .destructive) { model.cancel(train: false) }.disabled(model.busy)
                        }
                    }
                    card {
                        HStack { Label("終電アラート", systemImage: "tram"); Spacer(); badge(model.saved.trainID == nil ? "未セット" : "セット中") }
                        Text("\(model.saved.origin) → \(model.saved.home)").font(.title2.bold())
                        Text("時刻表の自動検索は準備中です。公式時刻表で確認した発車日時を入力してください。")
                            .font(.footnote).foregroundStyle(.secondary)
                        DisclosureGroup("駅・発車日時を変更", isExpanded: $trainExpanded) {
                            TextField("今いる駅", text: $model.saved.origin)
                            TextField("自宅の最寄り駅", text: $model.saved.home)
                            DatePicker("確認した発車日時", selection: $model.saved.departure, displayedComponents: [.date, .hourAndMinute])
                            Picker("何分前に知らせるか", selection: $model.saved.leadMinutes) {
                                ForEach([10,15,20,30], id: \.self) { Text("\($0)分前").tag($0) }
                            }
                        }.disabled(model.saved.trainID != nil || model.busy)
                        if model.saved.trainID == nil {
                            Button("入力した時刻で通知をセット") { Task { await model.scheduleTrain(); if model.saved.trainID != nil { trainExpanded = false } } }
                                .buttonStyle(.borderedProminent).disabled(model.busy)
                        } else {
                            Text("発車: \(model.saved.departure.formatted(date: .abbreviated, time: .shortened))・\(model.saved.leadMinutes)分前に通知")
                            Button("解除", role: .destructive) { model.cancel(train: true) }.disabled(model.busy)
                        }
                        if let decision = model.saved.trainDecision { Text(decision).foregroundStyle(.secondary) }
                    }
                    DisclosureGroup("起床の記録を見る") {
                        if model.saved.records.isEmpty { Text("まだ記録はありません") }
                        ForEach(model.saved.records.prefix(7)) { record in
                            Text("\(record.date.formatted(date: .abbreviated, time: .shortened)) · \(record.attempts)問 · \(record.seconds)秒")
                                .font(.footnote).frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                    DisclosureGroup("動作確認") {
                        Button("10秒後に鳴らす") { Task { await model.scheduleWake(demo: true) } }
                            .disabled(model.busy || model.saved.wakeID != nil)
                        Text("OSの停止操作でも音は止められます。正解したときだけ起床ログに残します。")
                            .font(.footnote).foregroundStyle(.secondary)
                    }
                }.padding().frame(maxWidth: 650)
                    .frame(maxWidth: .infinity)
            }
            .background(Color(red: 0.04, green: 0.06, blue: 0.15))
            .navigationTitle("絶起ヘルパー")
            .task { await model.observe() }
            .onChange(of: scenePhase) { _, phase in if phase == .active { model.synchronize() } }
            .fullScreenCover(isPresented: Binding(get: { model.problem != nil }, set: { _ in })) {
                QuizView(model: model)
            }
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
        }.tint(.orange).preferredColorScheme(.dark)
    }
    private func badge(_ text: String) -> some View {
        Text(text).font(.caption).padding(.horizontal, 10).padding(.vertical, 5).background(.white.opacity(0.1), in: Capsule())
    }
    private func card<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 16, content: content)
            .padding(20).frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(red: 0.11, green: 0.13, blue: 0.27), in: RoundedRectangle(cornerRadius: 24))
    }
}
struct QuizView: View {
    @Bindable var model: AppModel
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                Text("おはよう。問題を解こう。").font(.title.bold())
                Text(model.problem?.text ?? "").font(.title2.monospaced())
                TextField("整数で答える", text: $model.answer).textFieldStyle(.roundedBorder)
                    .keyboardType(.numbersAndPunctuation).onSubmit { model.submit() }
                Button("答える") { model.submit() }.buttonStyle(.borderedProminent)
                Text("\(model.attempts)問目　\(model.feedback)")
                if let error = model.error { Text(error).foregroundStyle(.red) }
            }.padding(24)
        }.interactiveDismissDisabled()
    }
}
