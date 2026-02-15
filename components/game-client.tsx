"use client";

import { useEffect, useRef } from "react";

export default function GameClient() {
  const bootedRef = useRef(false);

  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;

    // Mount the existing game runtime. This is a bridge step: Next.js shell + legacy JS core.
    // Later iterations will move this into typed React components with server actions.
    void import("../src/main");
  }, []);

  // Keep the DOM structure/ids so the legacy runtime can attach listeners.
  return (
    <div id="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand__title">데구르르</div>
          <div className="brand__subtitle">공으로 즐기는 핀볼 사다리</div>
        </div>
        <div className="topbar__actions">
          <button id="settings-btn" className="btn btn--ghost" type="button">
            설정
          </button>
          <button id="bgm-btn" className="btn btn--ghost" type="button" aria-pressed="false">
            BGM 끔
          </button>
          <button id="reset-btn" className="btn btn--ghost" type="button">
            초기화
          </button>
          <button id="winner-btn" className="btn btn--ghost" type="button" disabled>
            마지막 결과
          </button>
          <span className="topbar__divider" aria-hidden="true" />
          <button id="start-btn" className="btn btn--primary topbar__start" type="button">
            시작
          </button>
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
                <input id="view-lock" className="switch__input" type="checkbox" role="switch" disabled />
                <span className="switch__track" aria-hidden="true">
                  <span className="switch__thumb" />
                </span>
              </label>
            </div>
            <canvas id="minimap" width={260} height={190} />
            <div className="mini__hint" id="minimap-hint">
              미니맵을 클릭해 이동. 후미 추적으로 자동 추적을 재개합니다.
            </div>
          </div>
          <div className="hud__hint" id="hint">
            시작을 누르면 선택한 공이 한 번에 떨어집니다.
          </div>
          <div className="balls" id="balls" />
          <div className="result" id="result" aria-live="polite" />
        </div>

        <div className="board">
          <canvas id="game" width={900} height={1350} />
          <div className="board__coords">
            <div className="board__coordText" id="canvas-coord-readout">
              xFrac: -, yFrac: -
            </div>
            <button id="canvas-coord-copy" className="btn btn--ghost board__copy" type="button" disabled>
              좌표 복사
            </button>
          </div>
        </div>
      </main>

      <dialog id="settings-dialog" className="dialog dialog--settings">
        <form method="dialog" className="settingsModal" id="settings-form">
          <div className="winner__frame winner__frame--settings">
            <div className="winner__fx" aria-hidden="true" />
            <button className="winner__close" value="close" type="submit" aria-label="닫기">
              ×
            </button>

            <div className="winner__badge">설정</div>
            <div className="winner__title">공 설정</div>
            <div className="winner__sub">이름/이미지를 바꾸고 수량을 조절할 수 있어요.</div>

            <div className="settings__list settings__list--modal" id="settings-list" />

            <div className="settings__actions settings__actions--modal">
              <button id="add-ball" className="btn btn--ghost" type="button">
                공 추가
              </button>
              <button id="restore-defaults" className="btn btn--ghost" type="button">
                기본값 복원
              </button>
            </div>
          </div>
        </form>
      </dialog>

      <dialog id="winner-dialog" className="dialog dialog--winner">
        <form method="dialog" className="winner" id="winner-form">
          <div className="winner__frame">
            <div className="winner__fx" aria-hidden="true" />
            <div className="winner__confetti" aria-hidden="true">
              <span className="c" />
              <span className="c" />
              <span className="c" />
              <span className="c" />
              <span className="c" />
              <span className="c" />
              <span className="c" />
              <span className="c" />
              <span className="c" />
              <span className="c" />
              <span className="c" />
              <span className="c" />
            </div>
            <button className="winner__close" value="close" type="submit" aria-label="닫기">
              ×
            </button>

            <div className="winner__badge">마지막 도착</div>
            <div className="winner__title" id="winner-title" />
            <div className="winner__sub" id="winner-sub" />

            <div className="winner__grid">
              <div className="winner__thumb">
                <img id="winner-img" alt="" />
              </div>
              <div className="winner__meta">
                <div className="winner__metaRow">
                  <div className="winner__metaK">공</div>
                  <div className="winner__metaV" id="winner-name" />
                </div>
                <div className="winner__metaRow">
                  <div className="winner__metaK">도착 순서</div>
                  <div className="winner__metaV" id="winner-order" />
                </div>
              </div>
            </div>

            <div className="winner__actions">
              <button className="btn btn--primary" value="close" type="submit">
                확인
              </button>
            </div>
          </div>
        </form>
      </dialog>
    </div>
  );
}
