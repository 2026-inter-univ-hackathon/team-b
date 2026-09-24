// Local JavaScriptCore adapter. HTTP is performed by URLSession, never a WebView.
class URLSearchParams {
  constructor(values) { this.values = values; }
  toString() { return Object.entries(this.values).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&'); }
}
const nativeRequests = new Map();
let nativeRequestID = 0;
ODPT.getJson = (url) => new Promise((resolve, reject) => {
  const id = String(++nativeRequestID);
  nativeRequests.set(id, { resolve, reject });
  nativeHTTP(url, id);
});
function nativeHTTPResult(id, json, error) {
  const pending = nativeRequests.get(id);
  if (!pending) return;
  nativeRequests.delete(id);
  if (error) { pending.reject(new Error(error)); return; }
  try { pending.resolve(JSON.parse(json)); } catch (_) { pending.reject(new Error('時刻表データを読み込めませんでした。')); }
}
async function nativeRun(id, operation, inputJSON) {
  try {
    const input = JSON.parse(inputJSON);
    const network = await ODPT.network();
    let result;
    if (operation === 'stations') {
      result = [...network.names].sort();
    } else {
      const from = LastTrainSearch.normalizeName(network, input.from);
      const to = LastTrainSearch.normalizeName(network, input.to);
      if (!from || !to) throw new Error('入力した駅が対応データにありません。候補から駅名を選んでください。');
      if (from === to) throw new Error('出発駅と到着駅が同じです。電車での移動は不要です。');
      // Refresh timetables on each explicit query. Keep the shared station network.
      for (const key of Object.keys(ODPT.cache)) if (key.startsWith('tt:') || key === 'dump:odpt:TrainTimetable') delete ODPT.cache[key];
      // Always use Japan's operating day, even when the phone has another time zone.
      const originalDay = LastTrainSearch.operatingDay;
      const originalCalendars = LastTrainSearch.calendarsFor;
      LastTrainSearch.operatingDay = () => new Date(input.dayMillis);
      LastTrainSearch.calendarsFor = () => originalCalendars.call(LastTrainSearch, new Date(input.year, input.month - 1, input.day, 12));
      try { result = await LastTrainSearch.search(network, from, to, new Date(input.now), 2); }
      finally { LastTrainSearch.operatingDay = originalDay; LastTrainSearch.calendarsFor = originalCalendars; }
      if (result.noRoute) throw new Error('提供されている列車時刻表では、乗り換え2回までの終電を確認できませんでした。公式時刻表をご確認ください。');
      result.origin = from;
      result.home = to;
      result.checkedAt = input.now;
    }
    nativeDone(id, JSON.stringify(result), '');
  } catch (error) {
    // Rejected promises must not prevent a later retry after connectivity recovers.
    ODPT.cache = {};
    nativeDone(id, '', error.message || '終電を検索できませんでした。');
  }
}
