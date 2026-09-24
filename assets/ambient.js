(() => {
  const root = document.documentElement;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const clockPreference = "portfolio-clock-hidden";
  let preferenceStorage = null;
  try { preferenceStorage = window.localStorage; } catch { /* Storage can be disabled. */ }

  function storedFlag(storage, key) {
    try { return storage?.getItem(key) === "1"; } catch { return false; }
  }

  function saveFlag(storage, key, value) {
    try {
      if (value) storage?.setItem(key, "1");
      else storage?.removeItem(key);
    } catch { /* Browsing without storage still works. */ }
  }

  function greetingForHour(hour) {
    if (hour < 5 || hour >= 22) return "good night.";
    if (hour < 12) return "good morning.";
    if (hour < 17) return "good afternoon.";
    return "good evening.";
  }

  let introAllowed = window.self === window.top
    && !reducedMotion.matches
    && new URLSearchParams(window.location.search).get("manage") !== "1"
    && !window.location.hash.startsWith("#post/");
  if (introAllowed) root.classList.add("intro-pending");

  let finishImmediately = null;
  const safety = window.setTimeout(() => {
    introAllowed = false;
    if (finishImmediately) finishImmediately();
    else root.classList.remove("intro-pending", "intro-revealing");
  }, 7000);

  function initialize() {
    const clock = document.querySelector("#ambient-clock");
    const clockTime = document.querySelector("#clock-time");
    const clockToggle = document.querySelector("#clock-toggle");
    const intro = document.querySelector("#intro");
    const introClear = document.querySelector("#intro-clear");
    const page = document.querySelector(".page");

    if (window.self !== window.top) {
      clock.hidden = true;
      window.clearTimeout(safety);
      return;
    }

    const clockFormat = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
    });
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (zone) clock.title = `time on your device (${zone})`;

    function updateClock(force = false) {
      if (document.hidden && !force) return;
      const now = new Date();
      clockTime.textContent = clockFormat.format(now);
      clockTime.dateTime = now.toISOString();
    }

    function setClockHidden(hidden) {
      clock.classList.toggle("is-hidden", hidden);
      clockToggle.textContent = hidden ? "show time" : "hide time";
      clockToggle.setAttribute("aria-expanded", String(!hidden));
      saveFlag(preferenceStorage, clockPreference, hidden);
    }

    setClockHidden(storedFlag(preferenceStorage, clockPreference));
    clockToggle.addEventListener("click", () => setClockHidden(!clock.classList.contains("is-hidden")));
    updateClock(true);
    window.setInterval(updateClock, 1000);
    document.addEventListener("visibilitychange", () => updateClock(true));

    if (!introAllowed) {
      window.clearTimeout(safety);
      return;
    }

    introClear.textContent = greetingForHour(new Date().getHours());
    intro.hidden = false;
    page.inert = true;
    clock.inert = true;
    let phaseTimer = 0;
    let exitTimer = 0;
    let leaving = false;
    let finished = false;

    function completeIntro() {
      if (finished) return;
      finished = true;
      leaving = true;
      window.clearTimeout(phaseTimer);
      window.clearTimeout(exitTimer);
      window.clearTimeout(safety);
      intro.hidden = true;
      page.inert = false;
      clock.inert = false;
      root.classList.remove("intro-pending", "intro-revealing");
      if (document.activeElement === document.querySelector("#intro-skip")) {
        document.querySelector('[role="tab"][aria-selected="true"]')?.focus({ preventScroll: true });
      }
    }
    finishImmediately = completeIntro;

    function finishIntro(immediate = false) {
      if (finished || leaving) {
        if (immediate) completeIntro();
        return;
      }
      leaving = true;
      window.clearTimeout(phaseTimer);
      if (immediate || reducedMotion.matches) {
        completeIntro();
        return;
      }
      root.classList.add("intro-revealing");
      intro.classList.add("is-leaving");
      const onTransitionEnd = (event) => {
        if (event.target === intro && event.propertyName === "opacity") completeIntro();
      };
      intro.addEventListener("transitionend", onTransitionEnd, { once: true });
      exitTimer = window.setTimeout(completeIntro, 850);
    }

    document.querySelector("#intro-skip").addEventListener("click", () => finishIntro());
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !intro.hidden) finishIntro();
    });
    reducedMotion.addEventListener("change", () => {
      if (reducedMotion.matches) finishIntro(true);
    });

    const fontReady = document.fonts?.load('100 48px "Pencerio"') || Promise.resolve();
    Promise.race([
      fontReady.then(() => true, () => false),
      new Promise((resolve) => window.setTimeout(() => resolve(false), 1500))
    ]).then(() => {
      if (leaving || !introAllowed) return;
      window.requestAnimationFrame(() => {
        if (leaving) return;
        intro.classList.add("is-playing");
        phaseTimer = window.setTimeout(() => {
          if (leaving) return;
          intro.classList.add("is-holding");
          phaseTimer = window.setTimeout(() => finishIntro(), 500);
        }, 1050);
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("readystatechange", function onReady() {
      if (document.readyState === "loading") return;
      document.removeEventListener("readystatechange", onReady);
      initialize();
    });
  } else {
    initialize();
  }
})();
