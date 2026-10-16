(() => {
  function initialize() {
    const root = document.documentElement;
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const forcedColors = window.matchMedia("(forced-colors: active)");
    const revealSelector = ".post-list > .post-item, .detail .body > :is(h1,h2,h3,h4,h5,h6,p,ul,ol,pre,blockquote,img,figure,table)";
    const excluded = "dialog, [role='dialog'], #board-controls, #owner-actions, input, textarea, select, [contenteditable]:not([contenteditable='false']), [inert], :disabled, [aria-disabled='true']";
    const infinityButton = document.querySelector("button.role-connector");
    const infinityFallback = document.querySelector(".role-connector-fallback");
    const seen = new WeakSet();
    const pending = new Set();
    let failed = false;
    let suspended = false;
    let frame = 0;
    let scanQueued = false;
    let intersection = null;
    let mutations = null;
    let cursor = null;
    let echo = null;
    let interest = null;
    let magnet = null;
    let spotlight = null;
    let magnetX = 0;
    let magnetY = 0;
    let visible = false;
    let modalOpen = false;
    let known = false;
    let dirty = false;
    let x = 0;
    let y = 0;
    let echoX = 0;
    let echoY = 0;
    let lean = 0;
    let targetLean = 0;
    let lastMove = 0;
    let lastFrame = 0;
    let primaryDown = false;
    let nativeDrag = false;
    let infinityTimer = 0;

    const guard = callback => (...args) => {
      if (failed) return;
      try { return callback(...args); }
      catch { failOpen(); }
    };
    const enabled = () => finePointer.matches && !reducedMotion.matches && !forcedColors.matches && !suspended && !document.hidden;
    const blocked = element => modalOpen || !element?.closest || Boolean(element.closest(excluded + ", .panel-ghost"));
    const inViewport = () => x >= 0 && y >= 0 && x < root.clientWidth && y < root.clientHeight;

    function resetInfinityHover() {
      infinityButton?.classList.remove("is-reacting");
      infinityButton?.style.removeProperty("--loop-tilt");
    }

    function finishInfinity() {
      window.clearTimeout(infinityTimer);
      infinityTimer = 0;
      infinityButton?.classList.remove("is-looping");
    }

    function animateInfinity() {
      if (!infinityButton || document.hidden || infinityTimer) return;
      infinityButton.classList.add("is-looping");
      // The timer also settles feedback when animations are disabled or interrupted.
      infinityTimer = window.setTimeout(guard(finishInfinity), 950);
    }

    function resetInterest() {
      if (interest) {
        interest.classList.remove("is-reacting");
        interest.style.removeProperty("--asset-tilt");
      }
      interest = null;
    }

    function resetMagnet() {
      if (magnet) {
        magnet.style.removeProperty("--magnet-x");
        magnet.style.removeProperty("--magnet-y");
      }
      magnet = null;
      magnetX = magnetY = 0;
    }

    function resetSpotlight() {
      if (spotlight) {
        spotlight.classList.remove("has-spotlight");
        spotlight.style.removeProperty("--mx");
        spotlight.style.removeProperty("--my");
      }
      spotlight = null;
    }

    function hidePointer() {
      root.classList.remove("has-custom-cursor");
      visible = false;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      lastFrame = 0;
      lean = targetLean = 0;
      cursor?.classList.remove("is-visible", "is-interactive", "is-entry", "is-interest", "is-infinity", "is-pressed");
      echo?.classList.remove("is-visible", "is-pressed");
      resetInfinityHover();
      resetInterest();
      resetMagnet();
      resetSpotlight();
    }

    function removePointer() {
      hidePointer();
      cursor?.remove();
      echo?.remove();
      cursor = echo = null;
      known = false;
      lean = targetLean = 0;
    }

    function createPointer() {
      if (cursor || !enabled()) return;
      cursor = document.createElement("span");
      cursor.className = "fx-cursor";
      cursor.setAttribute("aria-hidden", "true");
      const shape = document.createElement("span");
      shape.className = "fx-cursor-shape";
      const label = document.createElement("span");
      label.className = "fx-cursor-label";
      label.textContent = "View";
      cursor.append(shape, label);
      echo = document.createElement("span");
      echo.className = "fx-cursor-echo";
      echo.setAttribute("aria-hidden", "true");
      document.body.append(cursor, echo);
    }

    function updateSurfaces() {
      const target = document.elementFromPoint(x, y);
      if (!inViewport() || blocked(target)) { hidePointer(); return; }
      cursor.classList.toggle("is-interactive", Boolean(target.closest("a[href], button:not(:disabled), summary, [role='button']:not([aria-disabled='true'])")));
      cursor.classList.toggle("is-entry", Boolean(target.closest(".post-list > .post-item")));
      const overInfinity = Boolean(target.closest("button.role-connector"));
      cursor.classList.toggle("is-infinity", overInfinity);
      if (overInfinity && infinityButton) {
        const box = infinityButton.getBoundingClientRect();
        const tilt = Math.max(-12, Math.min(12, (x - box.left - box.width / 2) * .6));
        infinityButton.style.setProperty("--loop-tilt", tilt.toFixed(1) + "deg");
        infinityButton.classList.add("is-reacting");
      } else resetInfinityHover();
      const nextInterest = target.closest(".interest-item");
      if (nextInterest !== interest) resetInterest();
      cursor.classList.toggle("is-interest", Boolean(nextInterest));
      if (nextInterest) {
        interest = nextInterest;
        const box = interest.getBoundingClientRect();
        const tilt = Math.max(-10, Math.min(10, (x - box.left - box.width / 2) * .3));
        interest.style.setProperty("--asset-tilt", tilt.toFixed(1) + "deg");
        interest.classList.add("is-reacting");
      }
      // Only the actual hovered link moves, so empty space never attracts a target.
      const nextMagnet = target.closest(".contact-link, .switcher button");
      if (nextMagnet !== magnet) resetMagnet();
      if (nextMagnet) {
        const box = nextMagnet.getBoundingClientRect();
        let shiftX = nextMagnet === magnet ? magnetX : 0;
        let shiftY = nextMagnet === magnet ? magnetY : 0;
        if (typeof DOMMatrixReadOnly === "function") {
          try {
            const transform = window.getComputedStyle(nextMagnet).transform;
            const matrix = transform === "none" ? null : new DOMMatrixReadOnly(transform);
            shiftX = matrix?.m41 || 0;
            shiftY = matrix?.m42 || 0;
          } catch { /* Keep the bounded offset fallback on older engines. */ }
        }
        const dx = x - (box.left + box.width / 2 - shiftX);
        const dy = y - (box.top + box.height / 2 - shiftY);
        magnet = nextMagnet;
        magnetX = Math.round(Math.max(-3, Math.min(3, dx * .12)) * 2) / 2;
        magnetY = Math.round(Math.max(-3, Math.min(3, dy * .12)) * 2) / 2;
        magnet.style.setProperty("--magnet-x", magnetX.toFixed(1) + "px");
        magnet.style.setProperty("--magnet-y", magnetY.toFixed(1) + "px");
      }
      const list = target.closest(".post-list");
      if (list !== spotlight) resetSpotlight();
      if (list) {
        spotlight = list;
        const box = list.getBoundingClientRect();
        list.style.setProperty("--mx", Math.max(0, Math.min(box.width, x - box.left)).toFixed(1) + "px");
        list.style.setProperty("--my", Math.max(0, Math.min(box.height, y - box.top)).toFixed(1) + "px");
        list.classList.add("has-spotlight");
      }
    }

    function keepEchoClose() {
      const dx = x - echoX;
      const dy = y - echoY;
      const distance = Math.hypot(dx, dy);
      if (distance > 6) {
        echoX = x - dx * 6 / distance;
        echoY = y - dy * 6 / distance;
      }
    }

    const tick = guard(timestamp => {
      frame = 0;
      if (!visible || !enabled()) return;
      if (dirty) { dirty = false; updateSurfaces(); }
      if (!visible) return;
      const elapsed = lastFrame ? Math.max(0, Math.min(50, timestamp - lastFrame)) : 16.7;
      lastFrame = timestamp;
      const ease = 1 - Math.exp(-elapsed / 20);
      keepEchoClose();
      echoX += (x - echoX) * ease;
      echoY += (y - echoY) * ease;
      if (timestamp - lastMove > 40) targetLean = 0;
      lean += (targetLean - lean) * ease;
      const moving = Math.hypot(x - echoX, y - echoY) > .1 || Math.abs(lean) > .03;
      if (!moving) { echoX = x; echoY = y; lean = 0; }
      echo.style.transform = `translate3d(${echoX}px, ${echoY}px, 0)`;
      cursor.style.setProperty("--cursor-lean", lean.toFixed(2) + "deg");
      if (moving) scheduleFrame();
      else { lastFrame = 0; echo.classList.remove("is-visible"); }
    });
    function scheduleFrame() {
      if (!frame) frame = window.requestAnimationFrame(tick);
    }

    function movePointer(event) {
      if (!enabled() || !cursor || event.pointerType === "touch") { hidePointer(); return; }
      primaryDown = Boolean(event.buttons & 1);
      if (!event.buttons) nativeDrag = false;
      if (nativeDrag || (event.buttons & ~1)) { hidePointer(); return; }
      const previousX = x;
      const previousMove = lastMove;
      x = event.clientX;
      y = event.clientY;
      if (!inViewport() || blocked(document.elementFromPoint(x, y))) { hidePointer(); return; }
      if (!known || !visible) {
        echoX = x;
        echoY = y;
        lean = targetLean = 0;
        echo.style.transform = `translate3d(${x}px, ${y}px, 0)`;
        cursor.style.setProperty("--cursor-lean", "0deg");
      }
      lastMove = performance.now();
      if (visible) {
        const elapsed = Math.max(1, lastMove - previousMove);
        targetLean = Math.max(-5, Math.min(5, (x - previousX) / elapsed * 2));
      }
      known = visible = dirty = true;
      cursor.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      cursor.classList.toggle("is-edge-right", x + 70 > root.clientWidth);
      cursor.classList.toggle("is-edge-bottom", y + 32 > root.clientHeight);
      // Clamp immediately as well as on animation frames, even during fast sweeps.
      keepEchoClose();
      echo.style.transform = `translate3d(${echoX}px, ${echoY}px, 0)`;
      cursor.classList.add("is-visible");
      echo.classList.add("is-visible");
      cursor.classList.toggle("is-pressed", Boolean(event.buttons & 1));
      echo.classList.toggle("is-pressed", Boolean(event.buttons & 1));
      root.classList.add("has-custom-cursor");
      scheduleFrame();
    }

    function releasePointer(event) {
      primaryDown = false;
      nativeDrag = false;
      cursor?.classList.remove("is-pressed");
      echo?.classList.remove("is-pressed");
      if (visible && event && event.pointerType !== "touch") movePointer(event);
    }

    function reveal(element) {
      pending.delete(element);
      element.classList.remove("reveal-pending");
      element.classList.add("reveal-visible");
      intersection?.unobserve(element);
    }

    function revealAll() {
      intersection?.disconnect();
      intersection = null;
      root.classList.remove("js-reveal");
      pending.forEach(reveal);
      document.querySelectorAll(".reveal-pending").forEach(reveal);
    }

    function scanReveals() {
      if (!intersection || suspended) return;
      pending.forEach(element => {
        if (!element.isConnected) {
          // Detached nodes may be reused; never leave an unobserved node hidden.
          reveal(element);
        }
      });
      document.querySelectorAll(revealSelector).forEach(element => {
        if (seen.has(element) || element.closest("[hidden], .panel-ghost") || !element.getClientRects().length) return;
        seen.add(element);
        if (element.getBoundingClientRect().top < window.innerHeight) return;
        element.classList.add("motion-entered", "reveal-pending");
        pending.add(element);
        intersection.observe(element);
      });
    }

    function syncModal() {
      modalOpen = Array.from(document.querySelectorAll("dialog[open], [role='dialog']")).some(element =>
        !element.hidden && element.getAttribute("aria-hidden") !== "true" && element.getClientRects().length > 0);
      if (modalOpen) hidePointer();
    }

    function syncPreferences() {
      if (document.hidden || reducedMotion.matches || suspended) finishInfinity();
      if (enabled()) createPointer();
      else removePointer();
      if (reducedMotion.matches || suspended || !("IntersectionObserver" in window)) { revealAll(); return; }
      if (!intersection) {
        intersection = new IntersectionObserver(guard(entries => {
          entries.forEach(entry => { if (entry.isIntersecting) reveal(entry.target); });
        }), { threshold: .1, rootMargin: "0px 0px -24px 0px" });
        scanReveals();
        root.classList.add("js-reveal");
      }
    }

    function queueScan() {
      if (scanQueued || suspended) return;
      scanQueued = true;
      queueMicrotask(guard(() => {
        scanQueued = false;
        syncModal();
        scanReveals();
        if (visible && enabled()) { dirty = true; scheduleFrame(); }
      }));
    }

    function failOpen() {
      failed = true;
      root.classList.remove("js-reveal", "has-custom-cursor");
      try {
        mutations?.disconnect();
        finishInfinity();
        if (infinityButton) infinityButton.hidden = true;
        if (infinityFallback) infinityFallback.hidden = false;
        removePointer();
      } catch { /* Content stays visible even if an effect cannot be cleaned up. */ }
      finally {
        try { revealAll(); }
        catch { root.classList.remove("js-reveal"); }
      }
    }

    try {
      mutations = new MutationObserver(guard(records => {
        if (records.some(record => !record.target.parentElement?.closest(".panel-ghost"))) queueScan();
      }));
      const observe = () => mutations.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden", "open", "aria-hidden", "aria-modal", "role", "disabled", "aria-disabled", "inert", "href", "contenteditable"] });
      observe();
      syncModal();
      syncPreferences();
      document.addEventListener("pointermove", guard(movePointer), { passive: true });
      document.addEventListener("pointerover", guard(movePointer), { passive: true });
      document.addEventListener("pointerout", guard(event => { if (!event.relatedTarget) hidePointer(); }), { passive: true });
      document.addEventListener("pointerdown", guard(event => {
        primaryDown = Boolean(event.buttons & 1);
        if (event.button !== 0 || blocked(event.target)
          || event.clientX >= root.clientWidth || event.clientY >= root.clientHeight) {
          nativeDrag = true;
          hidePointer();
          return;
        }
        nativeDrag = false;
        movePointer(event);
      }), { passive: true, capture: true });
      window.addEventListener("pointerup", guard(releasePointer), { passive: true, capture: true });
      document.addEventListener("pointercancel", guard(() => { releasePointer(); hidePointer(); }), { passive: true });
      document.addEventListener("lostpointercapture", guard(() => { releasePointer(); hidePointer(); }), { passive: true });
      document.addEventListener("contextmenu", guard(hidePointer));
      document.addEventListener("dragstart", guard(() => { nativeDrag = true; hidePointer(); }));
      document.addEventListener("dragend", guard(() => { releasePointer(); hidePointer(); }));
      document.addEventListener("selectionchange", guard(() => {
        if (primaryDown && !window.getSelection()?.isCollapsed) { nativeDrag = true; hidePointer(); }
      }));
      document.addEventListener("keydown", guard(hidePointer), true);
      document.addEventListener("focusin", guard(event => {
        if (blocked(event.target)) hidePointer();
        const pending = event.target.closest(".reveal-pending");
        if (pending) reveal(pending);
      }));
      window.addEventListener("blur", guard(() => { releasePointer(); hidePointer(); }));
      document.addEventListener("scroll", guard(() => {
        if (!visible || !enabled()) return;
        resetMagnet();
        dirty = true;
        scheduleFrame();
      }), { passive: true, capture: true });
      window.addEventListener("resize", guard(() => { hidePointer(); queueScan(); }), { passive: true });
      window.addEventListener("orientationchange", guard(() => { hidePointer(); queueScan(); }), { passive: true });
      document.addEventListener("visibilitychange", guard(syncPreferences));
      finePointer.addEventListener("change", guard(syncPreferences));
      reducedMotion.addEventListener("change", guard(syncPreferences));
      forcedColors.addEventListener("change", guard(syncPreferences));
      window.addEventListener("pagehide", guard(() => {
        suspended = true;
        mutations.disconnect();
        finishInfinity();
        removePointer();
        revealAll();
      }));
      window.addEventListener("pageshow", guard(() => {
        if (!suspended) return;
        suspended = false;
        observe();
        syncModal();
        syncPreferences();
      }));
      if (infinityButton) {
        infinityButton.addEventListener("click", guard(animateInfinity));
        const finish = guard(event => {
          if (event.animationName === "infinity-loop") finishInfinity();
        });
        infinityButton.addEventListener("animationend", finish);
        infinityButton.addEventListener("animationcancel", finish);
        infinityButton.hidden = false;
        if (infinityFallback) infinityFallback.hidden = true;
      }
    } catch { failOpen(); }
  }

  const launch = () => {
    try { initialize(); }
    catch {
      document.documentElement.classList.remove("js-reveal", "has-custom-cursor");
      document.querySelectorAll(".reveal-pending").forEach(element => element.classList.remove("reveal-pending"));
    }
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", launch, { once: true });
  else launch();
})();
