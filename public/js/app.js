/*
 * Brukergrensesnittet: leser innstillinger, kjører optimaliseringen og tegner
 * kalenderen. All logikk for datoer og planlegging ligger i holidays.js og
 * planner.js.
 */
(function () {
  "use strict";

  var H = window.FFHolidays;
  var P = window.FFPlanner;

  var STORAGE_KEY = "flest-fridager:v1";
  var MONTHS = ["Januar", "Februar", "Mars", "April", "Mai", "Juni", "Juli",
    "August", "September", "Oktober", "November", "Desember"];
  var WEEKDAYS = ["Ma", "Ti", "On", "To", "Fr", "Lø", "Sø"];

  var now = new Date();
  var todayKey = H.toKey(H.makeDate(now.getFullYear(), now.getMonth() + 1, now.getDate()));
  var thisYear = now.getFullYear();

  var state = {
    year: thisYear,
    budget: 25,
    strategy: 5,
    summerOn: true,
    summerWeek: 28,
    summerWeeks: 3,
    julaften: false,
    nyttarsaften: false,
    own: {}
  };

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

    var remaining = Math.max(0, state.budget - lockedInPlan);
    var result = P.optimize(days, remaining, { minRunLength: state.strategy });
    result.chosen.forEach(function (idx) { days[idx].suggested = true; });

    var periods = P.vacationPeriods(days).filter(function (p) {
      return p.end >= planFrom && p.start <= planTo;
    });

    return {
      days: days,
      planFrom: planFrom,
      planTo: planTo,
      lockedInPlan: lockedInPlan,
      remaining: remaining,
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

  function renderSummary(model) {
    var year = state.year;
    var res = model.result;
    var totalUsed = model.lockedInPlan + res.used;
    var freeDays = model.periods.reduce(function (s, p) { return s + p.length; }, 0);
    var vacDays = model.periods.reduce(function (s, p) { return s + p.vacationDays; }, 0);
    var squeeze = model.days.filter(function (d) {
      return d.squeeze && d.key.slice(0, 4) === String(year);
    });

    var stats = document.getElementById("stats");
    stats.textContent = "";
    [
      [freeDays, "dager fri i ferieperiodene"],
      [totalUsed + " / " + state.budget, "feriedager brukt"],
      [vacDays ? (freeDays / vacDays).toFixed(1).replace(".", ",") : "–", "fridager per feriedag"],
      [squeeze.length, "inneklemte dager i " + year]
    ].forEach(function (s) {
      var box = el("div", "stat");
      box.appendChild(el("strong", null, String(s[0])));
      box.appendChild(el("span", null, s[1]));
      stats.appendChild(box);
    });

    var list = document.getElementById("periods");
    list.textContent = "";
    if (!model.periods.length) {
      list.appendChild(el("li", "empty", "Ingen feriedager å fordele. Øk antall feriedager eller endre innstillingene."));
    }
    model.periods.forEach(function (p) {
      var li = el("li");
      var title = el("div", "period-title");
      title.appendChild(el("strong", null, periodLabel(model.days, p)));
      title.appendChild(el("span", "badge", p.length + " dager fri"));
      li.appendChild(title);
      li.appendChild(el("div", "period-dates",
        fmtDay.format(H.fromKey(p.start)) + " – " + fmtDay.format(H.fromKey(p.end)) +
        " · " + p.vacationDays + (p.vacationDays === 1 ? " feriedag" : " feriedager")));
      list.appendChild(li);
    });

    var sq = document.getElementById("squeeze-days");
    sq.textContent = "";
    squeeze.forEach(function (d) {
      sq.appendChild(el("li", d.key < model.planFrom ? "past" : "", fmtLong.format(d.date)));
    });
    if (!squeeze.length) sq.appendChild(el("li", null, "Ingen inneklemte dager i " + year + "."));

    // Hint under feriedagsfeltet.
    var label = document.getElementById("budget-label");
    label.textContent = year === thisYear ? "Feriedager du har igjen i år" : "Feriedager i " + year;
    var hint = document.getElementById("budget-hint");
    var parts = [];
    if (model.lockedInPlan) parts.push(model.lockedInPlan + " allerede lagt inn");
    if (state.budget < model.lockedInPlan) {
      parts.push("du har lagt inn " + (model.lockedInPlan - state.budget) + " flere enn du har");
    } else {
      parts.push(model.remaining + " fordelt automatisk");
    }
    hint.textContent = parts.join(" · ");
    hint.classList.toggle("warn", state.budget < model.lockedInPlan);
  }

  function renderCalendar(model) {
    var year = state.year;
    var byKey = {};
    model.days.forEach(function (d) { byKey[d.key] = d; });

    var cal = document.getElementById("calendar");
    cal.textContent = "";

    for (var m = 1; m <= 12; m++) {
      var card = el("section", "month");
      card.appendChild(el("h3", null, MONTHS[m - 1] + " " + year));

      var table = el("table");
      var head = el("tr");
      head.appendChild(el("th", "wk", "Uke"));
      WEEKDAYS.forEach(function (w) { head.appendChild(el("th", null, w)); });
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
            fillCell(td, byKey[H.toKey(cursor)], model);
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

  function fillCell(td, d, model) {
    var classes = ["day"];
    var notes = [];
    if (d.weekend) classes.push("weekend");
    if (d.holiday) { classes.push("holiday"); notes.push(d.holiday); }
    if (d.extra) { classes.push("extra"); notes.push(d.extra); }
    if (d.squeeze) { classes.push("squeeze"); notes.push("Inneklemt dag"); }
    if (d.suggested) { classes.push("suggested"); notes.push("Foreslått feriedag"); }
    if (d.summer) { classes.push("own"); notes.push("Sommerferie"); }
    else if (d.locked) { classes.push("own"); notes.push("Egen feriedag"); }
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
    var label = fmtLong.format(d.date) + (notes.length ? " – " + notes.join(", ") : "");
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
    var budget = document.getElementById("budget");
    var strategy = document.getElementById("strategy");
    var summerOn = document.getElementById("summer-on");
    var summerWeek = document.getElementById("summer-week");
    var summerWeeks = document.getElementById("summer-weeks");
    var jul = document.getElementById("opt-julaften");
    var nyttar = document.getElementById("opt-nyttarsaften");

    budget.value = state.budget;
    strategy.value = String(state.strategy);
    summerOn.checked = state.summerOn;
    summerWeek.value = state.summerWeek;
    summerWeeks.value = state.summerWeeks;
    jul.checked = state.julaften;
    nyttar.checked = state.nyttarsaften;

    function read() {
      state.budget = clampInt(budget.value, 0, 60, state.budget);
      state.strategy = clampInt(strategy.value, 1, 30, 5);
      state.summerOn = summerOn.checked;
      state.summerWeek = clampInt(summerWeek.value, 1, 52, 28);
      state.summerWeeks = clampInt(summerWeeks.value, 1, 6, 3);
      state.julaften = jul.checked;
      state.nyttarsaften = nyttar.checked;
      update();
    }

    [budget, strategy, summerOn, summerWeek, summerWeeks, jul, nyttar].forEach(function (input) {
      input.addEventListener("input", read);
      input.addEventListener("change", read);
    });

    document.getElementById("reset-own").addEventListener("click", function () {
      state.own = {};
      update();
    });
  }

  function update() {
    var model = compute();
    document.getElementById("summer-fields").classList.toggle("disabled", !state.summerOn);
    renderYearPicker();
    renderSummary(model);
    renderCalendar(model);
    save();
  }

  load();
  bindForm();
  update();
})();
