import { useEffect, useState, type DragEvent, type TouchEvent } from "react";
import { Button, IconButton } from "./Button";
import { AppIcon } from "./Icons";

const START_CAPTION_MAX = 28;
const MOBILE_MEDIA_QUERY = "(max-width: 720px)";

function readMobileViewport(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(MOBILE_MEDIA_QUERY).matches;
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
  const [mobileHudFoldOpen, setMobileHudFoldOpen] = useState<boolean>(true);
  const [participantsFoldOpen, setParticipantsFoldOpen] = useState<boolean>(true);
  const [resultFoldOpen, setResultFoldOpen] = useState<boolean>(() => !readMobileViewport());
  const [captionFoldOpen, setCaptionFoldOpen] = useState<boolean>(() => !readMobileViewport());
  const canDecreaseResultCount = winnerCount > 1;
  const canIncreaseResultCount = winnerCount < winnerCountMax;
  const totalParticipants = balls.reduce((sum, ball) => sum + Math.max(0, Math.floor(Number(ball.count) || 0)), 0);
  const startCaptionLength = String(startCaption || "").length;
  const showMobileHudSections = !isMobileViewport || mobileHudFoldOpen;
  const showParticipants = !isMobileViewport || participantsFoldOpen;
  const showResultOption = !isMobileViewport || resultFoldOpen;
  const showStartCaption = !isMobileViewport || captionFoldOpen;
  const mobileHudFoldAriaLabel = showMobileHudSections ? "메뉴 닫기" : "메뉴 열기";
  const collapsedHudClassName = showMobileHudSections ? "" : "is-hud-collapsed";
  const participantTitle = `참가자 목록(${totalParticipants})`;
  const participantFoldAriaLabel = showParticipants ? "참가자 목록 접기" : "참가자 목록 펼치기";
  const participantFoldCaretClassName = ["mobileFold__caret", showParticipants ? "is-open" : ""]
    .filter(Boolean)
    .join(" ");
  const participantCardClassName = ["panelCard", "panelCard--participants", isLocked ? "is-locked" : "", isMobileViewport ? "is-mobileFold" : ""]
    .filter(Boolean)
    .join(" ");
  const participantSectionClassName = [participantCardClassName, collapsedHudClassName].filter(Boolean).join(" ");
  const resultOptionClassName = [
    "resultOption",
    "resultOption--inline",
    isLocked ? "is-disabled" : "",
    isMobileViewport ? "is-mobileFold" : "",
    collapsedHudClassName,
  ]
    .filter(Boolean)
    .join(" ");
  const startCaptionClassName = ["startCaption", isLocked ? "is-disabled" : "", isMobileViewport ? "is-mobileFold" : "", collapsedHudClassName]
    .filter(Boolean)
    .join(" ");
  const hudClassName = ["hud", isMobileViewport && !showMobileHudSections ? "is-mobile-collapsed" : ""]
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
            참가자 설정
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

  return (
    <div className={hudClassName}>
      <div className="mini">
        <div className="mini__row">
          <div className="mini__title" id="minimap-title">
            미니맵
          </div>
          <label className="switch tooltip" data-tip={viewLockTooltip} aria-label={viewLockTooltip}>
            <span className="switch__label">시점 고정</span>
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
        <div className="mini__hint" id="minimap-hint">
          미니맵을 클릭해 이동하고, 시점 고정을 켜면 자동 추적으로 돌아갑니다.
        </div>
      </div>

      {isMobileViewport && (
        <div className="hud__mobileMenuRow">
          <IconButton
            id="mobile-hud-menu-btn"
            className={`hud__mobileMenuBtn ${showMobileHudSections ? "is-open" : ""}`}
            ariaLabel={mobileHudFoldAriaLabel}
            ariaExpanded={showMobileHudSections}
            title={mobileHudFoldAriaLabel}
            onClick={() => setMobileHudFoldOpen((prev) => !prev)}
          >
            <AppIcon name="menu" />
          </IconButton>
        </div>
      )}

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
            <Button id="settings-btn" variant="ghost" size="sm" disabled={isLocked} onClick={onOpenSettings}>
              참가자 설정
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
                      aria-label={`${ball.name} 순서 이동`}
                      title={isLocked ? "진행 중에는 순서를 변경할 수 없어요." : "드래그해서 순서를 변경하세요."}
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
                        aria-label={`${ball.name} 개수`}
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
                <span>진행 중에는 편집이 잠겨요</span>
              </div>
            )}
          </div>
        )}
      </section>

      <div className={resultOptionClassName}>
        {isMobileViewport && (
          <button
            type="button"
            className="mobileFold__toggle"
            aria-expanded={showResultOption}
            aria-controls="result-option-body"
            onClick={() => setResultFoldOpen((prev) => !prev)}
          >
            <span className="mobileFold__label">당첨자 수</span>
            <span className={`mobileFold__caret ${showResultOption ? "is-open" : ""}`} aria-hidden="true">
              ▾
            </span>
          </button>
        )}
        {showResultOption && (
          <>
            <div className="resultOption__row" id="result-option-body">
              <div className="resultOption__label">당첨자 수</div>
              <div
                className={`resultOption__viewWrap ${resultDisabled ? "tooltip" : ""}`}
                data-tip={resultDisabled ? "결과 보기는 게임 종료 이후 확인할 수 있습니다." : undefined}
              >
                <Button
                  id="winner-btn"
                  variant="ghost"
                  size="sm"
                  className="resultOption__viewBtn"
                  disabled={resultDisabled}
                  onClick={onOpenResult}
                >
                  결과 보기
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
            <div className="resultOption__helper">가장 늦게 도착한 순서대로 결과를 공개합니다.</div>
            {winnerCountWasClamped && (
              <div className="resultOption__hint">참가자 수를 넘어 자동으로 참가자 수로 맞춰졌습니다.</div>
            )}
          </>
        )}
      </div>

      <div className={startCaptionClassName}>
        {isMobileViewport && (
          <button
            type="button"
            className="mobileFold__toggle"
            aria-expanded={showStartCaption}
            aria-controls="start-caption-body"
            onClick={() => setCaptionFoldOpen((prev) => !prev)}
          >
            <span className="mobileFold__label">시작지점 문구</span>
            <span className="mobileFold__meta">{`${startCaptionLength}/${START_CAPTION_MAX}`}</span>
            <span className={`mobileFold__caret ${showStartCaption ? "is-open" : ""}`} aria-hidden="true">
              ▾
            </span>
          </button>
        )}
        {showStartCaption && (
          <div id="start-caption-body">
            <div className="startCaption__labelRow">
              <label className="startCaption__label" htmlFor="start-caption-input">
                시작지점 문구
              </label>
              <span className="startCaption__count">{`${startCaptionLength}/${START_CAPTION_MAX}`}</span>
            </div>
            <input
              id="start-caption-input"
              className="startCaption__input"
              type="text"
              maxLength={START_CAPTION_MAX}
              placeholder="예) 두근두근 당첨자는 누구일까요?"
              value={startCaption}
              disabled={isLocked}
              onChange={(event) => onSetStartCaption(event.currentTarget.value)}
            />
            <div className="startCaption__hint">
              {isLocked ? "진행 중에는 변경할 수 없어요." : "띄어쓰기 포함 최대 28자, 시작지점 상단에 표시됩니다."}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
