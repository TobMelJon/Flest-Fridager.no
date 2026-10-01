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

test("optimalisering med 1 dag gir 4 dager fri i mai 2026", () => {
  const days = P.buildDays("2026-05-01", "2026-05-31");
  const res = P.optimize(days, 1);
  // Fredag etter Kristi himmelfart og tirsdag etter 2. pinsedag gir begge 4 dager.
  assert.strictEqual(res.chosen.length, 1);
  assert.ok(["2026-05-15", "2026-05-26"].includes(days[res.chosen[0]].key));
  assert.strictEqual(res.gained, 4);
});

test("egne feriedager respekteres og telles ikke som ny gevinst", () => {
  const days = P.buildDays("2026-05-01", "2026-05-31", {
    vacation: { "2026-05-15": true }
  });
  const fri = days.find((d) => d.key === "2026-05-15");
  assert.strictEqual(fri.locked, true);
  assert.strictEqual(fri.takeable, false);
  const res = P.optimize(days, 1);
  assert.ok(!res.chosen.includes(days.indexOf(fri)));
});

test("minste periodelengde overholdes", () => {
  const days = P.buildDays("2026-01-01", "2026-12-31");
  const res = P.optimize(days, 10, { minRunLength: 9 });
  res.chosen.forEach((i) => { days[i].suggested = true; });
  const periods = P.vacationPeriods(days);
  assert.ok(periods.length > 0);
  periods.forEach((p) => assert.ok(p.length >= 9, JSON.stringify(p)));
  assert.ok(res.used <= 10);
});

test("planperiode begrenser valgbare dager", () => {
  const days = P.buildDays("2026-01-01", "2026-12-31", { planFrom: "2026-10-01" });
  const res = P.optimize(days, 25);
  res.chosen.forEach((i) => assert.ok(days[i].key >= "2026-10-01"));
});

// Brute force: prøv alle delmengder av valgbare dager og sammenlign med DP.
function score(days, chosenSet, minRun) {
  const free = days.map((d, i) => d.off || d.locked || chosenSet.has(i));
  let gain = 0;
  for (let i = 0; i < days.length; i++) {
    if (!free[i]) continue;
    let j = i, hasNew = false, hasLocked = false;
    while (j < days.length && free[j]) {
      if (chosenSet.has(j)) hasNew = true;
      if (days[j].locked) hasLocked = true;
      j++;
    }
    if (hasNew) {
      if (j - i < minRun) return -Infinity;
      if (!hasLocked) gain += j - i;
    }
    i = j - 1;
  }
  return gain;
}

test("DP gir samme optimum som brute force", () => {
  const ranges = [
    ["2026-03-25", "2026-04-20"],
    ["2026-05-01", "2026-05-31"],
    ["2026-12-14", "2027-01-08"]
  ];
  for (const [a, b] of ranges) {
    for (const budget of [1, 2, 3, 5]) {
      for (const minRun of [1, 4, 6]) {
        const days = P.buildDays(a, b);
        const idx = days.map((d, i) => (d.takeable ? i : -1)).filter((i) => i >= 0);
        let best = 0;
        for (let mask = 0; mask < 1 << idx.length; mask++) {
          let bits = 0;
          for (let m = mask; m; m &= m - 1) bits++;
          if (bits > budget) continue;
          const set = new Set(idx.filter((_, k) => mask & (1 << k)));
          best = Math.max(best, score(days, set, minRun));
        }
        const res = P.optimize(days, budget, { minRunLength: minRun });
        assert.strictEqual(res.gained, best, `${a}–${b} budsjett ${budget} min ${minRun}`);
        assert.strictEqual(score(days, new Set(res.chosen), minRun), best);
      }
    }
  }
});
