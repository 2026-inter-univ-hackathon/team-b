// 画面制御・タイマーなど全体の進行
// 状態: setup → armed → ringing → done

// ---------- 状態 ----------
// localStorage["zekki-helper"] にこの形で保存する
const state = {
  alarm: { time: "07:30", repeat: "once", weekdays: {}, nextAt: null, armed: false, genres: ["attention"], difficulty: "normal", sound: "beep", volume: 100 },
  log: [],
  problemStats: {},
};

// 鳴動中だけ使う一時状態（保存しない）
// eased: 5分経っても正解できず、難易度を下げたか（ログに残す）
const session = { problem: null, attempts: 0, startedAt: 0, eased: false, easeTimer: null };
const EASE_AFTER_MS = 5 * 60 * 1000;

// 監視タイマー
let watchTimer = null;
// 鳴らす時刻（epoch ms）。デモ用の「10秒後」もここに入れる
let targetAt = null;
let demoAlarm = false;
let ringingAt = null;

let activeFeature = "alarm";

function selectFeature(name, animate = false) {
  const previous = activeFeature;
  activeFeature = name === "train" ? "train" : "alarm";
  if (animate && previous !== activeFeature) {
    const effect = $("#feature-motion");
    effect.dataset.effect = "";
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // 連打した場合も、前の演出を積まずに選択先の演出を最初から再生する。
      void effect.offsetWidth;
      effect.dataset.effect = activeFeature;
    }
  }
  const train = activeFeature === "train";
  $("#alarm-panel").hidden = train;
  $("#lasttrain").hidden = !train;
  $("#wake-history").hidden = train;
  $("#alarm-check").hidden = train;
  $("#show-alarm").setAttribute("aria-pressed", String(!train));
  $("#show-train").setAttribute("aria-pressed", String(train));
  $("#background-alarm").hidden = !train || !state.alarm.armed;
  $("#background-alarm").textContent = `目覚ましは ${alarmTimeLabel()} にセット中です。`;
}

function setScreen(name) {
  document.body.dataset.state = name;
  renderAlarmCard();
}

