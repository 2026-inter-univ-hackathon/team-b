// よく使うDOM取得関数とゼロ埋め関数
const $ = (sel) => document.querySelector(sel);
const pad2 = (n) => String(n).padStart(2, "0");