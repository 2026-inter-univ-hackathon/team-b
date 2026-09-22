// node tests/alarm-disarm.cjs — 解除後にリロードせず設定変更・再セットできること
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const elements = new Map();
const element = (id) => {
  if (!elements.has(id)) elements.set(id, {
    dataset: {}, value: '', textContent: '', hidden: false, disabled: false, open: true, children: [],
    focus() { focused = id; }, replaceChildren() {}, setAttribute(key, value) { this[key] = value; },
  });
  return elements.get(id);
};
let focused, saved;
const fields = [element('#alarm-time'), element('#genre-math'), element('#difficulty-normal'), element('#sound-beep'), element('#btn-preview-sound')];
element('#alarm-fields').querySelectorAll = () => fields;
element('#alarm-time').value = '07:30';
const intervals = new Set();
const context = {
  document: {
    body: { dataset: { state: 'setup' } }, addEventListener() {},
    querySelectorAll: () => [{ value: 'math' }],
    querySelector: (selector) => ({ value: selector.includes('difficulty') ? 'normal' : 'beep' }),
  },
  window: { addEventListener() {}, matchMedia() { return { matches: false }; } },
  $: element,
  Problems: { LEVEL_LABELS: { normal: 'ふつう' } },
  Sound: { init() {} }, Attention: { requestPermission() {} },
  Store: { save(value) { saved = JSON.parse(JSON.stringify(value)); } },
  setInterval(fn) { intervals.add(fn); return fn; }, clearInterval(fn) { intervals.delete(fn); },
  pad2: (n) => String(n).padStart(2, '0'),
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('js/main.js', 'utf8'), context);
for (const time of ['07:30', '08:15']) {
  element('#alarm-time').value = time;
  context.arm();
  assert.equal(context.document.body.dataset.state, 'armed');
  assert.equal(element('#alarm-settings').hidden, true);
  assert(fields.every(field => field.disabled));
  assert.equal(intervals.size, 1);
  context.selectFeature('train');
  assert.equal(element('#alarm-panel').hidden, true);
  assert.equal(element('#lasttrain').hidden, false);
  assert.equal(element('#background-alarm').hidden, false);
  assert.equal(intervals.size, 1, 'feature switching preserves alarm monitoring');
  context.selectFeature('alarm');
  assert.equal(element('#alarm-panel').hidden, false);
  assert.equal(element('#lasttrain').hidden, true);
  context.disarm();
  assert.equal(context.document.body.dataset.state, 'setup');
  assert.equal(element('#alarm-settings').hidden, false);
  assert(fields.every(field => !field.disabled));
  assert.equal(focused, '#alarm-hour');
  assert.equal(saved.alarm.armed, false);
  assert.equal(saved.alarm.time, time);
  assert.equal(intervals.size, 0);
}
console.log('PASS: arm -> disarm -> edit -> rearm without reload; inputs enabled, settings open, timer cleared');

context.selectFeature('train', true);
assert.equal(element('#feature-motion').dataset.effect, 'train');
context.selectFeature('alarm', true);
assert.equal(element('#feature-motion').dataset.effect, 'alarm');
element('#feature-motion').dataset.effect = '';
context.selectFeature('alarm', true);
assert.equal(element('#feature-motion').dataset.effect, '', 'same tab does not animate');
context.window.matchMedia = () => ({ matches: true });
context.selectFeature('train', true);
assert.equal(element('#feature-motion').dataset.effect, '', 'reduced motion skips animation');
assert.equal(element('#lasttrain').hidden, false, 'reduced motion still switches panels');
console.log('PASS: directional tab animation, same-tab suppression, reduced-motion preference');
