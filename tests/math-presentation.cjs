// node tests/math-presentation.cjs — 生成問題を実際の数式描画関数へ渡す（実ブラウザの描画は対象外）
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
function node(tag) {
  return { tag, children: [], attributes: {}, textContent: '',
    style: { setProperty(key, value) { this[key] = value; } },
    appendChild(child) { this.children.push(child); },
    setAttribute(key, value) { this.attributes[key] = value; },
  };
}
const context = {
  document: {createElement: node, createTextNode: text => ({tag: '#text', textContent: text, children: []}), addEventListener() {}},
  window: {addEventListener() {}},
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('js/problems.js', 'utf8') + '\nthis.problems = Problems;', context);
vm.runInContext(fs.readFileSync('js/main.js', 'utf8'), context);
const text = el => el.textContent + el.children.map(text).join('');
const types = new Set();
for (const level of ['easy', 'normal', 'hard']) {
  for (const generator of context.problems.generators.math) {
    for (let i = 0; i < 10; i++) {
      const problem = generator(level);
      types.add(generator.name);
      const parent = node('div');
      context.renderMathProblem(parent, problem.text);
      const formula = parent.children[0];
      assert.equal(formula.className, 'math-expression');
      assert.equal(formula.tabIndex, 0, 'overflow can be reached with a keyboard');
      assert(!text(parent).includes('undefined'));
      if (problem.text.integral) {
        const bounds = problem.text.integral;
        const symbol = formula.children[0];
        assert.deepEqual(symbol.children.map(el => el.tag), ['span', 'sup', 'sub']);
        assert.equal(symbol.children[1].textContent, String(bounds.upper));
        assert.equal(symbol.children[2].textContent, '0');
        assert.equal(formula.children[1].textContent, ` (${bounds.integrand}) dx`);
        assert(!text(parent).includes('^'));
      } else if (problem.text.combination) {
        const {n, k} = problem.text.combination;
        const symbol = formula.children[0];
        assert.deepEqual(symbol.children.map(el => el.tag), ['sub', 'span', 'sub']);
        assert.equal(text(symbol), `${n}C${k}`);
        assert.equal(parent.children[1].textContent, problem.text.suffix);
      } else if (problem.text.matrix) {
        const matrix = formula.children[0];
        assert.equal(matrix.children.length, problem.text.matrix.flat().length);
        assert.equal(matrix.style['--cols'], problem.text.matrix.length);
        assert.deepEqual(matrix.children.map(el => el.textContent), Array.from(problem.text.matrix.flat(), value => String(value).replace('-', '−')));
      } else {
        assert.equal(text(parent), problem.text, 'formula and prose preserve original problem');
        assert(!formula.textContent.includes('は？'), 'prompt is outside scrolling formula');
      }
    }
  }
}
assert.equal(types.size, 8);
console.log('PASS: 240 math problems rendered; integral bounds, combination subscripts, matrix cells, formula/prose separation, focusable overflow');
