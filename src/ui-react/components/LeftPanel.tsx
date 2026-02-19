import { useEffect, useState, type DragEvent, type TouchEvent } from "react";
import { useI18n } from "../../i18n/react";
import { Button, IconButton } from "./Button";
import { AppIcon } from "./Icons";

const START_CAPTION_MAX = 28;
const MOBILE_MEDIA_QUERY = "(max-width: 720px)";
const MOBILE_HUD_CLASS_BY_OPEN: Record<"open" | "collapsed", string> = {
  open: "is-mobile-open",
  collapsed: "is-mobile-collapsed",
};

function readMobileViewport(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(MOBILE_MEDIA_QUERY).matches;
}

function resolveMobileHudClassName(isMobileViewport: boolean, isOpen: boolean): string {
  if (!isMobileViewport) return "";
  const key: "open" | "collapsed" = isOpen ? "open" : "collapsed";
  return MOBILE_HUD_CLASS_BY_OPEN[key];
}

type LeftPanelBall = {
  id: string;
  name: string;
  imageDataUrl: string;
  count: number;
  locked: boolean;
};

type LeftPanelProps = {
  viewLockChecked: boolean;
  viewLockDisabled: boolean;
  viewLockTooltip: string;
  resultDisabled: boolean;
  winnerCount: number;
  winnerCountMax: number;
  winnerCountWasClamped: boolean;
  startCaption: string;
  balls: LeftPanelBall[];
  onOpenSettings: () => void;
  onOpenResult: () => void;
  onToggleViewLock: (isOn: boolean) => void;
  onSetWinnerCount: (value: number) => void;
  onSetStartCaption: (value: string) => void;
  onAdjustBallCount: (ballId: string, delta: number) => void;
  onSetBallCount: (ballId: string, value: number) => void;
  onReorderBall: (sourceBallId: string, targetBallId: string) => void;
};

