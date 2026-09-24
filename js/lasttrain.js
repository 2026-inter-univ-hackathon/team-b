// 終電アラート
// 現在地（または今いる駅）から自宅最寄り駅への終電を調べ、出発すべき時刻の N 分前に鳴らす。
// 帰るかどうかの最後の判断は人がする。
//
// 時刻表は公共交通オープンデータセンター（ODPT）から取り、探索は js/odpt.js で自前で行う
// （駅すぱあとフリー・NAVITIME RapidAPI・Google Routes は実ダイヤの終電が出せず却下済み。CLAUDE.md 参照）。
// 通常キーでメトロ・都営、チャレンジキーでJR・私鉄の提供時刻表を使う。

const LastTrain = {
  // 保存する設定。main.js の state に相乗りし、同じ localStorage キーに入る
  defaults: { homeStation: "", alertMinutes: 15, plan: null },
  timer: null,
  blinkTimer: null,
  ringing: false,

  get settings() {
    if (!state.lastTrain) state.lastTrain = { ...this.defaults };
    return state.lastTrain;
  },

  // ---------- 入力 ----------

  // 出発駅名。Chrome は file:// で位置情報を取れないので、駅名の手入力を優先する
  async currentOrigin(network, typedStation) {
    if (typedStation.trim()) {
      const name = LastTrainSearch.normalizeName(network, typedStation);
      if (!name) throw new Error(`「${typedStation.trim()}」は対応データにありません${ODPT.hasToken() ? "（首都圏の路線のみ）" : "（トークン未設定のため都営線のみ）"}`);
      return name;
    }
    const pos = await new Promise((resolve, reject) => {
      if (!("geolocation" in navigator)) {
        reject(new Error("この環境では位置情報が使えません。今いる駅名を入力してください"));
        return;
      }
      navigator.geolocation.getCurrentPosition(resolve,
        () => reject(new Error("位置情報を取得できませんでした。今いる駅名を入力してください")),
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 });
    });
    const near = LastTrainSearch.nearestStation(network, pos.coords.latitude, pos.coords.longitude);
    if (!near) throw new Error("近くに対応路線の駅がありません。今いる駅名を入力してください");
    return near.title;
  },

  // 探索結果を画面と監視で使う形にする
  toPlan(origin, result, homeStation) {
    if (result.noRoute) return { noRoute: true, homeStation, originStation: origin };
    return {
      walkOnly: false,
      homeStation,
      originStation: origin,
      leaveAt: result.leaveAt,
      arriveAt: result.arriveAt,
      legs: result.legs,
      calendar: result.calendar,
      checkedAt: Date.now(),
    };
  },

  // ---------- 監視 ----------

  async check() {
    if (!navigator.onLine) {
      this.showError("終電の検索には通信が必要です。保存済みの結果は最新の運行情報ではありません。");
      return;
    }
    const home = $("#home-station").value;
    if (!home.trim()) {
      this.showError("自宅の最寄り駅を入力してください");
      return;
    }
    Sound.init();
    Attention.requestPermission();
    this.settings.homeStation = home.trim();
    this.settings.alertMinutes = Number($("#alert-minutes").value) || 15;
    persist();
    this.setStatus(ODPT.hasToken() ? "路線と駅のデータを読み込んでいます…" : "トークン未設定のため都営線のみ対応。時刻表（約 27MB）を読み込んでいます…");
    $("#btn-lasttrain-check").disabled = true;
    try {
      const network = await ODPT.network();
      const home = LastTrainSearch.normalizeName(network, this.settings.homeStation);
      if (!home) throw new Error(`「${this.settings.homeStation}」は対応データにありません${ODPT.hasToken() ? "（首都圏の路線のみ）" : "（トークン未設定のため都営線のみ）"}`);
      const origin = await this.currentOrigin(network, $("#current-station").value);
      let plan;
      if (origin === home) {
        // 今いる駅が自宅最寄り駅なら電車は要らない
        plan = { walkOnly: true, homeStation: home };
      } else {
        this.setStatus(`${origin} → ${home} の終電を時刻表から探しています…`);
        plan = this.toPlan(origin, await LastTrainSearch.search(network, origin, home, new Date(), 2), home);
      }
      if (plan.noRoute) throw new Error(`${origin} → ${home} は乗り換え 2 回までの経路が見つかりません`);
      if (!plan.walkOnly && plan.leaveAt <= Date.now()) throw new Error(`今日の終電（${this.hhmm(plan.leaveAt)} ${plan.originStation} 発）はもう出ています`);
      this.settings.plan = plan;
      persist();
      this.render();
      if (!plan.walkOnly) this.watch();
    } catch (e) {
      this.showError(e.message);
    } finally {
      $("#btn-lasttrain-check").disabled = false;
    }
  },

  watch() {
    clearInterval(this.timer);
    this.timer = setInterval(() => this.tick(), 1000);
    this.tick();
  },

  unwatch() {
    clearInterval(this.timer);
    this.timer = null;
  },

  tick() {
    const plan = this.settings.plan;
    if (!plan || plan.walkOnly) { this.unwatch(); return; }
    const alertAt = plan.leaveAt - this.settings.alertMinutes * 60 * 1000;
    this.renderCountdown();
    if (!plan.decision && !this.ringing && Date.now() >= alertAt) this.ring();
  },

  // ---------- 通知 ----------

  ring() {
    this.ringing = true;
    Sound.start(state.alarm.sound, state.alarm.volume);
    let on = true;
    this.blinkTimer = setInterval(() => {
      document.title = on ? "🚃 終電" : Attention.baseTitle;
      on = !on;
    }, 800);
    try {
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification("終電が近づいています", { body: this.summary() });
      }
    } catch { /* 通知が取れなくても画面と音で知らせる */ }
    $("#lasttrain-alert-text").textContent = this.summary();
    $("#lasttrain-alert").hidden = false;
  },

  // 人が「帰る／帰らない」を選んだら止める。どちらを選んでも同じ動作で、記録だけ違う
  dismiss(going) {
    Sound.stop();
    clearInterval(this.blinkTimer);
    document.title = Attention.baseTitle;
    $("#lasttrain-alert").hidden = true;
    this.ringing = false;
    this.unwatch();
    const plan = this.settings.plan;
    if (plan) plan.decision = going ? "going" : "staying";
    persist();
    this.render();
  },

  clear() {
    this.dismiss(false);
    this.settings.plan = null;
    persist();
    this.render();
  },

  // ---------- 表示 ----------

  hhmm(ms) {
    const d = new Date(ms);
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  },

  summary() {
    const p = this.settings.plan;
    if (!p || p.walkOnly || !p.legs) return "";
    const legs = p.legs.map((l) => `${l.from} ${this.hhmm(l.departAt)} 発 ${l.line}${l.trainType ? " " + l.trainType : ""}${l.headsign ? "（" + l.headsign + "）" : ""} → ${l.to} ${this.hhmm(l.arriveAt)} 着`);
    const via = p.legs.length > 1 ? `${p.legs.slice(0, -1).map((leg) => leg.to).join("、")} で乗り換え。` : "";
    return `${via}${legs.join("、")}`;
  },

  setStatus(text) {
    $("#lasttrain-status").textContent = text;
    $("#lasttrain-status").classList.remove("error");
  },

  showError(text) {
    $("#lasttrain-status").textContent = text;
    $("#lasttrain-status").classList.add("error");
  },

  renderCountdown() {
    const p = this.settings.plan;
    const el = $("#lasttrain-countdown");
    if (!p || p.walkOnly) { el.textContent = ""; return; }
    if (p.decision) { el.textContent = "通知終了"; return; }
    const seconds = Math.max(0, Math.ceil((p.leaveAt - Date.now()) / 1000));
    if (!seconds) { el.textContent = "出発時刻を過ぎました"; return; }
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor(seconds / 60) % 60;
    el.textContent = `${hours ? pad2(hours) + ":" : ""}${pad2(minutes)}:${pad2(seconds % 60)}`;
  },

  renderItinerary() {
    const list = $("#lasttrain-itinerary");
    list.replaceChildren();
    const p = this.settings.plan;
    if (!p || p.walkOnly || !p.legs || !p.legs.length) return;
    const stop = (name, time, detail) => {
      const li = document.createElement("li");
      const row = document.createElement("div");
      row.className = "itinerary-stop";
      const station = document.createElement("strong");
      station.textContent = name;
      const clock = document.createElement("span");
      clock.className = "itinerary-time";
      clock.textContent = time;
      row.append(station, clock);
      li.append(row);
      if (detail) {
        const text = document.createElement("p");
        text.className = "itinerary-detail";
        text.textContent = detail;
        li.append(text);
      }
      list.append(li);
    };
    p.legs.forEach((leg, index) => {
      const previous = p.legs[index - 1];
      const ride = Math.round((leg.arriveAt - leg.departAt) / 60000);
      const transfer = previous ? `乗り換え ${Math.round((leg.departAt - previous.arriveAt) / 60000)}分・` : "";
      const time = previous ? `${this.hhmm(previous.arriveAt)} 着 → ${this.hhmm(leg.departAt)} 発` : `${this.hhmm(leg.departAt)} 発`;
      stop(leg.from, time, `${transfer}${leg.line}${leg.trainType ? " " + leg.trainType : ""}${leg.headsign ? "・" + leg.headsign : ""}・乗車${ride}分`);
    });
    const last = p.legs[p.legs.length - 1];
    stop(last.to, `${this.hhmm(last.arriveAt)} 着`, "到着");
  },

  renderRoute() {
    const p = this.settings.plan;
    const home = $("#home-station").value.trim();
    const origin = $("#current-station").value.trim();
    $("#train-route").textContent = p && !p.walkOnly ? `${p.originStation} → ${p.homeStation}` : home ? `${origin || "出発駅を選択"} → ${home}` : "帰る時間を決める";
  },

  render() {
    const p = this.settings.plan;
    const result = $("#lasttrain-result");
    this.renderItinerary();
    this.renderCountdown();
    this.renderRoute();
    $("#train-status").textContent = !p ? "未セット" : p.walkOnly ? "電車は不要" : p.decision ? "確認済み" : "セット中";
    $("#btn-lasttrain-clear").hidden = !p;
    if (!p) {
      $("#lasttrain-checked").textContent = "";
      result.hidden = true;
      this.setStatus("");
      return;
    }
    result.hidden = !!p.walkOnly;
    if (p.walkOnly) {
      $("#lasttrain-checked").textContent = "";
      this.setStatus(`${p.homeStation}駅の近くにいます。電車は不要です`);
      $("#lasttrain-summary").textContent = "";
      $("#lasttrain-countdown").textContent = "";
      return;
    }
    this.setStatus(p.decision === "going" ? "帰ることにしました" : p.decision === "staying" ? "今日は帰らないことにしました" : `${this.hhmm(p.leaveAt - this.settings.alertMinutes * 60000)} に知らせます`);
    $("#lasttrain-summary").textContent = this.summary();
    $("#lasttrain-checked").textContent = p.checkedAt ? `検索日時: ${new Date(p.checkedAt).toLocaleString("ja-JP")}（保存済みの時刻表検索結果）` : "";
  },

  init() {
    const s = this.settings;
    $("#home-station").value = s.homeStation || "";
    $("#home-station").addEventListener("input", () => this.renderRoute());
    $("#current-station").addEventListener("input", () => this.renderRoute());

    $("#alert-minutes").value = String(s.alertMinutes || 15);
    $("#btn-lasttrain-check").addEventListener("click", () => this.check());
    $("#btn-lasttrain-clear").addEventListener("click", () => this.clear());
    $("#btn-lasttrain-go").addEventListener("click", () => this.dismiss(true));
    $("#btn-lasttrain-stay").addEventListener("click", () => this.dismiss(false));
    this.render();
    if (!s.plan && !ODPT.hasToken()) this.setStatus("現在は都営線のみ検索できます。京王線などの対応は準備中です。");
    // リロードしても、まだ判断していない計画が残っていれば監視を続ける
    if (s.plan && !s.plan.walkOnly && !s.plan.decision && s.plan.leaveAt > Date.now()) this.watch();
  },
};

document.addEventListener("DOMContentLoaded", () => LastTrain.init());
