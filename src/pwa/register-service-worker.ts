const UPDATE_TOAST_ID = "pwa-update-toast";
const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

type SwRegistrationWithWaiting = ServiceWorkerRegistration & {
  waiting: ServiceWorker | null;
};

function removeUpdateToast() {
  const toast = document.getElementById(UPDATE_TOAST_ID);
  if (!toast) return;
  toast.remove();
}

function requestSkipWaiting(registration: SwRegistrationWithWaiting) {
  if (!registration.waiting) return;
  registration.waiting.postMessage({ type: "SKIP_WAITING" });
}

function showUpdateToast(registration: SwRegistrationWithWaiting) {
  const existing = document.getElementById(UPDATE_TOAST_ID);
  if (existing) return;

  const toast = document.createElement("aside");
  toast.id = UPDATE_TOAST_ID;
  toast.className = "pwaUpdateToast";
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");

  const message = document.createElement("span");
  message.className = "pwaUpdateToast__text";
  message.textContent = "새 버전이 준비되었습니다.";

  const actions = document.createElement("div");
  actions.className = "pwaUpdateToast__actions";

  const applyButton = document.createElement("button");
  applyButton.type = "button";
  applyButton.className = "pwaUpdateToast__button";
  applyButton.textContent = "업데이트";
  applyButton.addEventListener("click", () => requestSkipWaiting(registration));

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "pwaUpdateToast__button pwaUpdateToast__button--ghost";
  closeButton.textContent = "닫기";
  closeButton.addEventListener("click", () => removeUpdateToast());

  actions.append(applyButton, closeButton);
  toast.append(message, actions);
  document.body.appendChild(toast);
}

function watchInstallingWorker(registration: SwRegistrationWithWaiting, worker: ServiceWorker | null) {
  if (!worker) return;
  worker.addEventListener("statechange", () => {
    const isReadyToUpdate =
      worker.state === "installed" &&
      !!navigator.serviceWorker.controller &&
      !!registration.waiting;
    if (!isReadyToUpdate) return;
    showUpdateToast(registration);
  });
}

export function registerServiceWorker() {
  if (import.meta.env.DEV) return;
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", async () => {
    let registration: SwRegistrationWithWaiting;
    try {
      registration = (await navigator.serviceWorker.register("/sw.js")) as SwRegistrationWithWaiting;
    } catch (error) {
      console.warn("[pwa] service worker registration failed", error);
      return;
    }

    let isRefreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (isRefreshing) return;
      isRefreshing = true;
      removeUpdateToast();
      window.location.reload();
    });

    if (registration.waiting) {
      showUpdateToast(registration);
    }
    watchInstallingWorker(registration, registration.installing);
    registration.addEventListener("updatefound", () => {
      watchInstallingWorker(registration, registration.installing);
    });

    window.setInterval(() => {
      registration.update().catch(() => undefined);
    }, UPDATE_CHECK_INTERVAL_MS);
  });
}
