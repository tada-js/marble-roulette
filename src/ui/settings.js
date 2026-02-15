import { saveBallsCatalog, restoreDefaultBalls } from "./storage.js";

export function mountSettingsDialog(dialogEl, listEl, restoreBtn, getBalls, setBalls) {
  function render() {
    const balls = getBalls();
    // Avoid innerHTML to reduce the chance of accidental XSS patterns.
    listEl.replaceChildren();
    for (const b of balls) {
      const row = document.createElement("div");
      row.className = "settings-row";

      const thumb = document.createElement("div");
      thumb.className = "settings-row__thumb";
      const img = document.createElement("img");
      img.alt = b.name;
      img.src = b.imageDataUrl;
      thumb.appendChild(img);

      const nameField = document.createElement("div");
      nameField.className = "field";
      const nameLabel = document.createElement("label");
      nameLabel.textContent = "Name";
      const nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.value = b.name;
      nameInput.addEventListener("input", () => {
        b.name = nameInput.value.slice(0, 40) || b.name;
        saveBallsCatalog(balls);
        setBalls(balls);
      });
      nameField.appendChild(nameLabel);
      nameField.appendChild(nameInput);

      const fileField = document.createElement("div");
      fileField.className = "field";
      const fileLabel = document.createElement("label");
      fileLabel.textContent = "Image";
      const fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = "image/*";
      fileInput.addEventListener("change", async () => {
        const f = fileInput.files?.[0];
        if (!f) return;
        const dataUrl = await fileToDataUrl(f);
        b.imageDataUrl = dataUrl;
        img.src = dataUrl;
        saveBallsCatalog(balls);
        setBalls(balls);
      });
      fileField.appendChild(fileLabel);
      fileField.appendChild(fileInput);

      const idBox = document.createElement("div");
      idBox.className = "field";
      const idLabel = document.createElement("label");
      idLabel.textContent = "Id (fixed)";
      const idInput = document.createElement("input");
      idInput.type = "text";
      idInput.value = b.id;
      idInput.disabled = true;
      idBox.appendChild(idLabel);
      idBox.appendChild(idInput);

      row.appendChild(thumb);
      row.appendChild(nameField);
      row.appendChild(fileField);
      row.appendChild(idBox);
      listEl.appendChild(row);
    }
  }

  restoreBtn.addEventListener("click", () => {
    const balls = restoreDefaultBalls();
    saveBallsCatalog(balls);
    setBalls(balls);
    render();
  });

  dialogEl.addEventListener("close", () => {
    // Ensure persisted.
    saveBallsCatalog(getBalls());
  });

  return { render, open: () => (render(), dialogEl.showModal()) };
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error("file read failed"));
    fr.onload = () => resolve(String(fr.result));
    fr.readAsDataURL(file);
  });
}
