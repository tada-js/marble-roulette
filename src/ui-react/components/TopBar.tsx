import { useEffect, useState, type ReactNode, type RefObject } from "react";
import type { StatusTone } from "../../app/ui-store";
import { Button, IconButton } from "./Button";
import { AppIcon } from "./Icons";

type TopBarProps = {
  startDisabled: boolean;
  startLabel: string;
  statusLabel: string;
  statusTone: StatusTone;
  statusMetaText?: string | null;
  stopRunVisible: boolean;
  stopRunDisabled: boolean;
  speedMultiplier: number;
  bgmOn: boolean;
  bgmTrack: string;
  bgmMenuOpen: boolean;
  bgmControlRef: RefObject<HTMLDivElement | null>;
  onStart: () => void;
  onStopRun: () => void;
  onToggleSpeed: () => void;
  onToggleBgm: () => void;
  onToggleBgmMenu: () => void;
  onSelectBgmTrack: (track: "bgm_1" | "bgm_2" | "bgm_3") => void;
  onInquiry: () => void;
};

export function TopBar(props: TopBarProps) {
  const {
    startDisabled,
    startLabel,
    statusLabel,
    statusTone,
    statusMetaText,
    stopRunVisible,
    stopRunDisabled,
    speedMultiplier,
    bgmOn,
    bgmTrack,
    bgmMenuOpen,
    bgmControlRef,
    onStart,
    onStopRun,
    onToggleSpeed,
    onToggleBgm,
    onToggleBgmMenu,
    onSelectBgmTrack,
    onInquiry,
  } = props;
  const [phaseChanging, setPhaseChanging] = useState(false);

  useEffect(() => {
    setPhaseChanging(true);
    const timer = window.setTimeout(() => setPhaseChanging(false), 220);
    return () => window.clearTimeout(timer);
  }, [statusTone]);
  const metaText = typeof statusMetaText === "string" && statusMetaText.trim() ? statusMetaText : null;
  const isFastMode = speedMultiplier >= 2;
  const runActionButtons: ReactNode[] = [];
  const topbarClassName = ["topbar", stopRunVisible ? "topbar--run" : ""].filter(Boolean).join(" ");

  if (stopRunVisible) {
    runActionButtons.push(
      <Button
        key="stop-run"
        id="stop-run-btn"
        variant="danger"
        size="sm"
        className="topbar__stop"
        disabled={stopRunDisabled}
        title="진행을 중지하고 초기화"
        onClick={onStopRun}
      >
        중지
      </Button>
    );
  }

  return (
    <header className={topbarClassName}>
      <div className="topbar__left brand">
        <div className="brand__mark" aria-hidden="true">
          <span className="brand__markGlyph">DG</span>
        </div>
        <div className="brand__wording">
          <div className="brand__title" title="데구르르 (Degururu)">
            데구르르 <span className="brand__titleEn">(Degururu)</span>
          </div>
        </div>
      </div>

      <div className="topbar__center">
        <Button id="start-btn" variant="primary" className="topbar__start" disabled={startDisabled} onClick={onStart}>
          {startLabel}
        </Button>
        <div
          className={`statusBadge statusBadge--${statusTone} ${phaseChanging ? "is-phase-changing" : ""}`.trim()}
          aria-live="polite"
        >
          <span className={`statusBadge__indicator statusBadge__indicator--${statusTone}`} aria-hidden="true">
            <span className="statusBadge__dot"></span>
            <span className="statusBadge__pauseIcon"></span>
          </span>
          <span className="statusBadge__label">{statusLabel}</span>
          {metaText ? <span className="statusBadge__meta">{metaText}</span> : null}
        </div>
        {runActionButtons.length > 0 ? (
          <div className="topbar__runActions">
            {runActionButtons}
          </div>
        ) : null}
      </div>

      <div className="topbar__right">
        <Button
          id="speed-btn"
          variant="ghost"
          size="sm"
          className={`topbar__speed topbar__action ${isFastMode ? "is-fast" : ""}`}
          ariaPressed={isFastMode}
          title={isFastMode ? "2배속 해제" : "2배속"}
          onClick={onToggleSpeed}
        >
          {isFastMode ? "2x" : "1x"}
        </Button>

        <div className="bgmControl" ref={bgmControlRef}>
          <IconButton
            id="bgm-btn"
            className={`bgmControl__toggleIcon topbar__action ${bgmOn ? "is-on" : "is-off"}`}
            ariaLabel={bgmOn ? "BGM 끄기" : "BGM 켜기"}
            ariaPressed={bgmOn}
            title={bgmOn ? "BGM 끄기" : "BGM 켜기"}
            onClick={onToggleBgm}
          >
            <AppIcon name={bgmOn ? "volume-on" : "volume-off"} />
          </IconButton>

          <IconButton
            id="bgm-settings-btn"
            className={`bgmControl__music topbar__action ${bgmMenuOpen ? "is-open" : ""}`}
            ariaLabel="BGM 트랙 선택"
            ariaHasPopup="menu"
            ariaExpanded={bgmMenuOpen}
            title="BGM 선택"
            onClick={onToggleBgmMenu}
          >
            <AppIcon name="music-track" />
          </IconButton>

          <div id="bgm-menu" className="bgmMenu" role="menu" hidden={!bgmMenuOpen}>
            <button
              type="button"
              className="bgmMenu__item"
              data-bgm-track="bgm_1"
              role="menuitemradio"
              aria-checked={bgmTrack === "bgm_1" ? "true" : "false"}
              onClick={() => onSelectBgmTrack("bgm_1")}
            >
              BGM 1
            </button>
            <button
              type="button"
              className="bgmMenu__item"
              data-bgm-track="bgm_2"
              role="menuitemradio"
              aria-checked={bgmTrack === "bgm_2" ? "true" : "false"}
              onClick={() => onSelectBgmTrack("bgm_2")}
            >
              BGM 2
            </button>
            <button
              type="button"
              className="bgmMenu__item"
              data-bgm-track="bgm_3"
              role="menuitemradio"
              aria-checked={bgmTrack === "bgm_3" ? "true" : "false"}
              onClick={() => onSelectBgmTrack("bgm_3")}
            >
              BGM 3
            </button>
          </div>
        </div>

        <IconButton
          id="inquiry-btn"
          className="topbar__iconAction topbar__action"
          ariaLabel="문의하기 열기"
          title="문의하기"
          onClick={onInquiry}
        >
          <AppIcon name="mail" />
        </IconButton>
      </div>
    </header>
  );
}
