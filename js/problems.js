// 問題ジェネレーター。各関数は { text, answer, genre } を返す純粋関数。
// app.js から独立しているので、コンソールで Problems.generate(["math"]) と叩いて確認できる。
// answer は必ず整数。負数は許容する（parseAnswer がマイナス記号を正規化する）。

const Problems = (() => {
  const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
  const pick = (arr) => arr[rand(0, arr.length - 1)];

  // ---------- 数学 ----------

  // f(x) = ax² + bx + c の x=k における微分係数 f'(k) = 2ak + b
  // level: "normal" | "easy"。easy は猶予つき再出題で使う（係数の範囲を狭めるだけ）
  function derivative(level) {
    const hi = level === "easy" ? 4 : 9;
    const a = rand(1, hi), b = rand(1, hi), c = rand(1, hi), k = rand(1, level === "easy" ? 3 : 5);
    return {
      text: `f(x) = ${a}x² + ${b}x + ${c} のとき f'(${k}) は？`,
      answer: 2 * a * k + b,
      genre: "math",
    };
  }

  // 行列式。easy は 2×2、normal は 2×2 か 3×3。行列式が 0 なら引き直す
  // text は { matrix: [[...], ...], suffix } の形で返し、app.js が縦書きの括弧つきで描画する
  function determinant(level) {
    const size = level === "easy" || Math.random() < 0.5 ? 2 : 3;
    const lo = level === "easy" ? 0 : (size === 3 ? -3 : -5);
    const hi = level === "easy" ? 4 : (size === 3 ? 3 : 5);
    let m, det;
    do {
      m = Array.from({ length: size }, () => Array.from({ length: size }, () => rand(lo, hi)));
      det = size === 2
        ? m[0][0] * m[1][1] - m[0][1] * m[1][0]
        : m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
        - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
        + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
    } while (det === 0);
    return {
      text: { matrix: m, suffix: "の行列式は？" },
      answer: det,
      genre: "math",
    };
  }

  // ---------- 物理 ----------

  // 等加速度運動。v = v0 + at、または x = v0 t + (1/2) a t²（a を偶数にして整数解にする）
  function uniformAcceleration(level) {
    const v0 = rand(1, level === "easy" ? 5 : 9), t = rand(2, level === "easy" ? 3 : 5);
    if (level === "easy" || Math.random() < 0.5) {
      const a = rand(1, 5);
      return {
        text: `初速 ${v0} m/s、加速度 ${a} m/s² で ${t} 秒後の速度は？（m/s）`,
        answer: v0 + a * t,
        genre: "physics",
      };
    }
    const a = 2 * rand(1, 3);
    return {
      text: `初速 ${v0} m/s、加速度 ${a} m/s² で ${t} 秒間に進む距離は？（m）`,
      answer: v0 * t + (a * t * t) / 2,
      genre: "physics",
    };
  }

  // ---------- プログラミング ----------
  // Python 風のテンプレート。変数部分を乱数で置換し、同じ計算を JS で行って答えを出す

  // ループの合計: s += i*m または s += i*i
  function loopSum(level) {
    const n = rand(3, level === "easy" ? 4 : 6);
    const square = level !== "easy" && Math.random() < 0.5;
    const m = rand(2, 5);
    let s = 0;
    for (let i = 1; i < n; i++) s += square ? i * i : i * m;
    const body = square ? "s += i * i" : `s += i * ${m}`;
    return {
      text: { pre: `s = 0\nfor i in range(1, ${n}):\n    ${body}\nprint(s)` },
      answer: s,
      genre: "code",
    };
  }

  // ビット演算: &, |, ^ のいずれか
  function bitwise(level) {
    const hi = level === "easy" ? 7 : 31;
    const a = rand(1, hi), b = rand(1, hi);
    const op = pick(["&", "|", "^"]);
    const answer = op === "&" ? a & b : op === "|" ? a | b : a ^ b;
    return {
      text: { pre: `print(${a} ${op} ${b})` },
      answer,
      genre: "code",
    };
  }

  // 整数除算と剰余
  function intDiv(level) {
    const a = rand(10, level === "easy" ? 30 : 99), b = rand(2, level === "easy" ? 5 : 9);
    const useMod = Math.random() < 0.5;
    return {
      text: { pre: `print(${a} ${useMod ? "%" : "//"} ${b})` },
      answer: useMod ? a % b : Math.floor(a / b),
      genre: "code",
    };
  }

  const generators = {
    math: [derivative, determinant],
    physics: [uniformAcceleration],
    code: [loopSum, bitwise, intDiv],
  };

  // 指定ジャンル群からランダムに1問生成する。ジャンルが空なら全ジャンルから
  function generate(genres, level = "normal") {
    const keys = (genres && genres.length) ? genres : Object.keys(generators);
    const pool = keys.flatMap((g) => generators[g] || []);
    if (pool.length === 0) return derivative(level);
    return pick(pool)(level);
  }

  // 入力を正規化して整数として解釈する。解釈できなければ null
  function parseAnswer(input) {
    const s = String(input)
      .trim()
      .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
      .replace(/[−ー－‐]/g, "-")
      .replace(/\s+/g, "");
    if (!/^-?\d+$/.test(s)) return null;
    return parseInt(s, 10);
  }

  function isCorrect(problem, input) {
    const n = parseAnswer(input);
    return n !== null && n === problem.answer;
  }

  return { generate, parseAnswer, isCorrect, generators };
})();
