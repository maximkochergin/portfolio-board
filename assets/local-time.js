(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.portfolioTime = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const TIME_ZONE = "Europe/Kyiv";
  const FALLBACK_TIME_ZONE = "Europe/Kiev";
  const LOCATION_LABEL = "Kyiv, Ukraine";
  let formatter;
  let activeTimeZone;

  const pad = value => String(value).padStart(2, "0");
  const validClock = value => value && Number.isInteger(value.hour) && value.hour >= 0 && value.hour <= 23
    && Number.isInteger(value.minute) && value.minute >= 0 && value.minute <= 59;

  function getFormatter() {
    if (formatter) return formatter;
    const options = {
      calendar: "gregory", numberingSystem: "latn", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23"
    };
    try {
      formatter = new Intl.DateTimeFormat("en-GB", { ...options, timeZone: TIME_ZONE });
      activeTimeZone = TIME_ZONE;
    } catch {
      formatter = new Intl.DateTimeFormat("en-GB", { ...options, timeZone: FALLBACK_TIME_ZONE });
      activeTimeZone = FALLBACK_TIME_ZONE;
    }
    return formatter;
  }

  function parseOverride(search) {
    if (typeof search !== "string") return null;
    const values = new URLSearchParams(search.split("#", 1)[0]).getAll("time");
    if (values.length !== 1 || !/^\d{2}:\d{2}$/.test(values[0])) return null;
    const [hour, minute] = values[0].split(":").map(Number);
    const value = { hour, minute };
    return validClock(value) ? value : null;
  }

  function sceneForHour(hour) {
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
    if (hour < 6 || hour >= 23) return "night";
    if (hour < 11) return "morning";
    if (hour < 18) return "day";
    return "evening";
  }

  function getSnapshot(date = new Date(), override = null) {
    const timestamp = date instanceof Date ? date.getTime() : NaN;
    if (!Number.isFinite(timestamp)) throw new TypeError("A valid Date is required.");
    const minuteStart = Math.floor(timestamp / 60000) * 60000;
    const parts = Object.fromEntries(getFormatter().formatToParts(new Date(minuteStart))
      .filter(part => part.type !== "literal").map(part => [part.type, Number(part.value)]));
    const localHour = parts.hour % 24;
    const preview = validClock(override) ? override : null;
    const hour = preview ? preview.hour : localHour;
    const minute = preview ? preview.minute : parts.minute;
    const clock = `${pad(hour)}:${pad(minute)}`;
    const displayClock = `${hour % 12 || 12}:${pad(minute)} ${hour < 12 ? "AM" : "PM"}`;
    const localTimestamp = Date.UTC(parts.year, parts.month - 1, parts.day, localHour, parts.minute);
    const offset = Math.round((localTimestamp - minuteStart) / 60000);
    const offsetText = `${offset < 0 ? "-" : "+"}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`;
    // A preview is a time of day, not a claim about an absolute instant.
    const datetime = preview ? clock
      : `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${clock}:00${offsetText}`;
    return { hour, minute, text: `${displayClock} in ${LOCATION_LABEL}`, datetime,
      scene: sceneForHour(hour), timeZone: activeTimeZone };
  }

  return Object.freeze({ TIME_ZONE, FALLBACK_TIME_ZONE, LOCATION_LABEL, parseOverride, sceneForHour, getSnapshot });
});
