// 状態管理・タイマー・音・保存。フレームワークなし。
// 状態: setup → armed → ringing → done

const STORAGE_KEY = "rikei-alarm";

// ---------- 保存 ----------
// Safari の file:// では localStorage が使えないことがあるので、失敗しても動作を続ける
const Store = {
  load() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
    catch { return {}; }
  },
  save(data) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); return true; }
    catch { return false; }
  },
};

// ---------- 音 ----------
// 音声ファイルは持たない。880Hz と 1100Hz を 0.25 秒ずつ交互に鳴らす
// 音量は 0.1 から始めて 30 秒ごとに 0.1 ずつ上げ、0.6 で止める
const Sound = {
  ctx: null,
  osc: null,
  gain: null,
  timer: null,
  rampTimer: null,
  // 自動再生制限を回避するため、必ずユーザー操作の中で呼ぶ
  init() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === "suspended") this.ctx.resume();
  },
  start() {
    this.init();
    if (this.osc) return;
    this.gain = this.ctx.createGain();
    this.gain.gain.value = 0.1;
    this.osc = this.ctx.createOscillator();
    this.osc.type = "square";
    this.osc.connect(this.gain).connect(this.ctx.destination);
    this.osc.start();
    this.rampTimer = setInterval(() => {
      const next = Math.min(0.6, this.gain.gain.value + 0.1);
      this.gain.gain.setValueAtTime(next, this.ctx.currentTime);
    }, 30 * 1000);
    let high = false;
    const flip = () => {
      this.osc.frequency.setValueAtTime(high ? 880 : 1100, this.ctx.currentTime);
      high = !high;
    };
    flip();
    this.timer = setInterval(flip, 250);
  },
  stop() {
    if (!this.osc) return;
    clearInterval(this.timer);
    clearInterval(this.rampTimer);
    this.osc.stop();
    this.osc.disconnect();
    this.osc = null;
    this.gain = null;
  },
};

// ---------- 気づかせる ----------
// 別タブを見ていても気づけるように、タブのタイトルを点滅させる。通知は取れたときだけ
const Attention = {
  baseTitle: document.title,
  timer: null,
  start() {
    let on = true;
    this.timer = setInterval(() => {
      document.title = on ? "⏰ 起きろ" : this.baseTitle;
      on = !on;
    }, 800);
    this.notify();
  },
  stop() {
    clearInterval(this.timer);
    document.title = this.baseTitle;
  },
  // 権限はユーザー操作（セット）の中で取る。file:// では取れないこともあるので失敗は無視する
  requestPermission() {
    try {
      if ("Notification" in window && Notification.permission === "default") Notification.requestPermission();
    } catch { /* 取れなくても動作に影響しない */ }
  },
  notify() {
    try {
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification("リケイアラーム", { body: "起きろ。問題を解くまで止まらない。" });
      }
    } catch { /* 同上 */ }
  },
};

// ---------- 状態 ----------
// localStorage["rikei-alarm"] にこの形で保存する
const state = {
  alarm: { time: "07:30", armed: false, genres: ["math", "code"] },
  log: [],
};

// 鳴動中だけ使う一時状態（保存しない）
// eased: 5分経っても正解できず、難易度を下げたか（ログに残す）
const session = { problem: null, attempts: 0, startedAt: 0, eased: false, easeTimer: null };
const EASE_AFTER_MS = 5 * 60 * 1000;

// 監視タイマー
let watchTimer = null;
// 鳴らす時刻（epoch ms）。デモ用の「10秒後」もここに入れる
let targetAt = null;

const $ = (sel) => document.querySelector(sel);
const pad2 = (n) => String(n).padStart(2, "0");

function setScreen(name) {
  document.body.dataset.state = name;
}

function persist() {
  Store.save(state);
}

function selectedGenres() {
  return [...document.querySelectorAll('input[name="genre"]:checked')].map((el) => el.value);
}

function applyGenresToForm() {
  document.querySelectorAll('input[name="genre"]').forEach((el) => {
    el.checked = state.alarm.genres.includes(el.value);
  });
}

// ---------- 監視 ----------

// "07:30" から、次にその時刻になる Date を返す。今日をもう過ぎていれば明日
function nextOccurrence(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
  return d;
}

