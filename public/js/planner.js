/*
 * Kalenderbygging, inneklemte dager og verdiberegning for feriedager.
 *
 * Verdimodellen: fridager du kobler sammen
 * ----------------------------------------
 * Tar du fri på noen arbeidsdager, smelter de sammen med fridagene rundt til én
 * sammenhengende friperiode. Fridager du uansett har (helger, røde dager og
 * feriedager du allerede har valgt) ligger i "friblokker". Verdien er hvor mange
 * fridager valget kobler på utover den største blokken du uansett har:
 *
 *     verdi = lengde på friperioden - feriedager brukt - største friblokk
 *             - det samme antall feriedager kobler sammen i en vanlig uke
 *
 * Eksempler:
 *   Inneklemt fredag etter Kristi himmelfart: 4 - 1 - 2 - 0 = +1
 *   Onsdag før skjærtorsdag: 6 - 1 - 5 - 0 = 0 (påsken er fri uansett)
 *   Mandag etter 1. januar på en fredag: 4 - 1 - 3 - 0 = 0
 *   Mandag–onsdag før påske: 10 - 3 - 5 - 0 = +2 (helgen kobles til påsken)
 *   En helt vanlig uke: 9 - 5 - 2 - 2 = 0
 *   Valgt mandag og fredag, ta tirsdag–torsdag: 9 - 3 - 3 - 0 = +3
 *
 * Dager uten verdi koster like mye uansett hvor de legges, så de fordeles ikke
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
   * Går gjennom alle sammenhengende uttak som starter på arbeidsdag i (maks
   * maxCost feriedager) og kaller visit(j, info) for hver mulig siste dag j.
   * info = { L, R, cost, largest } der [L, R) er hele friperioden og largest er
   * den største friblokken i den som du ville hatt uansett.
   */
  function eachSegmentFrom(days, free, i, maxCost, visit) {
    var n = days.length;
    var L = i;
    while (L > 0 && free[L - 1]) L--;
    var largest = i - L;
    var stretch = 0;
    var cost = 0;
    for (var j = i; j < n; j++) {
      if (free[j]) { stretch++; continue; }
      if (!days[j].takeable) break;
      if (stretch > largest) largest = stretch;
      stretch = 0;
      cost++;
      if (cost > maxCost) break;
      var R = j + 1;
      while (R < n && free[R]) R++;
      visit(j, { L: L, R: R, cost: cost, largest: Math.max(largest, R - j - 1) });
    }
  }

  /*
   * bridgeBase[c] = hvor mye c feriedager kan koble sammen i vanlige uker uten
   * røde dager (f.eks. 5 dager kobler to helger: 9 - 5 - 2 = 2). Trekkes fra,
   * slik at helt vanlige ferieuker får verdi 0.
   */
  function bridgeBaseTable(workdays, maxCost) {
    workdays = workdays || DEFAULT_WORKDAYS;
    var base = [];
    for (var c = 0; c <= maxCost; c++) base.push(0);
    if (!workdays.length) return base;
    var n = 7 * (Math.ceil(maxCost / workdays.length) + 4);
    var days = [];
    var free = [];
    for (var i = 0; i < n; i++) {
      var isFree = workdays.indexOf(i % 7) === -1;
      free.push(isFree);
      days.push({ takeable: !isFree });
    }
    for (var s = 0; s < n; s++) {
      if (free[s]) continue;
      eachSegmentFrom(days, free, s, maxCost, function (j, info) {
        var v = (info.R - info.L) - info.cost - info.largest;
        if (v > base[info.cost]) base[info.cost] = v;
      });
    }
    return base;
  }

  function normalizeOptions(options) {
    options = options || {};
    return {
      workdays: options.workdays || DEFAULT_WORKDAYS,
      maxCost: Math.max(1, Math.floor(options.maxCost || 5)),
      // Minste verdi per feriedag for at et uttak foreslås.
      minRatio: options.minRatio > 0 ? options.minRatio : 0.0001
    };
  }

  function prepare(days, opts) {
    var n = days.length;
    var free = new Array(n);
    var lockedPrefix = new Array(n + 1);
    lockedPrefix[0] = 0;
    for (var i = 0; i < n; i++) {
      free[i] = days[i].off || days[i].locked;
      lockedPrefix[i + 1] = lockedPrefix[i] + (days[i].locked ? 1 : 0);
    }
    var base = bridgeBaseTable(opts.workdays, Math.max(opts.maxCost, 1));
    return {
      free: free,
      gain: function (info) {
        return (info.R - info.L) - info.cost - info.largest - base[info.cost];
      },
      // Om friperioden henger sammen med feriedager brukeren har valgt.
      touchesOwn: function (info) {
        return lockedPrefix[info.R] - lockedPrefix[info.L] > 0;
      }
    };
  }

  function isValuable(gain, cost, opts) {
    return gain >= 1 && gain / cost >= opts.minRatio - 1e-9;
  }

  /*
   * Velger de verdifulle uttakene som til sammen gir mest verdi innenfor
   * budsjettet. Bruker bare dager som faktisk gir verdi – resten av budsjettet
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
    var ctx = prepare(days, opts);

    var W = B + 1;
    // Poeng = verdi * SCALE - brukte dager * DAY - antall perioder.
    // Verdi avgjør; ved likhet brukes færrest mulig feriedager, deretter færrest perioder.
    var DAY = n + 1;
    var SCALE = DAY * (B + 1) * 2 + n;
    var dp = new Float64Array((n + 2) * W);
    var choice = new Int32Array((n + 2) * W).fill(-1);

    for (var i = n - 1; i >= 0; i--) {
      for (var k = 0; k <= B; k++) {
        var best = dp[(i + 1) * W + k];
        var bestEnd = -1;
        if (days[i].takeable && k > 0) {
          eachSegmentFrom(days, ctx.free, i, Math.min(k, opts.maxCost), function (j, info) {
            var gain = ctx.gain(info);
            if (!isValuable(gain, info.cost, opts)) return;
            var next = Math.min(info.R + 1, n);
            var score = gain * SCALE - info.cost * DAY - 1 + dp[next * W + (k - info.cost)];
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
      var picked = null;
      eachSegmentFrom(days, ctx.free, pos, opts.maxCost, function (j, info) {
        if (j === end) picked = info;
      });
      for (var c = pos; c <= end; c++) {
        if (!ctx.free[c]) chosen.push(c);
      }
      budgetLeft -= picked.cost;
      gained += ctx.gain(picked);
      pos = picked.R + 1;
    }

    return { chosen: chosen, used: chosen.length, gained: gained };
  }

  /*
   * Verdikart: for hver dag som kan tas som ferie, det beste uttaket den inngår i
   * (høyest verdi per feriedag, deretter høyest verdi). null = ingen verdi.
   * Hvert element: { ratio, gain, cost, start, end, length, takeStart, takeEnd, own }
   * der own = true når uttaket bygger videre på feriedager brukeren har valgt.
   */
  function dayValues(days, options) {
    var opts = normalizeOptions(options);
    var ctx = prepare(days, opts);
    var values = new Array(days.length).fill(null);
    for (var i = 0; i < days.length; i++) {
      if (!days[i].takeable) continue;
      eachSegmentFrom(days, ctx.free, i, opts.maxCost, function (j, info) {
        var gain = ctx.gain(info);
        if (gain < 1) return;
        var v = {
          ratio: gain / info.cost, gain: gain, cost: info.cost,
          start: days[info.L].key, end: days[info.R - 1].key, length: info.R - info.L,
          takeStart: days[i].key, takeEnd: days[j].key, own: ctx.touchesOwn(info)
        };
        for (var d = i; d <= j; d++) {
          if (ctx.free[d]) continue;
          var cur = values[d];
          if (!cur || v.ratio > cur.ratio + 1e-9 ||
              (Math.abs(v.ratio - cur.ratio) < 1e-9 && v.gain > cur.gain)) {
            values[d] = v;
          }
        }
      });
    }
    return values;
  }

  /*
   * Live forslag rundt egne feriedager: uttak som henger sammen med dager
   * brukeren har valgt og som gir verdi, beste først.
   * Hvert element: { cost, gain, length, start, end, takeStart, takeEnd, joins }
   * der joins = true når uttaket kobler sammen to av brukerens egne perioder.
   */
  function ownSuggestions(days, options) {
    var opts = normalizeOptions(options);
    var ctx = prepare(days, opts);
    var list = [];
    for (var i = 0; i < days.length; i++) {
      if (!days[i].takeable) continue;
      eachSegmentFrom(days, ctx.free, i, opts.maxCost, function (j, info) {
        var gain = ctx.gain(info);
        if (gain < 1 || !ctx.touchesOwn(info)) return;
        // Bare uttak som ligger helt inntil en egen periode eller fyller et hull.
        var leftOwn = i > 0 && days[i - 1].locked || (info.L < i && days.slice(info.L, i).some(function (d) { return d.locked; }));
        var rightOwn = days.slice(j + 1, info.R).some(function (d) { return d.locked; });
        if (!leftOwn && !rightOwn) return;
        list.push({
          cost: info.cost, gain: gain, length: info.R - info.L,
          start: days[info.L].key, end: days[info.R - 1].key,
          takeStart: days[i].key, takeEnd: days[j].key,
          joins: leftOwn && rightOwn
        });
      });
    }
    list.sort(function (a, b) {
      return (b.gain / b.cost) - (a.gain / a.cost) || b.gain - a.gain || a.cost - b.cost;
    });
    // Fjern uttak som overlapper et bedre uttak.
    var picked = [];
    list.forEach(function (o) {
      var clash = picked.some(function (p) { return o.takeStart <= p.takeEnd && o.takeEnd >= p.takeStart; });
      if (!clash) picked.push(o);
    });
    return picked;
  }

  /*
   * Lister sammenhengende friperioder som inneholder minst én feriedag
   * (egen eller foreslått). Hver periode:
   *   { start, end, length, vacationDays, suggestedDays, ownDays, bonus }
   * der bonus er verdien etter modellen over.
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
      var largest = 0;
      var stretch = 0;
      while (j < n && isFree(days[j])) {
        if (days[j].off) { stretch++; if (stretch > largest) largest = stretch; }
        else stretch = 0;
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
          ownDays: own,
          largest: largest
        });
      }
      i = j - 1;
    }
    var base = bridgeBaseTable(opts.workdays, maxUsed);
    periods.forEach(function (p) {
      p.bonus = Math.max(0, p.length - p.vacationDays - p.largest - base[p.vacationDays]);
      delete p.largest;
    });
    return periods;
  }

  var api = {
    buildDays: buildDays,
    markSqueezeDays: markSqueezeDays,
    bridgeBaseTable: bridgeBaseTable,
    optimize: optimize,
    dayValues: dayValues,
    ownSuggestions: ownSuggestions,
    vacationPeriods: vacationPeriods
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.FFPlanner = api;
  }
})(this);
