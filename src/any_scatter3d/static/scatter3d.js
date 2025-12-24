function a(t) {
  t.innerHTML = "", t.style.fontFamily = "system-ui, sans-serif", t.style.padding = "12px", t.style.border = "1px solid #ddd", t.style.borderRadius = "8px", t.style.display = "flex", t.style.gap = "12px", t.style.alignItems = "center";
  const e = document.createElement("div"), n = document.createElement("button");
  return n.textContent = "Increment count", t.appendChild(n), t.appendChild(e), { btn: n, label: e };
}
function i(t, e) {
  const n = t.get("message"), o = t.get("count"), c = typeof n == "string" ? n : "(message not string)", s = typeof o == "number" ? o : NaN;
  e.textContent = `${c} | count = ${Number.isFinite(s) ? s : "(not a number)"}`;
}
function u({ model: t, el: e }) {
  const { btn: n, label: o } = a(e), c = () => i(t, o);
  n.addEventListener("click", () => {
    const s = t.get("count"), r = typeof s == "number" ? s : 0;
    t.set("count", r + 1), t.save_changes();
  }), c(), t.on("change", c);
}
const d = { render: u };
export {
  d as default,
  u as render
};
//# sourceMappingURL=scatter3d.js.map