// 設定と監視を同じカードに置く。監視中の変更は解除後に行う。
function renderAlarmCard() {
  const armed = document.body.dataset.state === "armed";
  $("#alarm-status").textContent = armed ? "セット中" : "未セット";
  $("#alarm-summary-time").textContent = alarmTimeLabel();
  $("#alarm-schedule-summary").textContent = scheduleLabel();
  const names = { attention: "文字・記号", math: "数学", physics: "物理", code: "プログラミング" };
  const sounds = { beep: "ビープ", siren: "サイレン", chime: "学校のチャイム", clock: "目覚まし時計" };
  $("#alarm-summary-options").textContent = `${state.alarm.genres.map(g => names[g]).filter(Boolean).join("・") || "全ジャンル"} ／ ${Problems.LEVEL_LABELS[state.alarm.difficulty] || "ふつう"} ／ ${sounds[state.alarm.sound] || "ビープ"}`;
  $("#alarm-fields").querySelectorAll("input, button, select").forEach(el => { el.disabled = armed; });
  $("#btn-demo").disabled = armed;
  $("#btn-check-beep").disabled = armed;
  $("#alarm-settings").hidden = armed;
  $("#volume-value").textContent = `${state.alarm.volume}%`;
  $("#difficulty-guide").textContent = {
    easy: "やさしい：短い文字列・一段の計算。数学は四則計算と一次方程式です。",
    normal: "ふつう：文字列を長くし、計算は複数の項・手順を使います。",
    hard: "むずかしい：紛らわしい文字列・多段の計算・3次の式などに挑戦します。",
  }[state.alarm.difficulty];
  renderScheduleForm();
  selectFeature(activeFeature);
  $("#home-log").replaceChildren(...[...$("#log").children].map(el => el.cloneNode(true)));
  if (!state.log.length) $("#home-log").textContent = "まだ起床の記録はありません";
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

function selectedDifficulty() {
  const el = document.querySelector('input[name="difficulty"]:checked');
  return el ? el.value : "normal";
}

function selectedSound() {
  const el = document.querySelector('input[name="sound"]:checked');
  return el ? el.value : "beep";
}

function applySoundToForm() {
  document.querySelectorAll('input[name="sound"]').forEach((el) => {
    el.checked = el.value === state.alarm.sound;
  });
}

function applyDifficultyToForm() {
  document.querySelectorAll('input[name="difficulty"]').forEach((el) => {
    el.checked = el.value === state.alarm.difficulty;
  });
}

// 保存値は従来どおり24時間表記にし、画面では午前・午後を明確に分ける。
function populateTimeControls() {
  const hour = $("#alarm-hour");
  const minute = $("#alarm-minute");
  if (hour.children.length || minute.children.length) return;
  for (let value = 1; value <= 12; value++) {
    const option = document.createElement("option");
    option.value = String(value);
    option.textContent = String(value);
    hour.appendChild(option);
  }
  for (let value = 0; value < 60; value++) {
    const option = document.createElement("option");
    option.value = pad2(value);
    option.textContent = pad2(value);
    minute.appendChild(option);
  }
}

function applyTimeToControls() {
  if (!validTime(state.alarm.time)) return;
  const [hour24, minute] = state.alarm.time.split(":").map(Number);
  $("#alarm-period-am").checked = hour24 < 12;
  $("#alarm-period-pm").checked = hour24 >= 12;
  $("#alarm-hour").value = String(hour24 % 12 || 12);
  $("#alarm-minute").value = pad2(minute);
  $("#alarm-time").value = state.alarm.time;
}

function syncTimeFromControls() {
  const hour = Number($("#alarm-hour").value);
  const minute = $("#alarm-minute").value;
  if (!Number.isInteger(hour) || hour < 1 || hour > 12 || !/^\d{2}$/.test(minute)) return;
  const hour24 = hour % 12 + ($("#alarm-period-pm").checked ? 12 : 0);
  $("#alarm-time").value = `${pad2(hour24)}:${minute}`;
}

// 今出題すべき難易度。5分正解できなかったら一段下げる
function currentLevel() {
  return session.eased ? Problems.easier(state.alarm.difficulty) : state.alarm.difficulty;
}

// ---------- 監視 ----------

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
const validTime = time => typeof time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(time);

// ローカル日付で探す。曜日別のオフと日付・週の繰り越しを同じ処理で扱う。
function nextAlarmAt(after = Date.now()) {
  for (let offset = 0; offset <= 7; offset++) {
    const date = new Date(after);
    date.setDate(date.getDate() + offset);
    const time = state.alarm.repeat === "weekly"
      ? state.alarm.weekdays[date.getDay()] : state.alarm.time;
    if (!validTime(time)) continue;
    const [h, m] = time.split(":").map(Number);
    date.setHours(h, m, 0, 0);
    if (date.getTime() > after) return date.getTime();
  }
  return null;
}

function alarmTimeLabel() {
  const at = state.alarm.armed && state.alarm.nextAt
    ? state.alarm.nextAt : state.alarm.repeat === "weekly" ? nextAlarmAt() : null;
  if (at) {
    const date = new Date(at);
    return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  }
  return state.alarm.repeat === "weekly" ? "--:--" : state.alarm.time;
}

function scheduleLabel() {
  const mode = state.alarm.repeat;
  const label = mode === "daily" ? "毎日" : mode === "weekly"
    ? [1, 2, 3, 4, 5, 6, 0].filter(day => validTime(state.alarm.weekdays[day]))
      .map(day => `${WEEKDAYS[day]} ${state.alarm.weekdays[day]}`).join(" ／ ") || "曜日を選んでください"
    : "1回だけ";
  if (!state.alarm.armed || !state.alarm.nextAt) return label;
  const date = new Date(state.alarm.nextAt);
  return `${label} · 次回 ${date.getMonth() + 1}/${date.getDate()}（${WEEKDAYS[date.getDay()]}）`;
}

function renderScheduleForm() {
  const weekly = state.alarm.repeat === "weekly";
  $("#alarm-weekdays").hidden = !weekly;
  $("#alarm-common-time").hidden = weekly;
  for (let day = 0; day < 7; day++) {
    $(`#alarm-day-time-${day}`).disabled = state.alarm.armed || !$(`#alarm-day-${day}`).checked;
  }
}

function readScheduleForm() {
  state.alarm.repeat = ["daily", "weekly"].includes($("#alarm-repeat").value) ? $("#alarm-repeat").value : "once";
  for (let day = 0; day < 7; day++) {
    state.alarm.weekdays[day] = $(`#alarm-day-${day}`).checked ? $(`#alarm-day-time-${day}`).value : null;
  }
  $("#alarm-schedule-error").hidden = true;
}

function missedOccurrence() {
  // 旧保存形式は armedAt から初回予定を復元する。
  const at = state.alarm.nextAt || (state.alarm.armedAt ? nextAlarmAt(state.alarm.armedAt) : null);
  return at && at <= Date.now() ? at : null;
}

function askMissed(at) {
  stopWatching();
  state.alarm.nextAt = at;
  persist();
  ringingAt = at;
  setScreen("armed");
  const date = new Date(at);
  $("#countdown").textContent = "設定時刻を過ぎています";
  $("#missed-text").textContent = `${date.getMonth() + 1}/${date.getDate()} ${pad2(date.getHours())}:${pad2(date.getMinutes())} を過ぎています。今すぐ鳴らしますか？`;
  $("#btn-ring-tomorrow").textContent = state.alarm.repeat === "once" ? "明日にする" : "次の予定にする";
  $("#missed").hidden = false;
}

function scheduleNext() {
  state.alarm.nextAt = nextAlarmAt();
  state.alarm.armed = state.alarm.nextAt !== null;
  persist();
  if (state.alarm.armed) startWatching(state.alarm.nextAt);
  else setScreen("setup");
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
    if (!demoAlarm && now - targetAt > 60000) { askMissed(targetAt); return; }
    ringingAt = targetAt;
    stopWatching();
    startRinging();
  }
}

