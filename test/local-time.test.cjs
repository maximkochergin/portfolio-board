const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const time = require("../assets/local-time.js");

test("time overrides require one complete, valid 24-hour time", () => {
  assert.deepEqual(time.parseOverride("?time=00:05"), { hour: 0, minute: 5 });
  assert.deepEqual(time.parseOverride("?manage=1&time=21%3A41&other=ok#work"), { hour: 21, minute: 41 });
  assert.deepEqual(time.parseOverride("?time=23:59"), { hour: 23, minute: 59 });
  for (const search of ["", "?time=24:00", "?time=23:60", "?time=6:00", "?time=06:0", "?time=06:00:00",
    "?time=+06:00", "?time=06:00&time=18:00", "?time=", "?manage=1", null]) {
    assert.equal(time.parseOverride(search), null, String(search));
  }
});

test("Kyiv time uses AM/PM and preserves a 24-hour machine-readable value", () => {
  const snapshot = time.getSnapshot(new Date("2026-01-15T22:05:42.999Z"));
  assert.equal(snapshot.text, "12:05 AM in Kyiv");
  assert.equal(snapshot.hour, 0);
  assert.equal(snapshot.minute, 5);
  assert.equal(snapshot.datetime, "2026-01-16T00:05:00+02:00");
  assert.equal(Date.parse(snapshot.datetime), Date.parse("2026-01-15T22:05:00Z"));
  assert.equal(time.getSnapshot(new Date("2026-07-15T06:04:00Z")).text, "9:04 AM in Kyiv");
  assert.equal(time.getSnapshot(new Date("2026-01-15T10:00:00Z")).text, "12:00 PM in Kyiv");
  assert.equal(time.getSnapshot(new Date("2026-01-15T13:25:00Z")).text, "3:25 PM in Kyiv");
});

test("Intl applies Ukraine's spring and autumn daylight-saving changes", () => {
  const samples = [
    ["2026-03-29T00:59:00Z", "2:59 AM in Kyiv", "+02:00"],
    ["2026-03-29T01:00:00Z", "4:00 AM in Kyiv", "+03:00"],
    ["2026-10-25T00:59:00Z", "3:59 AM in Kyiv", "+03:00"],
    ["2026-10-25T01:00:00Z", "3:00 AM in Kyiv", "+02:00"]
  ];
  for (const [iso, text, offset] of samples) {
    const snapshot = time.getSnapshot(new Date(iso));
    assert.equal(snapshot.text, text);
    assert.ok(snapshot.datetime.endsWith(offset));
    assert.equal(Date.parse(snapshot.datetime), Date.parse(iso));
  }
});

test("preview time updates the visible clock without fabricating an instant", () => {
  const samples = [
    ["00:00", "12:00 AM", "night"], ["05:59", "5:59 AM", "night"],
    ["06:00", "6:00 AM", "morning"], ["10:59", "10:59 AM", "morning"],
    ["11:00", "11:00 AM", "day"], ["12:00", "12:00 PM", "day"],
    ["17:59", "5:59 PM", "day"], ["18:00", "6:00 PM", "evening"],
    ["22:59", "10:59 PM", "evening"], ["23:00", "11:00 PM", "night"]
  ];
  for (const [clock, displayClock, scene] of samples) {
    const snapshot = time.getSnapshot(new Date("2026-01-15T12:00:00Z"), time.parseOverride(`?time=${clock}`));
    assert.equal(snapshot.text, `${displayClock} in Kyiv`);
    assert.equal(snapshot.datetime, clock);
    assert.equal(snapshot.hour, Number(clock.slice(0, 2)));
    assert.equal(snapshot.minute, Number(clock.slice(3)));
    assert.equal(snapshot.scene, scene);
  }
  assert.throws(() => time.getSnapshot(new Date("invalid")), TypeError);
  assert.equal(time.getSnapshot(new Date("2026-01-15T12:00:00Z"), { hour: 24, minute: 0 }).text, "2:00 PM in Kyiv");
});

