// node tests/odpt.cjs — APIの使い分けと時刻欠損の回帰テスト（通信なし）
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const context = { URLSearchParams, window: { APP_CONFIG: {
  ODPT_ACCESS_TOKEN: 'regular-test-key', ODPT_CHALLENGE_ACCESS_TOKEN: 'challenge-test-key',
} } };
vm.createContext(context);
vm.runInContext(fs.readFileSync('js/odpt.js', 'utf8') + '\nthis.api = ODPT; this.search = LastTrainSearch;', context);
const { api, search } = context;
(async () => {
  const requests = [];
  context.fetch = async (url) => {
    const u = new URL(url); requests.push(u);
    const regular = u.hostname === 'api.odpt.org';
    assert.equal(u.searchParams.get('acl:consumerKey'), regular ? 'regular-test-key' : 'challenge-test-key');
    return { ok: true, json: async () => [{ 'owl:sameAs': 'line', 'odpt:stationOrder': regular ? [{ 'odpt:station': 'a' }] : [] }] };
  };
  const merged = await api.fetchType('odpt:Railway');
  assert.equal(requests.length, 2);
  assert.equal(merged.length, 1);
  assert.equal(merged[0]['odpt:stationOrder'].length, 1);
  for (const [railway, host] of [['TokyoMetro.Ginza', 'api.odpt.org'], ['Toei.Shinjuku', 'api.odpt.org'], ['Keio.Keio', 'api-challenge.odpt.org'], ['JR-East.ChuoRapid', 'api-challenge.odpt.org']]) {
    requests.length = 0;
    await api.fetchType('odpt:TrainTimetable', { 'odpt:railway': 'odpt.Railway:' + railway });
    assert.equal(requests.length, 1);
    assert.equal(requests[0].hostname, host);
  }
  context.fetch = async () => ({ ok: true, json: async () => Array(1000).fill({}) });
  await assert.rejects(api.fetchType('odpt:TrainTimetable'), /取得上限/);
  const rail = { ids: ['a', 'b'], names: ['A', 'B'] };
  const train = (departure, arrival) => ({ 'odpt:trainTimetableObject': [
    { 'odpt:departureStation': 'a', 'odpt:departureTime': departure },
    { 'odpt:arrivalStation': 'b', ...(arrival ? { 'odpt:arrivalTime': arrival } : {}) },
  ] });
  assert.equal(search.latestLeg([train('00:30')], rail, 'A', 'B', 1679), null);
  const best = search.latestLeg([train('00:30'), train('00:10', '00:20'), train('23:50', '00:00')], rail, 'A', 'B', 1679);
  assert.equal(best.dep, 1450);
  assert.equal(best.arr, 1460);
  delete context.window.APP_CONFIG.ODPT_ACCESS_TOKEN;
  assert(api.hasToken());
  delete context.window.APP_CONFIG.ODPT_CHALLENGE_ACCESS_TOKEN;
  context.fetch = async (url) => {
    assert.equal(url, 'https://api-public.odpt.org/api/v4/odpt:Railway.json');
    return { ok: true, json: async () => [{ 'owl:sameAs': 'toei' }] };
  };
  assert.equal((await api.fetchType('odpt:Railway')).length, 1);
  console.log('PASS: dual API keys, complete railway merge, truncated timetable rejection, missing times, midnight, public fallback');
})().catch((error) => { console.error(error); process.exitCode = 1; });
