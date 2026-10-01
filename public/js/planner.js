/*
 * Kalenderbygging, inneklemte dager og optimalisering av feriedager.
 *
 * Optimaliseringen velger hvilke arbeidsdager som skal tas som ferie slik at
 * summen av lengden på alle sammenhengende friperioder som inneholder en
 * feriedag blir størst mulig. Det løses eksakt med dynamisk programmering
 * (en variant av ryggsekkproblemet over tidslinjen).
 */
(function (root) {
  "use strict";

  var H = (typeof module !== "undefined" && module.exports)
    ? require("./holidays.js")
    : root.FFHolidays;

  /*
   * Bygger en liste med dager fra startKey til og med endKey.
   * options:
   *   workdays:    ukedager man jobber, 0 = søndag ... 6 = lørdag (standard man–fre)
   *   extraOff:    { "YYYY-MM-DD": "Navn" } – ekstra fridager (f.eks. julaften)
   *   vacation:    { "YYYY-MM-DD": true }    – feriedager brukeren selv har lagt inn
   *   planFrom/planTo: dagene optimaliseringen får lov til å bruke
   */
  function buildDays(startKey, endKey, options) {
    options = options || {};
    var workdays = options.workdays || [1, 2, 3, 4, 5];
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
   * Finner beste plassering av `budget` feriedager.
   * options.minRunLength: korteste friperiode (i dager) som er verdt å ta fri for.
   * Returnerer { chosen: [indekser], gained, used }.
   */
  function optimize(days, budget, options) {
    options = options || {};
    var minRun = Math.max(1, options.minRunLength || 1);
    var n = days.length;
    var B = Math.max(0, Math.floor(budget || 0));

    var takeableCount = 0;
    for (var t = 0; t < n; t++) if (days[t].takeable) takeableCount++;
    B = Math.min(B, takeableCount);

    var free = new Array(n);
    for (var f = 0; f < n; f++) free[f] = days[f].off || days[f].locked;

    // Dager som allerede ligger i en friperiode med egne feriedager teller ikke
    // som ny gevinst – ellers ville algoritmen bare forlenget eksisterende ferie.
    var alreadyGained = new Array(n).fill(false);
    for (var s = 0; s < n; s++) {
      if (!free[s]) continue;
      var e = s;
      var hasLocked = false;
      while (e < n && free[e]) { if (days[e].locked) hasLocked = true; e++; }
      if (hasLocked) for (var g = s; g < e; g++) alreadyGained[g] = true;
      s = e - 1;
    }
    var gainedPrefix = new Array(n + 1);
    gainedPrefix[0] = 0;
    for (var p = 0; p < n; p++) gainedPrefix[p + 1] = gainedPrefix[p] + (alreadyGained[p] ? 1 : 0);

    var W = B + 1;
    // Poeng = gevinst * SCALE - (perioder * PERIOD_COST + brukte dager).
    // Gevinsten (antall fridager) avgjør alltid; ved likhet foretrekkes færre,
    // lengre perioder og deretter færrest brukte feriedager.
    var PERIOD_COST = 100;
    var SCALE = PERIOD_COST * (B + 2) * 2;
    var dp = new Float64Array((n + 2) * W);
    var choice = new Int32Array((n + 2) * W).fill(-1);

    for (var i = n - 1; i >= 0; i--) {
      for (var k = 0; k <= B; k++) {
        var best = dp[(i + 1) * W + k];
        var bestEnd = -1;
        if (days[i].takeable && k > 0) {
          var L = i;
          while (L > 0 && free[L - 1]) L--;
          var cost = 0;
          for (var j = i; j < n; j++) {
            if (free[j]) continue;
            if (!days[j].takeable) break;
            cost++;
            if (cost > k) break;
            var R = j + 1;
            while (R < n && free[R]) R++;
            var runLength = R - L;
            if (runLength < minRun) continue;
            var gain = runLength - (gainedPrefix[R] - gainedPrefix[L]);
            var next = Math.min(R + 1, n);
            var score = gain * SCALE - PERIOD_COST - cost + dp[next * W + (k - cost)];
            if (score > best) { best = score; bestEnd = j; }
          }
        }
        dp[i * W + k] = best;
        choice[i * W + k] = bestEnd;
      }
    }

    // Rekonstruer valgene.
    var chosen = [];
    var gained = 0;
    var pos = 0;
    var budgetLeft = B;
    while (pos < n) {
      var end = choice[pos * W + budgetLeft];
      if (end < 0) { pos++; continue; }
      for (var c = pos; c <= end; c++) {
        if (!free[c]) { chosen.push(c); budgetLeft--; }
      }
      var l = pos;
      while (l > 0 && free[l - 1]) l--;
      var r = end + 1;
      while (r < n && free[r]) r++;
      gained += (r - l) - (gainedPrefix[r] - gainedPrefix[l]);
      pos = r + 1;
    }

    return { chosen: chosen, used: chosen.length, gained: gained };
  }

  /*
   * Lister sammenhengende friperioder som inneholder minst én feriedag
   * (egen eller foreslått). Hver periode: { start, end, length, vacationDays }.
   */
  function vacationPeriods(days) {
    var periods = [];
    var n = days.length;
    for (var i = 0; i < n; i++) {
      var isFree = function (d) { return d.off || d.locked || d.suggested; };
      if (!isFree(days[i])) continue;
      var j = i;
      var used = 0;
      while (j < n && isFree(days[j])) {
        if (days[j].locked || days[j].suggested) used++;
        j++;
      }
      if (used > 0) {
        periods.push({
          start: days[i].key,
          end: days[j - 1].key,
          length: j - i,
          vacationDays: used
        });
      }
      i = j - 1;
    }
    return periods;
  }

  var api = {
    buildDays: buildDays,
    markSqueezeDays: markSqueezeDays,
    optimize: optimize,
    vacationPeriods: vacationPeriods
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.FFPlanner = api;
  }
})(this);
