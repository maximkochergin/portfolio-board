(() => {
  function initialize() {
    const root = document.documentElement;
    const clock = document.querySelector("#ukraine-time");
    const bunny = document.querySelector("#footer-bunny");
    const image = bunny?.querySelector("svg.bunny");
    const ownerAccess = document.querySelector("#owner-access");
    const controls = document.querySelector("#board-controls");
    const topLinks = document.querySelectorAll("#back-to-top, a.brand");
    const pageTop = document.querySelector("#page-top");
    const authDialog = document.querySelector("#auth-dialog");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const labels = {
      night: "A bunny sleeping",
      morning: "A bunny waking up",
      day: "A bunny sitting",
      evening: "A bunny relaxing"
    };
    let scene = root.dataset.bunnyScene || "day";
    let suspended = document.hidden;
    let minuteTimer = 0;
    let blinkTimer = 0;
    let blinkEnd = 0;
    let earTimer = 0;
    let earEnd = 0;
    let hopTimer = 0;
    let pressTimer = 0;
    let gesture = null;
    let suppressClick = false;
    let ownerVisible = root.dataset.ownerAccess === "visible";

    function cancelGesture(suppress = true) {
      window.clearTimeout(pressTimer);
      pressTimer = 0;
      const pointer = gesture?.id;
      if (gesture && suppress) suppressClick = true;
      gesture = null;
      if (pointer !== undefined && bunny?.hasPointerCapture?.(pointer)) {
        try { bunny.releasePointerCapture(pointer); } catch { /* The pointer may already be released. */ }
      }
    }

    function clearMotion() {
      [blinkTimer, blinkEnd, earTimer, earEnd, hopTimer].forEach(timer => window.clearTimeout(timer));
      blinkTimer = blinkEnd = earTimer = earEnd = hopTimer = 0;
      bunny?.classList.remove("is-blinking", "is-twitching", "is-hopping");
    }

    function failQuietly() {
      window.clearTimeout(minuteTimer);
      minuteTimer = 0;
      cancelGesture();
      clearMotion();
    }

    function guard(callback) {
      return event => {
        try { callback(event); } catch { failQuietly(); }
      };
    }

    function canAnimate() {
      return bunny?.isConnected && !suspended && !document.hidden && !reduced.matches;
    }

    function scheduleBlink() {
      if (!canAnimate() || !["day", "evening"].includes(scene)) return;
      const delay = scene === "day" ? 4000 + Math.random() * 3000 : 8000 + Math.random() * 4000;
      blinkTimer = window.setTimeout(guard(() => {
        blinkTimer = 0;
        if (!canAnimate()) return;
        bunny.classList.add("is-blinking");
        blinkEnd = window.setTimeout(guard(() => {
          blinkEnd = 0;
          bunny.classList.remove("is-blinking");
          scheduleBlink();
        }), scene === "evening" ? 300 : 160);
      }), delay);
    }

    function scheduleEar() {
      if (!canAnimate() || scene !== "day") return;
      earTimer = window.setTimeout(guard(() => {
        earTimer = 0;
        if (!canAnimate()) return;
        bunny.classList.add("is-twitching");
        earEnd = window.setTimeout(guard(() => {
          earEnd = 0;
          bunny.classList.remove("is-twitching");
          scheduleEar();
        }), 300);
      }), 11000 + Math.random() * 8000);
    }

    function syncMotion() {
      clearMotion();
      scheduleBlink();
      scheduleEar();
    }

    function hop() {
      if (!canAnimate() || hopTimer) return;
      window.clearTimeout(earTimer);
      window.clearTimeout(earEnd);
      earTimer = earEnd = 0;
      bunny.classList.remove("is-twitching");
      bunny.classList.add("is-hopping", "is-twitching");
      hopTimer = window.setTimeout(guard(() => {
        hopTimer = 0;
        bunny.classList.remove("is-hopping", "is-twitching");
        scheduleEar();
      }), 350);
    }

    function updateTime() {
      window.clearTimeout(minuteTimer);
      minuteTimer = 0;
      if (suspended || document.hidden) return;
      const time = window.portfolioTime;
      if (time?.getSnapshot && time.parseOverride) {
        const snapshot = time.getSnapshot(new Date(), time.parseOverride(window.location.search));
        if (clock) {
          clock.textContent = snapshot.text;
          clock.dateTime = snapshot.datetime;
          clock.hidden = false;
        }
        root.dataset.bunnyScene = snapshot.scene;
        image?.setAttribute("aria-label", labels[snapshot.scene] || labels.day);
        if (scene !== snapshot.scene) {
          scene = snapshot.scene;
          syncMotion();
        }
      }
      minuteTimer = window.setTimeout(guard(updateTime), 60000 - (Date.now() % 60000) + 25);
    }

    function syncOwnerAccess() {
      const manage = new URLSearchParams(window.location.search).get("manage") === "1";
      const visible = manage || Boolean(controls && !controls.hidden);
      if (visible) root.dataset.ownerAccess = "visible";
      else delete root.dataset.ownerAccess;
      const active = document.activeElement;
      if (ownerVisible && !visible && !document.querySelector("dialog[open], [role='dialog']:not([hidden])")
        && (active === document.body || active === ownerAccess || controls?.contains(active))) pageTop?.focus({ preventScroll: true });
      ownerVisible = visible;
    }

    function resume() {
      suspended = document.hidden;
      cancelGesture();
      syncOwnerAccess();
      updateTime();
      syncMotion();
    }

    function pause() {
      suspended = true;
      window.clearTimeout(minuteTimer);
      minuteTimer = 0;
      cancelGesture();
      clearMotion();
    }

    if (bunny) {
      bunny.addEventListener("pointerdown", guard(event => {
        if (!event.isPrimary || event.button !== 0) {
          cancelGesture();
          return;
        }
        cancelGesture(false);
        suppressClick = false;
        gesture = { id: event.pointerId, x: event.clientX, y: event.clientY };
        try { bunny.setPointerCapture?.(event.pointerId); } catch { /* Global listeners still track release. */ }
        pressTimer = window.setTimeout(guard(() => {
          pressTimer = 0;
          if (!gesture || document.hidden || suspended || !bunny.isConnected) return;
          suppressClick = true;
          ownerAccess?.click();
        }), 800);
      }));
      document.addEventListener("pointermove", guard(event => {
        if (!gesture || event.pointerId !== gesture.id) return;
        const bounds = bunny.getBoundingClientRect();
        const outside = event.clientX < bounds.left || event.clientX > bounds.right
          || event.clientY < bounds.top || event.clientY > bounds.bottom;
        if (outside || Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 8) cancelGesture();
      }), { capture: true, passive: true });
      document.addEventListener("pointerup", guard(event => {
        if (event.pointerId === gesture?.id) cancelGesture(false);
      }), true);
      document.addEventListener("pointerdown", guard(event => {
        if (gesture && event.pointerId !== gesture.id) cancelGesture();
      }), true);
      document.addEventListener("pointercancel", guard(event => {
        if (event.pointerId === gesture?.id) cancelGesture();
      }), true);
      bunny.addEventListener("pointerleave", guard(() => { if (gesture) cancelGesture(); }));
      bunny.addEventListener("lostpointercapture", guard(() => { if (gesture) cancelGesture(); }));
      bunny.addEventListener("click", guard(event => {
        if (suppressClick) {
          suppressClick = false;
          event.preventDefault();
          event.stopImmediatePropagation();
          return;
        }
        if (event.button === 0) hop();
      }), true);
      bunny.addEventListener("contextmenu", event => event.preventDefault());
      bunny.addEventListener("dragstart", event => event.preventDefault());
      document.addEventListener("scroll", guard(() => { if (gesture) cancelGesture(); }), { capture: true, passive: true });
      window.addEventListener("blur", guard(() => { cancelGesture(); clearMotion(); }));
      window.addEventListener("focus", guard(() => { if (!suspended) syncMotion(); }));
    }

    topLinks.forEach(link => link.addEventListener("click", guard(event => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      window.scrollTo({ top: 0, behavior: reduced.matches ? "auto" : "smooth" });
      pageTop?.focus({ preventScroll: true });
    })));
    authDialog?.addEventListener("close", guard(() => {
      if (root.dataset.ownerAccess === "visible") return;
      const active = document.activeElement;
      if (active === document.body || active === ownerAccess || authDialog.contains(active)) pageTop?.focus({ preventScroll: true });
    }));
    if (controls && typeof MutationObserver === "function") {
      const observer = new MutationObserver(guard(syncOwnerAccess));
      observer.observe(controls, { attributes: true, attributeFilter: ["hidden"] });
    }
    document.addEventListener("visibilitychange", guard(() => { if (document.hidden) pause(); else resume(); }));
    window.addEventListener("pagehide", guard(pause));
    window.addEventListener("pageshow", guard(resume));
    window.addEventListener("popstate", guard(syncOwnerAccess));
    reduced.addEventListener("change", guard(syncMotion));
    resume();
  }

  try {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => {
      try { initialize(); } catch { /* Footer enhancements never block the rest of the page. */ }
    }, { once: true });
    else initialize();
  } catch { /* The static footer remains usable if an enhancement is unavailable. */ }
})();
