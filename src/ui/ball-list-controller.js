/**
 * Create controller for left-side ball list rendering and quantity edits.
 *
 * @param {{
 *   container: HTMLElement;
 *   state: { mode?: string; winner?: unknown; counts?: Record<string, number> };
 *   getCatalog: () => Array<{id: string; name: string; imageDataUrl: string}>;
 *   getBallCount: (state: unknown, id: string) => number;
 *   setBallCount: (state: unknown, id: string, next: number) => void;
 *   saveCounts: (counts: Record<string, number>) => void;
 *   onChange?: () => void;
 * }} opts
 */
export function createBallListController(opts) {
  const {
    container,
    state,
    getCatalog,
    getBallCount,
    setBallCount,
    saveCounts,
    onChange = () => {},
  } = opts;

  function isLocked() {
    return state.mode === "playing" && !state.winner;
  }

  function render() {
    container.replaceChildren();
    const catalog = getCatalog();

    for (const b of catalog) {
      const card = document.createElement("div");
      card.className = "ball-card";
      card.role = "group";

      const thumb = document.createElement("div");
      thumb.className = "ball-thumb";
      const img = document.createElement("img");
      img.alt = b.name;
      img.src = b.imageDataUrl;
      thumb.appendChild(img);

      const meta = document.createElement("div");
      meta.className = "ball-meta";
      const name = document.createElement("div");
      name.className = "ball-name tooltip";
      name.setAttribute("data-tip", b.name);
      name.setAttribute("aria-label", b.name);
      const nameText = document.createElement("span");
      nameText.className = "ball-name__text";
      nameText.textContent = b.name;
      name.appendChild(nameText);
      const id = document.createElement("div");
      id.className = "ball-id";
      id.textContent = b.id;
      meta.appendChild(name);
      meta.appendChild(id);

      const qty = document.createElement("div");
      qty.className = "ball-qty";

      const minus = document.createElement("button");
      minus.className = "btn btn--ghost ball-qty__btn";
      minus.type = "button";
      minus.textContent = "-";

      const count = document.createElement("input");
      count.className = "ball-qty__count";
      count.type = "number";
      count.inputMode = "numeric";
      count.min = "0";
      count.max = "99";
      count.step = "1";
      count.value = String(getBallCount(state, b.id));
      count.setAttribute("aria-label", `${b.name} 개수`);

      const plus = document.createElement("button");
      plus.className = "btn btn--ghost ball-qty__btn";
      plus.type = "button";
      plus.textContent = "+";

      /**
       * @param {number} next
       */
      function applyCount(next) {
        setBallCount(state, b.id, next);
        saveCounts(state.counts || {});
        count.value = String(getBallCount(state, b.id));
        onChange();
      }

      minus.addEventListener("click", () => {
        if (isLocked()) return;
        applyCount(getBallCount(state, b.id) - 1);
      });
      plus.addEventListener("click", () => {
        if (isLocked()) return;
        applyCount(getBallCount(state, b.id) + 1);
      });
      count.addEventListener("input", () => {
        if (isLocked()) return;
        applyCount(Number(count.value));
      });

      const disabled = isLocked();
      minus.disabled = disabled;
      plus.disabled = disabled;
      count.disabled = disabled;

      qty.appendChild(minus);
      qty.appendChild(count);
      qty.appendChild(plus);

      card.appendChild(thumb);
      card.appendChild(meta);
      card.appendChild(qty);
      container.appendChild(card);
    }
  }

  return { render };
}
