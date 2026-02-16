import Toastify from "../../node_modules/toastify-js/src/toastify-es.js";

/**
 * Mount inquiry form interactions (validation, submit, status/toast updates).
 *
 * @param {{
 *   button?: HTMLElement | null;
 *   dialog?: HTMLDialogElement | null;
 *   form?: HTMLFormElement | null;
 *   nameInput?: HTMLInputElement | null;
 *   emailInput?: HTMLInputElement | null;
 *   subjectInput?: HTMLInputElement | null;
 *   messageInput?: HTMLTextAreaElement | null;
 *   messageCountEl?: HTMLElement | null;
 *   websiteInput?: HTMLInputElement | null;
 *   sendButton?: HTMLButtonElement | null;
 *   statusEl?: HTMLElement | null;
 *   endpoint?: string;
 * }} opts
 * @returns {{ updateMessageCount: () => void }}
 */
export function mountInquiry(opts = {}) {
  const {
    button,
    dialog,
    form,
    nameInput,
    emailInput,
    subjectInput,
    messageInput,
    messageCountEl,
    websiteInput,
    sendButton,
    statusEl,
    endpoint = "/api/inquiry",
  } = opts;

  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const xssRe = /<[^>]*>|javascript:|on\w+\s*=|data:text\/html/i;
  const messageMax = Number(messageInput?.maxLength || 2000);
  let openedAt = 0;

  /**
   * @param {string} message
   */
  function setStatus(message) {
    if (statusEl) statusEl.textContent = message;
  }

  /**
   * @param {unknown} value
   * @param {number} maxLen
   */
  function sanitizeSingleLine(value, maxLen) {
    return String(value || "")
      .replace(/[\u0000-\u001F\u007F]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, maxLen);
  }

  /**
   * @param {unknown} value
   * @param {number} maxLen
   */
  function sanitizeMultiLine(value, maxLen) {
    return String(value || "")
      .replace(/\r/g, "")
      .replace(/\u0000/g, "")
      .trim()
      .slice(0, maxLen);
  }

  /**
   * @param {unknown} value
   */
  function hasSuspiciousMarkup(value) {
    return xssRe.test(String(value || ""));
  }

  /**
   * @param {HTMLElement | null | undefined} el
   */
  function focusField(el) {
    if (!el) return;
    try {
      el.focus({ preventScroll: true });
    } catch {
      el.focus();
    }
  }

  /**
   * @param {string} message
   * @param {"success" | "error"} [type]
   * @param {number} [durationMs]
   */
  function showToast(message, type = "success", durationMs = 2200) {
    const makeToast = typeof Toastify === "function" ? Toastify : null;
    if (!makeToast) {
      setStatus(message);
      return;
    }
    const isError = type === "error";
    makeToast({
      text: message,
      duration: durationMs,
      gravity: "bottom",
      position: "right",
      stopOnFocus: true,
      close: false,
      className: `dg-toast ${isError ? "dg-toast--error" : "dg-toast--success"}`,
      offset: { x: 18, y: 18 },
    }).showToast();
  }

  function updateMessageCount() {
    if (!messageCountEl) return;
    const length = String(messageInput?.value || "").length;
    messageCountEl.textContent = String(Math.min(messageMax, length));
  }

  function validateInputs() {
    const name = sanitizeSingleLine(nameInput?.value, 40);
    const email = sanitizeSingleLine(emailInput?.value, 120).toLowerCase();
    const subject = sanitizeSingleLine(subjectInput?.value, 80);
    const message = sanitizeMultiLine(messageInput?.value, messageMax);
    const website = sanitizeSingleLine(websiteInput?.value, 200);

    if (!name) {
      setStatus("이름을 입력해 주세요.");
      focusField(nameInput);
      return null;
    }
    if (!email) {
      setStatus("이메일을 입력해 주세요.");
      focusField(emailInput);
      return null;
    }
    if (!emailRe.test(email)) {
      setStatus("이메일 형식이 올바르지 않습니다.");
      focusField(emailInput);
      return null;
    }
    if (!subject) {
      setStatus("제목을 입력해 주세요.");
      focusField(subjectInput);
      return null;
    }
    if (!message) {
      setStatus("내용을 입력해 주세요.");
      focusField(messageInput);
      return null;
    }
    if ([name, email, subject, message].some((v) => hasSuspiciousMarkup(v))) {
      setStatus("허용되지 않는 입력 형식이 포함되어 있습니다.");
      const firstBad = [nameInput, emailInput, subjectInput, messageInput].find((el) => hasSuspiciousMarkup(el?.value));
      focusField(firstBad);
      return null;
    }

    return { name, email, subject, message, website };
  }

  function openDialog() {
    if (!dialog) return;
    openedAt = Date.now();
    setStatus("");
    if (websiteInput) websiteInput.value = "";
    updateMessageCount();
    try {
      dialog.showModal();
    } catch {
      return;
    }
    focusField(nameInput);
  }

  if (button) {
    button.addEventListener("click", openDialog);
  }
  if (messageInput) {
    messageInput.addEventListener("input", () => {
      updateMessageCount();
    });
  }
  if (form) {
    form.addEventListener("submit", async (e) => {
      const submitter = e.submitter;
      const isCloseSubmit =
        submitter &&
        submitter.tagName === "BUTTON" &&
        (submitter.value === "close" || submitter.classList?.contains("twModal__close"));
      if (isCloseSubmit) {
        setStatus("");
        return;
      }

      e.preventDefault();
      const valid = validateInputs();
      if (!valid) return;

      const { name, email, subject, message, website } = valid;
      if (sendButton) sendButton.disabled = true;
      setStatus("전송 중...");

      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            email,
            subject,
            message,
            website,
            openedAt: openedAt || Date.now(),
          }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload?.ok) {
          const failMessage = payload?.message || "문의 전송에 실패했습니다.";
          setStatus(failMessage);
          showToast(failMessage, "error", 2600);
          return;
        }

        setStatus("");
        showToast("메일 전송 완료");
        form.reset();
        openedAt = 0;
        updateMessageCount();
        setTimeout(() => dialog?.close(), 500);
      } catch {
        setStatus("네트워크 오류가 발생했습니다.");
        showToast("네트워크 오류", "error", 2600);
      } finally {
        if (sendButton) sendButton.disabled = false;
      }
    });
  }

  return { updateMessageCount };
}
