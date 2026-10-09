(() => {
  function initialize() {
    const navigation = document.querySelector(".switcher");
    const mobile = window.matchMedia("(max-width: 700px)");
    const orient = () => navigation?.setAttribute("aria-orientation", mobile.matches ? "horizontal" : "vertical");
    orient();
    mobile.addEventListener("change", orient);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
  else initialize();
})();
