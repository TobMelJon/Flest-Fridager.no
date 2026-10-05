// Kjør med: node --test tests/
const test = require("node:test");
const assert = require("node:assert");
const H = require("../public/js/holidays.js");
const P = require("../public/js/planner.js");

test("påskedag stemmer for kjente år", () => {
  assert.strictEqual(H.toKey(H.easterSunday(2024)), "2024-03-31");
  assert.strictEqual(H.toKey(H.easterSunday(2025)), "2025-04-20");
  assert.strictEqual(H.toKey(H.easterSunday(2026)), "2026-04-05");
  assert.strictEqual(H.toKey(H.easterSunday(2027)), "2027-03-28");
});

test("norske helligdager 2026", () => {
  const h = H.norwegianHolidays(2026);
  assert.deepStrictEqual(Object.keys(h).sort(), [
    "2026-01-01", "2026-04-02", "2026-04-03", "2026-04-05", "2026-04-06",
    "2026-05-01", "2026-05-14", "2026-05-17", "2026-05-24", "2026-05-25",
    "2026-12-25", "2026-12-26"
  ]);
  assert.strictEqual(h["2026-05-14"], "Kristi himmelfartsdag");
});

test("sammenfallende helligdager slås sammen (2008: 1. mai = Kristi himmelfart)", () => {
  const h = H.norwegianHolidays(2008);
  assert.strictEqual(h["2008-05-01"], "Arbeidernes dag / Kristi himmelfartsdag");
});

test("fredag etter Kristi himmelfart 2026 er inneklemt", () => {
  const days = P.buildDays("2026-05-01", "2026-05-31");
  const fri = days.find((d) => d.key === "2026-05-15");
  assert.strictEqual(fri.squeeze, true);
  assert.strictEqual(days.filter((d) => d.squeeze).length, 1);
});

test("vanlige uker kobler sammen 0, men 5 dager kobler to helger (trekkes fra)", () => {
  assert.deepStrictEqual(P.bridgeBaseTable([1, 2, 3, 4, 5], 10), [0, 0, 0, 0, 0, 2, 2, 2, 2, 2, 4]);
});

const Y27 = () => P.buildDays("2026-12-01", "2028-01-31", { planFrom: "2027-01-01", planTo: "2027-12-31" });
const valueAt = (days, values, key) => values[days.findIndex((d) => d.key === key)];

test("inneklemt dag er mest verdt per feriedag", () => {
  const days = Y27();
  const v = P.dayValues(days, { maxCost: 5 });
  const fri = valueAt(days, v, "2027-05-07"); // fredag etter Kristi himmelfart
  assert.strictEqual(fri.cost, 1);
  assert.strictEqual(fri.gain, 1);
  assert.strictEqual(fri.ratio, 1);
  for (const d of days) {
    const x = v[days.indexOf(d)];
    if (x) assert.ok(x.ratio <= fri.ratio, d.key + " har høyere verdi enn inneklemt dag");
  }
});

test("dag inntil en fri periode du har uansett er ikke verdifull alene", () => {
  const days = Y27();
  const v = P.dayValues(days, { maxCost: 5 });
  assert.strictEqual(valueAt(days, v, "2027-01-04"), null);          // mandag etter 1. januar
  assert.ok(valueAt(days, v, "2027-03-30").cost > 1);                // tirsdag etter påske: bare som del av noe større
  const wed = valueAt(days, v, "2027-03-24");                         // onsdag før skjærtorsdag
  assert.strictEqual(wed.cost, 3);                                     // bare som del av man–ons
  assert.strictEqual(wed.gain, 2);
  assert.strictEqual(valueAt(days, v, "2027-04-14"), null);          // helt vanlig onsdag
});

test("bruker bare dager som gir verdi – resten av budsjettet blir igjen", () => {
  const days = Y27();
  const res = P.optimize(days, 25, { maxCost: 5 });
  assert.ok(res.used > 0 && res.used < 25, "brukte " + res.used);
  res.chosen.forEach((i) => { days[i].suggested = true; });
  P.vacationPeriods(days).forEach((p) => assert.ok(p.bonus >= 1, JSON.stringify(p)));
});

test("påsken 2027: mandag–onsdag kobler helgen til påsken", () => {
  const days = P.buildDays("2027-03-01", "2027-04-30");
  const res = P.optimize(days, 3, { maxCost: 5 });
  assert.deepStrictEqual(res.chosen.map((i) => days[i].key), ["2027-03-22", "2027-03-23", "2027-03-24"]);
  assert.strictEqual(res.gained, 2);
});

test("strengere krav til verdi gir færre forslag", () => {
  const loose = P.optimize(Y27(), 25, { maxCost: 5, minRatio: 0.01 });
  const strict = P.optimize(Y27(), 25, { maxCost: 5, minRatio: 1 });
  assert.ok(strict.used < loose.used);
});

