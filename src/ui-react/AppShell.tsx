import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type RefObject,
} from "react";
import {
  getUiActions,
  getUiSnapshot,
  subscribeUi,
  type InquirySubmitResult,
  type RequiredInquiryField,
  type UiActions,
} from "../app/ui-store";
import { useI18n } from "../i18n/react";
import { UPLOAD_IMAGE_ACCEPT } from "../app/image-upload-policy";
import { Button, IconButton } from "./components/Button";
import { GameCanvasStage } from "./components/GameCanvasStage";
import { LeftPanel } from "./components/LeftPanel";
import { ModalCard } from "./components/Modal";
import { ResultModal } from "./components/modals/ResultModal";
import { TopBar } from "./components/TopBar";

const CATALOG_MAX = 15;

function useUiSnapshot() {
  return useSyncExternalStore(subscribeUi, getUiSnapshot, getUiSnapshot);
}

function useDialogSync(ref: RefObject<HTMLDialogElement | null>, isOpen: boolean, onClose: () => void) {
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) {
      try {
        dialog.showModal();
      } catch {
        // ignore
      }
      return;
    }
    if (!isOpen && dialog.open) {
      try {
        dialog.close();
      } catch {
        // ignore
      }
    }
  }, [ref, isOpen]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const onDialogClose = () => onClose();
    dialog.addEventListener("close", onDialogClose);
    return () => dialog.removeEventListener("close", onDialogClose);
  }, [ref, onClose]);
}

/**
 * React UI shell for the game.
 * Engine/render logic stays in existing vanilla modules.
 */
