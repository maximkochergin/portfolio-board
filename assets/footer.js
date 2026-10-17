(() => {
  function initialize() {
    const root = document.documentElement;
    const clock = document.querySelector("#ukraine-time");
    const mascot = document.querySelector("#footer-mascot");
    const ownerAccess = document.querySelector("#owner-access");
    const controls = document.querySelector("#board-controls");
    const topLinks = document.querySelectorAll("a.brand");
    const pageTop = document.querySelector("#page-top");
    const authDialog = document.querySelector("#auth-dialog");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sceneLabels = { morning: "A ghost waking up", day: "A cheerful ghost", evening: "A ghost relaxing", night: "A ghost sleeping" };
    let suspended = document.hidden;
    let minuteTimer = 0;
    let greetingTimer = 0;
    let greetingRun = 0;
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
      mascot?.classList.remove("is-pressed");
      if (pointer !== undefined && mascot?.hasPointerCapture?.(pointer)) {
        try { mascot.releasePointerCapture(pointer); } catch { /* The pointer may already be released. */ }
      }
    }

    function clearMotion() {
      greetingRun += 1;
      window.clearTimeout(greetingTimer);
      greetingTimer = 0;
      mascot?.classList.remove("is-greeting");
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
      return mascot?.isConnected && !suspended && !document.hidden && !reduced.matches;
    }

    function greet() {
      if (!canAnimate() || greetingTimer) return;
      const run = ++greetingRun;
      mascot.classList.add("is-greeting");
      const finish = () => { if (run === greetingRun) clearMotion(); };
      greetingTimer = window.setTimeout(guard(finish), 650);
      const animations = mascot.getAnimations?.({ subtree: true }).filter(animation =>
        animation.effect?.target?.parentElement === mascot && typeof animation.animationName === "string");
      if (animations?.length) Promise.allSettled(animations.map(animation => animation.finished)).then(finish);
    }

    function leftGesture(event) {
      if (!gesture) return false;
      const bounds = mascot.getBoundingClientRect();
      return event.clientX < bounds.left || event.clientX > bounds.right
        || event.clientY < bounds.top || event.clientY > bounds.bottom
        || Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 8;
    }

    function updateTime() {
      window.clearTimeout(minuteTimer);
      minuteTimer = 0;
      if (suspended || document.hidden) return;
      const time = window.portfolioTime;
      if (time?.getSnapshot && time.parseOverride) {
        const snapshot = time.getSnapshot(new Date(), time.parseOverride(window.location.search));
        if (root.dataset.mascotScene !== snapshot.scene) clearMotion();
        root.dataset.mascotScene = snapshot.scene;
        mascot?.setAttribute("aria-label", sceneLabels[snapshot.scene] || "A small ghost");
        if (clock) {
          clock.textContent = snapshot.text;
          clock.dateTime = snapshot.datetime;
          clock.hidden = false;
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
      clearMotion();
    }

    function pause() {
      suspended = true;
      window.clearTimeout(minuteTimer);
      minuteTimer = 0;
      cancelGesture();
      clearMotion();
    }

    if (mascot) {
      mascot.addEventListener("pointerdown", guard(event => {
        if (!event.isPrimary || event.button !== 0) {
          cancelGesture();
          return;
        }
        cancelGesture(false);
        suppressClick = false;
        gesture = { id: event.pointerId, x: event.clientX, y: event.clientY };
        mascot.classList.add("is-pressed");
        try { mascot.setPointerCapture?.(event.pointerId); } catch { /* Global listeners still track release. */ }
        pressTimer = window.setTimeout(guard(() => {
          pressTimer = 0;
          if (!gesture || document.hidden || suspended || !mascot.isConnected) return;
          cancelGesture();
          clearMotion();
          ownerAccess?.click();
        }), 800);
      }));
      document.addEventListener("pointermove", guard(event => {
        if (!gesture || event.pointerId !== gesture.id) return;
        if (leftGesture(event)) cancelGesture();
      }), { capture: true, passive: true });
      document.addEventListener("pointerup", guard(event => {
        if (event.pointerId === gesture?.id) cancelGesture(leftGesture(event));
      }), true);
      document.addEventListener("pointerdown", guard(event => {
        if (gesture && event.pointerId !== gesture.id) cancelGesture();
      }), true);
      document.addEventListener("pointercancel", guard(event => {
        if (event.pointerId === gesture?.id) cancelGesture();
      }), true);
      mascot.addEventListener("pointerleave", guard(() => { if (gesture) cancelGesture(); }));
      mascot.addEventListener("lostpointercapture", guard(() => { if (gesture) cancelGesture(); }));
      mascot.addEventListener("click", guard(event => {
        if (suppressClick) {
          suppressClick = false;
          event.preventDefault();
          event.stopImmediatePropagation();
          return;
        }
        if (event.button === 0) greet();
      }), true);
      mascot.addEventListener("contextmenu", event => event.preventDefault());
      mascot.addEventListener("dragstart", event => event.preventDefault());
      document.addEventListener("scroll", guard(() => { if (gesture) cancelGesture(); }), { capture: true, passive: true });
      window.addEventListener("blur", guard(() => { cancelGesture(); clearMotion(); }));
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
    reduced.addEventListener("change", guard(clearMotion));
    resume();
  }

  try {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => {
      try { initialize(); } catch { /* Footer enhancements never block the rest of the page. */ }
    }, { once: true });
    else initialize();
  } catch { /* The static footer remains usable if an enhancement is unavailable. */ }
})();