test("ghost scenes follow each Kyiv time-of-day boundary", () => {
  const scenes = [
    [0, "night"], [5, "night"], [6, "morning"], [10, "morning"],
    [11, "day"], [17, "day"], [18, "evening"], [22, "evening"], [23, "night"]
  ];
  for (const [hour, scene] of scenes) assert.equal(time.sceneForHour(hour), scene);
  for (const hour of [-1, 24, 6.5, null, "6", NaN]) assert.equal(time.sceneForHour(hour), null);
  assert.equal(time.getSnapshot(new Date("2026-01-16T03:59:00Z")).scene, "night");
  assert.equal(time.getSnapshot(new Date("2026-01-16T04:00:00Z")).scene, "morning");
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
  assert.equal(snapshot.text, "12:05 AM in Kyiv");
  assert.equal(snapshot.timeZone, "Europe/Kiev");
  assert.deepEqual(requested.map(options => options.timeZone), ["Europe/Kyiv", "Europe/Kiev"]);
  assert.ok(requested.every(options => options.hourCycle === "h23"));
});

test("early initialization exposes only the direct manage route and preserves the URL", () => {
  const source = fs.readFileSync(path.join(__dirname, "../assets/footer-init.js"), "utf8");
  for (const search of ["?manage=1", "?manage=1&time=23:00&keep=ok", "?time=00:00&manage=1"]) {
    const location = { search, hash: "#work" };
    const root = { dataset: {} };
    vm.runInNewContext(source, { document: { documentElement: root }, window: { location }, URLSearchParams });
    assert.deepEqual(root.dataset, { ownerAccess: "visible" });
    assert.equal(location.search, search);
    assert.equal(location.hash, "#work");
  }
  for (const search of ["", "?time=23:00", "?manage=0", "?manage=true", "?manage=01"]) {
    const root = { dataset: {} };
    vm.runInNewContext(source, { document: { documentElement: root }, window: { location: { search } }, URLSearchParams });
    assert.deepEqual(root.dataset, {}, search);
  }
});

test("early initialization and the runtime use the same Kyiv scene", () => {
  const source = fs.readFileSync(path.join(__dirname, "../assets/footer-init.js"), "utf8");
  class FixedDate extends Date { constructor() { super("2026-10-17T02:59:59Z"); } }
  for (const search of ["", "?time=05:59", "?time=06:00", "?time=10:59", "?time=11:00",
    "?time=17:59", "?time=18:00", "?time=22:59", "?time=23:00&manage=1"]) {
    const root = { dataset: {} };
    const location = { search, hash: "#notes" };
    vm.runInNewContext(source, {
      document: { documentElement: root }, window: { location, portfolioTime: time }, URLSearchParams, Date: FixedDate
    });
    assert.equal(root.dataset.mascotScene, time.getSnapshot(new FixedDate(), time.parseOverride(search)).scene);
    assert.equal(root.dataset.ownerAccess, search.includes("manage=1") ? "visible" : undefined);
    assert.equal(location.hash, "#notes");
  }
});

test("early initialization needs no clock and fails safely when the page context is unavailable", () => {
  const source = fs.readFileSync(path.join(__dirname, "../assets/footer-init.js"), "utf8");
  const root = { dataset: {} };
  assert.doesNotThrow(() => vm.runInNewContext(source, { document: { documentElement: root }, window: {}, URLSearchParams }));
  assert.deepEqual(root.dataset, {});
  const manageRoot = { dataset: {} };
  const browser = { location: { search: "?manage=1" } };
  Object.defineProperty(browser, "portfolioTime", { get() { throw new Error("Unexpected clock access"); } });
  vm.runInNewContext(source, { document: { documentElement: manageRoot }, window: browser, URLSearchParams });
  assert.equal(manageRoot.dataset.ownerAccess, "visible");
  assert.deepEqual(manageRoot.dataset, { ownerAccess: "visible" });
  assert.doesNotThrow(() => vm.runInNewContext(source, { document: { documentElement: null }, window: {} }));
});
