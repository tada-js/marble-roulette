export function createButton({
  text = "",
  type = "button",
  className = "btn btn--ghost",
  onClick = null,
  disabled = false
} = {}) {
  const btn = document.createElement("button");
  btn.type = type;
  btn.className = className;
  btn.textContent = text;
  btn.disabled = !!disabled;
  if (typeof onClick === "function") btn.addEventListener("click", onClick);
  return btn;
}
