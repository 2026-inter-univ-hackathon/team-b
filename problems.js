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

  // 定積分 ∫₀^k (2a·x + b) dx = a·k² + b·k。x の係数を偶数にして答えを整数にする
  function integral(level) {
    const hi = level === "easy" ? 4 : 9;
    const a = rand(1, hi), b = rand(1, hi), k = rand(1, level === "easy" ? 3 : 5);
    return {
      text: `∫₀^${k} (${2 * a}x + ${b}) dx は？`,
      answer: a * k * k + b * k,
      genre: "math",
    };
  }

  // ベクトルの内積。easy は 2 次元・非負成分、normal は 3 次元・負も含む
  function dotProduct(level) {
    const dim = level === "easy" ? 2 : 3;
    const lo = level === "easy" ? 0 : -5, hi = 5;
    const u = Array.from({ length: dim }, () => rand(lo, hi));
    const v = Array.from({ length: dim }, () => rand(lo, hi));
    const show = (vec) => `(${vec.join(", ")})`.replace(/-/g, "−");
    return {
      text: `${show(u)}·${show(v)} は？`,
      answer: u.reduce((s, x, i) => s + x * v[i], 0),
      genre: "math",
    };
  }

  // 組合せ nCk。分子を順に掛けて割ると各段階で整数になる
  function combination(level) {
    const n = level === "easy" ? rand(4, 6) : rand(5, 9);
    const k = level === "easy" ? 2 : rand(2, 3);
    let c = 1;
    for (let i = 1; i <= k; i++) c = (c * (n - k + i)) / i;
    return {
      text: `${n}C${k}（${n} 個から ${k} 個を選ぶ組合せの数）は？`,
      answer: c,
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

  // 運動エネルギー (1/2)mv²。m を偶数にして整数解にする
  function kineticEnergy(level) {
    const m = 2 * rand(1, level === "easy" ? 3 : 5), v = rand(2, level === "easy" ? 5 : 9);
    return {
      text: `質量 ${m} kg の物体が ${v} m/s で動くときの運動エネルギーは？（J）`,
      answer: (m * v * v) / 2,
      genre: "physics",
    };
  }

  // オームの法則 V = IR。normal は半々で R = V/I を問う（V は I·R から作るので割り切れる）
  function ohm(level) {
    const i = rand(1, level === "easy" ? 5 : 9), r = rand(2, level === "easy" ? 9 : 20);
    const v = i * r;
    if (level === "easy" || Math.random() < 0.5) {
      return {
        text: `抵抗 ${r} Ω に電流 ${i} A が流れるときの電圧は？（V）`,
        answer: v,
        genre: "physics",
      };
    }
    return {
      text: `電圧 ${v} V をかけると電流 ${i} A が流れる抵抗の値は？（Ω）`,
      answer: r,
      genre: "physics",
    };
  }

  // 自由落下。g = 10 m/s² で v = 10t、h = 5t²。easy は速度だけ
  function freeFall(level) {
    const t = rand(1, 5);
    if (level === "easy" || Math.random() < 0.5) {
      return {
        text: `静止状態から自由落下して ${t} 秒後の速度は？（m/s、g = 10 m/s²）`,
        answer: 10 * t,
        genre: "physics",
      };
    }
    return {
      text: `静止状態から自由落下して ${t} 秒間に落ちる距離は？（m、g = 10 m/s²）`,
      answer: 5 * t * t,
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

  // 再帰の階乗。k ≤ 6 なので最大 720
  function recursion(level) {
    const k = level === "easy" ? rand(2, 4) : rand(3, 6);
    let f = 1;
    for (let i = 2; i <= k; i++) f *= i;
    return {
      text: { pre: `def f(n):\n    if n <= 1:\n        return 1\n    return n * f(n - 1)\nprint(f(${k}))` },
      answer: f,
      genre: "code",
    };
  }

  // 2進リテラル。easy は 3 bit、normal は 4〜6 bit
  function binaryLiteral(level) {
    const bits = level === "easy" ? 3 : rand(4, 6);
    const n = rand(1 << (bits - 1), (1 << bits) - 1);
    return {
      text: { pre: `print(0b${n.toString(2)})` },
      answer: n,
      genre: "code",
    };
  }

  // リストのスライスの合計。0 ≤ i < j ≤ len
  function sliceSum(level) {
    const len = level === "easy" ? 4 : rand(5, 6);
    const arr = Array.from({ length: len }, () => rand(1, 9));
    const i = level === "easy" ? rand(0, 1) : rand(0, len - 2);
    const j = rand(i + 1, len);
    return {
      text: { pre: `a = [${arr.join(", ")}]\nprint(sum(a[${i}:${j}]))` },
      answer: arr.slice(i, j).reduce((s, x) => s + x, 0),
      genre: "code",
    };
  }

  const generators = {
    math: [derivative, determinant, integral, dotProduct, combination],
    physics: [uniformAcceleration, kineticEnergy, ohm, freeFall],
    code: [loopSum, bitwise, intDiv, recursion, binaryLiteral, sliceSum],
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
