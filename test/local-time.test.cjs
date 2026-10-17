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

test("Ukraine time uses leading zeros and a midnight hour of 00", () => {
  const snapshot = time.getSnapshot(new Date("2026-01-15T22:05:42.999Z"));
  assert.equal(snapshot.text, "00:05 in Ukraine");
  assert.equal(snapshot.hour, 0);
  assert.equal(snapshot.minute, 5);
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

test("preview time updates the visible clock without fabricating an instant", () => {
  for (const clock of ["00:00", "05:59", "06:00", "10:59", "11:00", "17:59", "18:00", "22:59", "23:00"]) {
    const snapshot = time.getSnapshot(new Date("2026-01-15T12:00:00Z"), time.parseOverride(`?time=${clock}`));
    assert.equal(snapshot.text, `${clock} in Ukraine`);
    assert.equal(snapshot.datetime, clock);
    assert.equal(snapshot.hour, Number(clock.slice(0, 2)));
    assert.equal(snapshot.minute, Number(clock.slice(3)));
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
