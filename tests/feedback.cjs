// node tests/feedback.cjs — 生成問題、難易度、音量上限の回帰テスト
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const context = {};
vm.createContext(context);
vm.runInContext(fs.readFileSync('js/problems.js', 'utf8') + '\nthis.problems = Problems;', context);
const p = context.problems;
assert.deepEqual(Object.fromEntries(Object.entries(p.generators).map(([genre, rows]) => [genre, rows.length])), {
  attention: 3, math: 8, physics: 5, code: 7,
});
for (const level of p.LEVELS) {
  for (const genre of Object.keys(p.generators)) {
    let previous = null;
    for (let i = 0; i < 150; i++) {
      const q = p.generate([genre], level, previous);
      assert(Number.isSafeInteger(q.answer));
      assert.equal(q.genre, genre);
      assert.notEqual(q.type, previous, 'avoid immediate repetition of problem type');
      assert(p.isCorrect(q, String(q.answer)));
      assert(!p.isCorrect(q, String(q.answer + 1)));
      previous = q.type;
      if (level === 'easy' && genre === 'math') assert(['arithmetic', 'linearEquation', 'numberSequence'].includes(q.type));
      if (level === 'easy' && genre === 'physics') assert(['ohm', 'freeFall', 'force'].includes(q.type));
      if (level === 'easy' && genre === 'code') assert(['intDiv', 'binaryLiteral', 'conditional'].includes(q.type));
      if (genre === 'attention') {
        const [prompt, row] = q.text.split('\n');
        const symbols = row.split(' ');
        if (q.type === 'symbolCount') {
          const target = prompt.match(/「(.+)」/)[1];
          assert.equal(q.answer, symbols.filter(x => x === target).length);
          assert.equal(symbols.length, { easy: 6, normal: 12, hard: 20 }[level]);
        } else if (q.type === 'digitPosition') {
          const position = Number(prompt.match(/(\d+)番目/)[1]);
          assert.equal(q.answer, Number(symbols[prompt.startsWith('右') ? symbols.length - position : position - 1]));
        } else {
          assert.equal(q.type, 'oddSymbolPosition');
          const counts = new Map();
          symbols.forEach(symbol => counts.set(symbol, (counts.get(symbol) || 0) + 1));
          const odd = symbols.find(symbol => counts.get(symbol) === 1);
          assert.equal(q.answer, symbols.indexOf(odd) + 1);
        }
      }
    }
  }
}
assert(p.typeWeight({ arithmetic: { correct: 1, wrong: 9 } }, 'arithmetic') > p.typeWeight({ arithmetic: { correct: 9, wrong: 1 } }, 'arithmetic'));
for (const level of ['normal', 'hard']) {
  const q = p.generate(['math'], level, null, {}, true);
  assert.equal(q.level, p.easier(level), 'scheduled rescue problem is one level easier');
}
assert.equal(p.parseAnswer('－１２'), -12);
assert.equal(p.parseAnswer('12abc'), null);
const timers = new Map(); let nextTimer = 0, currentGain;
const audio = {
  state: 'running', currentTime: 0, destination: {},
  createGain() { return currentGain = { gain: { value: 0, setValueAtTime(v) { this.value = v; } }, connect() {}, disconnect() {} }; },
};
const soundContext = {
  window: { AudioContext: function () { return audio; } },
  setInterval(fn) { const id = ++nextTimer; timers.set(id, fn); return id; },
  clearInterval(id) { timers.delete(id); },
  setTimeout() { return ++nextTimer; }, clearTimeout() {},
};
vm.createContext(soundContext);
vm.runInContext(fs.readFileSync('js/sound.js', 'utf8') + '\nSoundPresets.beep.start = () => () => {}; this.sound = Sound;', soundContext);
const sound = soundContext.sound;
for (const volume of [10, 50, 100]) {
  sound.start('beep', volume);
  const cap = 0.6 * volume / 100;
  assert(currentGain.gain.value <= cap);
  for (let i = 0; i < 10; i++) for (const tick of timers.values()) tick();
  assert(Math.abs(currentGain.gain.value - cap) < 1e-9);
  sound.stop();
  assert.equal(timers.size, 0);
  sound.preview('beep', volume);
  assert(Math.abs(currentGain.gain.value - cap) < 1e-9);
  sound.stop();
}
console.log('PASS: 1800 generated problems, 23 types, adaptive weights, rescue level, easy pools, volume ramp/cap/preview');
