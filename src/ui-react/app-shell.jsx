import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { getUiActions, getUiSnapshot, subscribeUi } from "../app/ui-store.js";
import { Button, IconButton } from "./components/button.jsx";

function useUiSnapshot() {
  return useSyncExternalStore(subscribeUi, getUiSnapshot, getUiSnapshot);
}

/**
 * React UI shell for the game.
 * Engine/render logic stays in existing vanilla modules.
 */
export function AppShell() {
  const ui = useUiSnapshot();
  const [bgmMenuOpen, setBgmMenuOpen] = useState(false);
  const bgmControlRef = useRef(null);

  useEffect(() => {
    if (!bgmMenuOpen) return;

    /**
     * @param {PointerEvent} event
     */
    function onPointerDown(event) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (bgmControlRef.current?.contains(target)) return;
      setBgmMenuOpen(false);
    }

    /**
     * @param {KeyboardEvent} event
     */
    function onKeyDown(event) {
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

  /**
   * @template {keyof ReturnType<typeof getUiActions>} K
   * @param {K} key
   * @param {...Parameters<ReturnType<typeof getUiActions>[K]>} args
   */
  function runAction(key, ...args) {
    const actions = getUiActions();
    const fn = actions[key];
    if (typeof fn === "function") fn(...args);
  }

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
              <button
                id="bgm-btn"
                className="bgmControl__toggle"
                type="button"
                aria-pressed={ui.bgmOn ? "true" : "false"}
                onClick={() => runAction("toggleBgm")}
              >
                <span data-bgm-label>{ui.bgmOn ? "BGM 켬" : "BGM 끔"}</span>
              </button>

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

            <Button id="inquiry-btn" variant="ghost">
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

      <dialog id="settings-dialog" className="dialog dialog--settings">
        <form method="dialog" className="twModal" id="settings-form">
          <div className="twModal__card">
            <div className="twModal__header">
              <div className="twModal__headText">
                <div className="twModal__title">공 설정</div>
                <div className="twModal__desc">공을 추가/삭제하고, 이름과 이미지를 바꿀 수 있어요.</div>
              </div>
              <button className="twModal__close" value="close" type="submit" formNoValidate aria-label="닫기">
                ×
              </button>
            </div>

            <div className="twModal__body">
              <div className="twList" id="settings-list"></div>
            </div>

            <div className="twModal__footer">
              <Button id="add-ball" variant="ghost" type="button">
                공 추가
              </Button>
              <Button id="restore-defaults" variant="ghost" type="button">
                기본값 복원
              </Button>
              <Button variant="primary" type="submit">
                닫기
              </Button>
            </div>
          </div>
        </form>
      </dialog>

      <dialog id="inquiry-dialog" className="dialog dialog--settings">
        <form method="dialog" className="twModal" id="inquiry-form">
          <div className="twModal__card">
            <div className="twModal__header">
              <div className="twModal__headText">
                <div className="twModal__title">문의하기</div>
                <div className="twModal__desc">문의 내용을 안전하게 전송합니다.</div>
              </div>
              <button className="twModal__close" value="close" type="submit" formNoValidate aria-label="닫기">
                ×
              </button>
            </div>

            <div className="twModal__body">
              <div className="inquiryForm">
                <div className="field">
                  <label htmlFor="inq-name">이름</label>
                  <input
                    id="inq-name"
                    name="name"
                    type="text"
                    maxLength="40"
                    required
                    autoComplete="name"
                    placeholder="홍길동"
                  />
                </div>
                <div className="field">
                  <label htmlFor="inq-email">이메일</label>
                  <input
                    id="inq-email"
                    name="email"
                    type="email"
                    maxLength="120"
                    required
                    autoComplete="email"
                    placeholder="you@example.com"
                  />
                </div>
                <div className="field">
                  <label htmlFor="inq-subject">제목</label>
                  <input id="inq-subject" name="subject" type="text" maxLength="80" required placeholder="문의 제목" />
                </div>
                <div className="field">
                  <label htmlFor="inq-message">내용</label>
                  <textarea
                    id="inq-message"
                    name="message"
                    rows="6"
                    maxLength="2000"
                    required
                    placeholder="문의 내용을 작성해 주세요."
                  ></textarea>
                  <div className="inquiryCounter">
                    <span id="inq-message-count">0</span>/2000
                  </div>
                </div>
                <div className="inquiryHoneypot" aria-hidden="true">
                  <label htmlFor="inq-website">웹사이트</label>
                  <input id="inq-website" name="website" type="text" tabIndex="-1" autoComplete="off" />
                </div>
                <div id="inquiry-status" className="inquiryStatus" aria-live="polite"></div>
              </div>
            </div>

            <div className="twModal__footer">
              <Button id="inquiry-send" variant="primary" type="submit">
                메일 보내기
              </Button>
            </div>
          </div>
        </form>
      </dialog>

      <dialog id="winner-dialog" className="dialog dialog--winner">
        <form method="dialog" className="twModal" id="winner-form">
          <div className="twModal__card">
            <div className="twModal__header">
              <div className="twModal__headText">
                <div className="twModal__title">마지막 결과</div>
                <div className="twModal__desc">마지막으로 도착한 공을 확인하세요.</div>
              </div>
              <button className="twModal__close" value="close" type="submit" aria-label="닫기">
                ×
              </button>
            </div>

            <div className="twModal__body">
              <div className="twWinner">
                <div className="twWinner__thumb">
                  <img id="winner-img" src="data:," alt="" />
                </div>
                <div className="twWinner__copy">
                  <div className="twWinner__k">마지막 도착</div>
                  <div className="twWinner__v" id="winner-name"></div>
                </div>
              </div>
            </div>

            <div className="twModal__footer">
              <Button variant="primary" type="submit">
                확인
              </Button>
            </div>
          </div>
        </form>
      </dialog>
    </>
  );
}
