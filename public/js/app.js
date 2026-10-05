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
    schoolOn: true,
    winterWeek: 8,
    autumnWeek: 40,
    showSuggestions: true,
    showValues: true,
    own: {}
  };

  var lastModel = null;

  // Siste dag brukeren klikket inn (startpunkt for dobbeltklikk).
  var anchor = null;
  var anchorBeforeClick = null;

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
    if (!state.own || typeof state.own !== "object") state.own = {};
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

  function shortRange(startKey, endKey) {
    if (startKey === endKey) return fmtShort.format(H.fromKey(startKey));
    return fmtShort.format(H.fromKey(startKey)) + "–" + fmtShort.format(H.fromKey(endKey));
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
    if (!names.length) {
      days.forEach(function (d) {
        if (d.key >= period.start && d.key <= period.end && d.school) add(d.school);
      });
    }
    return names.length ? names.join(" og ") : "Ferie";
  }

  // ---------- Beregning ----------

  function compute() {
    var year = state.year;
    var yearFrom = year + "-01-01";
    var planFrom = year === thisYear ? todayKey : yearFrom;
    var planTo = year + "-12-31";

    var extraOff = {};
    [year - 1, year, year + 1].forEach(function (y) {
      var opt = H.optionalDaysOff(y);
      if (state.julaften) extraOff[opt.julaften.key] = opt.julaften.name;
      if (state.nyttarsaften) extraOff[opt.nyttarsaften.key] = opt.nyttarsaften.name;
    });

    var summer = {};
    if (state.summerOn) {
      var start = H.mondayOfIsoWeek(year, state.summerWeek);
      for (var i = 0; i < state.summerWeeks * 7; i++) {
        summer[H.toKey(H.addDays(start, i))] = true;
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

    // Skoleferier som berører året (juleferien starter året før).
    var school = [];
    if (state.schoolOn) {
      var opts = { winterWeek: state.winterWeek, autumnWeek: state.autumnWeek };
      school = H.schoolHolidays(year - 1, opts).concat(H.schoolHolidays(year, opts))
        .filter(function (s) { return s.end >= yearFrom && s.start <= planTo; });
    }

    var taken = 0;
    var planned = 0;
    days.forEach(function (d) {
      d.summer = d.locked && !!summer[d.key];
      d.school = null;
      school.forEach(function (s) { if (d.key >= s.start && d.key <= s.end) d.school = s.name; });
      if (d.locked && d.key >= yearFrom && d.key <= planTo) {
        if (d.key < planFrom) taken++;
        else planned++;
      }
    });

    var options = { workdays: state.workdays, maxCost: state.maxCost, minRatio: state.minRatio };
    var available = Math.max(0, state.budget - taken - planned);

    // Verdikartet viser hva hver dag er verdt gitt det som allerede er lagt inn.
    var values = P.dayValues(days, options);
    var extensions = P.extensionOptions(days, options);

    var result = { chosen: [], used: 0, gained: 0 };
    if (state.showSuggestions) {
      result = P.optimize(days, available, options);
      result.chosen.forEach(function (idx) { days[idx].suggested = true; });
    }

    var periods = P.vacationPeriods(days, options).filter(function (p) {
      return p.end >= yearFrom && p.start <= planTo;
    });

    return {
      days: days,
      values: values,
      extensions: extensions,
      school: school,
      yearFrom: yearFrom,
      planFrom: planFrom,
      planTo: planTo,
      taken: taken,
      planned: planned,
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
        anchor = anchorBeforeClick = null;
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

  // Beste utvidelse for en egen periode, som en kort tekst og dagene som legges til.
  function bestExtension(model, period) {
    var run = null;
    model.extensions.forEach(function (r) {
      if (r.start === period.start && r.end === period.end) run = r;
    });
    if (!run || !run.options.length) return null;
    var o = run.options[0];
    var keys = o.take.map(function (i) { return model.days[i].key; });
    return {
      text: "+" + plural(o.cost, "feriedag", "feriedager") + " (" +
        shortRange(keys[0], keys[keys.length - 1]) + ") → " + o.length +
        " dager fri i stedet for " + period.length,
      keys: keys
    };
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
      [model.taken + model.planned, year === thisYear ? "tatt ut eller planlagt" : "planlagt"],
      [res.used, "foreslått"],
      [left, "igjen å plassere selv"]
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
      var past = p.end < model.planFrom;
      var kind = past ? "taken" : (p.ownDays === 0 ? "suggested" : (p.suggestedDays === 0 ? "own" : "mixed"));
      var li = el("li", "period-" + kind);
      var title = el("div", "period-title");
      title.appendChild(el("strong", null, periodLabel(model.days, p)));
      title.appendChild(el("span", p.bonus > 0 ? "badge" : "badge muted",
        p.bonus > 0 ? "+" + p.bonus + " ekstra" : "ingen ekstra"));
      li.appendChild(title);
      li.appendChild(el("div", "period-calc",
        plural(p.vacationDays, "feriedag", "feriedager") + " → " + plural(p.length, "dag", "dager") + " fri"));
      var who = { taken: "Tatt ut", suggested: "Forslag", own: "Valgt av deg",
        mixed: "Valgt av deg + " + plural(p.suggestedDays, "forslag", "forslag") }[kind];
      li.appendChild(el("div", "period-dates", range(p.start, p.end) + " · " + who));

      if (kind === "own") {
        var ext = bestExtension(model, p);
        if (ext) {
          var tip = el("div", "period-tip");
          tip.appendChild(el("span", null, ext.text));
          var add = el("button", "link-btn", "Legg til");
          add.type = "button";
          add.addEventListener("click", function () {
            ext.keys.forEach(function (k) { state.own[k] = true; });
            update();
          });
          tip.appendChild(add);
          li.appendChild(tip);
        }
      }
      list.appendChild(li);
    });

    renderSchoolOverview(model);

    var sq = document.getElementById("squeeze-days");
    sq.textContent = "";
    squeeze.forEach(function (d) {
      sq.appendChild(el("li", d.key < model.planFrom ? "past" : "", fmtLong.format(d.date)));
    });
    if (!squeeze.length) sq.appendChild(el("li", null, "Ingen inneklemte dager i " + year + "."));

    // Hint under feriedagsfeltet.
    document.getElementById("budget-label").textContent = "Feriedager i " + year;
    var hint = document.getElementById("budget-hint");
    var over = model.taken + model.planned - state.budget;
    var parts = [];
    if (year === thisYear) parts.push(model.taken + " tatt ut");
    parts.push(model.planned + " planlagt", res.used + " foreslått", left + " igjen");
    hint.textContent = over > 0
      ? "Du har lagt inn " + plural(over, "dag", "dager") + " mer enn du har."
      : parts.join(" · ");
    hint.classList.toggle("warn", over > 0);

    document.getElementById("accept").disabled = res.used === 0;
  }

  function renderSchoolOverview(model) {
    var box = document.getElementById("school-overview");
    box.textContent = "";
    // Juleferien som startet året før vises i kalenderen, men ikke i oversikten.
    var list = model.school.filter(function (s) { return s.start >= model.yearFrom; });
    box.hidden = !list.length;
    if (!list.length) return;
    box.appendChild(el("h3", null, "Skoleferier " + state.year));
    var ul = el("ul");
    list.forEach(function (s) {
      var li = el("li");
      li.appendChild(el("strong", null, s.name));
      var weekNote = (s.name === "Vinterferie" || s.name === "Høstferie")
        ? " · uke " + isoWeek(H.fromKey(s.start)) : "";
      li.appendChild(el("span", null, (s.approx ? "ca. " : "") + shortRange(s.start, s.end) + weekNote));
      ul.appendChild(li);
    });
    box.appendChild(ul);
  }

  // Kalenderen bygges én gang per år; senere oppdateres bare cellene. Da blir
  // knappene stående mellom to klikk, slik at nettleserens dobbeltklikk virker.
  var cells = {};
  var monthNotes = [];
  var builtYear = null;

  function buildCalendar(year) {
    var cal = document.getElementById("calendar");
    cal.textContent = "";
    cells = {};
    monthNotes = [];

    for (var m = 1; m <= 12; m++) {
      var card = el("section", "month");
      var head = el("div", "month-head");
      head.appendChild(el("h3", null, MONTHS[m - 1] + " " + year));
      var notes = el("div", "month-notes");
      head.appendChild(notes);
      monthNotes.push(notes);
      card.appendChild(head);

      var table = el("table");
      var tr = el("tr");
      tr.appendChild(el("th", "wk", "Uke"));
      WEEKDAYS.forEach(function (w) { tr.appendChild(el("th", null, w[0])); });
      var thead = el("thead");
      thead.appendChild(tr);
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
            var key = H.toKey(cursor);
            var b = el("button", "day", String(cursor.getUTCDate()));
            b.type = "button";
            b.setAttribute("data-key", key);
            td.appendChild(b);
            cells[key] = b;
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
    builtYear = year;
  }

  function renderCalendar(model) {
    if (builtYear !== state.year) buildCalendar(state.year);

    model.days.forEach(function (d, i) {
      var node = cells[d.key];
      if (node) updateCell(node, d, model.values[i], model);
    });

    monthNotes.forEach(function (box, idx) {
      var m = String(idx + 1).padStart(2, "0");
      var from = state.year + "-" + m + "-01";
      var to = state.year + "-" + m + "-31";
      box.textContent = "";
      model.school.forEach(function (s) {
        if (s.end >= from && s.start <= to) box.appendChild(el("span", "chip-school", s.name));
      });
    });
  }

  function updateCell(node, d, value, model) {
    var classes = ["day"];
    var notes = [];
    var past = d.key < model.planFrom;
    if (d.weekend) classes.push("weekend");
    if (d.holiday) { classes.push("holiday"); notes.push(d.holiday); }
    if (d.extra) { classes.push("extra"); notes.push(d.extra); }
    if (d.squeeze) { classes.push("squeeze"); notes.push("Inneklemt dag"); }
    if (d.school) { classes.push("school"); notes.push(d.school + " (skole)"); }
    if (d.suggested) { classes.push("suggested"); notes.push("Forslag"); }
    if (d.summer) { classes.push(past ? "taken" : "own"); notes.push("Sommerferie"); }
    else if (d.locked) { classes.push(past ? "taken" : "own"); notes.push(past ? "Tatt ut" : "Valgt feriedag"); }
    if (value) {
      if (state.showValues || d.suggested) classes.push("val-" + valueTier(value.ratio));
      notes.push(value.extends
        ? "Legg til " + plural(value.cost, "feriedag", "feriedager") + " → " + value.length +
          " dager fri i stedet for " + value.extends + " (" + shortRange(value.start, value.end) + ")"
        : "Verdi: ta fri " + shortRange(value.start, value.end) + " med " +
          plural(value.cost, "feriedag", "feriedager") + " → " + value.length +
          " dager fri (+" + value.gain + " ekstra)");
    }
    if (past) classes.push("past");
    if (d.key === todayKey) classes.push("today");

    var clickable = !d.off && !d.summer;
    if (clickable) {
      notes.push(d.locked ? "Klikk for å fjerne"
        : (past ? "Klikk hvis du har tatt fri denne dagen" : "Klikk for å velge, dobbeltklikk for å fylle perioden"));
    }
    node.className = classes.join(" ");
    node.setAttribute("aria-disabled", clickable ? "false" : "true");
    node.setAttribute("aria-pressed", d.locked ? "true" : "false");
    var label = fmtLong.format(d.date) + (notes.length ? " – " + notes.join(". ") : "");
    node.title = label;
    node.setAttribute("aria-label", label);
  }

  // ---------- Klikk og dobbeltklikk i kalenderen ----------

  function isClickable(node) {
    return node && node.getAttribute("aria-disabled") !== "true";
  }

  function workdayKeysBetween(a, b) {
    if (a > b) { var t = a; a = b; b = t; }
    return lastModel.days.filter(function (d) {
      return d.key >= a && d.key <= b && !d.off && !d.summer && cells[d.key];
    }).map(function (d) { return d.key; });
  }

  function bindCalendar() {
    var cal = document.getElementById("calendar");

    cal.addEventListener("click", function (e) {
      var node = e.target.closest("button.day");
      if (!isClickable(node)) return;
      // Andre klikk i et dobbeltklikk håndteres av dblclick under.
      if (e.detail > 1) return;
      var key = node.getAttribute("data-key");
      if (e.shiftKey && anchor) {
        workdayKeysBetween(anchor, key).forEach(function (k) { state.own[k] = true; });
        anchor = key;
        update();
        return;
      }
      anchorBeforeClick = anchor;
      if (state.own[key]) {
        delete state.own[key];
        anchor = null;
      } else {
        state.own[key] = true;
        anchor = key;
      }
      update();
    });

    cal.addEventListener("dblclick", function (e) {
      var node = e.target.closest("button.day");
      if (!isClickable(node)) return;
      var key = node.getAttribute("data-key");
      var from = anchorBeforeClick && anchorBeforeClick !== key ? anchorBeforeClick : key;
      workdayKeysBetween(from, key).forEach(function (k) { state.own[k] = true; });
      anchor = key;
      anchorBeforeClick = null;
      update();
    });
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
      schoolOn: document.getElementById("school-on"),
      winterWeek: document.getElementById("winter-week"),
      autumnWeek: document.getElementById("autumn-week"),
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
    inputs.schoolOn.checked = state.schoolOn;
    inputs.winterWeek.value = state.winterWeek;
    inputs.autumnWeek.value = state.autumnWeek;
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
      state.schoolOn = inputs.schoolOn.checked;
      state.winterWeek = clampInt(inputs.winterWeek.value, 6, 11, 8);
      state.autumnWeek = clampInt(inputs.autumnWeek.value, 38, 44, 40);
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
      anchor = anchorBeforeClick = null;
      update();
    });
  }

  function update() {
    var model = compute();
    lastModel = model;
    document.getElementById("summer-fields").classList.toggle("disabled", !state.summerOn);
    document.getElementById("school-fields").classList.toggle("disabled", !state.schoolOn);
    renderYearPicker();
    renderWorkdays();
    renderSummary(model);
    renderCalendar(model);
    save();
  }

  load();
  bindForm();
  bindCalendar();
  update();
})();
