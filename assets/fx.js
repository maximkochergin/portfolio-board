(() => {
  function initialize() {
    const root = document.documentElement;
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const revealSelector = ".footer-sign, .post-list > .post-item, .detail .body > :is(h1,h2,h3,h4,h5,h6,p,ul,ol,pre,blockquote,img,figure,table)";
    const excluded = "dialog, [role='dialog'], #board-controls, #owner-actions, input, textarea, select, [contenteditable]:not([contenteditable='false'])";
    const seen = new WeakSet();
    const pending = new Set();
    let failed = false;
    let suspended = false;
    let frame = 0;
    let scanQueued = false;
    let intersection = null;
    let mutations = null;
    let dot = null;
    let ring = null;
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
    let ringX = 0;
    let ringY = 0;

    const guard = callback => (...args) => {
      if (failed) return;
      try { return callback(...args); }
      catch { failOpen(); }
    };
    const enabled = () => finePointer.matches && !reducedMotion.matches && !suspended && !document.hidden;
    const blocked = element => modalOpen || !element || Boolean(element.closest(excluded + ", .panel-ghost"));

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
      visible = false;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      dot?.classList.remove("is-visible", "is-pressed");
      ring?.classList.remove("is-visible", "is-interactive", "is-entry", "is-contact", "is-pressed");
      resetMagnet();
      resetSpotlight();
    }

    function removePointer() {
      hidePointer();
      dot?.remove();
      ring?.remove();
      dot = ring = null;
      known = false;
    }

    function createPointer() {
      if (dot || !enabled()) return;
      dot = document.createElement("span");
      dot.className = "fx-dot";
      dot.setAttribute("aria-hidden", "true");
      ring = document.createElement("span");
      ring.className = "fx-ring";
      ring.setAttribute("aria-hidden", "true");
      const shape = document.createElement("span");
      shape.className = "fx-ring-shape";
      const label = document.createElement("span");
      label.className = "fx-label";
      label.textContent = "View";
      ring.append(shape, label);
      document.body.append(dot, ring);
    }

    function updateSurfaces() {
      const target = document.elementFromPoint(x, y);
      if (blocked(target)) { hidePointer(); return; }
      ring.classList.toggle("is-interactive", Boolean(target.closest("a[href], button:not(:disabled), summary, [role='button']:not([aria-disabled='true'])")));
      ring.classList.toggle("is-contact", Boolean(target.closest("#contact-icons .contact-link")));
      ring.classList.toggle("is-entry", Boolean(target.closest(".post-list > .post-item")));
      let nearest = null;
      let distance = 60;
      let offsetX = 0;
      let offsetY = 0;
      document.querySelectorAll(".contact-link, .switcher button").forEach(element => {
        if (element.closest("[hidden], .panel-ghost") || element.matches(":disabled, [aria-disabled='true']") || !element.getClientRects().length) return;
        const box = element.getBoundingClientRect();
        let shiftX = element === magnet ? magnetX : 0;
        let shiftY = element === magnet ? magnetY : 0;
        if (element === magnet && typeof DOMMatrixReadOnly === "function") {
          try {
            const transform = window.getComputedStyle(element).transform;
            const matrix = transform === "none" ? null : new DOMMatrixReadOnly(transform);
            shiftX = matrix?.m41 || 0;
            shiftY = matrix?.m42 || 0;
          } catch { /* Keep the bounded offset fallback on older engines. */ }
        }
        const dx = x - (box.left + box.width / 2 - shiftX);
        const dy = y - (box.top + box.height / 2 - shiftY);
        const next = Math.hypot(dx, dy);
        if (next < distance) {
          nearest = element;
          distance = next;
          offsetX = Math.round(Math.max(-7, Math.min(7, dx * .25)) * 2) / 2;
          offsetY = Math.round(Math.max(-7, Math.min(7, dy * .25)) * 2) / 2;
        }
      });
      if (nearest !== magnet) resetMagnet();
      if (nearest) {
        magnet = nearest;
        magnetX = offsetX;
        magnetY = offsetY;
        magnet.style.setProperty("--magnet-x", offsetX.toFixed(2) + "px");
        magnet.style.setProperty("--magnet-y", offsetY.toFixed(2) + "px");
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

    const tick = guard(() => {
      frame = 0;
      if (!visible || !enabled()) return;
      if (dirty) { dirty = false; updateSurfaces(); }
      if (!visible) return;
      ringX += (x - ringX) * .18;
      ringY += (y - ringY) * .18;
      const moving = Math.abs(x - ringX) + Math.abs(y - ringY) > .1;
      if (!moving) { ringX = x; ringY = y; }
      ring.style.transform = `translate3d(${ringX - 16}px, ${ringY - 16}px, 0)`;
      if (moving) scheduleFrame();
    });
    function scheduleFrame() {
      if (!frame) frame = window.requestAnimationFrame(tick);
    }

    function movePointer(event) {
      if (!enabled() || !dot || event.pointerType === "touch") { hidePointer(); return; }
      if (blocked(event.target)) { hidePointer(); return; }
      x = event.clientX;
      y = event.clientY;
      if (!known || !visible) { ringX = x; ringY = y; }
      known = visible = dirty = true;
      dot.style.transform = `translate3d(${x - 3}px, ${y - 3}px, 0)`;
      dot.classList.add("is-visible");
      ring.classList.add("is-visible");
      dot.classList.toggle("is-pressed", Boolean(event.buttons & 1));
      ring.classList.toggle("is-pressed", Boolean(event.buttons & 1));
      scheduleFrame();
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
          intersection.unobserve(element);
          pending.delete(element);
        }
      });
      document.querySelectorAll(revealSelector).forEach(element => {
        if (seen.has(element) || element.closest("[hidden], .panel-ghost") || !element.getClientRects().length) return;
        if (element.matches(".footer-sign") && document.querySelector(".content[aria-busy='true']")) return;
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
      root.classList.remove("js-reveal");
      try {
        mutations?.disconnect();
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
      const observe = () => mutations.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden", "open", "aria-hidden", "aria-modal", "aria-busy", "role"] });
      observe();
      syncModal();
      syncPreferences();
      document.addEventListener("pointermove", guard(movePointer), { passive: true });
      document.addEventListener("pointerover", guard(movePointer), { passive: true });
      document.addEventListener("pointerout", guard(event => { if (!event.relatedTarget) hidePointer(); }), { passive: true });
      document.addEventListener("pointerdown", guard(event => {
        if (!visible || blocked(event.target)) return;
        dot.classList.add("is-pressed");
        ring.classList.add("is-pressed");
      }), { passive: true });
      document.addEventListener("pointerup", guard(() => {
        dot?.classList.remove("is-pressed");
        ring?.classList.remove("is-pressed");
      }), { passive: true });
      document.addEventListener("keydown", guard(hidePointer));
      document.addEventListener("focusin", guard(event => {
        const pending = event.target.closest(".reveal-pending");
        if (pending) reveal(pending);
      }));
      window.addEventListener("blur", guard(hidePointer));
      window.addEventListener("scroll", guard(hidePointer), { passive: true });
      window.addEventListener("resize", guard(() => { hidePointer(); queueScan(); }), { passive: true });
      window.addEventListener("orientationchange", guard(() => { hidePointer(); queueScan(); }), { passive: true });
      document.addEventListener("visibilitychange", guard(syncPreferences));
      finePointer.addEventListener("change", guard(syncPreferences));
      reducedMotion.addEventListener("change", guard(syncPreferences));
      window.addEventListener("pagehide", guard(() => {
        suspended = true;
        mutations.disconnect();
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
    } catch { failOpen(); }
  }

  const launch = () => {
    try { initialize(); }
    catch {
      document.documentElement.classList.remove("js-reveal");
      document.querySelectorAll(".reveal-pending").forEach(element => element.classList.remove("reveal-pending"));
    }
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", launch, { once: true });
  else launch();
})();
