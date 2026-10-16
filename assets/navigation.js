(() => {
  function initialize() {
    const navigation = document.querySelector(".switcher");
    const mobile = window.matchMedia("(max-width: 767px)");
    const orient = () => navigation?.setAttribute("aria-orientation", mobile.matches ? "horizontal" : "vertical");
    orient();
    navigation?.addEventListener("keydown", event => {
      if (!(event.altKey || event.ctrlKey || event.metaKey)
        || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)
        || !(event.target instanceof Element) || !event.target.closest('[role="tab"]')) return;
      // Preserve browser shortcuts before the tab handler can cancel their default action.
      event.stopPropagation();
    }, true);
    mobile.addEventListener("change", orient);
    window.addEventListener("resize", orient);
    window.addEventListener("orientationchange", orient);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
  else initialize();
})();
