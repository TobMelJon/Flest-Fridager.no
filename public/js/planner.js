/*
 * Kalenderbygging, inneklemte dager og verdiberegning for feriedager.
 *
 * Verdimodellen
 * -------------
 * Tar du fri på noen arbeidsdager, smelter de sammen med helger og røde dager
 * rundt til én sammenhengende friperiode. Verdien (bonus) av et slikt valg er:
 *
 *     bonus = lengden på friperioden - "vanlig" lengde for samme antall feriedager
 *
 * der "vanlig" lengde er det lengste friperioden de samme feriedagene kan gi i en
 * helt vanlig uke uten røde dager (1 dag → 3 dager, 5 dager → 9 dager osv.).
 * Bonus er altså fridager du får *i tillegg* fordi du treffer røde dager.
 * Eksempel: inneklemt fredag etter Kristi himmelfart: 1 feriedag → 4 dager fri,
 * vanlig ville vært 3, bonus = 1.
 *
 * Dager uten bonus koster like mye uansett hvor de legges, så de fordeles ikke
 * automatisk – det er opp til brukeren.
 */
(function (root) {
  "use strict";

  var H = (typeof module !== "undefined" && module.exports)
    ? require("./holidays.js")
    : root.FFHolidays;

  var DEFAULT_WORKDAYS = [1, 2, 3, 4, 5];

  /*
   * Bygger en liste med dager fra startKey til og med endKey.
   * options:
   *   workdays:    ukedager man jobber, 0 = søndag ... 6 = lørdag (standard man–fre)
   *   extraOff:    { "YYYY-MM-DD": "Navn" } – ekstra fridager (f.eks. julaften)
   *   vacation:    { "YYYY-MM-DD": true }    – feriedager brukeren selv har lagt inn
   *   planFrom/planTo: dagene som kan foreslås som feriedager
   */
  function buildDays(startKey, endKey, options) {
    options = options || {};
    var workdays = options.workdays || DEFAULT_WORKDAYS;
    var extraOff = options.extraOff || {};
    var vacation = options.vacation || {};
    var planFrom = options.planFrom || startKey;
    var planTo = options.planTo || endKey;

    var holidayCache = {};
    function holidaysFor(year) {
      if (!holidayCache[year]) holidayCache[year] = H.norwegianHolidays(year);
      return holidayCache[year];
    }

    var days = [];
    var end = H.fromKey(endKey);
    for (var d = H.fromKey(startKey); d <= end; d = H.addDays(d, 1)) {
      var key = H.toKey(d);
      var weekday = d.getUTCDay();
      var holiday = holidaysFor(d.getUTCFullYear())[key] || null;
      var extra = extraOff[key] || null;
      var weekend = workdays.indexOf(weekday) === -1;
      var off = weekend || !!holiday || !!extra;
      var locked = !off && !!vacation[key];
      days.push({
        key: key,
        date: d,
        weekday: weekday,
        weekend: weekend,
        holiday: holiday,
        extra: extra,
        off: off,
        locked: locked,
        takeable: !off && !locked && key >= planFrom && key <= planTo,
        squeeze: false,
        suggested: false
      });
    }
    markSqueezeDays(days);
    return days;
  }

  // En inneklemt dag er en enkelt arbeidsdag med fridager på begge sider.
  function markSqueezeDays(days) {
    for (var i = 1; i < days.length - 1; i++) {
      days[i].squeeze = !days[i].off && days[i - 1].off && days[i + 1].off;
    }
    return days;
  }

  /*
   * base[c] = lengste friperiode c feriedager kan gi i vanlige uker uten røde
   * dager, gitt hvilke ukedager man jobber. Regnes ut på en syntetisk kalender.
   */
  function baselineTable(workdays, maxCost) {
    workdays = workdays || DEFAULT_WORKDAYS;
    var base = [0];
    var perWeek = workdays.length;
    if (perWeek === 0) {
      for (var z = 1; z <= maxCost; z++) base.push(z);
      return base;
    }
    var n = 7 * (Math.ceil(maxCost / perWeek) + 3);
    var free = [];
    for (var i = 0; i < n; i++) free.push(workdays.indexOf(i % 7) === -1);
    for (var c = 1; c <= maxCost; c++) base.push(c);
    for (var s = 0; s < n; s++) {
      if (free[s]) continue;
      var L = s;
      while (L > 0 && free[L - 1]) L--;
      var cost = 0;
      for (var j = s; j < n; j++) {
        if (free[j]) continue;
        cost++;
        if (cost > maxCost) break;
        var R = j + 1;
        while (R < n && free[R]) R++;
        if (R - L > base[cost]) base[cost] = R - L;
      }
    }
    return base;
  }

  /*
   * Forbereder hjelpestrukturer for å regne ut bonus for en friperiode raskt,
   * også når den slår seg sammen med feriedager brukeren har lagt inn selv.
   */
  function prepare(days, workdays, maxCost) {
    var n = days.length;
    var free = new Array(n);
    var totalLocked = 0;
    for (var i = 0; i < n; i++) {
      free[i] = days[i].off || days[i].locked;
      if (days[i].locked) totalLocked++;
    }
    var base = baselineTable(workdays, maxCost + totalLocked);

    // Bonus som egne feriedager allerede gir, slik at bare *økningen* teller.
    var lockedPrefix = new Array(n + 1).fill(0);
    var existingPrefix = new Array(n + 1).fill(0);
    var existingAt = new Array(n).fill(0);
    for (var s = 0; s < n; s++) {
      if (!free[s]) continue;
      var e = s;
      var locked = 0;
      while (e < n && free[e]) { if (days[e].locked) locked++; e++; }
      if (locked) existingAt[s] = Math.max(0, (e - s) - base[locked]);
      s = e - 1;
    }
    for (var p = 0; p < n; p++) {
      lockedPrefix[p + 1] = lockedPrefix[p] + (days[p].locked ? 1 : 0);
      existingPrefix[p + 1] = existingPrefix[p] + existingAt[p];
    }

    return {
      n: n,
      free: free,
      base: base,
      // Bonus for friperioden [L, R) når `cost` nye feriedager er lagt inn.
      gain: function (L, R, cost) {
        var locked = lockedPrefix[R] - lockedPrefix[L];
        var existing = existingPrefix[R] - existingPrefix[L];
        return (R - L) - base[cost + locked] - existing;
      }
    };
  }

  /*
   * Går gjennom alle mulige sammenhengende uttak av feriedager som starter på
   * dag i (maks maxCost dager) og kaller visit(i, j, cost, L, R, gain), der
   * j er siste feriedag og [L, R) er hele friperioden.
   */
  function eachSegmentFrom(days, ctx, i, maxCost, visit) {
    var free = ctx.free;
    var n = ctx.n;
    var L = i;
    while (L > 0 && free[L - 1]) L--;
    var cost = 0;
    for (var j = i; j < n; j++) {
      if (free[j]) continue;
      if (!days[j].takeable) break;
      cost++;
      if (cost > maxCost) break;
      var R = j + 1;
      while (R < n && free[R]) R++;
      visit(j, cost, L, R, ctx.gain(L, R, cost));
    }
  }

  function normalizeOptions(options) {
    options = options || {};
    return {
      workdays: options.workdays || DEFAULT_WORKDAYS,
      maxCost: Math.max(1, Math.floor(options.maxCost || 5)),
      // Minste bonus per feriedag for at et uttak regnes som verdifullt.
      minRatio: options.minRatio > 0 ? options.minRatio : 0.0001
    };
  }

  function isValuable(gain, cost, opts) {
    return gain >= 1 && gain / cost >= opts.minRatio - 1e-9;
  }

  /*
   * Velger de verdifulle uttakene som til sammen gir mest bonus innenfor
   * budsjettet. Bruker bare dager som faktisk gir bonus – resten av budsjettet
   * blir stående igjen til brukeren.
   *
   * Løses eksakt med dynamisk programmering over tidslinjen: dp[i][k] er beste
   * poengsum fra dag i og utover med k feriedager igjen.
   *
   * Returnerer { chosen: [indekser], used, gained }.
   */
  function optimize(days, budget, options) {
    var opts = normalizeOptions(options);
    var n = days.length;
    var B = Math.max(0, Math.floor(budget || 0));
    var ctx = prepare(days, opts.workdays, opts.maxCost);

    var W = B + 1;
    // Poeng = bonus * SCALE - brukte dager * DAY - antall perioder.
    // Bonus avgjør; ved likhet brukes færrest mulig feriedager, deretter færrest perioder.
    var DAY = n + 1;
    var SCALE = DAY * (B + 1) * 2 + n;
    var dp = new Float64Array((n + 2) * W);
    var choice = new Int32Array((n + 2) * W).fill(-1);

    for (var i = n - 1; i >= 0; i--) {
      for (var k = 0; k <= B; k++) {
        var best = dp[(i + 1) * W + k];
        var bestEnd = -1;
        if (days[i].takeable && k > 0) {
          eachSegmentFrom(days, ctx, i, Math.min(k, opts.maxCost), function (j, cost, L, R, gain) {
            if (!isValuable(gain, cost, opts)) return;
            var next = Math.min(R + 1, n);
            var score = gain * SCALE - cost * DAY - 1 + dp[next * W + (k - cost)];
            if (score > best) { best = score; bestEnd = j; }
          });
        }
        dp[i * W + k] = best;
        choice[i * W + k] = bestEnd;
      }
    }

    var chosen = [];
    var gained = 0;
    var pos = 0;
    var budgetLeft = B;
    while (pos < n) {
      var end = choice[pos * W + budgetLeft];
      if (end < 0) { pos++; continue; }
      var cost = 0;
      for (var c = pos; c <= end; c++) {
        if (!ctx.free[c]) { chosen.push(c); cost++; }
      }
      budgetLeft -= cost;
      var l = pos;
      while (l > 0 && ctx.free[l - 1]) l--;
      var r = end + 1;
      while (r < n && ctx.free[r]) r++;
      gained += ctx.gain(l, r, cost);
      pos = r + 1;
    }

    return { chosen: chosen, used: chosen.length, gained: gained };
  }

  /*
   * Utvidelser av egne friperioder: hva du får ved å legge til noen feriedager
   * rett før eller etter en periode du allerede har lagt inn. Tar du f.eks.
   * onsdag–fredag (5 dager fri), gir mandag–tirsdag samme uke 9 dager fri.
   * Tas bare med når periodene vokser mer enn antall dager du legger til.
   *
   * Returnerer [{ start, end, length, options: [{ cost, gain, length, start, end, take }] }]
   * der `take` er indeksene til dagene som må legges til.
   */
  function extensionOptions(days, options) {
    var opts = normalizeOptions(options);
    var n = days.length;
    var K = opts.maxCost;
    var free = days.map(function (d) { return d.off || d.locked; });
    var runs = [];
    for (var s = 0; s < n; s++) {
      if (!free[s]) continue;
      var e = s;
      var hasLocked = false;
      while (e < n && free[e]) { if (days[e].locked) hasLocked = true; e++; }
      if (hasLocked) runs.push([s, e]);
      s = e - 1;
    }

    return runs.map(function (run) {
      var s = run[0], e = run[1];
      var left = [], right = [];
      for (var i = s - 1; i >= 0 && left.length < K; i--) {
        if (free[i]) continue;
        if (!days[i].takeable) break;
        left.push(i);
      }
      for (var j = e; j < n && right.length < K; j++) {
        if (free[j]) continue;
        if (!days[j].takeable) break;
        right.push(j);
      }
      var list = [];
      for (var a = 0; a <= left.length; a++) {
        for (var b = 0; b <= right.length && a + b <= K; b++) {
          if (a + b === 0) continue;
          var L = a ? left[a - 1] : s;
          while (L > 0 && free[L - 1]) L--;
          var R = b ? right[b - 1] + 1 : e;
          while (R < n && free[R]) R++;
          var gain = (R - L) - (e - s) - (a + b);
          if (gain < 1) continue;
          list.push({
            cost: a + b,
            gain: gain,
            length: R - L,
            start: days[L].key,
            end: days[R - 1].key,
            take: left.slice(0, a).concat(right.slice(0, b)).sort(function (x, y) { return x - y; })
          });
        }
      }
      list.sort(function (x, y) { return (y.gain / y.cost) - (x.gain / x.cost) || y.gain - x.gain || x.cost - y.cost; });
      return { start: days[s].key, end: days[e - 1].key, length: e - s, options: list };
    });
  }

  /*
   * Verdikart: for hver dag som kan tas som ferie, det beste uttaket den inngår i
   * (høyest bonus per feriedag, deretter høyest bonus). null = ingen bonus.
   * Hvert element: { ratio, gain, cost, start, end, length, extends }, der
   * `extends` er lengden på egen periode som utvides (eller undefined).
   */
  function dayValues(days, options) {
    var opts = normalizeOptions(options);
    var ctx = prepare(days, opts.workdays, opts.maxCost);
    var values = new Array(days.length).fill(null);

    function offer(d, v) {
      var cur = values[d];
      if (!cur || v.ratio > cur.ratio + 1e-9 ||
          (Math.abs(v.ratio - cur.ratio) < 1e-9 && v.gain > cur.gain)) {
        values[d] = v;
      }
    }

    for (var i = 0; i < days.length; i++) {
      if (!days[i].takeable) continue;
      eachSegmentFrom(days, ctx, i, opts.maxCost, function (j, cost, L, R, gain) {
        if (gain < 1) return;
        var v = {
          ratio: gain / cost, gain: gain, cost: cost,
          start: days[L].key, end: days[R - 1].key, length: R - L
        };
        for (var d = i; d <= j; d++) {
          if (!ctx.free[d]) offer(d, v);
        }
      });
    }

    // Live verdi rundt egne feriedager.
    extensionOptions(days, opts).forEach(function (run) {
      run.options.forEach(function (o) {
        var v = {
          ratio: o.gain / o.cost, gain: o.gain, cost: o.cost,
          start: o.start, end: o.end, length: o.length, extends: run.length
        };
        o.take.forEach(function (d) { offer(d, v); });
      });
    });
    return values;
  }

  /*
   * Lister sammenhengende friperioder som inneholder minst én feriedag
   * (egen eller foreslått). Hver periode:
   *   { start, end, length, vacationDays, suggestedDays, ownDays, bonus }
   */
  function vacationPeriods(days, options) {
    var opts = normalizeOptions(options);
    var periods = [];
    var n = days.length;
    var maxUsed = 0;
    function isFree(d) { return d.off || d.locked || d.suggested; }
    for (var i = 0; i < n; i++) {
      if (!isFree(days[i])) continue;
      var j = i;
      var suggested = 0;
      var own = 0;
      while (j < n && isFree(days[j])) {
        if (days[j].suggested) suggested++;
        if (days[j].locked) own++;
        j++;
      }
      var used = suggested + own;
      if (used > 0) {
        maxUsed = Math.max(maxUsed, used);
        periods.push({
          start: days[i].key,
          end: days[j - 1].key,
          length: j - i,
          vacationDays: used,
          suggestedDays: suggested,
          ownDays: own
        });
      }
      i = j - 1;
    }
    var base = baselineTable(opts.workdays, maxUsed);
    periods.forEach(function (p) { p.bonus = p.length - base[p.vacationDays]; });
    return periods;
  }

  var api = {
    buildDays: buildDays,
    markSqueezeDays: markSqueezeDays,
    baselineTable: baselineTable,
    optimize: optimize,
    extensionOptions: extensionOptions,
    dayValues: dayValues,
    vacationPeriods: vacationPeriods
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.FFPlanner = api;
  }
})(this);