test("egne feriedager: mandag + fredag valgt → tirsdag–torsdag kobler sammen", () => {
  const days = P.buildDays("2027-09-01", "2027-11-30", {
    vacation: { "2027-10-11": true, "2027-10-15": true }
  });
  const tips = P.ownSuggestions(days, { maxCost: 5 });
  assert.strictEqual(tips[0].takeStart, "2027-10-12");
  assert.strictEqual(tips[0].takeEnd, "2027-10-14");
  assert.strictEqual(tips[0].length, 9);
  assert.strictEqual(tips[0].joins, true);
  const v = P.dayValues(days, { maxCost: 5 });
  assert.strictEqual(valueAt(days, v, "2027-10-13").own, true);
  // Forslagene bruker også dette.
  const res = P.optimize(days, 3, { maxCost: 5 });
  assert.deepStrictEqual(res.chosen.map((i) => days[i].key), ["2027-10-12", "2027-10-13", "2027-10-14"]);
});

test("egne feriedager: onsdag–fredag + mandag–tirsdag gir 9 dager i stedet for 5", () => {
  const days = P.buildDays("2027-09-01", "2027-11-30", {
    vacation: { "2027-10-06": true, "2027-10-07": true, "2027-10-08": true }
  });
  const tips = P.ownSuggestions(days, { maxCost: 5 });
  assert.deepStrictEqual([tips[0].takeStart, tips[0].takeEnd, tips[0].length], ["2027-10-04", "2027-10-05", 9]);
});

test("planperiode begrenser valgbare dager", () => {
  const days = P.buildDays("2026-01-01", "2026-12-31", { planFrom: "2026-10-01" });
  const res = P.optimize(days, 25);
  res.chosen.forEach((i) => assert.ok(days[i].key >= "2026-10-01"));
});

// Brute force: prøv alle delmengder av valgbare dager og sammenlign med DP.
function score(days, chosenSet, opts) {
  const base = P.bridgeBaseTable([1, 2, 3, 4, 5], 40);
  const free = days.map((d, i) => d.off || d.locked || chosenSet.has(i));
  let gain = 0;
  for (let i = 0; i < days.length; i++) {
    if (!free[i]) continue;
    let j = i, c = 0, largest = 0, stretch = 0;
    while (j < days.length && free[j]) {
      if (chosenSet.has(j)) { c++; stretch = 0; } else { stretch++; largest = Math.max(largest, stretch); }
      j++;
    }
    if (c > 0) {
      const g = (j - i) - c - largest - base[c];
      if (c > opts.maxCost || g < 1 || g / c < opts.minRatio - 1e-9) return -Infinity;
      gain += g;
    }
    i = j - 1;
  }
  return gain;
}

test("DP gir samme optimum som brute force", () => {
  const ranges = [
    ["2026-03-25", "2026-04-20", {}],
    ["2026-05-01", "2026-05-31", {}],
    ["2026-12-14", "2027-01-08", {}],
    ["2027-03-15", "2027-04-07", {}],
    ["2027-10-01", "2027-10-24", { "2027-10-11": true, "2027-10-15": true }]
  ];
  for (const [a, b, vacation] of ranges) {
    for (const budget of [1, 2, 3, 5]) {
      for (const opts of [{ maxCost: 1, minRatio: 0.01 }, { maxCost: 5, minRatio: 0.01 }, { maxCost: 5, minRatio: 1 }]) {
        const days = P.buildDays(a, b, { vacation });
        const idx = days.map((d, i) => (d.takeable ? i : -1)).filter((i) => i >= 0);
        let best = 0;
        for (let mask = 0; mask < 1 << idx.length; mask++) {
          let bits = 0;
          for (let m = mask; m; m &= m - 1) bits++;
          if (bits > budget) continue;
          const set = new Set(idx.filter((_, k) => mask & (1 << k)));
          best = Math.max(best, score(days, set, opts));
        }
        const res = P.optimize(days, budget, opts);
        const label = `${a}–${b} budsjett ${budget} ${JSON.stringify(opts)}`;
        assert.strictEqual(res.gained, best, label);
        assert.strictEqual(score(days, new Set(res.chosen), opts), best, label);
      }
    }
  }
});

test("skoleferier: påskeferie fra lørdag før palmesøndag til 2. påskedag", () => {
  const list = H.schoolHolidays(2027, { winterWeek: 9, autumnWeek: 41 });
  const by = Object.fromEntries(list.map((s) => [s.name, s]));
  assert.deepStrictEqual([by.Påskeferie.start, by.Påskeferie.end], ["2027-03-20", "2027-03-29"]);
  assert.deepStrictEqual([by.Vinterferie.start, by.Vinterferie.end], ["2027-03-01", "2027-03-05"]);
  assert.deepStrictEqual([by.Høstferie.start, by.Høstferie.end], ["2027-10-11", "2027-10-15"]);
  assert.strictEqual(by.Juleferie.approx, true);
});

test("tidligere dager kan ikke foreslås, men kan være lagt inn som tatt ut", () => {
  const days = P.buildDays("2026-01-01", "2026-12-31", {
    planFrom: "2026-10-05",
    vacation: { "2026-05-15": true }
  });
  const fri = days.find((d) => d.key === "2026-05-15");
  assert.strictEqual(fri.locked, true);
  const res = P.optimize(days, 25);
  res.chosen.forEach((i) => assert.ok(days[i].key >= "2026-10-05"));
});
