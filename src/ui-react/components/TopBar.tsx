import type { ReactNode, RefObject } from "react";
import { useI18n } from "../../i18n/react";
import { Button, IconButton } from "./Button";
import { AppIcon } from "./Icons";

type TopBarProps = {
  startDisabled: boolean;
  startLabel: string;
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
  const { language, setLanguage, t } = useI18n();
  const {
    startDisabled,
    startLabel,
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
  const isFastMode = speedMultiplier >= 2;
  const nextLanguage = language === "ko" ? "en" : "ko";
  const showBrandAlias = language === "ko";
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
        title={t("topbar.stopTitle")}
        onClick={onStopRun}
      >
        {t("topbar.stop")}
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
          <div className="brand__title" title={t("topbar.brandTitle")}>
            {t("topbar.brandLabel")} {showBrandAlias ? <span className="brand__titleEn">(Degururu)</span> : null}
          </div>
        </div>
      </div>

      <div className="topbar__center">
        <Button id="start-btn" variant="primary" className="topbar__start" disabled={startDisabled} onClick={onStart}>
          {startLabel}
        </Button>
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
          title={isFastMode ? t("topbar.speedOff") : t("topbar.speedOn")}
          onClick={onToggleSpeed}
        >
          {isFastMode ? "2x" : "1x"}
        </Button>

        <Button
          id="lang-btn"
          variant="ghost"
          size="sm"
          className="topbar__lang topbar__action"
          title={t("lang.toggleLabel")}
          onClick={() => setLanguage(nextLanguage)}
        >
          {t("lang.code")}
        </Button>

        <div className="bgmControl" ref={bgmControlRef}>
          <IconButton
            id="bgm-btn"
            className={`bgmControl__toggleIcon topbar__action ${bgmOn ? "is-on" : "is-off"}`}
            ariaLabel={bgmOn ? t("topbar.bgmOff") : t("topbar.bgmOn")}
            ariaPressed={bgmOn}
            title={bgmOn ? t("topbar.bgmOff") : t("topbar.bgmOn")}
            onClick={onToggleBgm}
          >
            <AppIcon name={bgmOn ? "volume-on" : "volume-off"} />
          </IconButton>

          <IconButton
            id="bgm-settings-btn"
            className={`bgmControl__music topbar__action ${bgmMenuOpen ? "is-open" : ""}`}
            ariaLabel={t("topbar.bgmTrack")}
            ariaHasPopup="menu"
            ariaExpanded={bgmMenuOpen}
            title={t("topbar.bgmMenu")}
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
          ariaLabel={t("topbar.inquiryOpen")}
          title={t("topbar.inquiry")}
          onClick={onInquiry}
        >
          <AppIcon name="mail" />
        </IconButton>
      </div>
    </header>
  );
}