function startWatching(at) {
  targetAt = at;
  clearInterval(watchTimer);
  watchTimer = setInterval(tick, 1000);
  setScreen("armed");
  tick();
}

function stopWatching() {
  clearInterval(watchTimer);
  watchTimer = null;
  targetAt = null;
}

function arm() {
  readScheduleForm();
  state.alarm.time = $("#alarm-time").value || "07:30";
  if (nextAlarmAt() === null || (state.alarm.repeat === "weekly" && Object.values(state.alarm.weekdays).some(time => time !== null && !validTime(time)))) {
    $("#alarm-schedule-error").hidden = false;
    return;
  }
  demoAlarm = false;
  Sound.init();
  Attention.requestPermission();
  state.alarm.genres = selectedGenres();
  state.alarm.difficulty = selectedDifficulty();
  state.alarm.sound = selectedSound();
  state.alarm.armed = true;
  state.alarm.armedAt = Date.now();
  scheduleNext();
}

function disarm() {
  stopWatching();
  demoAlarm = false;
  state.alarm.nextAt = null;
  state.alarm.armed = false;
  persist();
  $("#missed").hidden = true;
  $("#armed-note").hidden = true;
  setScreen("setup");
  $("#alarm-settings").hidden = false;
  $(state.alarm.repeat === "weekly" ? "#alarm-repeat" : "#alarm-hour").focus();
}

