// 音声機能
// ---------- 音 ----------
// 音声ファイルは持たない。すべて Web Audio のオシレーターで合成する
// 各プリセットは start(ctx, out) で鳴らし始め、止めるための関数を返す
const SoundPresets = {
  // 880Hz と 1100Hz を 0.25 秒ずつ交互に鳴らす（初期のもの）
  beep: {
    label: "ビープ",
    start(ctx, out) {
      const osc = ctx.createOscillator();
      osc.type = "square";
      osc.connect(out);
      osc.start();
      let high = false;
      const flip = () => {
        osc.frequency.setValueAtTime(high ? 880 : 1100, ctx.currentTime);
        high = !high;
      };
      flip();
      const timer = setInterval(flip, 250);
      return () => { clearInterval(timer); osc.stop(); osc.disconnect(); };
    },
  },
  // サイレン。2 本のオシレーターを少しずらして重ね、指数カーブで 2 秒かけて上下させる
  // ローパスフィルターで角を取り、LFO でわずかに揺らして「うなり」を出す
  siren: {
    label: "サイレン",
    start(ctx, out) {
      const LOW = 440, HIGH = 960, HALF = 2;
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 1800;
      filter.Q.value = 4;
      filter.connect(out);
      // 主音（のこぎり波）と、少し低くずらした副音（矩形波）。ずれがうなりになる
      const voices = [["sawtooth", 0], ["square", -12]].map(([type, detune]) => {
        const osc = ctx.createOscillator();
        osc.type = type;
        osc.detune.value = detune;
        osc.frequency.setValueAtTime(LOW, ctx.currentTime);
        osc.connect(filter);
        osc.start();
        return osc;
      });
      // 5Hz の LFO で音程を ±8 cent 揺らす
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.value = 5;
      lfoGain.gain.value = 8;
      lfo.connect(lfoGain);
      voices.forEach((osc) => lfoGain.connect(osc.detune));
      lfo.start();
      let up = true;
      const sweep = () => {
        const t = ctx.currentTime;
        const target = up ? HIGH : LOW;
        voices.forEach((osc) => osc.frequency.exponentialRampToValueAtTime(target, t + HALF));
        // フィルターも音程に合わせて開閉させ、上昇時に明るく聞こえるようにする
        filter.frequency.exponentialRampToValueAtTime(up ? 2600 : 1400, t + HALF);
        up = !up;
      };
      sweep();
      const timer = setInterval(sweep, HALF * 1000);
      return () => {
        clearInterval(timer);
        [...voices, lfo].forEach((osc) => { osc.stop(); osc.disconnect(); });
        lfoGain.disconnect();
        filter.disconnect();
      };
    },
  },
  // 学校のチャイム（ウェストミンスターの鐘）。キーンコーンカーンコーン を繰り返す
  // 音色は基音に倍音を重ねて長く減衰させ、鐘らしくする
  chime: {
    label: "学校のチャイム",
    start(ctx, out) {
      const E5 = 659.25, D5 = 587.33, C5 = 523.25, G4 = 392;
      // [周波数, 長さ(秒)]。フレーズ末の音は長く伸ばし、フレーズ間に間を置く
      const score = [
        [E5, 0.9], [D5, 0.9], [C5, 0.9], [G4, 2.2],
        [C5, 0.9], [E5, 0.9], [D5, 0.9], [G4, 2.2],
      ];
      // 倍音の比率と相対音量。1.0 が基音、3.0 が 12 度上、2.76 はわずかに濁る鐘の成分
      const partials = [[1, 1], [2, 0.35], [2.76, 0.15], [3, 0.2]];
      const live = new Set();
      const strike = (freq, hold) => {
        const t = ctx.currentTime;
        const env = ctx.createGain();
        env.gain.setValueAtTime(0.001, t);
        env.gain.exponentialRampToValueAtTime(1, t + 0.02);
        env.gain.exponentialRampToValueAtTime(0.001, t + hold + 1.5);
        env.connect(out);
        partials.forEach(([ratio, level]) => {
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.type = "sine";
          osc.frequency.value = freq * ratio;
          g.gain.value = level;
          osc.connect(g).connect(env);
          osc.start(t);
          osc.stop(t + hold + 1.6);
          live.add(osc);
          osc.onended = () => { osc.disconnect(); g.disconnect(); live.delete(osc); };
        });
        setTimeout(() => env.disconnect(), (hold + 1.7) * 1000);
      };
      let i = 0, timer = null;
      const next = () => {
        const [freq, hold] = score[i];
        strike(freq, hold);
        i = (i + 1) % score.length;
        timer = setTimeout(next, hold * 1000);
      };
      next();
      return () => {
        clearTimeout(timer);
        live.forEach((osc) => { try { osc.stop(); } catch { /* 停止済み */ } osc.disconnect(); });
        live.clear();
      };
    },
  },
  // 目覚まし時計風。2000Hz を 4 回刻んで少し休む
  clock: {
    label: "目覚まし時計",
    start(ctx, out) {
      const env = ctx.createGain();
      env.gain.value = 0;
      const osc = ctx.createOscillator();
      osc.type = "square";
      osc.frequency.value = 2000;
      osc.connect(env).connect(out);
      osc.start();
      let step = 0;
      const tick = () => {
        // 0〜7 は 0.1 秒ごとに ON/OFF、8〜11 は休み
        const on = step < 8 && step % 2 === 0;
        env.gain.setValueAtTime(on ? 1 : 0, ctx.currentTime);
        step = (step + 1) % 12;
      };
      tick();
      const timer = setInterval(tick, 100);
      return () => { clearInterval(timer); osc.stop(); osc.disconnect(); env.disconnect(); };
    },
  },
};

// 音量は 0.1 から始めて 30 秒ごとに 0.1 ずつ上げ、0.6 で止める
const Sound = {
  ctx: null,
  gain: null,
  stopPreset: null,
  rampTimer: null,
  previewTimer: null,
  // 自動再生制限を回避するため、必ずユーザー操作の中で呼ぶ
  init() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === "suspended") this.ctx.resume();
  },
  start(kind) {
    this.init();
    // 試聴中に鳴動が始まったら、試聴を止めてから本番の音を鳴らす
    if (this.previewTimer) this.stop();
    if (this.stopPreset) return;
    const preset = SoundPresets[kind] || SoundPresets.beep;
    this.gain = this.ctx.createGain();
    this.gain.gain.value = 0.1;
    this.gain.connect(this.ctx.destination);
    this.stopPreset = preset.start(this.ctx, this.gain);
    this.rampTimer = setInterval(() => {
      const next = Math.min(0.6, this.gain.gain.value + 0.1);
      this.gain.gain.setValueAtTime(next, this.ctx.currentTime);
    }, 30 * 1000);
  },
  stop() {
    clearTimeout(this.previewTimer);
    this.previewTimer = null;
    if (!this.stopPreset) return;
    clearInterval(this.rampTimer);
    this.stopPreset();
    this.stopPreset = null;
    this.gain.disconnect();
    this.gain = null;
  },
  // 試聴。鳴らして 2 秒で止める。鳴動中は使わない
  preview(kind) {
    this.stop();
    this.start(kind);
    this.previewTimer = setTimeout(() => this.stop(), 2000);
  },
};
