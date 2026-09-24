// 通知・点滅機能
// ---------- 気づかせる ----------
// 別タブを見ていても気づけるように、タブのタイトルを点滅させる。通知は取れたときだけ
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
  // 権限はユーザー操作（セット）の中で取る。file:// では取れないこともあるので失敗は無視する
  requestPermission() {
    try {
      if ("Notification" in window && Notification.permission === "default") Notification.requestPermission();
    } catch { /* 取れなくても動作に影響しない */ }
  },
  notify() {
    try {
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification("Zekki ヘルパー", { body: "起きろ。問題を解くまで止まらない。" });
      }
    } catch { /* 同上 */ }
  },
};