function armDemo() {
  demoAlarm = true;
  Sound.init();
  state.alarm.genres = selectedGenres();
  state.alarm.difficulty = selectedDifficulty();
  state.alarm.sound = selectedSound();
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

// 数式は通常文と分け、幅を超えるときは式全体を横にスクロールできるようにする。
function renderMathProblem(container, text) {
  const expression = document.createElement("span");
  expression.className = "math-expression";
  expression.tabIndex = 0;
  expression.setAttribute("role", "group");
  expression.setAttribute("aria-label", "数式（長い場合は横にスクロールできます）");
  if (typeof text === "string") {
    // 問いかけは式の外に置き、通常の文章として折り返す。
    const parts = text.match(/^(.*?)( のとき .*| の x は？| は？)$/);
    expression.textContent = parts ? parts[1] : text;
    container.appendChild(expression);
    if (parts) container.appendChild(document.createTextNode(parts[2]));
    return;
  }
  if (text.matrix) {
    expression.appendChild(renderMatrix(text.matrix));
  } else if (text.integral) {
    const { lower, upper, integrand } = text.integral;
    const integral = document.createElement("span");
    integral.className = "integral-symbol";
    integral.setAttribute("role", "img");
    integral.setAttribute("aria-label", `${lower}から${upper}までの定積分`);
    for (const [tag, className, value] of [["span", "integral-sign", "∫"], ["sup", "integral-upper", upper], ["sub", "integral-lower", lower]]) {
      const part = document.createElement(tag);
      part.className = className;
      part.textContent = String(value);
      part.setAttribute("aria-hidden", "true");
      integral.appendChild(part);
    }
    expression.appendChild(integral);
    expression.appendChild(document.createTextNode(` (${integrand}) dx`));
  } else if (text.combination) {
    const { n, k } = text.combination;
    const combination = document.createElement("span");
    combination.setAttribute("role", "img");
    combination.setAttribute("aria-label", `${n}個から${k}個を選ぶ組合せ`);
    for (const [tag, value] of [["sub", n], ["span", "C"], ["sub", k]]) {
      const part = document.createElement(tag);
      part.textContent = String(value);
      part.setAttribute("aria-hidden", "true");
      combination.appendChild(part);
    }
    expression.appendChild(combination);
  }
  container.appendChild(expression);
  if (text.suffix) container.appendChild(document.createTextNode(text.suffix));
}

function showProblem() {
  const baseLevel = currentLevel();
  const preferEasier = Boolean(Problems.easier(baseLevel)) && (session.attempts + 1) % 4 === 0;
  session.problem = Problems.generate(
    state.alarm.genres,
    baseLevel,
    session.problem && session.problem.type,
    state.problemStats,
    preferEasier
  );
  session.attempts += 1;
  const q = $("#question");
  q.textContent = "";
  const text = session.problem.text;
  if (session.problem.genre === "math") {
    renderMathProblem(q, text);
  } else if (typeof text === "string") {
    q.textContent = text;
  } else if (text.matrix) {
    q.appendChild(renderMatrix(text.matrix));
    q.appendChild(document.createTextNode(" " + text.suffix));
  } else {
    const pre = document.createElement("pre");
    pre.textContent = text.pre;
    q.appendChild(pre);
  }
  const actualLevel = session.problem.level || baseLevel;
  const easierNote = actualLevel !== baseLevel ? "・解きやすい問題" : "";
  $("#attempts").textContent = `${session.attempts}問目（${Problems.LEVEL_LABELS[actualLevel] || Problems.LEVEL_LABELS[baseLevel]}${easierNote}）` + (session.eased ? "　難易度を下げました" : "");
  const input = $("#answer");
  input.value = "";
  input.classList.remove("wrong");
  input.focus();
}

function startRinging() {
  const date = new Date(ringingAt || Date.now());
  $("#ringing-time").textContent = `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  session.attempts = 0;
  session.startedAt = Date.now();
  session.eased = false;
  // 5分正解できなければ難易度を一段下げる。寝たまま諦めさせないため。下げたことはログに残す
  // 「やさしい」を選んでいるときはこれ以上下げられないので何もしない
  if (Problems.easier(state.alarm.difficulty)) {
    session.easeTimer = setTimeout(() => {
      session.eased = true;
      $("#attempts").textContent += "　難易度を下げました";
    }, EASE_AFTER_MS);
  }
  Sound.start(state.alarm.sound, state.alarm.volume);
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
    recordProblemResult(true);
    finish();
    return;
  }
  recordProblemResult(false);
  // 不正解: 震わせてから次の問題。アニメーションを再発火させるため一度クラスを外す
  input.classList.remove("wrong");
  void input.offsetWidth;
  input.classList.add("wrong");
  setTimeout(showProblem, 450);
}

function recordProblemResult(correct) {
  if (demoAlarm || !session.problem || !session.problem.type) return;
  const row = state.problemStats[session.problem.type] || { correct: 0, wrong: 0 };
  row[correct ? "correct" : "wrong"] += 1;
  state.problemStats[session.problem.type] = row;
  persist();
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
    const level = e.difficulty ? `　${Problems.LEVEL_LABELS[e.difficulty] || e.difficulty}` : "";
    li.textContent = `${e.date}${level}　${e.attempts}問目で正解　${e.seconds}秒` + (e.eased ? "　難易度↓" : "");
    ul.appendChild(li);
  });
}

function finish() {
  Sound.stop();
  Attention.stop();
  clearTimeout(session.easeTimer);
  const seconds = Math.round((Date.now() - session.startedAt) / 1000);
  state.log.push({ date: todayKey(), attempts: session.attempts, seconds, eased: session.eased, difficulty: state.alarm.difficulty });
  const repeat = !demoAlarm && state.alarm.armed && state.alarm.repeat !== "once";
  state.alarm.armed = false;
  state.alarm.nextAt = null;
  if (repeat) scheduleNext();
  else persist();
  demoAlarm = false;
  $("#next-alarm-note").textContent = repeat ? `${scheduleLabel()} ${alarmTimeLabel()} に自動セットしました。` : "";
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
  if (saved.problemStats && typeof saved.problemStats === "object") state.problemStats = saved.problemStats;
  if (saved.lastTrain) state.lastTrain = saved.lastTrain;

  if (!["once", "daily", "weekly"].includes(state.alarm.repeat)) state.alarm.repeat = "once";
  if (!state.alarm.weekdays || typeof state.alarm.weekdays !== "object") state.alarm.weekdays = {};
  $("#alarm-repeat").value = state.alarm.repeat;
  for (let day = 0; day < 7; day++) {
    const time = state.alarm.weekdays[day];
    $(`#alarm-day-${day}`).checked = time === undefined ? day >= 1 && day <= 5 : validTime(time);
    $(`#alarm-day-time-${day}`).value = validTime(time) ? time : state.alarm.time;
  }
  populateTimeControls();
  applyTimeToControls();
  applyGenresToForm();
  applyDifficultyToForm();
  applySoundToForm();
  renderLog();
  renderAlarmCard();
  $("#alarm-volume").value = String(state.alarm.volume);
  $("#show-alarm").addEventListener("click", () => selectFeature("alarm", true));
  $("#show-train").addEventListener("click", () => selectFeature("train", true));
  $("#alarm-volume").addEventListener("input", () => {
    state.alarm.volume = Number($("#alarm-volume").value);
    $("#volume-value").textContent = `${state.alarm.volume}%`;
    persist();
  });
  $("#alarm-fields").addEventListener("change", () => {
    syncTimeFromControls();
    readScheduleForm();
    state.alarm.time = $("#alarm-time").value || "07:30";
    state.alarm.genres = selectedGenres();
    state.alarm.difficulty = selectedDifficulty();
    state.alarm.sound = selectedSound();
    persist();
    renderAlarmCard();
  });

  $("#btn-set").addEventListener("click", arm);
  $("#btn-demo").addEventListener("click", armDemo);
  $("#btn-disarm").addEventListener("click", disarm);
  $("#btn-enable-sound").addEventListener("click", () => {
    Sound.init();
    $("#armed-note").hidden = true;
  });
  $("#answer-form").addEventListener("submit", onAnswer);
  $("#btn-preview-sound").addEventListener("click", () => Sound.preview(selectedSound(), state.alarm.volume));
  $("#btn-again").addEventListener("click", () => { selectFeature("alarm"); setScreen(state.alarm.armed ? "armed" : "setup"); });

  // 動作確認ボタン（開発用）
  $("#btn-check-beep").addEventListener("click", () => {
    Sound.preview(selectedSound(), state.alarm.volume);
    $("#check-result").textContent = "音: 鳴っていれば OK";
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
    scheduleNext();
  });

  if (state.alarm.armed) {
    const missedAt = missedOccurrence();
    if (missedAt) askMissed(missedAt);
    else if (state.alarm.nextAt) startWatching(state.alarm.nextAt);
    else scheduleNext();
    $("#armed-note").hidden = false;
  }
});
