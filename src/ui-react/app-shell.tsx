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
import { Button, IconButton } from "./components/button";
import { ModalCard } from "./components/modal";

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

  const settingsDialogRef = useRef<HTMLDialogElement | null>(null);
  const inquiryDialogRef = useRef<HTMLDialogElement | null>(null);
  const winnerDialogRef = useRef<HTMLDialogElement | null>(null);
  const bgmControlRef = useRef<HTMLDivElement | null>(null);

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
  useDialogSync(inquiryDialogRef, !!ui.inquiryOpen, () => runAction("closeInquiry"));
  useDialogSync(winnerDialogRef, !!ui.winnerOpen, () => runAction("closeWinner"));

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
  const winner = ui.winnerPayload || null;

  return (
    <>
      <div id="app">
        <header className="topbar">
          <div className="topbar__left brand">
            <div className="brand__title">데구르르 (Degururu)</div>
            <div className="brand__subtitle">공으로 즐기는 핀볼 사다리</div>
          </div>

          <div className="topbar__center">
            <Button
              id="start-btn"
              variant="primary"
              className="topbar__start"
              disabled={ui.startDisabled}
              onClick={() => runAction("handleStartClick")}
            >
              {ui.startLabel}
            </Button>
            <Button
              id="pause-btn"
              variant="ghost"
              className="topbar__pause"
              disabled={ui.pauseDisabled}
              ariaPressed={ui.pausePressed}
              onClick={() => runAction("togglePause")}
            >
              {ui.pauseLabel}
            </Button>
          </div>

          <div className="topbar__right">
            <div className="bgmControl" ref={bgmControlRef}>
              <Button
                id="bgm-btn"
                variant="ghost"
                size="md"
                className="bgmControl__toggle"
                ariaPressed={ui.bgmOn}
                onClick={() => runAction("toggleBgm")}
              >
                <span data-bgm-label>{ui.bgmOn ? "BGM 켬" : "BGM 끔"}</span>
              </Button>

              <IconButton
                id="bgm-settings-btn"
                className="bgmControl__gear"
                ariaLabel="BGM 트랙 선택"
                ariaHasPopup="menu"
                ariaExpanded={bgmMenuOpen}
                title="BGM 선택"
                onClick={() => setBgmMenuOpen((prev) => !prev)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M19.43 12.98a7.83 7.83 0 0 0 .06-.98 7.83 7.83 0 0 0-.06-.98l2.11-1.65a.5.5 0 0 0 .12-.64l-2-3.46a.5.5 0 0 0-.6-.22l-2.49 1a7.14 7.14 0 0 0-1.69-.98l-.38-2.65A.5.5 0 0 0 14 1h-4a.5.5 0 0 0-.49.42l-.38 2.65c-.6.23-1.16.56-1.68.98l-2.5-1a.5.5 0 0 0-.6.22l-2 3.46a.5.5 0 0 0 .12.64l2.11 1.65A7.83 7.83 0 0 0 4.51 12c0 .33.02.66.06.98l-2.11 1.65a.5.5 0 0 0-.12.64l2 3.46a.5.5 0 0 0 .6.22l2.5-1c.52.42 1.08.75 1.68.98l.38 2.65A.5.5 0 0 0 10 23h4a.5.5 0 0 0 .49-.42l.38-2.65c.6-.23 1.16-.56 1.69-.98l2.49 1a.5.5 0 0 0 .6-.22l2-3.46a.5.5 0 0 0-.12-.64zM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5z" />
                </svg>
              </IconButton>

              <div id="bgm-menu" className="bgmMenu" role="menu" hidden={!bgmMenuOpen}>
                <button
                  type="button"
                  className="bgmMenu__item"
                  data-bgm-track="bgm_1"
                  role="menuitemradio"
                  aria-checked={ui.bgmTrack === "bgm_1" ? "true" : "false"}
                  onClick={() => {
                    runAction("setBgmTrack", "bgm_1");
                    setBgmMenuOpen(false);
                  }}
                >
                  BGM 1
                </button>
                <button
                  type="button"
                  className="bgmMenu__item"
                  data-bgm-track="bgm_2"
                  role="menuitemradio"
                  aria-checked={ui.bgmTrack === "bgm_2" ? "true" : "false"}
                  onClick={() => {
                    runAction("setBgmTrack", "bgm_2");
                    setBgmMenuOpen(false);
                  }}
                >
                  BGM 2
                </button>
              </div>
            </div>

            <Button id="inquiry-btn" variant="ghost" onClick={() => runAction("openInquiry")}>
              문의
            </Button>
          </div>
        </header>

        <main className="stage">
          <div className="hud">
            <div className="mini">
              <div className="mini__row">
                <div className="mini__title" id="minimap-title">
                  미니맵
                </div>
                <label
                  className="switch"
                  title="켜면 후미 공을 따라갑니다. 끄면 자유 시점으로 미니맵으로 이동합니다."
                >
                  <span className="switch__label">시점 고정</span>
                  <input
                    id="view-lock"
                    className="switch__input"
                    type="checkbox"
                    role="switch"
                    checked={ui.viewLockChecked}
                    disabled={ui.viewLockDisabled}
                    onChange={(event) => runAction("toggleViewLock", event.currentTarget.checked)}
                  />
                  <span className="switch__track" aria-hidden="true">
                    <span className="switch__thumb"></span>
                  </span>
                </label>
              </div>
              <canvas id="minimap" width="260" height="190"></canvas>
              <div className="mini__hint" id="minimap-hint">
                미니맵을 클릭해 이동. 후미 추적으로 자동 추적을 재개합니다.
              </div>
            </div>

            <div className="hud__actions">
              <Button id="settings-btn" variant="ghost" onClick={() => runAction("openSettings")}>
                공 설정
              </Button>
              <Button
                id="winner-btn"
                variant="ghost"
                disabled={ui.winnerDisabled}
                onClick={() => runAction("openWinner")}
              >
                마지막 결과
              </Button>
            </div>

            <div className="balls" id="balls">
              {ui.balls.map((ball) => (
                <div key={ball.id} className="ball-card" role="group">
                  <div className="ball-thumb">
                    <img alt={ball.name} src={ball.imageDataUrl} />
                  </div>

                  <div className="ball-meta">
                    <div className="ball-name tooltip" data-tip={ball.name} aria-label={ball.name}>
                      <span className="ball-name__text">{ball.name}</span>
                    </div>
                    <div className="ball-id">{ball.id}</div>
                  </div>

                  <div className="ball-qty">
                    <Button
                      variant="ghost"
                      className="ball-qty__btn"
                      disabled={ball.locked}
                      onClick={() => runAction("adjustBallCount", ball.id, -1)}
                    >
                      -
                    </Button>
                    <input
                      className="ball-qty__count"
                      type="number"
                      inputMode="numeric"
                      min="0"
                      max="99"
                      step="1"
                      value={String(ball.count)}
                      aria-label={`${ball.name} 개수`}
                      disabled={ball.locked}
                      onChange={(event) => runAction("setBallCount", ball.id, Number(event.currentTarget.value))}
                    />
                    <Button
                      variant="ghost"
                      className="ball-qty__btn"
                      disabled={ball.locked}
                      onClick={() => runAction("adjustBallCount", ball.id, 1)}
                    >
                      +
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="board">
            <canvas id="game" width="900" height="1350"></canvas>
            <div className="board__coords">
              <div className="board__coordText" id="canvas-coord-readout">
                xFrac: -, yFrac: -
              </div>
              <Button id="canvas-coord-copy" variant="ghost" className="board__copy" disabled>
                좌표 복사
              </Button>
            </div>
          </div>
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
      >
        <form className="twModal" id="settings-form" onSubmit={(event) => event.preventDefault()}>
          <ModalCard
            title="공 설정"
            description="공을 추가/삭제하고, 이름과 이미지를 바꿀 수 있어요."
            onClose={() => runAction("closeSettings")}
            footer={
              <>
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
                <Button variant="primary" type="button" onClick={() => runAction("closeSettings")}>
                  닫기
                </Button>
              </>
            }
          >
            <div className="twList" id="settings-list">
              {ui.balls.map((ball) => {
                const fileInputId = `ball-file-${ball.id}`;
                return (
                  <div className="twItem" key={ball.id}>
                    <div className="twItem__thumb">
                      <img alt={ball.name} src={ball.imageDataUrl} />
                    </div>
                    <div className="twItem__main">
                      <div className="twItem__grid">
                        <div className="field">
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
                        <div className="field">
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
                        <div className="field">
                          <label>ID (고정)</label>
                          <input type="text" value={ball.id} disabled />
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
                  </div>
                );
              })}
            </div>
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
        id="winner-dialog"
        className="dialog dialog--winner"
        ref={winnerDialogRef}
        onCancel={(event) => {
          event.preventDefault();
          runAction("closeWinner");
        }}
      >
        <form className="twModal" id="winner-form" onSubmit={(event) => event.preventDefault()}>
          <ModalCard
            title="마지막 결과"
            description="마지막으로 도착한 공을 확인하세요."
            onClose={() => runAction("closeWinner")}
            footer={
              <Button variant="primary" type="button" onClick={() => runAction("closeWinner")}>
                확인
              </Button>
            }
          >
            <div className="twWinner">
              <div className="twWinner__thumb">
                <img id="winner-img" src={winner?.img || "data:,"} alt={winner?.name || ""} />
              </div>
              <div className="twWinner__copy">
                <div className="twWinner__k">마지막 도착</div>
                <div className="twWinner__v" id="winner-name">
                  {winner?.name || "-"}
                </div>
              </div>
            </div>
          </ModalCard>
        </form>
      </dialog>
    </>
  );
}
