//音声機能
const Sound = {
  ctx: null,
  osc: null,
  gain: null,
  timer: null,
  rampTimer: null,
  init() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === "suspended") this.ctx.resume();
  },
  start() {
    this.init();
    if (this.osc) return;
    this.gain = this.ctx.createGain();
    this.gain.gain.value = 0.1;
    this.osc = this.ctx.createOscillator();
    this.osc.type = "square";
    this.osc.connect(this.gain).connect(this.ctx.destination);
    this.osc.start();
    this.rampTimer = setInterval(() => {
      const next = Math.min(0.6, this.gain.gain.value + 0.1);
      this.gain.gain.setValueAtTime(next, this.ctx.currentTime);
    }, 30 * 1000);
    let high = false;
    const flip = () => {
      this.osc.frequency.setValueAtTime(high ? 880 : 1100, this.ctx.currentTime);
      high = !high;
    };
    flip();
    this.timer = setInterval(flip, 250);
  },
  stop() {
    if (!this.osc) return;
    clearInterval(this.timer);
    clearInterval(this.rampTimer);
    this.osc.stop();
    this.osc.disconnect();
    this.osc = null;
    this.gain = null;
  }
};