export function AppShell() {
  const { t } = useI18n();
  const ui = useUiSnapshot();
  const [bgmMenuOpen, setBgmMenuOpen] = useState(false);
  const [fileNames, setFileNames] = useState<Record<string, string>>(() => ({}));
  const [countdownValue, setCountdownValue] = useState<number | null>(null);

  const settingsDialogRef = useRef<HTMLDialogElement | null>(null);
  const settingsConfirmDialogRef = useRef<HTMLDialogElement | null>(null);
  const inquiryDialogRef = useRef<HTMLDialogElement | null>(null);
  const resultDialogRef = useRef<HTMLDialogElement | null>(null);
  const settingsListRef = useRef<HTMLDivElement | null>(null);
  const bgmControlRef = useRef<HTMLDivElement | null>(null);
  const countdownTimersRef = useRef<number[]>([]);
  const filePickerActiveRef = useRef(false);
  const previousSettingsOpenRef = useRef<boolean>(!!ui.settingsOpen);
  const previousSettingsBallCountRef = useRef<number>(ui.balls.length);

  const inquiryEmailRef = useRef<HTMLInputElement | null>(null);
  const inquirySubjectRef = useRef<HTMLInputElement | null>(null);
  const inquiryMessageRef = useRef<HTMLTextAreaElement | null>(null);
  const catalogLocked = !!ui.balls.find((ball) => ball.locked);

  function runAction<K extends keyof UiActions>(
    key: K,
    ...args: Parameters<UiActions[K]>
  ): ReturnType<UiActions[K]> | undefined {
    const actions = getUiActions() as UiActions;
    const fn = actions[key] as unknown as ((...params: unknown[]) => ReturnType<UiActions[K]>) | undefined;
    if (typeof fn === "function") return fn(...(args as unknown[]));
    return undefined;
  }

  useDialogSync(settingsDialogRef, !!ui.settingsOpen, () => runAction("closeSettings"));
  useDialogSync(settingsConfirmDialogRef, !!ui.settingsConfirmOpen, () => {});
  useDialogSync(inquiryDialogRef, !!ui.inquiryOpen, () => runAction("closeInquiry"));
  useDialogSync(resultDialogRef, !!ui.resultState.open, () => runAction("closeResultModal"));

  function clearCountdownTimers() {
    for (const timerId of countdownTimersRef.current) window.clearTimeout(timerId);
    countdownTimersRef.current = [];
  }

  function triggerStartNow() {
    clearCountdownTimers();
    setCountdownValue(null);
    runAction("handleStartClick");
  }

  function startGameCountdown() {
    if (countdownValue != null) return;
    clearCountdownTimers();
    setCountdownValue(3);
    countdownTimersRef.current.push(
      window.setTimeout(() => setCountdownValue(2), 900),
      window.setTimeout(() => setCountdownValue(1), 1800),
      window.setTimeout(() => triggerStartNow(), 2700)
    );
  }

  function handleTopBarStart() {
    if (ui.statusTone === "running" || ui.statusTone === "paused") {
      runAction("prepareRestartForCountdown");
    }
    startGameCountdown();
  }

  function handleResultRestart() {
    runAction("closeResultModal");
    startGameCountdown();
  }

  function skipCountdown() {
    if (countdownValue == null) return;
    triggerStartNow();
  }

  useEffect(() => {
    if (!bgmMenuOpen) return;

    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (bgmControlRef.current?.contains(target)) return;
      setBgmMenuOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setBgmMenuOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [bgmMenuOpen]);

  useEffect(() => {
    if (!ui.inquiryOpen) return;
    const t = setTimeout(() => {
      const el = inquiryEmailRef.current;
      if (!el) return;
      try {
        el.focus({ preventScroll: true });
      } catch {
        el.focus();
      }
    }, 10);
    return () => clearTimeout(t);
  }, [ui.inquiryOpen]);

  useEffect(() => () => clearCountdownTimers(), []);

  useEffect(() => {
    const isOpen = !!ui.settingsOpen;
    const wasOpen = previousSettingsOpenRef.current;
    const previousCount = previousSettingsBallCountRef.current;
    const currentCount = ui.balls.length;

    if (isOpen && wasOpen && currentCount > previousCount) {
      const list = settingsListRef.current;
      if (list) {
        window.requestAnimationFrame(() => {
          try {
            list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
          } catch {
            list.scrollTop = list.scrollHeight;
          }
        });
      }
    }

    previousSettingsOpenRef.current = isOpen;
    previousSettingsBallCountRef.current = currentCount;
  }, [ui.settingsOpen, ui.balls.length]);

  function focusInquiryField(field: RequiredInquiryField) {
    const map = {
      email: inquiryEmailRef.current,
      subject: inquirySubjectRef.current,
      message: inquiryMessageRef.current,
    };
    const el = map[field];
    if (!el) return;
    try {
      el.focus({ preventScroll: true });
    } catch {
      el.focus();
    }
  }

  async function handleInquirySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = (await runAction("submitInquiry")) as InquirySubmitResult | undefined;
    if (!result || result.ok) return;
    if (result.field) focusInquiryField(result.field);
  }

  const inquiryMessageLength = Math.min(2000, String(ui.inquiryForm?.message || "").length);
  const canAddCatalogBall = ui.balls.length < CATALOG_MAX && !catalogLocked;
  const canRemoveCatalogBall = ui.balls.length > 1 && !catalogLocked;
  const canApplySettings = !!ui.settingsDirty && !catalogLocked;
  const settingsCloseLabel = ui.settingsDirty ? t("common.cancel") : t("common.close");
  const totalParticipants = ui.balls.reduce((sum, ball) => sum + Math.max(0, Math.floor(Number(ball.count) || 0)), 0);
  const statusMetaText =
    ui.statusTone === "ready"
      ? `${totalParticipants}/${totalParticipants}`
      : ui.statusTone === "running" && ui.statusRemainingCount != null
        ? `${Math.max(0, ui.statusRemainingCount)}/${totalParticipants}`
        : null;
  const stopRunVisible = ui.statusTone === "running" || ui.statusTone === "paused";
  const stopRunDisabled = false;
  const viewLockTooltip = ui.viewLockDisabled
    ? t("app.viewLockDisabled")
    : t("app.viewLockEnabled");
  const resultRollCandidates = ui.balls
    .filter((ball) => ball.count > 0)
    .flatMap((ball) => {
      const repeat = Math.min(Math.max(1, ball.count), 6);
      return Array.from({ length: repeat }, () => ({
        ballId: ball.id,
        name: ball.name,
        img: ball.imageDataUrl,
      }));
    })
    .slice(0, 48);
  const isDev = import.meta.env.DEV;

  return (
    <>
      <div id="app">
        <TopBar
          startDisabled={ui.startDisabled || countdownValue != null}
          startLabel={countdownValue != null ? t("game.startPreparing") : ui.startLabel}
          stopRunVisible={stopRunVisible}
          stopRunDisabled={stopRunDisabled}
          speedMultiplier={ui.speedMultiplier}
          bgmOn={ui.bgmOn}
          bgmTrack={ui.bgmTrack}
          bgmMenuOpen={bgmMenuOpen}
          bgmControlRef={bgmControlRef}
          onStart={handleTopBarStart}
          onStopRun={() => runAction("stopRunNow")}
          onToggleSpeed={() => runAction("toggleSpeedMode")}
          onToggleBgm={() => runAction("toggleBgm")}
          onToggleBgmMenu={() => setBgmMenuOpen((prev) => !prev)}
          onSelectBgmTrack={(track) => {
            runAction("setBgmTrack", track);
            setBgmMenuOpen(false);
          }}
          onInquiry={() => runAction("openInquiry")}
        />

        <main className="stage">
          <LeftPanel
            viewLockChecked={ui.viewLockChecked}
            viewLockDisabled={ui.viewLockDisabled}
            viewLockTooltip={viewLockTooltip}
            resultDisabled={ui.resultDisabled}
            winnerCount={ui.winnerCount}
            winnerCountMax={ui.winnerCountMax}
            winnerCountWasClamped={ui.winnerCountWasClamped}
            startCaption={ui.startCaption}
            balls={ui.balls}
            onOpenSettings={() => runAction("openSettings")}
            onOpenResult={() => runAction("openResultModal")}
            onToggleViewLock={(isOn) => runAction("toggleViewLock", isOn)}
            onSetWinnerCount={(nextValue) => runAction("setWinnerCount", nextValue)}
            onSetStartCaption={(value) => runAction("setStartCaption", value)}
            onAdjustBallCount={(ballId, delta) => runAction("adjustBallCount", ballId, delta)}
            onSetBallCount={(ballId, nextValue) => runAction("setBallCount", ballId, nextValue)}
            onReorderBall={(sourceBallId, targetBallId) =>
              runAction("reorderCatalogBall", sourceBallId, targetBallId)
            }
          />
          <GameCanvasStage
            isDev={isDev}
            countdownValue={countdownValue}
            statusLabel={ui.statusLabel}
            statusTone={ui.statusTone}
            statusMetaText={statusMetaText}
            onSkipCountdown={skipCountdown}
          />
        </main>
      </div>

      <dialog
        id="settings-dialog"
        className="dialog dialog--settings"
        ref={settingsDialogRef}
        onCancel={(event) => {
          if (filePickerActiveRef.current) {
            event.preventDefault();
            return;
          }
          if (event.target !== event.currentTarget) return;
          event.preventDefault();
          runAction("closeSettings");
        }}
        onClick={(event) => {
          if (event.target !== event.currentTarget) return;
          runAction("closeSettings");
        }}
      >
        <form className="twModal" id="settings-form" onSubmit={(event) => event.preventDefault()}>
          <ModalCard
            className="settingsModal twModal__card--scrollable"
            size="lg"
            title={
              <span className="settingsTitle">
                {t("settings.title")}
                {ui.settingsDirty ? <span className="settingsTitle__badge">{t("settings.dirty")}</span> : null}
              </span>
            }
            description={t("settings.description")}
            onClose={() => runAction("closeSettings")}
            footer={
              <div className="settingsFooter">
                <div className="settingsFooter__left">
                  <Button
                    id="add-ball"
                    variant="ghost"
                    type="button"
                    disabled={!canAddCatalogBall}
                    onClick={() => runAction("addCatalogBall")}
                  >
                    {t("settings.addParticipant")}
                  </Button>
                  <Button
                    id="restore-defaults"
                    variant="ghost"
                    type="button"
                    disabled={catalogLocked}
                    onClick={() => runAction("restoreDefaultCatalog")}
                  >
                    {t("settings.reset")}
                  </Button>
                </div>
                <div className="settingsFooter__right">
                  <Button
                    id="apply-settings"
                    variant="primary"
                    width="lg"
                    type="button"
                    disabled={!canApplySettings}
                    onClick={() => runAction("applySettings")}
                  >
                    {t("common.apply")}
                  </Button>
                  <Button
                    id="close-settings"
                    variant="ghost"
                    width="lg"
                    type="button"
                    onClick={() => runAction("closeSettings")}
                  >
                    {settingsCloseLabel}
                  </Button>
                </div>
              </div>
            }
          >
            <div className="twList" id="settings-list" ref={settingsListRef}>
              {ui.balls.map((ball) => {
                const fileInputId = `ball-file-${ball.id}`;
                return (
                  <div className="twItem" key={ball.id}>
                    <IconButton
                      className="twItem__removeIcon"
                      ariaLabel={`${ball.name} ${t("settings.remove")}`}
                      title={t("settings.remove")}
                      disabled={!canRemoveCatalogBall}
                      onClick={() => runAction("removeCatalogBall", ball.id)}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M7 7L17 17" />
                        <path d="M17 7L7 17" />
                      </svg>
                    </IconButton>
                    <div className="twItem__topRow">
                      <div className="twItem__primaryRow">
                        <div className="twItem__thumb">
                          <img alt={ball.name} src={ball.imageDataUrl} />
                        </div>
                        <div className="field twItem__nameField">
                          <label htmlFor={`ball-name-${ball.id}`}>{t("settings.name")}</label>
                          <input
                            id={`ball-name-${ball.id}`}
                            type="text"
                            value={ball.name}
                            maxLength={40}
                            disabled={catalogLocked}
                            onChange={(event) => runAction("setCatalogBallName", ball.id, event.currentTarget.value)}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="twItem__secondaryId">{t("settings.id")}: {ball.id}</div>
                    <div className="field twItem__field">
                      <label htmlFor={fileInputId}>{t("settings.image")}</label>
                      <label className={`twUploadZone ${catalogLocked ? "is-disabled" : ""}`} htmlFor={fileInputId}>
                        <span className="twUploadZone__title">{t("settings.uploadTitle")}</span>
                        <span className="twUploadZone__hint">{t("settings.uploadHint")}</span>
                        <span className="twUploadZone__name">{fileNames[ball.id] || t("common.notSelected")}</span>
                      </label>
                      <input
                        id={fileInputId}
                        className="fileRow__input"
                        type="file"
                        accept={UPLOAD_IMAGE_ACCEPT}
                        disabled={catalogLocked}
                        onClick={() => {
                          filePickerActiveRef.current = true;
                          const clear = () => {
                            window.setTimeout(() => {
                              filePickerActiveRef.current = false;
                            }, 0);
                          };
                          window.addEventListener("focus", clear, { once: true });
                        }}
                        onChange={async (event) => {
                          filePickerActiveRef.current = false;
                          const file = event.currentTarget.files?.[0];
                          setFileNames((prev) => ({
                            ...prev,
                            [ball.id]: file?.name ? file.name.slice(0, 32) : t("common.notSelected"),
                          }));
                          if (!file) return;
                          await runAction("setCatalogBallImage", ball.id, file);
                          event.currentTarget.value = "";
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </ModalCard>
        </form>
      </dialog>

      <dialog
        id="settings-confirm-dialog"
        className="dialog dialog--settings"
        ref={settingsConfirmDialogRef}
        onCancel={(event) => {
          event.preventDefault();
          runAction("cancelDiscardSettings");
        }}
        onClick={(event) => {
          if (event.target !== event.currentTarget) return;
          runAction("cancelDiscardSettings");
        }}
      >
        <form className="twModal" id="settings-confirm-form" onSubmit={(event) => event.preventDefault()}>
          <ModalCard
            className="settingsConfirm"
            size="sm"
            title={t("settings.discardConfirm")}
            onClose={() => runAction("cancelDiscardSettings")}
            footer={
              <div className="settingsConfirm__actions">
                <Button width="md" variant="ghost" type="button" onClick={() => runAction("cancelDiscardSettings")}>
                  {t("common.no")}
                </Button>
                <Button width="md" variant="danger" type="button" onClick={() => runAction("confirmDiscardSettings")}>
                  {t("common.yes")}
                </Button>
              </div>
            }
          >
            {null}
          </ModalCard>
        </form>
      </dialog>

      <dialog
        id="inquiry-dialog"
        className="dialog dialog--settings"
        ref={inquiryDialogRef}
        onCancel={(event) => {
          event.preventDefault();
          runAction("closeInquiry");
        }}
        onClick={(event) => {
          if (event.target !== event.currentTarget) return;
          runAction("closeInquiry");
        }}
      >
        <form className="twModal" id="inquiry-form" onSubmit={handleInquirySubmit}>
          <ModalCard
            size="md"
            title={t("inquiry.title")}
            onClose={() => runAction("closeInquiry")}
            footer={
              <Button id="inquiry-send" variant="primary" type="submit" disabled={ui.inquirySubmitting}>
                {ui.inquirySubmitting ? t("inquiry.sending") : t("inquiry.send")}
              </Button>
            }
          >
            <div className="inquiryForm">
              <div className="field">
                <label htmlFor="inq-email">
                  <span className="field__required">*</span>
                  {t("inquiry.email")}
                </label>
                <input
                  id="inq-email"
                  name="email"
                  type="email"
                  maxLength={120}
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={ui.inquiryForm.email}
                  ref={inquiryEmailRef}
                  onChange={(event) => runAction("setInquiryField", "email", event.currentTarget.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="inq-subject">
                  <span className="field__required">*</span>
                  {t("inquiry.subject")}
                </label>
                <input
                  id="inq-subject"
                  name="subject"
                  type="text"
                  maxLength={80}
                  required
                  placeholder={t("inquiry.subjectPlaceholder")}
                  value={ui.inquiryForm.subject}
                  ref={inquirySubjectRef}
                  onChange={(event) => runAction("setInquiryField", "subject", event.currentTarget.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="inq-message">
                  <span className="field__required">*</span>
                  {t("inquiry.message")}
                </label>
                <textarea
                  id="inq-message"
                  name="message"
                  rows={6}
                  maxLength={2000}
                  required
                  placeholder={t("inquiry.messagePlaceholder")}
                  value={ui.inquiryForm.message}
                  ref={inquiryMessageRef}
                  onChange={(event) => runAction("setInquiryField", "message", event.currentTarget.value)}
                ></textarea>
                <div className="inquiryCounter">
                  <span id="inq-message-count">{inquiryMessageLength}</span>/2000
                </div>
              </div>
              <div className="field inquiryNotice">
                <div className="inquiryNotice__meta">
                  <span className="inquiryNotice__text">
                    {t("inquiry.notice")}
                  </span>
                  <a
                    className="inquiryNotice__link"
                    href="/privacy-policy.html"
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t("inquiry.privacy")}
                  </a>
                </div>
              </div>
              <div className="inquiryHoneypot" aria-hidden="true">
                <label htmlFor="inq-website">{t("inquiry.website")}</label>
                <input
                  id="inq-website"
                  name="website"
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={ui.inquiryForm.website}
                  onChange={(event) => runAction("setInquiryField", "website", event.currentTarget.value)}
                />
              </div>
              <div id="inquiry-status" className="inquiryStatus" aria-live="polite">
                {ui.inquiryStatus}
              </div>
            </div>
          </ModalCard>
        </form>
      </dialog>

      <dialog
        id="result-dialog"
        className="dialog dialog--winner"
        ref={resultDialogRef}
        onCancel={(event) => {
          event.preventDefault();
          runAction("closeResultModal");
        }}
        onClick={(event) => {
          if (event.target !== event.currentTarget) return;
          runAction("closeResultModal");
        }}
      >
        <form className="twModal" id="result-form" onSubmit={(event) => event.preventDefault()}>
          <ResultModal
            state={ui.resultState}
            rollCandidates={resultRollCandidates}
            onClose={() => runAction("closeResultModal")}
            onSkip={() => runAction("skipResultReveal")}
            onSpinDone={() => runAction("completeResultSpin")}
            onCopy={() => runAction("copyResults")}
            onRestart={handleResultRestart}
          />
        </form>
      </dialog>
    </>
  );
}
