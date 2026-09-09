// 保存機能
// Safari の file:// では localStorage が使えないことがあるので、失敗しても動作を続ける
const STORAGE_KEY = "zekki-helper";

// ---------- 保存 ----------
// Safari の file:// では localStorage が使えないことがあるので、失敗しても動作を続ける
const Store = {
  load() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
    catch { return {}; }
  },
  save(data) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); return true; }
    catch { return false; }
  },
};
