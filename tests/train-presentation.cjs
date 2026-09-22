// node tests/train-presentation.cjs — 実際の計画に基づく表示（API通信なし）
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const node = () => ({ textContent: '', children: [], append(...items) { this.children.push(...items); }, replaceChildren(...items) { this.children = items; } });
const elements = new Map();
const $ = id => { if (!elements.has(id)) elements.set(id, node()); return elements.get(id); };
const now = Date.now();
const context = { state: {}, $, document: { createElement: node, addEventListener() {} }, Date, pad2: n => String(n).padStart(2, '0') };
vm.createContext(context);
vm.runInContext(fs.readFileSync('js/lasttrain.js', 'utf8') + '\nthis.train = LastTrain;', context);
const train = context.train;
const dep = now + 42 * 60000;
train.settings.plan = { leaveAt: dep, legs: [
  { from: '渋谷', to: '新宿', departAt: dep, arriveAt: dep + 9 * 60000, line: '山手線', trainType: '各駅停車' },
  { from: '新宿', to: '三鷹', departAt: dep + 15 * 60000, arriveAt: dep + 31 * 60000, line: '中央線', trainType: '快速' },
] };
train.renderItinerary();
const text = n => [n.textContent, ...n.children.map(text)].join(' ');
const rows = $('#lasttrain-itinerary').children;
assert.equal(rows.length, 3);
assert.match(text(rows[0]), /渋谷/);
assert.match(text(rows[1]), /新宿/);
assert.match(text(rows[1]), /乗り換え 6分/);
assert.match(text(rows[1]), /乗車16分/);
assert.match(text(rows[2]), /三鷹/);
assert(!text($('#lasttrain-itinerary')).includes('番線'));
train.renderCountdown();
assert.match($('#lasttrain-countdown').textContent, /^4[12]:\d{2}$/);
train.settings.plan.decision = 'going';
train.renderCountdown();
assert.equal($('#lasttrain-countdown').textContent, '通知終了');
delete train.settings.plan.decision;
train.settings.plan.leaveAt = now - 1000;
train.renderCountdown();
assert.equal($('#lasttrain-countdown').textContent, '出発時刻を過ぎました');
train.settings.plan = { walkOnly: true };
train.renderCountdown(); train.renderItinerary();
assert.equal($('#lasttrain-countdown').textContent, '');
assert.equal($('#lasttrain-itinerary').children.length, 0);
train.settings.plan = null;
train.renderItinerary();
assert.equal($('#lasttrain-itinerary').children.length, 0);
console.log('PASS: itinerary order, transfer/ride duration, no fabricated platforms, countdown, dismissed/expired/walking/empty plans');
train.settings.plan = { leaveAt: dep, legs: [
  { from: 'A', to: 'B', departAt: dep, arriveAt: dep + 10 * 60000, line: '1線' },
  { from: 'B', to: 'C', departAt: dep + 15 * 60000, arriveAt: dep + 25 * 60000, line: '2線' },
  { from: 'C', to: 'D', departAt: dep + 31 * 60000, arriveAt: dep + 45 * 60000, line: '3線' },
] };
train.renderItinerary();
assert.equal($('#lasttrain-itinerary').children.length, 4);
assert.match(text($('#lasttrain-itinerary').children[1]), /乗り換え 5分/);
assert.match(text($('#lasttrain-itinerary').children[2]), /乗り換え 6分/);
assert.match(train.summary(), /^B、C で乗り換え。/);
console.log('PASS: both transfers appear in itinerary and notification summary');
// The Web action explicitly requests two transfers; native callers keep their default.
context.navigator = { onLine: true };
context.Sound = { init() {} };
context.Attention = { requestPermission() {} };
context.persist = () => {};
context.ODPT = { hasToken: () => true, network: async () => ({}) };
const searchedPlan = train.settings.plan;
context.LastTrainSearch = {
  normalizeName: (_network, name) => name,
  search: async (_network, from, to, _now, maxTransfers) => {
    assert.equal(from, 'A'); assert.equal(to, 'D'); assert.equal(maxTransfers, 2);
    return searchedPlan;
  },
};
$('#home-station').value = 'D';
$('#current-station').value = 'A';
$('#alert-minutes').value = '15';
train.setStatus = () => {};
train.showError = message => { throw new Error(message); };
train.render = () => {};
let watching = false;
train.watch = () => { watching = true; };
train.settings.plan = null;
train.check().then(() => {
  assert.equal(train.settings.plan.legs.length, 3);
  assert(watching);
  assert.equal($('#btn-lasttrain-check').disabled, false);
  console.log('PASS: Web search requests two transfers and persists/watches the three-leg result');
}).catch(error => { console.error(error); process.exitCode = 1; });
