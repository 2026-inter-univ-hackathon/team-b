// 公共交通オープンデータセンター（ODPT）から時刻表を取り、終電を自分で探す。
// 経路探索 API が無いので、路線の駅並び順と列車時刻表だけで「乗り換えなし／最大2回」の経路を組む。
//
// 通常キー: api.odpt.org（メトロ・都営）。チャレンジキー: api-challenge.odpt.org（JR・私鉄）。
// トークンなし: api-public.odpt.org の公開ダンプ（都営 6 路線のみ。動作確認用）
//
// データの形（実測）:
//   odpt:Railway.odpt:stationOrder[] = { odpt:index, odpt:station, odpt:stationTitle.ja }
//   odpt:Station = { owl:sameAs, dc:title, geo:lat, geo:long, odpt:railway }
//   odpt:TrainTimetable.odpt:trainTimetableObject[] = { odpt:departureStation, odpt:departureTime "HH:MM", odpt:arrivalStation, odpt:arrivalTime }
//   深夜 0 時台は "00:xx" 表記。カレンダーは Weekday / Saturday / Holiday / SaturdayHoliday
// DOM には触らない。lasttrain.js から使う。

const ODPT = {
  API: "https://api.odpt.org/api/v4",
  CHALLENGE: "https://api-challenge.odpt.org/api/v4",
  PUBLIC: "https://api-public.odpt.org/api/v4",
  cache: {},

  token(key = "ODPT_ACCESS_TOKEN") {
    const t = typeof window !== "undefined" && window.APP_CONFIG && window.APP_CONFIG[key];
    if (!t || t.startsWith("ここに")) return null;
    return t;
  },

  hasToken() {
    return !!(this.token() || this.token("ODPT_CHALLENGE_ACCESS_TOKEN"));
  },

  async getJson(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`ODPT からデータを取得できません（HTTP ${res.status}）`);
    return res.json();
  },

  // type は "odpt:Railway" など。params は完全一致で絞り込む
  async fetchType(type, params = {}) {
    const t = this.token();
    const challenge = this.token("ODPT_CHALLENGE_ACCESS_TOKEN");
    if (t || challenge) {
      let sources = [[this.API, t], [this.CHALLENGE, challenge]].filter(([, key]) => key);
      const operator = (params["odpt:operator"] || params["odpt:railway"] || "").split(":")[1]?.split(".")[0];
      if (operator && t && challenge) {
        const regular = operator === "TokyoMetro" || operator === "Toei";
        sources = sources.filter(([base]) => base === (regular ? this.API : this.CHALLENGE));
      }
      const lists = await Promise.all(sources.map(async ([base, key]) => {
        const q = new URLSearchParams({ ...params, "acl:consumerKey": key });
        const rows = await this.getJson(`${base}/${type}?${q}`);
        // APIの上限で欠けた時刻表を「終電」として表示しない。
        if (rows.length >= 1000 && type === "odpt:TrainTimetable") {
          throw new Error("列車時刻表が取得上限に達しました。この路線の終電は確定できません。");
        }
        return rows;
      }));
      const merged = new Map();
      for (const row of lists.flat()) {
        const id = row["owl:sameAs"], previous = merged.get(id);
        // 別APIには乗換先参照用の駅順が空の路線もある。完全な情報を残す。
        if (previous && (previous["odpt:stationOrder"] || []).length > (row["odpt:stationOrder"] || []).length) continue;
        merged.set(id, { ...previous, ...row });
      }
      return [...merged.values()];
    }
    // 公開ダンプは絞り込みが効かないので、1 回だけ全件を読んで手元で絞る
    const key = `dump:${type}`;
    if (!this.cache[key]) this.cache[key] = this.getJson(`${this.PUBLIC}/${type}.json`);
    const all = await this.cache[key];
    return all.filter((o) => Object.entries(params).every(([k, v]) => o[k] === v));
  },

  // 路線と駅は一度に全部読む（数 MB 以下）。以後の駅名検索・最寄り駅は手元で済む
  async network() {
    if (!this.cache.network) {
      this.cache.network = (async () => {
        const railways = await this.fetchType("odpt:Railway");
        if (!this.hasToken()) return LastTrainSearch.buildNetwork(railways, await this.fetchType("odpt:Station"));
        // まず事業者ごとに取得し、1000件に達した事業者だけ路線ごとに分ける。
        const stations = [];
        for (const operator of new Set(railways.map((rail) => rail["odpt:operator"]).filter(Boolean))) {
          const rows = await this.fetchType("odpt:Station", { "odpt:operator": operator });
          if (rows.length < 1000) { stations.push(...rows); continue; }
          for (const rail of railways.filter((rail) => rail["odpt:operator"] === operator)) {
            stations.push(...await this.fetchType("odpt:Station", { "odpt:railway": rail["owl:sameAs"] }));
          }
        }
        return LastTrainSearch.buildNetwork(railways, stations);
      })().catch((error) => { delete this.cache.network; throw error; });
    }
    return this.cache.network;
  },

  // 路線 × カレンダーの列車時刻表。候補のカレンダーを順に試し、最初に見つかったものを使う
  async trainTimetables(railwayId, calendarIds) {
    for (const cal of calendarIds) {
      const key = `tt:${railwayId}:${cal}`;
      if (!this.cache[key]) this.cache[key] = this.fetchType("odpt:TrainTimetable", { "odpt:railway": railwayId, "odpt:calendar": cal });
      const list = await this.cache[key];
      if (list.length) return list;
    }
    return [];
  },
};