export function LeftPanel(props: LeftPanelProps) {
  const { t } = useI18n();
  const {
    viewLockChecked,
    viewLockDisabled,
    viewLockTooltip,
    resultDisabled,
    winnerCount,
    winnerCountMax,
    winnerCountWasClamped,
    startCaption,
    balls,
    onOpenSettings,
    onOpenResult,
    onToggleViewLock,
    onSetWinnerCount,
    onSetStartCaption,
    onAdjustBallCount,
    onSetBallCount,
    onReorderBall,
  } = props;
  const isLocked = !!balls.find((ball) => ball.locked);
  const [isMobileViewport, setIsMobileViewport] = useState<boolean>(readMobileViewport);
  const [draggingBallId, setDraggingBallId] = useState<string | null>(null);
  const [dropTargetBallId, setDropTargetBallId] = useState<string | null>(null);
  const [mobileHudFoldOpen, setMobileHudFoldOpen] = useState<boolean>(() => !readMobileViewport());
  const [participantsFoldOpen, setParticipantsFoldOpen] = useState<boolean>(true);
  const [resultFoldOpen, setResultFoldOpen] = useState<boolean>(() => !readMobileViewport());
  const [captionFoldOpen, setCaptionFoldOpen] = useState<boolean>(() => !readMobileViewport());
  const canDecreaseResultCount = winnerCount > 1;
  const canIncreaseResultCount = winnerCount < winnerCountMax;
  const totalParticipants = balls.reduce((sum, ball) => sum + Math.max(0, Math.floor(Number(ball.count) || 0)), 0);
  const startCaptionLength = String(startCaption || "").length;
  const showParticipants = !isMobileViewport || participantsFoldOpen;
  const showResultOption = !isMobileViewport || resultFoldOpen;
  const showStartCaption = !isMobileViewport || captionFoldOpen;
  const showMinimapFocusIcon = isMobileViewport;
  const mobileHudFoldAriaLabel = mobileHudFoldOpen ? t("left.menuClose") : t("left.menuOpen");
  const participantTitle = t("left.participantListTitle", { count: totalParticipants });
  const participantFoldAriaLabel = showParticipants ? t("left.participantFoldClose") : t("left.participantFoldOpen");
  const participantFoldCaretClassName = ["mobileFold__caret", showParticipants ? "is-open" : ""]
    .filter(Boolean)
    .join(" ");
  const participantCardClassName = ["panelCard", "panelCard--participants", isLocked ? "is-locked" : "", isMobileViewport ? "is-mobileFold" : ""]
    .filter(Boolean)
    .join(" ");
  const participantSectionClassName = participantCardClassName;
  const resultOptionClassName = [
    "resultOption",
    "resultOption--inline",
    isLocked ? "is-disabled" : "",
    isMobileViewport ? "is-mobileFold" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const startCaptionClassName = ["startCaption", isLocked ? "is-disabled" : "", isMobileViewport ? "is-mobileFold" : ""]
    .filter(Boolean)
    .join(" ");
  const hudClassName = ["hud", resolveMobileHudClassName(isMobileViewport, mobileHudFoldOpen)]
    .filter(Boolean)
    .join(" ");

  function clearDragState() {
    setDraggingBallId(null);
    setDropTargetBallId(null);
  }

  function handleDragStart(ballId: string, event: DragEvent<HTMLButtonElement>) {
    if (isLocked) {
      event.preventDefault();
      return;
    }
    setDraggingBallId(ballId);
    setDropTargetBallId(ballId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", ballId);
  }

  function handleDragOver(ballId: string, event: DragEvent<HTMLDivElement>) {
    if (isLocked) return;
    const sourceBallId = draggingBallId || event.dataTransfer.getData("text/plain");
    if (!sourceBallId || sourceBallId === ballId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (dropTargetBallId !== ballId) {
      setDropTargetBallId(ballId);
    }
  }

  function handleDrop(ballId: string, event: DragEvent<HTMLDivElement>) {
    if (isLocked) return;
    event.preventDefault();
    const sourceBallId = draggingBallId || event.dataTransfer.getData("text/plain");
    if (!sourceBallId || sourceBallId === ballId) {
      clearDragState();
      return;
    }
    onReorderBall(sourceBallId, ballId);
    clearDragState();
  }

  function handleDragEnd() {
    clearDragState();
  }

  function findBallIdFromPoint(clientX: number, clientY: number): string | null {
    if (typeof document === "undefined") return null;
    const pointedElement = document.elementFromPoint(clientX, clientY);
    if (!pointedElement) return null;
    const rowElement = pointedElement.closest("[data-ball-id]");
    if (!(rowElement instanceof HTMLElement)) return null;
    const targetBallId = rowElement.getAttribute("data-ball-id");
    return targetBallId || null;
  }

  function handleTouchDragStart(ballId: string, event: TouchEvent<HTMLButtonElement>) {
    if (isLocked) return;
    setDraggingBallId(ballId);
    setDropTargetBallId(ballId);
    if (event.cancelable) {
      event.preventDefault();
    }
  }

  function handleTouchDragMove(event: TouchEvent<HTMLButtonElement>) {
    if (isLocked || !draggingBallId) return;
    const movingTouch = event.touches[0];
    if (!movingTouch) return;
    const targetBallId = findBallIdFromPoint(movingTouch.clientX, movingTouch.clientY);
    if (targetBallId && targetBallId !== draggingBallId && targetBallId !== dropTargetBallId) {
      setDropTargetBallId(targetBallId);
    }
    if (event.cancelable) {
      event.preventDefault();
    }
  }

  function handleTouchDragEnd(event: TouchEvent<HTMLButtonElement>) {
    if (isLocked || !draggingBallId) {
      clearDragState();
      return;
    }
    const touchPoint = event.changedTouches[0];
    const targetBallIdFromPoint = touchPoint ? findBallIdFromPoint(touchPoint.clientX, touchPoint.clientY) : null;
    const sourceBallId = draggingBallId;
    const targetBallId = targetBallIdFromPoint || dropTargetBallId;
    if (targetBallId && targetBallId !== sourceBallId) {
      onReorderBall(sourceBallId, targetBallId);
    }
    clearDragState();
  }

  function handleTouchDragCancel() {
    clearDragState();
  }

  function renderDesktopParticipantHeader() {
    return (
      <div className="panelCard__header">
        <div className="panelCard__title">{participantTitle}</div>
        <div className="panelCard__headerActions">
          <Button id="settings-btn" variant="ghost" size="sm" disabled={isLocked} onClick={onOpenSettings}>
            {t("left.participantSettings")}
          </Button>
        </div>
      </div>
    );
  }

  useEffect(() => {
    if (!isLocked) return;
    setDraggingBallId(null);
    setDropTargetBallId(null);
  }, [isLocked]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mediaQuery = window.matchMedia(MOBILE_MEDIA_QUERY);
    const onChange = (event: MediaQueryListEvent) => setIsMobileViewport(event.matches);
    setIsMobileViewport(mediaQuery.matches);
    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", onChange);
      return () => mediaQuery.removeEventListener("change", onChange);
    }
    mediaQuery.addListener(onChange);
    return () => mediaQuery.removeListener(onChange);
  }, []);

  useEffect(() => {
    if (!isMobileViewport && !mobileHudFoldOpen) {
      setMobileHudFoldOpen(true);
    }
  }, [isMobileViewport, mobileHudFoldOpen]);

  useEffect(() => {
    if (!isMobileViewport) return;
    setMobileHudFoldOpen(false);
  }, [isMobileViewport]);

  useEffect(() => {
    if (!isMobileViewport || !mobileHudFoldOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMobileHudFoldOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isMobileViewport, mobileHudFoldOpen]);

  return (
    <div className={hudClassName}>
      {isMobileViewport && (
        <button
          type="button"
          className="hud__mobileScrim"
          aria-label={t("left.menuClose")}
          aria-hidden={mobileHudFoldOpen ? undefined : "true"}
          tabIndex={mobileHudFoldOpen ? 0 : -1}
          onClick={() => setMobileHudFoldOpen(false)}
        />
      )}
      <div className="mini">
        <div className="mini__row">
          <div className="mini__title" id="minimap-title">
            {t("left.minimap")}
          </div>
          <label className="switch tooltip" data-tip={viewLockTooltip} aria-label={viewLockTooltip}>
            <span className="switch__label">{t("left.viewLock")}</span>
            <input
              id="view-lock"
              className="switch__input"
              type="checkbox"
              role="switch"
              checked={viewLockChecked}
              disabled={viewLockDisabled}
              onChange={(event) => onToggleViewLock(event.currentTarget.checked)}
            />
            <span className="switch__track" aria-hidden="true">
              <span className="switch__thumb"></span>
            </span>
          </label>
        </div>
        <canvas id="minimap" width="260" height="190"></canvas>
        {showMinimapFocusIcon && (
          <IconButton
            className={`mini__refocus ${viewLockChecked ? "is-on" : ""}`}
            ariaLabel={viewLockChecked ? t("left.viewLockDisable") : t("left.viewLockEnable")}
            ariaPressed={viewLockChecked}
            title={viewLockChecked ? t("left.viewLockOn") : t("left.viewLockOff")}
            disabled={viewLockDisabled}
            onClick={() => onToggleViewLock(!viewLockChecked)}
          >
            <AppIcon name="lock" />
          </IconButton>
        )}
        <div className="mini__hint" id="minimap-hint">
          {t("left.minimapHint")}
        </div>
      </div>

      {isMobileViewport && (
        <div className="hud__mobileMenuRow">
          <IconButton
            id="mobile-hud-menu-btn"
            className={`hud__mobileMenuBtn ${mobileHudFoldOpen ? "is-open" : ""}`}
            ariaLabel={mobileHudFoldAriaLabel}
            ariaExpanded={mobileHudFoldOpen}
            title={mobileHudFoldAriaLabel}
            onClick={() => setMobileHudFoldOpen((prev) => !prev)}
          >
            <AppIcon name="menu" />
          </IconButton>
        </div>
      )}

      <div className="hud__content" id="mobile-hud-content">
        {isMobileViewport && (
          <div className="hudMobileSheet__header">
            <div className="hudMobileSheet__handle" aria-hidden="true"></div>
            <div className="hudMobileSheet__titleRow">
                <div className="hudMobileSheet__titleWrap">
                <div className="hudMobileSheet__title">{t("left.gameSettings")}</div>
              </div>
              <IconButton
                className="hudMobileSheet__closeBtn"
                ariaLabel={t("left.menuClose")}
                title={t("left.menuClose")}
                onClick={() => setMobileHudFoldOpen(false)}
              >
                <span aria-hidden="true">✕</span>
              </IconButton>
            </div>
          </div>
        )}

        <div className={startCaptionClassName}>
          {isMobileViewport && (
            <button
              type="button"
              className="mobileFold__toggle"
              aria-label={showStartCaption ? t("left.startCaptionFoldClose") : t("left.startCaptionFoldOpen")}
              aria-expanded={showStartCaption}
              aria-controls="start-caption-body"
              onClick={() => setCaptionFoldOpen((prev) => !prev)}
            >
              <span className="mobileFold__label">{t("left.startCaption")}</span>
              <span className="mobileFold__meta">{`${startCaptionLength}/${START_CAPTION_MAX}`}</span>
              <span className={`mobileFold__caret ${showStartCaption ? "is-open" : ""}`} aria-hidden="true">
                ▾
              </span>
            </button>
          )}
          {showStartCaption && (
            <div id="start-caption-body">
              {!isMobileViewport ? (
                <div className="startCaption__labelRow">
                  <label className="startCaption__label" htmlFor="start-caption-input">
                    {t("left.startCaption")}
                  </label>
                  <span className="startCaption__count">{`${startCaptionLength}/${START_CAPTION_MAX}`}</span>
                </div>
              ) : null}
              <input
                id="start-caption-input"
                className="startCaption__input"
                type="text"
                maxLength={START_CAPTION_MAX}
                placeholder={t("left.startCaptionPlaceholder")}
                value={startCaption}
                disabled={isLocked}
                onChange={(event) => onSetStartCaption(event.currentTarget.value)}
              />
              <div className="startCaption__hint">
                {isLocked
                  ? t("left.startCaptionLocked")
                  : t("left.startCaptionHint", { max: START_CAPTION_MAX })}
              </div>
            </div>
          )}
        </div>

        <div className={resultOptionClassName}>
          {isMobileViewport && (
            <button
              type="button"
              className="mobileFold__toggle"
              aria-label={showResultOption ? t("left.winnerCountFoldClose") : t("left.winnerCountFoldOpen")}
              aria-expanded={showResultOption}
              aria-controls="result-option-body"
              onClick={() => setResultFoldOpen((prev) => !prev)}
            >
              <span className="mobileFold__label">{t("left.winnerCount")}</span>
              <span className={`mobileFold__caret ${showResultOption ? "is-open" : ""}`} aria-hidden="true">
                ▾
              </span>
            </button>
          )}
          {showResultOption && (
            <>
              <div
                className={`resultOption__row ${isMobileViewport ? "resultOption__row--mobile" : ""}`}
                id="result-option-body"
              >
                {!isMobileViewport ? <div className="resultOption__label">{t("left.winnerCount")}</div> : null}
                <div
                  className={`resultOption__viewWrap ${resultDisabled ? "tooltip" : ""}`}
                  data-tip={resultDisabled ? t("left.resultDisabledTip") : undefined}
                >
                  <Button
                    id="winner-btn"
                    variant="ghost"
                    size="sm"
                    className="resultOption__viewBtn"
                    disabled={resultDisabled}
                    onClick={onOpenResult}
                  >
                    {t("left.openResult")}
                  </Button>
                </div>
              </div>

              <div className="resultOption__controls">
                <div className="resultOption__stepper">
                  <Button
                    variant="ghost"
                    className="resultOption__stepBtn"
                    disabled={isLocked || !canDecreaseResultCount}
                    onClick={() => onSetWinnerCount(winnerCount - 1)}
                  >
                    -
                  </Button>
                  <input
                    id="winner-count-input"
                    className="resultOption__input"
                    type="number"
                    min={1}
                    max={winnerCountMax}
                    step={1}
                    value={String(winnerCount)}
                    disabled={isLocked}
                    onChange={(event) => onSetWinnerCount(Number(event.currentTarget.value))}
                  />
                  <Button
                    variant="ghost"
                    className="resultOption__stepBtn"
                    disabled={isLocked || !canIncreaseResultCount}
                    onClick={() => onSetWinnerCount(winnerCount + 1)}
                  >
                    +
                  </Button>
                </div>
              </div>
              <div className="resultOption__helper">{t("left.resultHelper")}</div>
              {winnerCountWasClamped && (
                <div className="resultOption__hint">{t("left.resultClamped")}</div>
              )}
            </>
          )}
        </div>

        <section className={participantSectionClassName}>
          {isMobileViewport ? (
            <button
              type="button"
              className="mobileFold__toggle"
              aria-label={participantFoldAriaLabel}
              aria-expanded={showParticipants}
              aria-controls="participant-list-body"
              onClick={() => setParticipantsFoldOpen((prev) => !prev)}
            >
              <span className="mobileFold__label">{participantTitle}</span>
              <span className={participantFoldCaretClassName} aria-hidden="true">
                ▾
              </span>
            </button>
          ) : (
            renderDesktopParticipantHeader()
          )}
          {isMobileViewport && showParticipants && (
            <div className="participantSection__actions">
              <Button
                id="settings-btn"
                variant="accent"
                size="md"
                width="full"
                className="participantSection__settingsBtn"
                disabled={isLocked}
                onClick={onOpenSettings}
              >
                {t("left.participantSettings")}
              </Button>
            </div>
          )}
          {showParticipants && (
            <div id="participant-list-body" className={`participantListWrap ${isLocked ? "is-locked" : ""}`}>
              <div className="participantList" id="balls" aria-hidden={isLocked ? "true" : undefined}>
                {balls.map((ball) => {
                  const rowClassName = [
                    "participantRow",
                    draggingBallId === ball.id ? "is-dragging" : "",
                    dropTargetBallId === ball.id && draggingBallId !== ball.id ? "is-drop-target" : "",
                  ]
                    .filter(Boolean)
                    .join(" ");

                  return (
                    <div
                      key={ball.id}
                      data-ball-id={ball.id}
                      className={`${rowClassName} tooltip`}
                      data-tip={ball.name}
                      title={ball.name}
                      aria-label={ball.name}
                      role="group"
                      onDragOver={(event) => handleDragOver(ball.id, event)}
                      onDrop={(event) => handleDrop(ball.id, event)}
                    >
                      <button
                        type="button"
                        className="participantRow__dragHandle"
                        aria-label={t("left.reorderAria", { name: ball.name })}
                        title={isLocked ? t("left.reorderLocked") : t("left.reorderHint")}
                        draggable={!isLocked}
                        disabled={isLocked}
                        onDragStart={(event) => handleDragStart(ball.id, event)}
                        onDragEnd={handleDragEnd}
                        onTouchStart={(event) => handleTouchDragStart(ball.id, event)}
                        onTouchMove={handleTouchDragMove}
                        onTouchEnd={handleTouchDragEnd}
                        onTouchCancel={handleTouchDragCancel}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <circle cx="8" cy="6.5" r="1.4" />
                          <circle cx="8" cy="12" r="1.4" />
                          <circle cx="8" cy="17.5" r="1.4" />
                          <circle cx="16" cy="6.5" r="1.4" />
                          <circle cx="16" cy="12" r="1.4" />
                          <circle cx="16" cy="17.5" r="1.4" />
                        </svg>
                      </button>

                      <div className="participantRow__thumb">
                        <img alt={ball.name} src={ball.imageDataUrl} />
                      </div>

                      <div className="participantRow__qty">
                        <Button
                          variant="ghost"
                          className="participantRow__qtyBtn"
                          disabled={ball.locked || ball.count <= 1}
                          onClick={() => onAdjustBallCount(ball.id, -1)}
                        >
                          -
                        </Button>
                        <input
                          className="participantRow__count"
                          type="number"
                          inputMode="numeric"
                          min="1"
                          max="99"
                          step="1"
                          value={String(ball.count)}
                          aria-label={t("left.countAria", { name: ball.name })}
                          disabled={ball.locked}
                          onChange={(event) => onSetBallCount(ball.id, Number(event.currentTarget.value))}
                        />
                        <Button
                          variant="ghost"
                          className="participantRow__qtyBtn"
                          disabled={ball.locked}
                          onClick={() => onAdjustBallCount(ball.id, 1)}
                        >
                          +
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
              {isLocked && (
                <div className="participantList__lockOverlay" role="status" aria-live="polite">
                  <AppIcon name="lock" />
                  <span>{t("left.editLocked")}</span>
                </div>
              )}
            </div>
          )}
        </section>

      </div>
    </div>
  );
}
