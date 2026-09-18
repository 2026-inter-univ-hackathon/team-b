// 問題ジェネレーター。各関数は { text, answer, genre } を返す純粋関数。
// app.js から独立しているので、コンソールで Problems.generate(["math"]) と叩いて確認できる。
// answer は必ず整数。負数は許容する（parseAnswer がマイナス記号を正規化する）。
// level は "easy" | "normal" | "hard"。人がセット画面で選ぶ。
// 5分正解できなかったときは app.js が一段やさしい level で呼び直す。

const Problems = (() => {
  const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
  const pick = (arr) => arr[rand(0, arr.length - 1)];
  // level に応じた値を返す。未知の level は normal 扱い
  const byLevel = (level, easy, normal, hard) =>
    level === "easy" ? easy : level === "hard" ? hard : normal;

  // 専門知識を使わず、画面を見て考える問題。文字列は毎回生成する。
  function symbolCount(level) {
    const symbols = byLevel(level, ["○", "△"], ["○", "△", "□"], ["○", "◎", "△", "□"]);
    const target = pick(symbols);
    const length = byLevel(level, 6, 12, 20);
    const row = Array.from({ length }, () => pick(symbols));
    return { text: `「${target}」は何個ありますか？\n${row.join(" ")}`,
      answer: row.filter(x => x === target).length, genre: "attention" };
  }

  function digitPosition(level) {
    const length = byLevel(level, 4, 7, 10);
    const row = Array.from({ length }, () => rand(0, 9));
    const position = rand(1, length);
    const right = level !== "easy" && Math.random() < 0.5;
    return { text: `${right ? "右" : "左"}から${position}番目の数字は？\n${row.join(" ")}`,
      answer: row[right ? length - position : position - 1], genre: "attention" };
  }

  function arithmetic(level) {
    const a = rand(2, 9), b = rand(2, 9), c = rand(2, 9), d = rand(2, 9);
    if (level === "hard") return { text: `(${a} + ${b}) × ${c} − ${d} は？`, answer: (a + b) * c - d, genre: "math" };
    if (level === "normal") return { text: `${a} + ${b} × ${c} は？`, answer: a + b * c, genre: "math" };
    return { text: `${a} + ${b} は？`, answer: a + b, genre: "math" };
  }

  function linearEquation(level) {
    const x = rand(2, 9), a = rand(2, 5), b = rand(1, 9), c = rand(1, 4);
    if (level === "hard") return { text: `${a + c}x + ${b} = ${c}x + ${a * x + b} の x は？`, answer: x, genre: "math" };
    if (level === "normal") return { text: `${a}x + ${b} = ${a * x + b} の x は？`, answer: x, genre: "math" };
    return { text: `x + ${b} = ${x + b} の x は？`, answer: x, genre: "math" };
  }

  // ---------- 数学 ----------

  // f(x) = ax² + bx + c の x=k における微分係数 f'(k) = 2ak + b
  // hard は 3 次の項を足す: f'(k) = 3dk² + 2ak + b
  function derivative(level) {
    const hi = byLevel(level, 4, 9, 9);
    const a = rand(1, hi), b = rand(1, hi), c = rand(1, hi), k = rand(1, byLevel(level, 3, 5, 6));
    if (level === "hard") {
      const d = rand(1, 5);
      return {
        text: `f(x) = ${d}x³ + ${a}x² + ${b}x + ${c} のとき f'(${k}) は？`,
        answer: 3 * d * k * k + 2 * a * k + b,
        genre: "math",
      };
    }
    return {
      text: `f(x) = ${a}x² + ${b}x + ${c} のとき f'(${k}) は？`,
      answer: 2 * a * k + b,
      genre: "math",
    };
  }

  // 行列式。normal は 2×2、hard は 3×3。easy の出題プールには含めない。行列式が0なら引き直す
  // text は { matrix: [[...], ...], suffix } の形で返し、app.js が縦書きの括弧つきで描画する
  function determinant(level) {
    const size = byLevel(level, 2, 2, 3);
    const lo = byLevel(level, 0, size === 3 ? -3 : -5, -5);
    const hi = byLevel(level, 4, size === 3 ? 3 : 5, 5);
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
  // hard は ∫₀^k (3d·x² + 2a·x + b) dx = d·k³ + a·k² + b·k
  function integral(level) {
    const hi = byLevel(level, 4, 9, 9);
    const a = rand(1, hi), b = rand(1, hi), k = rand(1, byLevel(level, 3, 5, 5));
    if (level === "hard") {
      const d = rand(1, 3);
      return {
        text: `∫₀^${k} (${3 * d}x² + ${2 * a}x + ${b}) dx は？`,
        answer: d * k * k * k + a * k * k + b * k,
        genre: "math",
      };
    }
    return {
      text: `∫₀^${k} (${2 * a}x + ${b}) dx は？`,
      answer: a * k * k + b * k,
      genre: "math",
    };
  }

  // ベクトルの内積。easy は 2 次元・非負成分、normal は 3 次元・負も含む、hard は 4 次元で範囲を広げる
  function dotProduct(level) {
    const dim = byLevel(level, 2, 3, 4);
    const lo = byLevel(level, 0, -5, -9), hi = byLevel(level, 5, 5, 9);
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
    const n = rand(byLevel(level, 4, 5, 8), byLevel(level, 6, 9, 12));
    const k = byLevel(level, 2, rand(2, 3), rand(3, 4));
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
  // hard は距離の問題のみで、範囲を広げる
  function uniformAcceleration(level) {
    const v0 = rand(1, byLevel(level, 5, 9, 15)), t = rand(2, byLevel(level, 3, 5, 8));
    if (level === "easy" || (level === "normal" && Math.random() < 0.5)) {
      const a = rand(1, 5);
      return {
        text: `初速 ${v0} m/s、加速度 ${a} m/s² で ${t} 秒後の速度は？（m/s）`,
        answer: v0 + a * t,
        genre: "physics",
      };
    }
    const a = 2 * rand(1, byLevel(level, 3, 3, 5));
    return {
      text: `初速 ${v0} m/s、加速度 ${a} m/s² で ${t} 秒間に進む距離は？（m）`,
      answer: v0 * t + (a * t * t) / 2,
      genre: "physics",
    };
  }

  // 運動エネルギー (1/2)mv²。m を偶数にして整数解にする
  // hard は逆に「運動エネルギーと質量から速さ」を問う（v から E を作るので平方根が整数になる）
  function kineticEnergy(level) {
    const m = 2 * rand(1, byLevel(level, 3, 5, 8)), v = rand(2, byLevel(level, 5, 9, 12));
    const e = (m * v * v) / 2;
    if (level === "hard") {
      return {
        text: `質量 ${m} kg の物体の運動エネルギーが ${e} J のとき、速さは？（m/s）`,
        answer: v,
        genre: "physics",
      };
    }
    return {
      text: `質量 ${m} kg の物体が ${v} m/s で動くときの運動エネルギーは？（J）`,
      answer: e,
      genre: "physics",
    };
  }

  // オームの法則 V = IR。normal は半々で R = V/I を問う（V は I·R から作るので割り切れる）
  // hard は直列抵抗の合成: 2 つの抵抗の合計に対する電流から電圧を求める
  function ohm(level) {
    const i = rand(1, byLevel(level, 5, 9, 9)), r = rand(2, byLevel(level, 9, 20, 30));
    if (level === "hard") {
      const r2 = rand(2, 30);
      return {
        text: `抵抗 ${r} Ω と ${r2} Ω を直列につなぎ、電流 ${i} A が流れるときの全体の電圧は？（V）`,
        answer: i * (r + r2),
        genre: "physics",
      };
    }
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
  // hard は初速つきの投げ下ろし h = v0·t + 5t²
  function freeFall(level) {
    const t = rand(1, byLevel(level, 5, 5, 8));
    if (level === "hard") {
      const v0 = rand(1, 9);
      return {
        text: `初速 ${v0} m/s で真下に投げて ${t} 秒間に落ちる距離は？（m、g = 10 m/s²）`,
        answer: v0 * t + 5 * t * t,
        genre: "physics",
      };
    }
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

  // ループの合計: s += i*m または s += i*i。hard は range の始点と step を変える
  function loopSum(level) {
    const n = rand(3, byLevel(level, 4, 6, 10));
    const square = level !== "easy" && Math.random() < 0.5;
    const m = rand(2, 5);
    const start = level === "hard" ? rand(0, 2) : 1;
    const step = level === "hard" ? rand(1, 3) : 1;
    let s = 0;
    for (let i = start; i < n; i += step) s += square ? i * i : i * m;
    const body = square ? "s += i * i" : `s += i * ${m}`;
    const args = step === 1 ? `${start}, ${n}` : `${start}, ${n}, ${step}`;
    return {
      text: { pre: `s = 0\nfor i in range(${args}):\n    ${body}\nprint(s)` },
      answer: s,
      genre: "code",
    };
  }

  // ビット演算: &, |, ^ のいずれか。hard はシフトも混ぜる
  function bitwise(level) {
    const hi = byLevel(level, 7, 31, 63);
    const a = rand(1, hi), b = rand(1, hi);
    if (level === "hard" && Math.random() < 0.4) {
      const k = rand(1, 3);
      const left = Math.random() < 0.5;
      return {
        text: { pre: `print(${a} ${left ? "<<" : ">>"} ${k})` },
        answer: left ? a << k : a >> k,
        genre: "code",
      };
    }
    const op = pick(["&", "|", "^"]);
    const answer = op === "&" ? a & b : op === "|" ? a | b : a ^ b;
    return {
      text: { pre: `print(${a} ${op} ${b})` },
      answer,
      genre: "code",
    };
  }

  // 整数除算と剰余。hard は負数の被除数（Python は床除算なので JS の Math.floor と一致する）
  function intDiv(level) {
    let a = rand(10, byLevel(level, 30, 99, 99)), b = rand(2, byLevel(level, 5, 9, 12));
    if (level === "hard") a = -a;
    const useMod = Math.random() < 0.5;
    // Python の % は常に除数と同じ符号。JS の % と違うので床除算から作る
    const q = Math.floor(a / b);
    return {
      text: { pre: `print(${a} ${useMod ? "%" : "//"} ${b})` },
      answer: useMod ? a - q * b : q,
      genre: "code",
    };
  }

  // 再帰の階乗。k ≤ 6 なので最大 720。hard はフィボナッチ（k ≤ 12）
  function recursion(level) {
    if (level === "hard") {
      const k = rand(6, 12);
      let a = 0, b = 1;
      for (let i = 0; i < k; i++) [a, b] = [b, a + b];
      return {
        text: { pre: `def f(n):\n    if n <= 1:\n        return n\n    return f(n - 1) + f(n - 2)\nprint(f(${k}))` },
        answer: a,
        genre: "code",
      };
    }
    const k = byLevel(level, rand(2, 4), rand(3, 6), 0);
    let f = 1;
    for (let i = 2; i <= k; i++) f *= i;
    return {
      text: { pre: `def f(n):\n    if n <= 1:\n        return 1\n    return n * f(n - 1)\nprint(f(${k}))` },
      answer: f,
      genre: "code",
    };
  }

  // 2進リテラル。easy は 3 bit、normal は 4〜6 bit、hard は 16 進リテラル
  function binaryLiteral(level) {
    if (level === "hard") {
      const n = rand(16, 255);
      return {
        text: { pre: `print(0x${n.toString(16).toUpperCase()})` },
        answer: n,
        genre: "code",
      };
    }
    const bits = byLevel(level, 3, rand(4, 6), 0);
    const n = rand(1 << (bits - 1), (1 << bits) - 1);
    return {
      text: { pre: `print(0b${n.toString(2)})` },
      answer: n,
      genre: "code",
    };
  }

  // リストのスライスの合計。0 ≤ i < j ≤ len。hard は負のインデックス
  function sliceSum(level) {
    const len = byLevel(level, 4, rand(5, 6), rand(6, 8));
    const arr = Array.from({ length: len }, () => rand(1, 9));
    const i = byLevel(level, rand(0, 1), rand(0, len - 2), rand(0, len - 3));
    const j = rand(Math.min(len, i + byLevel(level, 1, 2, 3)), len);
    // hard は j を末尾からの負数で書く（j = len のときは省略記法）
    const jText = level === "hard" ? (j === len ? "" : String(j - len)) : String(j);
    return {
      text: { pre: `a = [${arr.join(", ")}]\nprint(sum(a[${i}:${jText}]))` },
      answer: arr.slice(i, j).reduce((s, x) => s + x, 0),
      genre: "code",
    };
  }

  const generators = {
    attention: [symbolCount, digitPosition],
    math: [arithmetic, linearEquation, derivative, determinant, integral, dotProduct, combination],
    physics: [uniformAcceleration, kineticEnergy, ohm, freeFall],
    code: [loopSum, bitwise, intDiv, recursion, binaryLiteral, sliceSum],
  };

  const LEVELS = ["easy", "normal", "hard"];
  const LEVEL_LABELS = { easy: "やさしい", normal: "ふつう", hard: "むずかしい" };

  // 一段やさしい level を返す。easy はそれ以上下げられないので null
  function easier(level) {
    const i = LEVELS.indexOf(level);
    return i > 0 ? LEVELS[i - 1] : null;
  }

  // 指定ジャンル群からランダムに1問生成する。ジャンルが空なら全ジャンルから
  function generate(genres, level = "normal", previousType = null) {
    if (!LEVELS.includes(level)) level = "normal";
    const keys = (genres && genres.length) ? genres : Object.keys(generators);
    // 「やさしい」では微積分・行列・再帰を出さず、一段の処理に絞る。
    const easy = { attention: generators.attention, math: [arithmetic, linearEquation], physics: [ohm, freeFall], code: [intDiv, binaryLiteral] };
    const source = level === "easy" ? easy : generators;
    const pool = keys.flatMap(g => source[g] || []);
    const candidates = pool.filter(fn => fn.name !== previousType);
    const generator = pick(candidates.length ? candidates : pool.length ? pool : generators.attention);
    const problem = generator(level);
    if (level === "easy" && problem.genre === "physics") {
      problem.text += generator === ohm ? "（電圧 = 電流 × 抵抗）" : "（速度 = 重力加速度 × 時間）";
    }
    return { ...problem, type: generator.name };
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

  return { generate, parseAnswer, isCorrect, generators, LEVELS, LEVEL_LABELS, easier };
})();
