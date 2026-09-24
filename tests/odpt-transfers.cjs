// Offline route fixtures: exact connections, limits, caching, and preference order.
const assert = require('node:assert/strict');
const { ODPT, LastTrainSearch: search } = require('../js/odpt.js');
const rail = (id, names) => ({ id, title: id, names, ids: names.map(n => id + ':' + n) });
const train = (rail, stops) => ({ 'odpt:trainTimetableObject': stops.map(([name, time]) => ({
  'odpt:departureStation': rail.id + ':' + name, 'odpt:departureTime': time,
})) });
const network = rails => ({ rails, titleOf: {} });
const now = new Date(2026, 8, 20, 12);
const at = time => search.operatingDay(now).getTime() + search.toMin(time) * 60000;
let data = {}, calls;
ODPT.trainTimetables = async id => { calls.set(id, (calls.get(id) || 0) + 1); return data[id] || []; };
async function run(rails, from = 'A', to = 'D', maxTransfers = 2) {
  calls = new Map();
  const result = await search.search(network(rails), from, to, now, maxTransfers);
  assert([...calls.values()].every(count => count === 1), 'one timetable request per railway/search');
  if (!result.noRoute) {
    assert(result.legs.length <= maxTransfers + 1);
    for (let i = 1; i < result.legs.length; i++) {
      assert.equal(result.legs[i - 1].to, result.legs[i].from);
      assert(result.legs[i].departAt - result.legs[i - 1].arriveAt >= 5 * 60000);
    }
  }
  return result;
}
(async () => {
  const a = rail('first', ['A', 'B']), b = rail('middle', ['B', 'C']), c = rail('last', ['C', 'D']);
  data = {
    first: [train(a, [['A','23:50'], ['B','00:05']]), train(a, [['A','23:55'], ['B','00:11']])],
    middle: [train(b, [['B','00:10'], ['C','00:25']])],
    last: [train(c, [['C','00:30'], ['D','00:50']])],
  };
  let result = await run([a,b,c]);
  assert.equal(result.legs.length, 3);
  assert.equal(result.leaveAt, at('23:50')); // Later first train misses its connection.
  assert.equal(result.arriveAt, at('00:50'));
  assert((await run([a,b,c], 'A','D',1)).noRoute);
  assert((await search.search(network([a,b,c]), 'A','D',now)).noRoute, 'default preserves existing native caller');
  const fourth = rail('fourth', ['D','E']);
  data.fourth = [train(fourth, [['D','00:55'],['E','01:10']])];
  assert((await run([a,b,c,fourth], 'A','E')).noRoute);
  assert.equal(calls.size, 0, 'topologically impossible route needs no HTTP');
  const savedMiddle = data.middle;
  data.middle = [train(b, [['B','00:10'],['C','00:26']])];
  assert((await run([a,b,c])).noRoute); // Only four minutes for second transfer.
  data.middle = [];
  assert((await run([a,b,c])).noRoute); // Missing timetable is never fabricated.
  data.middle = savedMiddle;
  assert((await run([a,b,c], 'D','A')).noRoute); // No reverse-direction trains.
  assert((await run([a,b,c], 'A','A')).noRoute);
  const direct = rail('direct', ['A','D']);
  data.direct = [train(direct, [['A','23:45'],['D','00:15']])];
  result = await run([direct,a,b,c]);
  assert.equal(result.legs.length, 3); // Latest departure wins over fewer transfers.
  data.direct = [train(direct, [['A','23:50'],['D','01:00']])];
  result = await run([a,b,c,direct]);
  assert.equal(result.legs.length, 1); // Same departure: fewer transfers, even if later arrival.
  result = await run([direct,a,b,c]);
  assert.equal(result.legs.length, 1); // Independent of candidate iteration order.
  const alternative = rail('alternative', ['A','D']);
  data.alternative = [train(alternative, [['A','23:50'],['D','00:40']])];
  assert.equal((await run([direct,alternative])).legs[0].line, 'alternative');
  assert.equal((await run([direct], 'A','D',0)).legs.length, 1);
  const one = rail('one', ['A','C']);
  data.one = [train(one, [['A','00:00'],['C','00:25']])];
  assert.equal((await run([one,c])).legs.length, 2);
  // Many first-leg choices share the same suffix. Solve that suffix once.
  const sources = Array.from({length: 25}, (_, i) => rail('source'+i,['A','B']));
  for (const r of sources) data[r.id] = [train(r,[['A','23:50'],['B','00:05']])];
  const latest = search.latestLeg; let suffixCalls = 0;
  search.latestLeg = function(trains, r, ...args) { if (r.id === 'last') suffixCalls++; return latest.call(this,trains,r,...args); };
  await run([...sources,b,c]);
  assert.equal(suffixCalls, 1);
  search.latestLeg = latest;
  const paths = [...search.candidates(network([rail('loop',['A','B','C']),b,c]),'A','D',2)];
  for (const path of paths) {
    const stops = [path[0].from,...path.map(l => l.to)];
    assert.equal(new Set(stops).size, stops.length, 'no repeated transfer stations');
    assert(path.length <= 3);
  }
  const original = ODPT.trainTimetables;
  ODPT.trainTimetables = async () => { throw new Error('HTTP 429'); };
  await assert.rejects(search.search(network([direct]), 'A','D',now), /429/);
  ODPT.trainTimetables = original;
  console.log('PASS: two transfers, midnight, both transfer margins, maximum bound, direction, absent data, direct/one-transfer regression, tie priority, suffix memoization, no loops, HTTP failures');
})().catch(error => { console.error(error); process.exitCode = 1; });
