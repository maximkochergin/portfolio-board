(() => {
  const root = document.documentElement;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const clockPreference = "portfolio-clock-hidden";
  let preferenceStorage = null;
  try { preferenceStorage = window.localStorage; } catch { /* Storage can be disabled. */ }

  function storedFlag(storage, key) {
    try { return storage.getItem(key) === "1"; } catch { return false; }
  }

  function saveFlag(storage, key, value) {
    try {
      if (value) storage.setItem(key, "1");
      else storage.removeItem(key);
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
    && new URLSearchParams(window.location.search).get("manage") !== "1";
  if (introAllowed) root.classList.add("intro-pending");

  const safety = window.setTimeout(() => {
    introAllowed = false;
    root.classList.remove("intro-pending", "intro-revealing");
    const intro = document.querySelector("#intro");
    const page = document.querySelector(".page");
    const clock = document.querySelector("#ambient-clock");
    if (intro) intro.hidden = true;
    if (page) page.inert = false;
    if (clock) clock.inert = false;
  }, 5000);

  function initialize() {
    const clock = document.querySelector("#ambient-clock");
    const clockTime = document.querySelector("#clock-time");
    const clockToggle = document.querySelector("#clock-toggle");
    const intro = document.querySelector("#intro");
    const introGreeting = document.querySelector("#intro-greeting");
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

    introGreeting.textContent = greetingForHour(new Date().getHours());
    intro.hidden = false;
    page.inert = true;
    clock.inert = true;
    let leaving = false;
    function finishIntro() {
      if (leaving) return;
      leaving = true;
      root.classList.add("intro-revealing");
      intro.classList.add("is-leaving");
      window.setTimeout(() => {
        intro.hidden = true;
        page.inert = false;
        clock.inert = false;
        root.classList.remove("intro-pending", "intro-revealing");
        window.clearTimeout(safety);
      }, 720);
    }

    document.querySelector("#intro-skip").addEventListener("click", finishIntro);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !intro.hidden) finishIntro();
    });
    reducedMotion.addEventListener("change", () => {
      if (reducedMotion.matches) finishIntro();
    });

    const fontReady = document.fonts?.load('100 48px "Pencerio"') || Promise.resolve();
    Promise.race([fontReady.catch(() => {}), new Promise((resolve) => window.setTimeout(resolve, 550))])
      .then(() => {
        if (leaving || !introAllowed) return;
        window.requestAnimationFrame(() => {
          intro.classList.add("is-playing");
          window.setTimeout(finishIntro, 1650);
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
