import { Button } from "./button";

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
  resultDisabled: boolean;
  winnerCount: number;
  winnerCountMax: number;
  winnerCountWasClamped: boolean;
  balls: LeftPanelBall[];
  onOpenSettings: () => void;
  onOpenResult: () => void;
  onToggleViewLock: (isOn: boolean) => void;
  onSetWinnerCount: (value: number) => void;
  onAdjustBallCount: (ballId: string, delta: number) => void;
  onSetBallCount: (ballId: string, value: number) => void;
};

export function LeftPanel(props: LeftPanelProps) {
  const {
    viewLockChecked,
    viewLockDisabled,
    resultDisabled,
    winnerCount,
    winnerCountMax,
    winnerCountWasClamped,
    balls,
    onOpenSettings,
    onOpenResult,
    onToggleViewLock,
    onSetWinnerCount,
    onAdjustBallCount,
    onSetBallCount,
  } = props;
  const isLocked = !!balls.find((ball) => ball.locked);
  const canDecreaseResultCount = winnerCount > 1;
  const canIncreaseResultCount = winnerCount < winnerCountMax;

  return (
    <div className="hud">
      <div className="mini">
        <div className="mini__row">
          <div className="mini__title" id="minimap-title">
            미니맵
          </div>
          <label className="switch" title="켜면 후미 공을 따라갑니다. 끄면 자유 시점으로 미니맵으로 이동합니다.">
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

      <section className="panelCard panelCard--participants">
        <div className="panelCard__header">
          <div className="panelCard__title">참가자 목록</div>
          <Button id="settings-btn" variant="ghost" size="sm" onClick={onOpenSettings}>
            공 설정
          </Button>
        </div>
        {isLocked ? <div className="panelCard__hint">진행 중에는 편집이 잠겨요</div> : null}
        <div className="participantList" id="balls">
          {balls.map((ball) => (
            <div key={ball.id} className="participantRow" role="group">
              <div className="participantRow__thumb">
                <img alt={ball.name} src={ball.imageDataUrl} />
              </div>

              <div className="participantRow__meta">
                <div className="participantRow__name tooltip" data-tip={ball.name} aria-label={ball.name}>
                  <span className="participantRow__nameText">{ball.name}</span>
                </div>
              </div>

              <div className="participantRow__qty">
                <Button
                  variant="ghost"
                  className="participantRow__qtyBtn"
                  disabled={ball.locked}
                  onClick={() => onAdjustBallCount(ball.id, -1)}
                >
                  -
                </Button>
                <input
                  className="participantRow__count"
                  type="number"
                  inputMode="numeric"
                  min="0"
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
          ))}
        </div>
      </section>

      <div className={`resultOption resultOption--inline ${isLocked ? "is-disabled" : ""}`}>
        <div className="resultOption__row">
          <div className="resultOption__label">선택 결과 수</div>
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
        <div className="resultOption__meta">최대 {winnerCountMax}개</div>
        <div className="resultOption__helper">가장 늦게 도착한 순서대로 선택 결과를 공개합니다.</div>
        {winnerCountWasClamped ? (
          <div className="resultOption__hint">입력값이 최대치를 넘어 자동으로 맞춰졌습니다.</div>
        ) : null}
      </div>
    </div>
  );
}
