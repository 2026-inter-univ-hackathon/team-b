// file:// では従来のアプリとして動く。PWAはHTTPS/localhostでのみ有効。
(() => {
  const panel = document.querySelector('#pwa-info');
  const status = document.querySelector('#pwa-status');
  const install = document.querySelector('#btn-install');
  const network = document.querySelector('#network-status');
  const web = ['http:', 'https:'].includes(location.protocol);
  const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const showNetwork = () => {
    network.hidden = navigator.onLine;
    network.textContent = 'オフラインです。目覚ましは使えます。終電の再検索には通信が必要です。';
  };
  window.addEventListener('online', showNetwork);
  window.addEventListener('offline', showNetwork);
  showNetwork();
  if (!web || !window.isSecureContext || !('serviceWorker' in navigator)) return;
  panel.hidden = false;
  let prompt = null;
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    prompt = event;
    install.hidden = standalone();
  });
  window.addEventListener('appinstalled', () => {
    prompt = null;
    install.hidden = true;
  });
  install.addEventListener('click', async () => {
    if (!prompt) return;
    const current = prompt;
    prompt = null;
    install.hidden = true;
    try { await current.prompt(); }
    catch { status.textContent = '追加できませんでした。ブラウザのメニューからお試しください。'; }
  });
  status.textContent = 'オフラインで使う準備をしています…';
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then(registration => {
    const ready = () => { status.textContent = 'オフライン起動の準備ができました。'; };
    const updated = () => { status.textContent = '更新があります。使用を終えて、このアプリの画面をすべて閉じると更新されます。'; };
    if (registration.active) ready();
    if (registration.waiting) updated();
    const watch = worker => {
      if (!worker) return;
      const changed = () => {
        if (worker.state === 'installed' && registration.active) updated();
        if (worker.state === 'activated') ready();
        if (worker.state === 'redundant') status.textContent = 'オフライン用の更新に失敗しました。通信環境を確認し、次回起動時にお試しください。';
      };
      worker.addEventListener('statechange', changed);
      changed();
    };
    watch(registration.installing);
    registration.addEventListener('updatefound', () => watch(registration.installing));
  }).catch(() => {
    status.textContent = 'オフライン起動の準備ができませんでした。オンラインでは引き続き使えます。';
  });
})();