// セットしてから今までの間に設定時刻があったなら、その時刻（epoch ms）を返す。なければ null
function missedOccurrence() {
  const armedAt = state.alarm.armedAt;
  if (!armedAt) return null;
  const [h, m] = state.alarm.time.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  // 今日の設定時刻がまだ来ていなければ昨日を見る
  if (d.getTime() > Date.now()) d.setDate(d.getDate() - 1);
  const t = d.getTime();
  if (t <= armedAt) return null;
  // すでに今日起きた記録があれば聞かない
  if (state.log.some((e) => e.date === todayKey(new Date(t)))) return null;
  return t;
}

function formatClock(d) {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

function formatRemaining(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h} 時間 ${m} 分`;
  if (m > 0) return `${m} 分 ${s} 秒`;
  return `${s} 秒`;
}

function tick() {
  const now = Date.now();
  $("#now").textContent = formatClock(new Date(now));
  if (targetAt === null) return;
  const t = new Date(targetAt);
  $("#countdown").textContent = `${pad2(t.getHours())}:${pad2(t.getMinutes())} まであと ${formatRemaining(targetAt - now)}`;
  if (now >= targetAt) {
    stopWatching();
    startRinging();
  }
}

function startWatching(at) {
  targetAt = at;
  clearInterval(watchTimer);
  watchTimer = setInterval(tick, 1000);
  tick();
  setScreen("armed");
}

function stopWatching() {
  clearInterval(watchTimer);
  watchTimer = null;
  targetAt = null;
}

function arm() {
  Sound.init();
  Attention.requestPermission();
  state.alarm.time = $("#alarm-time").value || "07:30";
  state.alarm.genres = selectedGenres();
  state.alarm.armed = true;
  state.alarm.armedAt = Date.now();
  persist();
  startWatching(nextOccurrence(state.alarm.time).getTime());
}

function disarm() {
  stopWatching();
  state.alarm.armed = false;
  persist();
  setScreen("setup");
}

function armDemo() {
  Sound.init();
  state.alarm.genres = selectedGenres();
  // デモは保存しない。リロードで「10秒後」が復元されても意味がないため
  startWatching(Date.now() + 10 * 1000);
}

// ---------- 鳴動 ----------

// 行列を縦書きの括弧つきで描画する。列数は CSS 変数で渡す
function renderMatrix(rows) {
  const el = document.createElement("span");
  el.className = "matrix";
  el.style.setProperty("--cols", rows[0].length);
  for (const row of rows) {
    for (const v of row) {
      const cell = document.createElement("span");
      cell.textContent = String(v).replace("-", "−");
      el.appendChild(cell);
    }
  }
  return el;
}

function showProblem() {
  session.problem = Problems.generate(state.alarm.genres, session.eased ? "easy" : "normal");
  session.attempts += 1;
  const q = $("#question");
  q.textContent = "";
  const text = session.problem.text;
  if (typeof text === "string") {
    q.textContent = text;
  } else if (text.matrix) {
    q.appendChild(renderMatrix(text.matrix));
    q.appendChild(document.createTextNode(" " + text.suffix));
  } else {
    const pre = document.createElement("pre");
    pre.textContent = text.pre;
    q.appendChild(pre);
  }
  $("#attempts").textContent = `${session.attempts}問目` + (session.eased ? "（難易度を下げました）" : "");
  const input = $("#answer");
  input.value = "";
  input.classList.remove("wrong");
  input.focus();
}

function startRinging() {
  session.attempts = 0;
  session.startedAt = Date.now();
  session.eased = false;
  // 5分正解できなければ難易度を下げる。寝たまま諦めさせないため。下げたことはログに残す
  session.easeTimer = setTimeout(() => {
    session.eased = true;
    $("#attempts").textContent += "（難易度を下げました）";
  }, EASE_AFTER_MS);
  Sound.start();
  Attention.start();
  setScreen("ringing");
  showProblem();
}

// 鳴動中はフォーカスを入力欄に戻し続ける。寝ぼけてマウスを探させない
document.addEventListener("click", () => {
  if (document.body.dataset.state === "ringing") $("#answer").focus();
});

function onAnswer(ev) {
  ev.preventDefault();
  const input = $("#answer");
  if (Problems.isCorrect(session.problem, input.value)) {
    finish();
    return;
  }
  // 不正解: 震わせてから次の問題。アニメーションを再発火させるため一度クラスを外す
  input.classList.remove("wrong");
  void input.offsetWidth;
  input.classList.add("wrong");
  setTimeout(showProblem, 450);
}

// ---------- 停止・ログ ----------

function todayKey(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// 直近7日間の起床回数（同じ日は1回と数える）
function weeklyCount() {
  const since = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const days = new Set(
    state.log.filter((e) => new Date(e.date).getTime() >= since).map((e) => e.date)
  );
  return days.size;
}

// 直近5件を新しい順に表示
function renderLog() {
  const ul = $("#log");
  ul.textContent = "";
  state.log.slice(-5).reverse().forEach((e) => {
    const li = document.createElement("li");
    li.textContent = `${e.date}　${e.attempts}問目で正解　${e.seconds}秒` + (e.eased ? "　難易度↓" : "");
    ul.appendChild(li);
  });
}

function finish() {
  Sound.stop();
  Attention.stop();
  clearTimeout(session.easeTimer);
  const seconds = Math.round((Date.now() - session.startedAt) / 1000);
  state.log.push({ date: todayKey(), attempts: session.attempts, seconds, eased: session.eased });
  state.alarm.armed = false;
  persist();
  $("#result").textContent = `${session.attempts}問目で正解、${seconds}秒` + (session.eased ? "（難易度を下げて）" : "");
  $("#weekly").textContent = `今週 ${weeklyCount()} 回自力起床`;
  renderLog();
  setScreen("done");
}

// 鳴動中にページを離れようとしたら確認ダイアログを出す
window.addEventListener("beforeunload", (ev) => {
  if (document.body.dataset.state === "ringing") {
    ev.preventDefault();
    ev.returnValue = "";
  }
});

// ---------- 起動 ----------

document.addEventListener("DOMContentLoaded", () => {
  const saved = Store.load();
  if (saved.alarm) Object.assign(state.alarm, saved.alarm);
  if (Array.isArray(saved.log)) state.log = saved.log;

  $("#alarm-time").value = state.alarm.time;
  applyGenresToForm();

  $("#btn-set").addEventListener("click", arm);
  $("#btn-demo").addEventListener("click", armDemo);
  $("#btn-disarm").addEventListener("click", disarm);
  $("#btn-enable-sound").addEventListener("click", () => {
    Sound.init();
    $("#armed-note").hidden = true;
  });
  $("#answer-form").addEventListener("submit", onAnswer);
  $("#btn-again").addEventListener("click", () => setScreen("setup"));

  // 動作確認ボタン（開発用）
  $("#btn-check-beep").addEventListener("click", () => {
    Sound.start();
    setTimeout(() => Sound.stop(), 1000);
    $("#check-result").textContent = "ビープ: 鳴っていれば OK";
  });
  $("#btn-check-storage").addEventListener("click", () => {
    const stamp = new Date().toISOString();
    const ok = Store.save({ ...Store.load(), _check: stamp });
    const back = Store.load()._check === stamp;
    $("#check-result").textContent = ok && back
      ? `localStorage: OK（${stamp} を保存して読み戻せた）`
      : "localStorage: NG（保存できない。発表は Chrome に固定する）";
  });

  // リロードしても監視中に戻る。ただし AudioContext はユーザー操作なしでは作れないので、
  // 鳴動時に音が出ない可能性がある。監視画面に注意書きを出す
  $("#btn-ring-now").addEventListener("click", () => {
    Sound.init();
    $("#missed").hidden = true;
    stopWatching();
    startRinging();
  });
  $("#btn-ring-tomorrow").addEventListener("click", () => {
    $("#missed").hidden = true;
  });

  if (state.alarm.armed) {
    startWatching(nextOccurrence(state.alarm.time).getTime());
    $("#armed-note").hidden = false;
    // セット後に一度も鳴らないまま設定時刻を過ぎていたら（スリープ・再起動など）、人に選ばせる
    const missedAt = missedOccurrence();
    if (missedAt) {
      $("#missed-text").textContent = `${state.alarm.time} を過ぎています（${formatRemaining(Date.now() - missedAt)} 前）。今すぐ鳴らしますか？`;
      $("#missed").hidden = false;
    }
  }
});
