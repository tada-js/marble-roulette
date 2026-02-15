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
      nameLabel.textContent = "이름";
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
      fileLabel.textContent = "이미지";
      const fileRow = document.createElement("div");
      fileRow.className = "fileRow";

      const fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = "image/*";
      fileInput.className = "fileRow__input";
      const fileBtn = document.createElement("button");
      fileBtn.type = "button";
      fileBtn.className = "btn btn--ghost fileRow__btn";
      fileBtn.textContent = "파일 선택";
      const fileName = document.createElement("div");
      fileName.className = "fileRow__name";
      fileName.textContent = "선택 안 함";
      fileBtn.addEventListener("click", () => fileInput.click());
      fileInput.addEventListener("change", async () => {
        const f = fileInput.files?.[0];
        fileName.textContent = f?.name ? f.name.slice(0, 32) : "선택 안 함";
        if (!f) return;
        const dataUrl = await fileToDataUrl(f);
        b.imageDataUrl = dataUrl;
        img.src = dataUrl;
        saveBallsCatalog(balls);
        setBalls(balls);
      });
      fileRow.appendChild(fileBtn);
      fileRow.appendChild(fileName);
      fileRow.appendChild(fileInput);
      fileField.appendChild(fileLabel);
      fileField.appendChild(fileRow);

      const idBox = document.createElement("div");
      idBox.className = "field";
      const idLabel = document.createElement("label");
      idLabel.textContent = "ID (고정)";
      const idInput = document.createElement("input");
      idInput.type = "text";
      idInput.value = b.id;
      idInput.disabled = true;
      idBox.appendChild(idLabel);
      idBox.appendChild(idInput);

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "btn btn--danger settings-row__remove";
      removeBtn.textContent = "삭제";
      removeBtn.disabled = balls.length <= 1;
      removeBtn.addEventListener("click", () => {
        if (balls.length <= 1) return;
        const next = balls.filter((x) => x.id !== b.id);
        saveBallsCatalog(next);
        setBalls(next);
        render();
      });
      idBox.appendChild(removeBtn);

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
    fr.onerror = () => reject(new Error("파일을 읽지 못했습니다"));
    fr.onload = () => resolve(String(fr.result));
    fr.readAsDataURL(file);
  });
}
