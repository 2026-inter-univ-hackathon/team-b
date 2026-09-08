//画面制御・タイマーなど全体の進行
// ---------- 状態 ----------
const state = {
  alarm: { time: "07:30", armed: false, genres: ["math", "code"] },
  log: [],
};

const session = { problem: null, attempts: 0, startedAt: 0, eased: false, easeTimer: null };
const EASE_AFTER_MS = 5 * 60 * 1000;

let watchTimer = null;
let targetAt = null;

function setScreen(name) { document.body.dataset.state = name; }
function persist() { Store.save(state); }
function selectedGenres() {
  return [...document.querySelectorAll('input[name="genre"]:checked')].map((el) => el.value);
}
function applyGenresToForm() {
  document.querySelectorAll('input[name="genre"]').forEach((el) => {
    el.checked = state.alarm.genres.includes(el.value);
  });
}

// ---------- 監視 ----------
function nextOccurrence(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
  return d;
}

function missedOccurrence() {
  const armedAt = state.alarm.armedAt;
  if (!armedAt) return null;
  const [h, m] = state.alarm.time.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  if (d.getTime() > Date.now()) d.setDate(d.getDate() - 1);
  const t = d.getTime();
  if (t <= armedAt) return null;
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
  startWatching(Date.now() + 10 * 1000);
}

// ---------- 鳴動 ----------
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
  session.easeTimer = setTimeout(() => {
    session.eased = true;
    $("#attempts").textContent += "（難易度を下げました）";
  }, EASE_AFTER_MS);
  Sound.start();
  Attention.start();
  setScreen("ringing");
  showProblem();
}

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
  input.classList.remove("wrong");
  void input.offsetWidth;
  input.classList.add("wrong");
  setTimeout(showProblem, 450);
}

// ---------- 停止・ログ ----------
function todayKey(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function weeklyCount() {
  const since = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const days = new Set(
    state.log.filter((e) => new Date(e.date).getTime() >= since).map((e) => e.date)
  );
  return days.size;
}

function renderLog() {
  const ul = $("#log");
  ul.textContent = "";
  state.log.slice(-5).reverse().forEach((e) => {
    const li = document.createElement("li");
    li.textContent = `${e.date} ${e.attempts}問目で正解 ${e.seconds}秒` + (e.eased ? " 難易度↓" : "");
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
    const missedAt = missedOccurrence();
    if (missedAt) {
      $("#missed-text").textContent = `${state.alarm.time} を過ぎています（${formatRemaining(Date.now() - missedAt)} 前）。今すぐ鳴らしますか？`;
      $("#missed").hidden = false;
    }
  }
});