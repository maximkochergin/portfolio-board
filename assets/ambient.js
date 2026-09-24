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
    const introBlur = document.querySelector("#intro-blur");
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

    const greeting = greetingForHour(new Date().getHours());
    introBlur.textContent = greeting;
    introClear.textContent = greeting;
    intro.hidden = false;
    page.inert = true;
    clock.inert = true;

    function revealLetters() {
      const bounds = introClear.getBoundingClientRect();
      const letters = introClear.firstChild;
      if (!bounds.width || !letters || !introClear.animate) {
        introBlur.style.clipPath = "none";
        introClear.style.clipPath = "none";
        return 900;
      }

      const count = letters.textContent.length;
      const range = document.createRange();
      const frames = [{ clipPath: "inset(0 100% 0 0)", offset: 0 }];
      let previousInset = 100;
      for (let index = 1; index <= count; index += 1) {
        range.setStart(letters, 0);
        range.setEnd(letters, index);
        const visibleWidth = Math.max(0, range.getBoundingClientRect().right - bounds.left + 1);
        const nextInset = index === count ? 0 : Math.min(previousInset, Math.max(0, 100 - visibleWidth / bounds.width * 100));
        frames.push({ clipPath: `inset(0 ${previousInset}% 0 0)`, offset: (index - 0.68) / count });
        frames.push({ clipPath: `inset(0 ${nextInset}% 0 0)`, offset: index / count });
        previousInset = nextInset;
      }

      const duration = Math.max(1150, count * 105);
      introBlur.animate(frames, { duration, fill: "forwards" });
      introClear.animate(frames, { duration, delay: 150, fill: "forwards" });
      return duration + 150;
    }

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
          if (leaving) return;
          const revealTime = revealLetters();
          intro.classList.add("is-playing");
          window.setTimeout(() => {
            if (leaving) return;
            intro.classList.add("is-holding");
            window.setTimeout(finishIntro, 520);
          }, revealTime);
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