const LastTrainSearch = {
  // 2026 年の祝日（休日ダイヤ判定用）
  HOLIDAYS: [
    "2026-01-01", "2026-01-12", "2026-02-11", "2026-02-23", "2026-03-20", "2026-04-29",
    "2026-05-03", "2026-05-04", "2026-05-05", "2026-05-06", "2026-07-20", "2026-08-11",
    "2026-09-21", "2026-09-22", "2026-09-23", "2026-10-12", "2026-11-03", "2026-11-23",
    "2026-12-31", "2027-01-01", "2027-01-02", "2027-01-03",
  ],
  TRAIN_TYPES: {
    Local: "各駅停車", Rapid: "快速", Express: "急行", SemiExpress: "準急", LimitedExpress: "特急",
    CommuterRapid: "通勤快速", CommuterExpress: "通勤急行", RapidExpress: "快速急行", SpecialRapid: "特別快速",
  },
  TRANSFER_MINUTES: 5,
  END_OF_NIGHT: 27 * 60 + 59, // 翌 3:59 を運行日の分で表す

  // "HH:MM" → 運行日 0:00 からの分。4 時より前は翌日扱い
  toMin(hhmm) {
    const [h, m] = hhmm.split(":").map(Number);
    let t = h * 60 + m;
    if (t < 4 * 60) t += 1440;
    return t;
  },

  // 運行日の 0:00。4 時より前は前日のダイヤがまだ動いている
  operatingDay(now = new Date()) {
    const d = new Date(now);
    if (d.getHours() < 4) d.setDate(d.getDate() - 1);
    d.setHours(0, 0, 0, 0);
    return d;
  },

  calendarsFor(day) {
    const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
    const dow = day.getDay();
    if (dow === 0 || this.HOLIDAYS.includes(key)) return ["odpt.Calendar:Holiday", "odpt.Calendar:SaturdayHoliday"];
    if (dow === 6) return ["odpt.Calendar:Saturday", "odpt.Calendar:SaturdayHoliday"];
    return ["odpt.Calendar:Weekday"];
  },

  // 路線・駅の生データを「駅名（dc:title）をノードにしたネットワーク」に整える
  buildNetwork(railways, stations) {
    const titleOf = {};
    const stationList = [];
    for (const s of stations) {
      titleOf[s["owl:sameAs"]] = s["dc:title"];
      if (typeof s["geo:lat"] === "number") stationList.push({ id: s["owl:sameAs"], title: s["dc:title"], lat: s["geo:lat"], lon: s["geo:long"] });
    }
    const rails = railways.map((r) => {
      const order = (r["odpt:stationOrder"] || []).slice().sort((a, b) => a["odpt:index"] - b["odpt:index"]);
      const ids = order.map((o) => o["odpt:station"]);
      const names = order.map((o) => titleOf[o["odpt:station"]] || (o["odpt:stationTitle"] && o["odpt:stationTitle"].ja) || "");
      return { id: r["owl:sameAs"], title: (r["odpt:railwayTitle"] && r["odpt:railwayTitle"].ja) || r["dc:title"] || r["owl:sameAs"], ids, names };
    });
    const names = new Set(rails.flatMap((r) => r.names).filter(Boolean));
    return { rails, stations: stationList, titleOf, names };
  },

  distance(lat1, lon1, lat2, lon2) {
    const R = 6371000, toRad = (x) => (x * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  },

  nearestStation(network, lat, lon) {
    let best = null, bestD = Infinity;
    for (const s of network.stations) {
      const d = this.distance(lat, lon, s.lat, s.lon);
      if (d < bestD) { bestD = d; best = s; }
    }
    if (!best || bestD > 2500) return null;
    return { title: best.title, distance: Math.round(bestD) };
  },

  // 入力された駅名をデータ上の駅名に合わせる（「駅」を落とす、完全一致）
  normalizeName(network, input) {
    const n = input.trim().replace(/駅$/, "");
    if (network.names.has(n)) return n;
    return null;
  },

  // 候補を一度に配列化せず、最大3乗車まで順に生成する。
  // 同じ駅への戻りと同一路線での連続乗り換えは除外する。
  *candidates(network, from, to, maxTransfers = 1) {
    if (from === to) return;
    const stationRails = new Map();
    for (const rail of network.rails) {
      for (const name of new Set(rail.names.filter(Boolean))) {
        if (!stationRails.has(name)) stationRails.set(name, []);
        stationRails.get(name).push(rail);
      }
    }
    const maxRides = maxTransfers + 1;
    // 到着駅までに最低何乗車必要か。残り乗車数で届かない枝は探索しない。
    const distance = new Map([[to, 0]]), expanded = new Set();
    let frontier = [to];
    for (let rides = 1; rides <= maxRides && frontier.length; rides++) {
      const next = [];
      for (const station of frontier) {
        for (const rail of stationRails.get(station) || []) {
          if (expanded.has(rail.id)) continue;
          expanded.add(rail.id);
          for (const name of rail.names) {
            if (!name || distance.has(name)) continue;
            distance.set(name, rides); next.push(name);
          }
        }
      }
      frontier = next;
    }
    function* walk(station, legs, visited) {
      const remaining = maxRides - legs.length;
      if ((distance.get(station) ?? Infinity) > remaining) return;
      for (const rail of stationRails.get(station) || []) {
        if (rail.id === legs[legs.length - 1]?.rail.id) continue;
        if (rail.names.includes(to)) yield [...legs, { rail, from: station, to }];
        if (remaining === 1) continue;
        for (const transfer of new Set(rail.names)) {
          if (!transfer || transfer === to || visited.has(transfer)) continue;
          if ((distance.get(transfer) ?? Infinity) > remaining - 1) continue;
          if (!(stationRails.get(transfer) || []).some((other) => other.id !== rail.id)) continue;
          yield* walk(transfer, [...legs, { rail, from: station, to: transfer }], new Set([...visited, transfer]));
        }
      }
    }
    yield* walk(from, [], new Set([from]));
  },

  // 路線 rail を from → to と乗り、limit（分）までに着ける中で一番遅く出る列車
  latestLeg(trains, rail, from, to, limit) {
    const fromId = rail.ids[rail.names.indexOf(from)];
    const toId = rail.ids[rail.names.indexOf(to)];
    let best = null;
    for (const t of trains) {
      const objs = t["odpt:trainTimetableObject"] || [];
      let dep = null;
      for (const o of objs) {
        const st = o["odpt:departureStation"] || o["odpt:arrivalStation"];
        if (dep === null) {
          if (st === fromId && o["odpt:departureTime"]) dep = this.toMin(o["odpt:departureTime"]);
          continue;
        }
        if (st === toId) {
          const time = o["odpt:arrivalTime"] || o["odpt:departureTime"];
          // 通過駅など、時刻のないエントリーは到着として扱わない。
          if (!time) break;
          const arr = this.toMin(time);
          if (arr <= limit && arr >= dep && (!best || dep > best.dep || (dep === best.dep && arr < best.arr))) best = { dep, arr, train: t };
          break;
        }
      }
    }
    return best;
  },

  describeTrain(network, t) {
    const type = (t["odpt:trainType"] || "").split(".").pop();
    const dest = (t["odpt:destinationStation"] || []).map((id) => network.titleOf[id] || id.split(".").pop()).join("・");
    return { trainType: this.TRAIN_TYPES[type] || type || "", headsign: dest ? `${dest}行` : "" };
  },

  // 終電を探す。Web・iOSとも2回を明示指定。省略時は従来の呼び出しとの互換で1回。
  // 見つかれば実日時とlegs、無ければ { noRoute: true }。
  async search(network, from, to, now = new Date(), maxTransfers = 1) {
    const day = this.operatingDay(now);
    const calendars = this.calendarsFor(day);
    const cands = this.candidates(network, from, to, maxTransfers);
    // 共有する末尾区間は一度だけ計算。時刻表も路線ごとに一度だけ要求する。
    const timetables = new Map(), legResults = new Map();
    const timetableOf = (rail) => {
      if (!timetables.has(rail.id)) timetables.set(rail.id, ODPT.trainTimetables(rail.id, calendars));
      return timetables.get(rail.id);
    };
    let best = null;
    for (const legs of cands) {
      let limit = this.END_OF_NIGHT;
      const solved = [];
      for (let i = legs.length - 1; i >= 0; i--) {
        const leg = legs[i];
        const key = JSON.stringify([leg.rail.id, leg.from, leg.to, limit]);
        if (!legResults.has(key)) legResults.set(key, this.latestLeg(await timetableOf(leg.rail), leg.rail, leg.from, leg.to, limit));
        const found = legResults.get(key);
        if (!found) { solved.length = 0; break; }
        solved.unshift({ ...leg, dep: found.dep, arr: found.arr, ...this.describeTrain(network, found.train) });
        limit = found.dep - this.TRANSFER_MINUTES;
      }
      if (!solved.length) continue;
      const leaveMin = solved[0].dep, arriveMin = solved[solved.length - 1].arr;
      if (!best || leaveMin > best.leaveMin || (leaveMin === best.leaveMin && (solved.length < best.legs.length || (solved.length === best.legs.length && arriveMin < best.arriveMin)))) {
        best = { legs: solved, leaveMin, arriveMin };
      }
    }
    if (!best) return { noRoute: true };
    const at = (min) => day.getTime() + min * 60000;
    return {
      day,
      calendar: calendars[0].split(":").pop(),
      legs: best.legs.map((l) => ({ line: l.rail.title, from: l.from, to: l.to, departAt: at(l.dep), arriveAt: at(l.arr), trainType: l.trainType, headsign: l.headsign })),
      leaveAt: at(best.leaveMin),
      arriveAt: at(best.arriveMin),
    };
  },
};

if (typeof module !== "undefined") module.exports = { ODPT, LastTrainSearch };
