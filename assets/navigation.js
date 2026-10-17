(() => {
  function initialize() {
    const navigation = document.querySelector(".switcher");
    if (navigation && navigation.getAttribute("aria-orientation") !== "horizontal") {
      navigation.setAttribute("aria-orientation", "horizontal");
    }
    navigation?.addEventListener("keydown", event => {
      if (!(event.altKey || event.ctrlKey || event.metaKey)
        || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)
        || !(event.target instanceof Element) || !event.target.closest('[role="tab"]')) return;
      // Preserve browser shortcuts before the tab handler can cancel their default action.
      event.stopPropagation();
    }, true);
    const back = document.querySelector("#back-to-list");
    if (back) {
      const syncBackLabel = () => {
        if (back.textContent !== "Back") back.textContent = "Back";
      };
      const labels = new MutationObserver(syncBackLabel);
      labels.observe(back, { childList: true });
      syncBackLabel();
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
  else initialize();
})();
