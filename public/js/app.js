/*
 * Brukergrensesnittet: leser innstillinger, regner ut verdier og forslag og
 * tegner kalenderen. All logikk for datoer og verdier ligger i holidays.js og
 * planner.js.
 */
(function () {
  "use strict";

  var H = window.FFHolidays;
  var P = window.FFPlanner;

  var STORAGE_KEY = "flest-fridager:v2";
  var MONTHS = ["Januar", "Februar", "Mars", "April", "Mai", "Juni", "Juli",
    "August", "September", "Oktober", "November", "Desember"];
  // Kalenderen starter på mandag; verdien er JavaScripts ukedagnummer (0 = søndag).
  var WEEKDAYS = [["Ma", 1], ["Ti", 2], ["On", 3], ["To", 4], ["Fr", 5], ["Lø", 6], ["Sø", 0]];

  var now = new Date();
  var todayKey = H.toKey(H.makeDate(now.getFullYear(), now.getMonth() + 1, now.getDate()));
  var thisYear = now.getFullYear();

  var state = {
    year: thisYear,
    budget: 25,
    workdays: [1, 2, 3, 4, 5],
    maxCost: 5,
    minRatio: 0.5,
    summerOn: true,
    summerWeek: 28,
    summerWeeks: 3,
    julaften: false,
    nyttarsaften: false,
    showSuggestions: true,
    showValues: true,
    own: {}
  };

  var lastModel = null;

  // ---------- Lagring (kun i brukerens nettleser) ----------

  function load() {
    try {
      var saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
      if (saved && typeof saved === "object") {
        Object.keys(state).forEach(function (k) {
          if (k in saved) state[k] = saved[k];
        });
      }
    } catch (e) { /* lagring er ikke tilgjengelig – bruk standardverdier */ }
    if (state.year < thisYear || state.year > thisYear + 1) state.year = thisYear;
    if (!Array.isArray(state.workdays)) state.workdays = [1, 2, 3, 4, 5];
  }

  function save() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) { /* ignorer */ }
  }

  // ---------- Hjelpefunksjoner ----------

  var fmtDay = new Intl.DateTimeFormat("nb-NO", {
    weekday: "short", day: "numeric", month: "short", timeZone: "UTC"
  });
  var fmtShort = new Intl.DateTimeFormat("nb-NO", {
    day: "numeric", month: "short", timeZone: "UTC"
  });
  var fmtLong = new Intl.DateTimeFormat("nb-NO", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC"
  });

  function isoWeek(date) {
    var d = new Date(date.getTime());
    var dayNum = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - dayNum + 3);
    var firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
    return 1 + Math.round(((d - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  }

  // Mandag i ISO-uke `week` for `year`.
  function mondayOfWeek(year, week) {
    var jan4 = H.makeDate(year, 1, 4);
    var monday = H.addDays(jan4, -((jan4.getUTCDay() + 6) % 7));
    return H.addDays(monday, (week - 1) * 7);
  }

  function clampInt(value, min, max, fallback) {
    var n = parseInt(value, 10);
    if (isNaN(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function plural(n, one, many) {
    return n + " " + (n === 1 ? one : many);
  }

  function range(startKey, endKey) {
    return fmtDay.format(H.fromKey(startKey)) + " – " + fmtDay.format(H.fromKey(endKey));
  }

  // Verdinivå 1–3 brukes til fargene i verdikartet.
  function valueTier(ratio) {
    if (ratio >= 2) return 3;
    if (ratio >= 1) return 2;
    return 1;
  }

  function periodLabel(days, period) {
    var names = [];
    function add(name) { if (names.indexOf(name) === -1) names.push(name); }
    days.forEach(function (d) {
      if (d.key < period.start || d.key > period.end) return;
      var h = (d.holiday || "") + " " + (d.extra || "");
      if (/påske|Skjærtorsdag|Langfredag/i.test(h)) add("Påske");
      if (/himmelfart/i.test(h)) add("Kristi himmelfart");
      if (/pinse/i.test(h)) add("Pinse");
      if (/Arbeidernes/.test(h)) add("1. mai");
      if (/Grunnlov/.test(h)) add("17. mai");
      if (/jul/i.test(h)) add("Jul");
      if (/nyttår/i.test(h)) add("Nyttår");
      if (d.summer) add("Sommerferie");
    });
    return names.length ? names.join(" og ") : "Ferie";
  }

  // ---------- Beregning ----------

  function compute() {
    var year = state.year;
    var planFrom = year === thisYear ? todayKey : year + "-01-01";
    var planTo = year + "-12-31";

    var extraOff = {};
    [year - 1, year, year + 1].forEach(function (y) {
      var opt = H.optionalDaysOff(y);
      if (state.julaften) extraOff[opt.julaften.key] = opt.julaften.name;
      if (state.nyttarsaften) extraOff[opt.nyttarsaften.key] = opt.nyttarsaften.name;
    });

    var summer = {};
    if (state.summerOn) {
      var start = mondayOfWeek(year, state.summerWeek);
      for (var i = 0; i < state.summerWeeks * 7; i++) {
        var key = H.toKey(H.addDays(start, i));
        if (key >= planFrom) summer[key] = true;
      }
    }

    var vacation = {};
    Object.keys(state.own).forEach(function (k) { vacation[k] = true; });
    Object.keys(summer).forEach(function (k) { vacation[k] = true; });

    var days = P.buildDays((year - 1) + "-12-01", (year + 1) + "-01-31", {
      workdays: state.workdays,
      extraOff: extraOff,
      vacation: vacation,
      planFrom: planFrom,
      planTo: planTo
    });

    var lockedInPlan = 0;
    days.forEach(function (d) {
      d.summer = d.locked && !!summer[d.key];
      if (d.locked && d.key >= planFrom && d.key <= planTo) lockedInPlan++;
    });

    var options = { workdays: state.workdays, maxCost: state.maxCost, minRatio: state.minRatio };
    var available = Math.max(0, state.budget - lockedInPlan);

    // Verdikartet viser hva hver dag er verdt gitt det som allerede er lagt inn.
    var values = P.dayValues(days, options);

    var result = { chosen: [], used: 0, gained: 0 };
    if (state.showSuggestions) {
      result = P.optimize(days, available, options);
      result.chosen.forEach(function (idx) { days[idx].suggested = true; });
    }

    var periods = P.vacationPeriods(days, options).filter(function (p) {
      return p.end >= planFrom && p.start <= planTo;
    });

    return {
      days: days,
      values: values,
      planFrom: planFrom,
      planTo: planTo,
      lockedInPlan: lockedInPlan,
      available: available,
      result: result,
      periods: periods
    };
  }

  // ---------- Tegning ----------

  function renderYearPicker() {
    var box = document.getElementById("year-picker");
    box.textContent = "";
    [thisYear, thisYear + 1].forEach(function (y) {
      var b = el("button", y === state.year ? "active" : "", String(y));
      b.type = "button";
      b.setAttribute("role", "radio");
      b.setAttribute("aria-checked", y === state.year ? "true" : "false");
      b.addEventListener("click", function () {
        state.year = y;
        update();
      });
      box.appendChild(b);
    });
  }

  function renderWorkdays() {
    var box = document.getElementById("workdays");
    box.textContent = "";
    WEEKDAYS.forEach(function (w) {
      var on = state.workdays.indexOf(w[1]) !== -1;
      var b = el("button", on ? "active" : "", w[0]);
      b.type = "button";
      b.setAttribute("aria-pressed", on ? "true" : "false");
      b.addEventListener("click", function () {
        if (on) state.workdays = state.workdays.filter(function (d) { return d !== w[1]; });
        else state.workdays = state.workdays.concat([w[1]]);
        update();
      });
      box.appendChild(b);
    });
  }

  function renderSummary(model) {
    var year = state.year;
    var res = model.result;
    var bonus = model.periods.reduce(function (s, p) { return s + Math.max(0, p.bonus); }, 0);
    var left = Math.max(0, model.available - res.used);
    var squeeze = model.days.filter(function (d) {
      return d.squeeze && d.key.slice(0, 4) === String(year);
    });

    var stats = document.getElementById("stats");
    stats.textContent = "";
    [
      ["+" + bonus, "ekstra fridager i planen"],
      [res.used, "verdifulle dager foreslått"],
      [left, "feriedager igjen å plassere selv"],
      [squeeze.length, "inneklemte dager i " + year]
    ].forEach(function (s) {
      var box = el("div", "stat");
      box.appendChild(el("strong", null, String(s[0])));
      box.appendChild(el("span", null, s[1]));
      stats.appendChild(box);
    });

    var rem = document.getElementById("remaining");
    if (!state.showSuggestions) {
      rem.textContent = "Forslag er skrudd av. Bruk verdikartet og klikk på dagene du vil ha fri.";
    } else if (left > 0 && res.used > 0) {
      rem.textContent = "Forslagene bruker bare dagene som gir ekstra fridager. " +
        (left === 1 ? "Den siste feriedagen gir" : "De " + left + " andre feriedagene gir") +
        " like mye uansett hvor " + (left === 1 ? "den legges, så den" : "de legges, så de") + " plasserer du selv.";
    } else if (left > 0) {
      rem.textContent = "Ingen flere dager gir ekstra fridager med disse valgene. Plasser " +
        (left === 1 ? "den siste feriedagen" : "de " + left + " feriedagene") + " der det passer deg.";
    } else {
      rem.textContent = "";
    }

    var list = document.getElementById("periods");
    list.textContent = "";
    var sorted = model.periods.slice().sort(function (a, b) {
      return (b.bonus / b.vacationDays) - (a.bonus / a.vacationDays) || b.bonus - a.bonus ||
        (a.start < b.start ? -1 : 1);
    });
    if (!sorted.length) {
      list.appendChild(el("li", "empty", "Ingen feriedager lagt inn eller foreslått ennå."));
    }
    sorted.forEach(function (p) {
      var kind = p.ownDays === 0 ? "suggested" : (p.suggestedDays === 0 ? "own" : "mixed");
      var li = el("li", "period-" + kind);
      var title = el("div", "period-title");
      title.appendChild(el("strong", null, periodLabel(model.days, p)));
      title.appendChild(el("span", p.bonus > 0 ? "badge" : "badge muted",
        p.bonus > 0 ? "+" + p.bonus + " ekstra" : "ingen ekstra"));
      li.appendChild(title);
      li.appendChild(el("div", "period-calc",
        plural(p.vacationDays, "feriedag", "feriedager") + " → " + p.length + " dager fri"));
      var who = kind === "suggested" ? "Forslag" : (kind === "own" ? "Din ferie" :
        "Din ferie + " + plural(p.suggestedDays, "foreslått dag", "foreslåtte dager"));
      li.appendChild(el("div", "period-dates", range(p.start, p.end) + " · " + who));
      list.appendChild(li);
    });

    var sq = document.getElementById("squeeze-days");
    sq.textContent = "";
    squeeze.forEach(function (d) {
      sq.appendChild(el("li", d.key < model.planFrom ? "past" : "", fmtLong.format(d.date)));
    });
    if (!squeeze.length) sq.appendChild(el("li", null, "Ingen inneklemte dager i " + year + "."));

    // Hint under feriedagsfeltet.
    document.getElementById("budget-label").textContent =
      year === thisYear ? "Feriedager du har igjen i år" : "Feriedager i " + year;
    var hint = document.getElementById("budget-hint");
    var over = model.lockedInPlan - state.budget;
    hint.textContent = over > 0
      ? "Du har lagt inn " + plural(over, "dag", "dager") + " mer enn du har."
      : model.lockedInPlan + " lagt inn · " + res.used + " foreslått · " + left + " igjen";
    hint.classList.toggle("warn", over > 0);

    document.getElementById("accept").disabled = res.used === 0;
  }

  function renderCalendar(model) {
    var year = state.year;
    var byKey = {};
    model.days.forEach(function (d, i) { byKey[d.key] = i; });

    var cal = document.getElementById("calendar");
    cal.textContent = "";

    for (var m = 1; m <= 12; m++) {
      var card = el("section", "month");
      card.appendChild(el("h3", null, MONTHS[m - 1] + " " + year));

      var table = el("table");
      var head = el("tr");
      head.appendChild(el("th", "wk", "Uke"));
      WEEKDAYS.forEach(function (w) { head.appendChild(el("th", null, w[0])); });
      var thead = el("thead");
      thead.appendChild(head);
      table.appendChild(thead);

      var tbody = el("tbody");
      var first = H.makeDate(year, m, 1);
      var cursor = H.addDays(first, -((first.getUTCDay() + 6) % 7));
      while (true) {
        var row = el("tr");
        row.appendChild(el("td", "wk", String(isoWeek(cursor))));
        for (var c = 0; c < 7; c++) {
          var td = el("td");
          if (cursor.getUTCMonth() === m - 1) {
            var idx = byKey[H.toKey(cursor)];
            fillCell(td, model.days[idx], model.values[idx], model);
          }
          row.appendChild(td);
          cursor = H.addDays(cursor, 1);
        }
        tbody.appendChild(row);
        if (cursor.getUTCMonth() !== m - 1) break;
      }
      table.appendChild(tbody);
      card.appendChild(table);
      cal.appendChild(card);
    }
  }

  function fillCell(td, d, value, model) {
    var classes = ["day"];
    var notes = [];
    if (d.weekend) classes.push("weekend");
    if (d.holiday) { classes.push("holiday"); notes.push(d.holiday); }
    if (d.extra) { classes.push("extra"); notes.push(d.extra); }
    if (d.squeeze) { classes.push("squeeze"); notes.push("Inneklemt dag"); }
    if (d.suggested) { classes.push("suggested"); notes.push("Foreslått feriedag"); }
    if (d.summer) { classes.push("own"); notes.push("Sommerferie"); }
    else if (d.locked) { classes.push("own"); notes.push("Egen feriedag"); }
    if (value) {
      if (state.showValues && !d.suggested) classes.push("val-" + valueTier(value.ratio));
      notes.push("Verdi: ta fri " + fmtShort.format(H.fromKey(value.start)) + "–" +
        fmtShort.format(H.fromKey(value.end)) + " med " +
        plural(value.cost, "feriedag", "feriedager") + " → " + value.length +
        " dager fri (+" + value.gain + " ekstra)");
    }
    if (d.key < model.planFrom) classes.push("past");
    if (d.key === todayKey) classes.push("today");

    var clickable = !d.off && !d.summer && d.key >= model.planFrom;
    var node;
    if (clickable) {
      node = el("button", classes.join(" "), String(d.date.getUTCDate()));
      node.type = "button";
      node.addEventListener("click", function () { toggleOwn(d); });
      notes.push(d.locked ? "Klikk for å fjerne" : "Klikk for å legge inn som feriedag");
    } else {
      node = el("span", classes.join(" "), String(d.date.getUTCDate()));
    }
    var label = fmtLong.format(d.date) + (notes.length ? " – " + notes.join(". ") : "");
    node.title = label;
    node.setAttribute("aria-label", label);
    td.appendChild(node);
  }

  function toggleOwn(d) {
    if (state.own[d.key]) delete state.own[d.key];
    else state.own[d.key] = true;
    update();
  }

  // ---------- Skjema ----------

  function bindForm() {
    var inputs = {
      budget: document.getElementById("budget"),
      maxCost: document.getElementById("max-cost"),
      minRatio: document.getElementById("min-ratio"),
      summerOn: document.getElementById("summer-on"),
      summerWeek: document.getElementById("summer-week"),
      summerWeeks: document.getElementById("summer-weeks"),
      julaften: document.getElementById("opt-julaften"),
      nyttarsaften: document.getElementById("opt-nyttarsaften"),
      showSuggestions: document.getElementById("show-suggestions"),
      showValues: document.getElementById("show-values")
    };

    inputs.budget.value = state.budget;
    inputs.maxCost.value = String(state.maxCost);
    inputs.minRatio.value = String(state.minRatio);
    inputs.summerOn.checked = state.summerOn;
    inputs.summerWeek.value = state.summerWeek;
    inputs.summerWeeks.value = state.summerWeeks;
    inputs.julaften.checked = state.julaften;
    inputs.nyttarsaften.checked = state.nyttarsaften;
    inputs.showSuggestions.checked = state.showSuggestions;
    inputs.showValues.checked = state.showValues;

    function read() {
      state.budget = clampInt(inputs.budget.value, 0, 60, state.budget);
      state.maxCost = clampInt(inputs.maxCost.value, 1, 10, 5);
      state.minRatio = parseFloat(inputs.minRatio.value) || 0.5;
      state.summerOn = inputs.summerOn.checked;
      state.summerWeek = clampInt(inputs.summerWeek.value, 1, 52, 28);
      state.summerWeeks = clampInt(inputs.summerWeeks.value, 1, 6, 3);
      state.julaften = inputs.julaften.checked;
      state.nyttarsaften = inputs.nyttarsaften.checked;
      state.showSuggestions = inputs.showSuggestions.checked;
      state.showValues = inputs.showValues.checked;
      update();
    }

    Object.keys(inputs).forEach(function (k) {
      inputs[k].addEventListener("input", read);
      inputs[k].addEventListener("change", read);
    });

    document.getElementById("accept").addEventListener("click", function () {
      if (!lastModel) return;
      lastModel.result.chosen.forEach(function (idx) {
        state.own[lastModel.days[idx].key] = true;
      });
      update();
    });

    document.getElementById("reset-own").addEventListener("click", function () {
      state.own = {};
      update();
    });
  }

  function update() {
    var model = compute();
    lastModel = model;
    document.getElementById("summer-fields").classList.toggle("disabled", !state.summerOn);
    renderYearPicker();
    renderWorkdays();
    renderSummary(model);
    renderCalendar(model);
    save();
  }

  load();
  bindForm();
  update();
})();
