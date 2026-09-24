// node tests/alarm-repeat.cjs — ローカル日時・保存復元・正解後の繰り返しを検証
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('js/main.js', 'utf8');
const at = (day, time) => new Date(`${day}T${time}:00`).getTime();
function app(now, initial = {}) {
  let clock = now, saved = structuredClone(initial), init;
  const intervals = new Set(), elements = new Map();
  const node = () => ({ value: '', checked: false, hidden: false, children: [], textContent: '',
    events: {}, dataset: {}, classList: {add() {}, remove() {}},
    addEventListener(type, fn) { this.events[type] = fn; },
    querySelectorAll() { return []; }, setAttribute() {}, focus() {},
    replaceChildren(...children) { this.children = children; },
    appendChild(child) { this.children.push(child); }, cloneNode() { return node(); },
  });
  const $ = id => { if (!elements.has(id)) elements.set(id, node()); return elements.get(id); };
  $('#missed').hidden = true;
  let sounds = 0;
  const context = {
    Date: class extends Date { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } },
    $, document: {body: {dataset: {state: 'setup'}}, createElement: node,
      addEventListener(type, fn) { if (type === 'DOMContentLoaded') init = fn; },
      querySelectorAll() { return []; }, querySelector() { return null; }},
    window: {addEventListener() {}}, Store: {load: () => structuredClone(saved), save: data => { saved = structuredClone(data); return true; }},
    Sound: {init() {}, stop() {}, start() { sounds++; }}, Attention: {requestPermission() {}, start() {}, stop() {}},
    Problems: {LEVEL_LABELS: {normal: 'ふつう'}, easier: () => null, generate: () => ({text: '1 + 1', answer: 2, type: 'arithmetic', level: 'normal'}), isCorrect: (_, answer) => answer === '2'},
    pad2: n => String(n).padStart(2, '0'), setInterval(fn) { intervals.add(fn); return fn; }, clearInterval(fn) { intervals.delete(fn); }, clearTimeout() {},
  };
  vm.createContext(context);
  vm.runInContext(source + '\nthis.state = state;', context);
  init();
  return {context, $, get saved() { return saved; }, get sounds() { return sounds; }, intervals,
    advance(time) { clock = time; for (const tick of [...intervals]) tick(); },
    click(id) { $(id).events.click(); },
    answer() { $('#answer').value = '2'; $('#answer-form').events.submit({preventDefault() {}}); },
    setup(mode, days = {}) {
      $('#alarm-repeat').value = mode;
      $('#alarm-time').value = '07:30';
      for (let day = 0; day < 7; day++) { $(`#alarm-day-${day}`).checked = day in days; $(`#alarm-day-time-${day}`).value = days[day] || ''; }
      $('#alarm-fields').events.change();
    },
  };
}
// 金曜にセット → 土日オフ → 月曜7時 → 火曜8時半。正解後に次回へ。
let a = app(at('2026-09-18', '09:00'));
a.setup('weekly', {1: '07:00', 2: '08:30'});
assert.equal(a.$('#alarm-summary-time').textContent, '07:00', 'preview shows next time before arming');
a.click('#btn-set');
assert.equal(a.saved.alarm.nextAt, at('2026-09-21', '07:00'));
assert.equal(a.$('#alarm-summary-time').textContent, '07:00');
a.advance(at('2026-09-21', '07:00'));
assert.equal(a.sounds, 1);
assert.equal(a.context.document.body.dataset.state, 'ringing');
a.answer();
assert.equal(a.saved.alarm.nextAt, at('2026-09-22', '08:30'));
assert.equal(a.saved.alarm.armed, true);
assert.equal(a.context.document.body.dataset.state, 'done');
a.click('#btn-again');
assert.equal(a.context.document.body.dataset.state, 'armed');
assert.equal(a.intervals.size, 1);
// 次回を保存・復元し、解除すれば再開しない。
a = app(at('2026-09-21', '12:00'), a.saved);
assert.equal(a.$('#alarm-summary-time').textContent, '08:30');
assert.equal(a.intervals.size, 1);
a.click('#btn-disarm');
assert.equal(a.saved.alarm.nextAt, null);
a = app(at('2026-09-21', '12:00'), a.saved);
assert.equal(a.intervals.size, 0);
// 毎日、1回、デモ。
for (const mode of ['once', 'daily']) {
  a = app(at('2026-12-31', '06:00'));
  a.setup(mode); a.click('#btn-set');
  a.advance(at('2026-12-31', '07:30')); a.answer();
  assert.equal(a.saved.problemStats.arithmetic.correct, 1, 'correct result is persisted by problem type');
  assert.equal(a.saved.alarm.armed, mode === 'daily');
  assert.equal(a.saved.alarm.nextAt, mode === 'daily' ? at('2027-01-01', '07:30') : null);
  assert.equal(a.intervals.size, mode === 'daily' ? 1 : 0);
}
a = app(at('2026-09-18', '06:00'));
a.setup('daily'); a.click('#btn-demo');
a.advance(at('2026-09-18', '06:01')); a.answer();
assert.equal(a.saved.alarm.armed, false);
assert.equal(a.intervals.size, 0);
assert.equal(Object.keys(a.saved.problemStats).length, 0, 'demo results do not affect accuracy history');
// 全曜日オフ・空の時刻はセットできない。週1回は翌週へ。
a = app(at('2026-09-21', '07:00'));
a.setup('weekly'); a.click('#btn-set');
assert.equal(a.$('#alarm-summary-time').textContent, '--:--');
assert.equal(a.$('#alarm-schedule-error').hidden, false);
assert.equal(a.intervals.size, 0);
a.setup('weekly', {1: ''}); a.click('#btn-set');
assert.equal(a.intervals.size, 0);
a.setup('weekly', {1: '07:00'}); a.click('#btn-set');
assert.equal(a.saved.alarm.nextAt, at('2026-09-28', '07:00'));
// リロードで過ぎた予定を勝手に鳴らさず、人の選択を待つ。
a = app(at('2026-09-18', '06:00'));
a.setup('daily'); a.click('#btn-set');
const pending = a.saved;
a = app(at('2026-09-18', '08:00'), pending);
assert.equal(a.sounds, 0); assert.equal(a.intervals.size, 0);
assert.equal(a.$('#missed').hidden, false);
a.click('#btn-ring-tomorrow');
assert.equal(a.saved.alarm.nextAt, at('2026-09-19', '07:30'));
a = app(at('2026-09-18', '08:01'), a.saved);
assert.equal(a.$('#missed').hidden, true);
assert.equal(a.$('#missed-text').textContent, '');
assert.equal(a.intervals.size, 1);
a = app(at('2026-09-18', '08:00'), pending);
a.click('#btn-ring-now'); assert.equal(a.sounds, 1); a.answer();
assert.equal(a.saved.alarm.nextAt, at('2026-09-19', '07:30'));
// 開いたままのスリープ復帰も選択待ち。旧保存形式も移行できる。
a = app(at('2026-09-18', '06:00'));
a.setup('daily'); a.click('#btn-set'); a.advance(at('2026-09-18', '09:00'));
assert.equal(a.sounds, 0); assert.equal(a.intervals.size, 0); assert.equal(a.$('#missed').hidden, false);
a = app(at('2026-09-18', '09:00'), {alarm: {time: '07:30', armed: true, armedAt: at('2026-09-18', '06:00')}});
assert.equal(a.context.state.alarm.repeat, 'once');
assert.equal(a.sounds, 0); assert.equal(a.$('#missed').hidden, false);
a = app(at('2026-09-18', '06:00'), {alarm: {time: '13:05'}});
assert.equal(a.$('#alarm-period-pm').checked, true);
assert.equal(a.$('#alarm-hour').value, '1');
assert.equal(a.$('#alarm-minute').value, '05');
a.$('#alarm-period-am').checked = true; a.$('#alarm-period-pm').checked = false;
a.$('#alarm-hour').value = '12'; a.$('#alarm-minute').value = '10';
a.$('#alarm-fields').events.change();
assert.equal(a.context.state.alarm.time, '00:10', '12 AM is stored as 24-hour midnight');
console.log('PASS: weekday times/off days, daily/year rollover, once/demo, validation, auto-rearm, reload, disarm, missed choices, sleep, legacy storage');
