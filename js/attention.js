//通知・点滅機能
const Attention = {
  baseTitle: document.title,
  timer: null,
  start() {
    let on = true;
    this.timer = setInterval(() => {
      document.title = on ? "⏰ 起きろ" : this.baseTitle;
      on = !on;
    }, 800);
    this.notify();
  },
  stop() {
    clearInterval(this.timer);
    document.title = this.baseTitle;
  },
  requestPermission() {
    try {
      if ("Notification" in window && Notification.permission === "default") Notification.requestPermission();
    } catch { }
  },
  notify() {
    try {
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification("リケイアラーム", { body: "起きろ。問題を解くまで止まらない。" });
      }
    } catch { }
  }
};