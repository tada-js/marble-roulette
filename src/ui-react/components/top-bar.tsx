import type { RefObject } from "react";
import type { StatusTone } from "../../app/ui-store";
import { Button, IconButton } from "./button";

type TopBarProps = {
  startDisabled: boolean;
  startLabel: string;
  statusLabel: string;
  statusTone: StatusTone;
  bgmOn: boolean;
  bgmTrack: string;
  bgmMenuOpen: boolean;
  bgmControlRef: RefObject<HTMLDivElement | null>;
  onStart: () => void;
  onToggleBgm: () => void;
  onToggleBgmMenu: () => void;
  onSelectBgmTrack: (track: "bgm_1" | "bgm_2") => void;
  onInquiry: () => void;
};

function BgmOnIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M11.5 5.5L8 8.5H5.25A1.25 1.25 0 0 0 4 9.75v4.5c0 .69.56 1.25 1.25 1.25H8l3.5 3a.75.75 0 0 0 1.25-.57V6.07a.75.75 0 0 0-1.25-.57Z" />
      <path d="M15.25 9.25a.75.75 0 0 1 1.06 0 3.9 3.9 0 0 1 0 5.5.75.75 0 1 1-1.06-1.06 2.4 2.4 0 0 0 0-3.38.75.75 0 0 1 0-1.06Z" />
      <path d="M17.9 6.6a.75.75 0 0 1 1.07 0 7.66 7.66 0 0 1 0 10.8.75.75 0 1 1-1.07-1.05 6.16 6.16 0 0 0 0-8.7.75.75 0 0 1 0-1.06Z" />
    </svg>
  );
}

function BgmOffIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M11.5 5.5L8 8.5H5.25A1.25 1.25 0 0 0 4 9.75v4.5c0 .69.56 1.25 1.25 1.25H8l3.5 3a.75.75 0 0 0 1.25-.57V6.07a.75.75 0 0 0-1.25-.57Z" />
      <path d="m16 9 4 6" />
      <path d="m20 9-4 6" />
    </svg>
  );
}

function MusicIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M14.25 4.75a.75.75 0 0 1 .93-.73l4 1a.75.75 0 0 1 .57.73v8.4a2.85 2.85 0 1 1-1.5-2.5V6.34l-2.5-.63v10.43a2.85 2.85 0 1 1-1.5-2.5V4.75Z" />
    </svg>
  );
}

function InquiryIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6.75 6h10.5A2.25 2.25 0 0 1 19.5 8.25v6.5A2.25 2.25 0 0 1 17.25 17h-5.2l-3.4 2.6c-.49.38-1.2.03-1.2-.59V17.0A2.25 2.25 0 0 1 5.25 14.75v-6.5A2.25 2.25 0 0 1 7.5 6Z" />
      <path d="M9 11.5h6" />
      <path d="M9 9h4.5" />
    </svg>
  );
}

export function TopBar(props: TopBarProps) {
  const {
    startDisabled,
    startLabel,
    statusLabel,
    statusTone,
    bgmOn,
    bgmTrack,
    bgmMenuOpen,
    bgmControlRef,
    onStart,
    onToggleBgm,
    onToggleBgmMenu,
    onSelectBgmTrack,
    onInquiry,
  } = props;

  return (
    <header className="topbar">
      <div className="topbar__left brand">
        <div className="brand__title">데구르르 (Degururu)</div>
        <div className="brand__subtitle">공으로 즐기는 핀볼 사다리</div>
      </div>

      <div className="topbar__center">
        <Button id="start-btn" variant="primary" className="topbar__start" disabled={startDisabled} onClick={onStart}>
          {startLabel}
        </Button>
        <div className={`statusBadge statusBadge--${statusTone}`} aria-live="polite">
          {statusLabel}
        </div>
      </div>

      <div className="topbar__right">
        <div className="bgmControl" ref={bgmControlRef}>
          <IconButton
            id="bgm-btn"
            className={`bgmControl__toggleIcon ${bgmOn ? "is-on" : "is-off"}`}
            ariaLabel={bgmOn ? "BGM 끄기" : "BGM 켜기"}
            ariaPressed={bgmOn}
            title={bgmOn ? "BGM 끄기" : "BGM 켜기"}
            onClick={onToggleBgm}
          >
            {bgmOn ? <BgmOnIcon /> : <BgmOffIcon />}
          </IconButton>

          <IconButton
            id="bgm-settings-btn"
            className={`bgmControl__music ${bgmMenuOpen ? "is-open" : ""}`}
            ariaLabel="BGM 트랙 선택"
            ariaHasPopup="menu"
            ariaExpanded={bgmMenuOpen}
            title="BGM 선택"
            onClick={onToggleBgmMenu}
          >
            <MusicIcon />
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
          </div>
        </div>

        <IconButton
          id="inquiry-btn"
          className="topbar__iconAction"
          ariaLabel="문의 열기"
          title="문의"
          onClick={onInquiry}
        >
          <InquiryIcon />
        </IconButton>
      </div>
    </header>
  );
}
