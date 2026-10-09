(() => {
  const preferenceKey = "portfolio-clock-hidden";
  let storage = null;
  try { storage = window.localStorage; } catch { /* Storage is optional. */ }

  function initialize() {
    const clock = document.querySelector("#ambient-clock");
    const time = document.querySelector("#clock-time");
    const toggle = document.querySelector("#clock-toggle");
    const greeting = document.querySelector("#local-greeting");
    if (!clock || !time || !toggle) return;

    function setHidden(hidden) {
      clock.classList.toggle("is-hidden", hidden);
      toggle.textContent = hidden ? "Show time" : "Hide time";
      toggle.setAttribute("aria-expanded", String(!hidden));
      try {
        if (hidden) storage?.setItem(preferenceKey, "1");
        else storage?.removeItem(preferenceKey);
      } catch { /* The clock still works without saved preferences. */ }
    }
    let hidden = false;
    try { hidden = storage?.getItem(preferenceKey) === "1"; } catch { /* Use the default. */ }
    setHidden(hidden);
    toggle.addEventListener("click", () => setHidden(!clock.classList.contains("is-hidden")));

    function update() {
      if (document.hidden) return;
      const now = new Date();
      time.textContent = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
      time.dateTime = now.toISOString();
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      clock.title = zone ? "Time on your device (" + zone + ")" : "Time on your device";
      if (greeting) {
        const hour = now.getHours();
        const phrase = hour < 5 || hour >= 22 ? "Hello" : hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
        greeting.textContent = phrase + ". Welcome to the archive.";
      }
    }
    update();
    window.setInterval(update, 30000);
    document.addEventListener("visibilitychange", update);
    window.addEventListener("pageshow", update);

    const navigation = document.querySelector(".switcher");
    const mobile = window.matchMedia("(max-width: 700px)");
    const orient = () => navigation?.setAttribute("aria-orientation", mobile.matches ? "horizontal" : "vertical");
    orient();
    mobile.addEventListener("change", orient);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
  else initialize();
})();
