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

    const greeting = greetingForHour(new Date().getHours());
    introClear.textContent = greeting;
    intro.hidden = false;
    page.inert = true;
    clock.inert = true;
    let leaving = false;
    let revealFrame = 0;

    function revealLetters(onComplete) {
      const bounds = introClear.getBoundingClientRect();
      const letters = introClear.firstChild;
      const maskSupported = window.CSS?.supports?.("mask-image", "linear-gradient(to right, black, transparent)")
        || window.CSS?.supports?.("-webkit-mask-image", "linear-gradient(to right, black, transparent)");
      if (!bounds.width || !letters || !maskSupported) {
        introClear.style.maskImage = "none";
        introClear.style.webkitMaskImage = "none";
        window.setTimeout(onComplete, 1400);
        return;
      }

      const count = letters.textContent.length;
      const range = document.createRange();
      const edges = [0];
      for (let index = 1; index <= count; index += 1) {
        range.setStart(letters, 0);
        range.setEnd(letters, index);
        const right = Math.min(bounds.width, range.getBoundingClientRect().right - bounds.left);
        edges.push(index === count ? bounds.width : Math.max(edges[index - 1], right));
      }

      const letterMs = 225;
      const duration = count * letterMs;
      let startedAt = null;
      function draw(now) {
        if (leaving) return;
        if (startedAt === null) startedAt = now;
        const elapsed = Math.min(duration, now - startedAt);
        const index = Math.min(count - 1, Math.floor(elapsed / letterMs));
        const fraction = Math.min(1, (elapsed / letterMs - index) / 0.9);
        const eased = fraction * fraction * (3 - 2 * fraction);
        const edge = edges[index] + (edges[index + 1] - edges[index]) * eased;
        const solid = Math.max(0, edge - 24);
        const feather = Math.max(solid + 1, edge + 12);
        const mask = `linear-gradient(to right, #000 0px, #000 ${solid}px, transparent ${feather}px)`;
        introClear.style.maskImage = mask;
        introClear.style.webkitMaskImage = mask;
        if (elapsed < duration) {
          revealFrame = window.requestAnimationFrame(draw);
        } else {
          introClear.style.maskImage = "none";
          introClear.style.webkitMaskImage = "none";
          onComplete();
        }
      }
      revealFrame = window.requestAnimationFrame(draw);
    }

    function finishIntro() {
      if (leaving) return;
      leaving = true;
      window.cancelAnimationFrame(revealFrame);
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
    Promise.race([fontReady.catch(() => {}), new Promise((resolve) => window.setTimeout(resolve, 1500))])
      .then(() => {
        if (leaving || !introAllowed) return;
        window.requestAnimationFrame(() => {
          if (leaving) return;
          intro.classList.add("is-playing");
          revealLetters(() => {
            if (leaving) return;
            intro.classList.add("is-holding");
            window.setTimeout(finishIntro, 680);
          });
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
