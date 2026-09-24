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
    let revealFrame = 0;
    let leaving = false;
    let finished = false;

    function completeIntro() {
      if (finished) return;
      finished = true;
      leaving = true;
      window.clearTimeout(phaseTimer);
      window.clearTimeout(exitTimer);
      window.cancelAnimationFrame(revealFrame);
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
      window.cancelAnimationFrame(revealFrame);
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

    function revealGreeting() {
      const text = introClear.firstChild;
      const count = text?.length || 0;
      const bounds = introClear.getBoundingClientRect();
      const maskSupported = window.CSS?.supports?.("mask-image", "linear-gradient(to right, black, transparent)")
        || window.CSS?.supports?.("-webkit-mask-image", "linear-gradient(to right, black, transparent)");
      if (!maskSupported || !count || !bounds.width) {
        intro.classList.add("is-playing");
        phaseTimer = window.setTimeout(() => finishIntro(), 1800);
        return;
      }

      const range = document.createRange();
      range.setStart(text, 0);
      range.setEnd(text, 1);
      const edges = [range.getBoundingClientRect().left - bounds.left];
      for (let index = 1; index <= count; index += 1) {
        range.setEnd(text, index);
        const right = range.getBoundingClientRect().right - bounds.left;
        edges.push(Math.max(edges[index - 1], Math.min(bounds.width, right)));
      }

      introClear.style.setProperty("--intro-reveal", "-8px");
      intro.classList.add("is-writing", "is-playing");
      const letterMs = 185;
      const duration = count * letterMs;
      let startedAt = null;
      function draw(now) {
        if (leaving) return;
        if (startedAt === null) startedAt = now;
        const elapsed = Math.min(duration, now - startedAt);
        const index = Math.min(count - 1, Math.floor(elapsed / letterMs));
        const fraction = (elapsed - index * letterMs) / letterMs;
        const eased = fraction * fraction * (3 - 2 * fraction);
        const edge = edges[index] + (edges[index + 1] - edges[index]) * eased;
        introClear.style.setProperty("--intro-reveal", `${edge}px`);
        if (elapsed < duration) revealFrame = window.requestAnimationFrame(draw);
        else {
          introClear.style.setProperty("--intro-reveal", `${bounds.width + 8}px`);
          phaseTimer = window.setTimeout(() => finishIntro(), 600);
        }
      }
      revealFrame = window.requestAnimationFrame(draw);
    }

    const fontReady = document.fonts?.load('100 48px "Pencerio"') || Promise.resolve();
    Promise.race([
      fontReady.then(() => true, () => false),
      new Promise((resolve) => window.setTimeout(() => resolve(false), 1500))
    ]).then(() => {
      if (leaving || !introAllowed) return;
      window.requestAnimationFrame(() => {
        if (leaving) return;
        revealGreeting();
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
