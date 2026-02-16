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
import { Button } from "./components/button";
import { GameCanvasStage } from "./components/game-canvas-stage";
import { LeftPanel } from "./components/left-panel";
import { ModalCard } from "./components/modal";
import { ResultModal } from "./components/modals/result-modal";
import { TopBar } from "./components/top-bar";

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
  const ui = useUiSnapshot();
  const [bgmMenuOpen, setBgmMenuOpen] = useState(false);
  const [fileNames, setFileNames] = useState<Record<string, string>>(() => ({}));
  const [countdownValue, setCountdownValue] = useState<number | null>(null);

  const settingsDialogRef = useRef<HTMLDialogElement | null>(null);
  const settingsConfirmDialogRef = useRef<HTMLDialogElement | null>(null);
  const inquiryDialogRef = useRef<HTMLDialogElement | null>(null);
  const resultDialogRef = useRef<HTMLDialogElement | null>(null);
  const bgmControlRef = useRef<HTMLDivElement | null>(null);
  const countdownTimersRef = useRef<number[]>([]);

  const inquiryNameRef = useRef<HTMLInputElement | null>(null);
  const inquiryEmailRef = useRef<HTMLInputElement | null>(null);
  const inquirySubjectRef = useRef<HTMLInputElement | null>(null);
  const inquiryMessageRef = useRef<HTMLTextAreaElement | null>(null);

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
      const el = inquiryNameRef.current;
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

  function focusInquiryField(field: RequiredInquiryField) {
    const map = {
      name: inquiryNameRef.current,
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
  const catalogLocked = !!ui.balls.find((ball) => ball.locked);
  const canAddCatalogBall = ui.balls.length < CATALOG_MAX && !catalogLocked;
  const canRemoveCatalogBall = ui.balls.length > 1 && !catalogLocked;
  const canApplySettings = !!ui.settingsDirty && !catalogLocked;
  const settingsCloseLabel = ui.settingsDirty ? "취소" : "닫기";
  const isDev = import.meta.env.DEV;

  return (
    <>
      <div id="app">
        <TopBar
          startDisabled={ui.startDisabled || countdownValue != null}
          startLabel={countdownValue != null ? "준비 중..." : ui.startLabel}
          statusLabel={ui.statusLabel}
          statusTone={ui.statusTone}
          bgmOn={ui.bgmOn}
          bgmTrack={ui.bgmTrack}
          bgmMenuOpen={bgmMenuOpen}
          bgmControlRef={bgmControlRef}
          onStart={handleTopBarStart}
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
            resultDisabled={ui.resultDisabled}
            winnerCount={ui.winnerCount}
            winnerCountMax={ui.winnerCountMax}
            winnerCountWasClamped={ui.winnerCountWasClamped}
            balls={ui.balls}
            onOpenSettings={() => runAction("openSettings")}
            onOpenResult={() => runAction("openResultModal")}
            onToggleViewLock={(isOn) => runAction("toggleViewLock", isOn)}
            onSetWinnerCount={(nextValue) => runAction("setWinnerCount", nextValue)}
            onAdjustBallCount={(ballId, delta) => runAction("adjustBallCount", ballId, delta)}
            onSetBallCount={(ballId, nextValue) => runAction("setBallCount", ballId, nextValue)}
          />
          <GameCanvasStage
            isDev={isDev}
            countdownValue={countdownValue}
            onSkipCountdown={skipCountdown}
            lastFewRemaining={ui.lastFewRemaining}
          />
        </main>
      </div>

      <dialog
        id="settings-dialog"
        className="dialog dialog--settings"
        ref={settingsDialogRef}
        onCancel={(event) => {
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
                공 설정
                {ui.settingsDirty ? <span className="settingsTitle__badge">변경됨</span> : null}
              </span>
            }
            description="공을 추가/삭제하고, 이름과 이미지를 바꿀 수 있어요."
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
                    공 추가
                  </Button>
                  <Button
                    id="restore-defaults"
                    variant="ghost"
                    type="button"
                    disabled={catalogLocked}
                    onClick={() => runAction("restoreDefaultCatalog")}
                  >
                    기본값 복원
                  </Button>
                </div>
                <div className="settingsFooter__right">
                  <Button
                    id="apply-settings"
                    variant="primary"
                    type="button"
                    disabled={!canApplySettings}
                    onClick={() => runAction("applySettings")}
                  >
                    적용
                  </Button>
                  <Button id="close-settings" variant="ghost" type="button" onClick={() => runAction("closeSettings")}>
                    {settingsCloseLabel}
                  </Button>
                </div>
              </div>
            }
          >
            <div className="twList" id="settings-list">
              {ui.balls.map((ball) => {
                const fileInputId = `ball-file-${ball.id}`;
                return (
                  <div className="twItem" key={ball.id}>
                    <div className="twItem__head">
                      <div className="twItem__thumb">
                        <img alt={ball.name} src={ball.imageDataUrl} />
                      </div>
                      <div className="twItem__headMeta">
                        <div className="twItem__headLabel">공 ID</div>
                        <div className="twItem__idBadge">{ball.id}</div>
                      </div>
                    </div>
                    <div className="twItem__grid">
                      <div className="field twItem__field">
                        <label htmlFor={`ball-name-${ball.id}`}>이름</label>
                        <input
                          id={`ball-name-${ball.id}`}
                          type="text"
                          value={ball.name}
                          maxLength={40}
                          disabled={catalogLocked}
                          onChange={(event) => runAction("setCatalogBallName", ball.id, event.currentTarget.value)}
                        />
                      </div>
                      <div className="field twItem__field">
                        <label htmlFor={fileInputId}>이미지</label>
                        <div className="fileRow">
                          <label className="btn btn--ghost btn--md fileRow__btn" htmlFor={fileInputId}>
                            파일 선택
                          </label>
                          <div className="fileRow__name">{fileNames[ball.id] || "선택 안 함"}</div>
                          <input
                            id={fileInputId}
                            className="fileRow__input"
                            type="file"
                            accept="image/*"
                            disabled={catalogLocked}
                            onChange={async (event) => {
                              const file = event.currentTarget.files?.[0];
                              setFileNames((prev) => ({
                                ...prev,
                                [ball.id]: file?.name ? file.name.slice(0, 32) : "선택 안 함",
                              }));
                              if (!file) return;
                              await runAction("setCatalogBallImage", ball.id, file);
                              event.currentTarget.value = "";
                            }}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="twItem__actions">
                      <Button
                        variant="danger"
                        className="twItem__remove"
                        disabled={!canRemoveCatalogBall}
                        onClick={() => runAction("removeCatalogBall", ball.id)}
                      >
                        삭제
                      </Button>
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
            title="설정을 취소하시겠습니까?"
            onClose={() => runAction("cancelDiscardSettings")}
            footer={
              <div className="settingsConfirm__actions">
                <Button width="md" variant="ghost" type="button" onClick={() => runAction("cancelDiscardSettings")}>
                  아니오
                </Button>
                <Button width="md" variant="danger" type="button" onClick={() => runAction("confirmDiscardSettings")}>
                  예
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
      >
        <form className="twModal" id="inquiry-form" onSubmit={handleInquirySubmit}>
          <ModalCard
            size="md"
            title="문의하기"
            description="문의 내용을 안전하게 전송합니다."
            onClose={() => runAction("closeInquiry")}
            footer={
              <Button id="inquiry-send" variant="primary" type="submit" disabled={ui.inquirySubmitting}>
                {ui.inquirySubmitting ? "전송 중..." : "메일 보내기"}
              </Button>
            }
          >
            <div className="inquiryForm">
              <div className="field">
                <label htmlFor="inq-name">이름</label>
                <input
                  id="inq-name"
                  name="name"
                  type="text"
                  maxLength={40}
                  required
                  autoComplete="name"
                  placeholder="홍길동"
                  value={ui.inquiryForm.name}
                  ref={inquiryNameRef}
                  onChange={(event) => runAction("setInquiryField", "name", event.currentTarget.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="inq-email">이메일</label>
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
                <label htmlFor="inq-subject">제목</label>
                <input
                  id="inq-subject"
                  name="subject"
                  type="text"
                  maxLength={80}
                  required
                  placeholder="문의 제목"
                  value={ui.inquiryForm.subject}
                  ref={inquirySubjectRef}
                  onChange={(event) => runAction("setInquiryField", "subject", event.currentTarget.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="inq-message">내용</label>
                <textarea
                  id="inq-message"
                  name="message"
                  rows={6}
                  maxLength={2000}
                  required
                  placeholder="문의 내용을 작성해 주세요."
                  value={ui.inquiryForm.message}
                  ref={inquiryMessageRef}
                  onChange={(event) => runAction("setInquiryField", "message", event.currentTarget.value)}
                ></textarea>
                <div className="inquiryCounter">
                  <span id="inq-message-count">{inquiryMessageLength}</span>/2000
                </div>
              </div>
              <div className="inquiryHoneypot" aria-hidden="true">
                <label htmlFor="inq-website">웹사이트</label>
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
            onClose={() => runAction("closeResultModal")}
            onSkip={() => runAction("skipResultReveal")}
            onCopy={() => runAction("copyResults")}
            onRestart={handleResultRestart}
          />
        </form>
      </dialog>
    </>
  );
}
