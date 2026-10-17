const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const time = require("../assets/local-time.js");

const boundaries = [
  ["05:59", "night"], ["06:00", "morning"], ["10:59", "morning"], ["11:00", "day"],
  ["17:59", "day"], ["18:00", "evening"], ["22:59", "evening"], ["23:00", "night"]
];

test("scene boundaries follow Ukraine's four parts of the day", () => {
  for (const [clock, scene] of boundaries) assert.equal(time.sceneForHour(Number(clock.slice(0, 2))), scene, clock);
  assert.equal(time.sceneForHour(0), "night");
  for (const invalid of [-1, 24, 1.5, "6", NaN]) assert.throws(() => time.sceneForHour(invalid), RangeError);
});

test("time overrides require one complete, valid 24-hour time", () => {
  assert.deepEqual(time.parseOverride("?time=00:05"), { hour: 0, minute: 5 });
  assert.deepEqual(time.parseOverride("?manage=1&time=21%3A41&other=ok#work"), { hour: 21, minute: 41 });
  assert.deepEqual(time.parseOverride("?time=23:59"), { hour: 23, minute: 59 });
  for (const search of ["", "?time=24:00", "?time=23:60", "?time=6:00", "?time=06:0", "?time=06:00:00",
    "?time=+06:00", "?time=06:00&time=18:00", "?time=", "?manage=1", null]) {
    assert.equal(time.parseOverride(search), null, String(search));
  }
});

test("Ukraine time uses leading zeros and a midnight hour of 00", () => {
  const snapshot = time.getSnapshot(new Date("2026-01-15T22:05:42.999Z"));
  assert.equal(snapshot.text, "00:05 in Ukraine");
  assert.equal(snapshot.hour, 0);
  assert.equal(snapshot.minute, 5);
  assert.equal(snapshot.scene, "night");
  assert.equal(snapshot.datetime, "2026-01-16T00:05:00+02:00");
  assert.equal(Date.parse(snapshot.datetime), Date.parse("2026-01-15T22:05:00Z"));
  assert.equal(time.getSnapshot(new Date("2026-07-15T06:04:00Z")).text, "09:04 in Ukraine");
});

test("Intl applies Ukraine's spring and autumn daylight-saving changes", () => {
  const samples = [
    ["2026-03-29T00:59:00Z", "02:59 in Ukraine", "+02:00"],
    ["2026-03-29T01:00:00Z", "04:00 in Ukraine", "+03:00"],
    ["2026-10-25T00:59:00Z", "03:59 in Ukraine", "+03:00"],
    ["2026-10-25T01:00:00Z", "03:00 in Ukraine", "+02:00"]
  ];
  for (const [iso, text, offset] of samples) {
    const snapshot = time.getSnapshot(new Date(iso));
    assert.equal(snapshot.text, text);
    assert.ok(snapshot.datetime.endsWith(offset));
    assert.equal(Date.parse(snapshot.datetime), Date.parse(iso));
  }
});

test("preview time updates the visible clock and scene without fabricating an instant", () => {
  for (const [clock, scene] of boundaries) {
    const snapshot = time.getSnapshot(new Date("2026-01-15T12:00:00Z"), time.parseOverride(`?time=${clock}`));
    assert.equal(snapshot.text, `${clock} in Ukraine`);
    assert.equal(snapshot.datetime, clock);
    assert.equal(snapshot.scene, scene);
  }
  assert.throws(() => time.getSnapshot(new Date("invalid")), TypeError);
  assert.equal(time.getSnapshot(new Date("2026-01-15T12:00:00Z"), { hour: 24, minute: 0 }).text, "14:00 in Ukraine");
});

test("local-time imports without touching the DOM and falls back to Europe/Kiev", () => {
  const source = fs.readFileSync(path.join(__dirname, "../assets/local-time.js"), "utf8");
  const requested = [];
  const sandbox = {
    module: { exports: {} }, Date, URLSearchParams,
    Intl: { DateTimeFormat: function (locale, options) {
      requested.push(options);
      if (options.timeZone === "Europe/Kyiv") throw new RangeError("Unsupported zone");
      return new Intl.DateTimeFormat(locale, options);
    } }
  };
  Object.defineProperty(sandbox, "document", { get() { throw new Error("Unexpected DOM access"); } });
  vm.runInNewContext(source, sandbox);
  const snapshot = sandbox.module.exports.getSnapshot(new Date("2026-01-15T22:05:00Z"));
  assert.equal(snapshot.text, "00:05 in Ukraine");
  assert.equal(snapshot.timeZone, "Europe/Kiev");
  assert.deepEqual(requested.map(options => options.timeZone), ["Europe/Kyiv", "Europe/Kiev"]);
  assert.ok(requested.every(options => options.hourCycle === "h23"));
});

test("early initialization shares all scene boundaries and preserves the URL", () => {
  const source = fs.readFileSync(path.join(__dirname, "../assets/footer-init.js"), "utf8");
  for (const [clock, expected] of boundaries) {
    const location = { search: `?manage=1&time=${clock}&keep=ok`, hash: "#work" };
    const root = { dataset: {} };
    vm.runInNewContext(source, { document: { documentElement: root }, window: { portfolioTime: time, location }, URLSearchParams, Date });
    assert.equal(root.dataset.bunnyScene, expected);
    assert.equal(root.dataset.bunnyScene, time.getSnapshot(new Date(), time.parseOverride(location.search)).scene);
    assert.equal(root.dataset.ownerAccess, "visible");
    assert.equal(location.search, `?manage=1&time=${clock}&keep=ok`);
    assert.equal(location.hash, "#work");
  }
  const root = { dataset: {} };
  vm.runInNewContext(source, { document: { documentElement: root }, window: { portfolioTime: time, location: { search: "?time=23:00" } }, URLSearchParams, Date });
  assert.equal(root.dataset.bunnyScene, "night");
  assert.equal(root.dataset.ownerAccess, undefined);
});

test("early initialization fails safely when the clock is unavailable", () => {
  const source = fs.readFileSync(path.join(__dirname, "../assets/footer-init.js"), "utf8");
  const root = { dataset: {} };
  assert.doesNotThrow(() => vm.runInNewContext(source, { document: { documentElement: root }, window: {}, URLSearchParams, Date }));
  assert.deepEqual(root.dataset, {});
  const manageRoot = { dataset: {} };
  vm.runInNewContext(source, { document: { documentElement: manageRoot }, window: { location: { search: "?manage=1" } }, URLSearchParams, Date });
  assert.equal(manageRoot.dataset.ownerAccess, "visible");
  assert.equal(manageRoot.dataset.bunnyScene, undefined);
});
