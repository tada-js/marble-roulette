import { Button } from "./button";

type GameCanvasStageProps = {
  isDev: boolean;
  countdownValue: number | null;
  onSkipCountdown: () => void;
  lastFewRemaining: number;
};

export function GameCanvasStage({ isDev, countdownValue, onSkipCountdown, lastFewRemaining }: GameCanvasStageProps) {
  return (
    <div className="board">
      <canvas id="game" width="900" height="1350"></canvas>
      {countdownValue != null ? (
        <div className="boardCountdown" aria-live="assertive">
          <div className={`boardCountdown__value boardCountdown__value--${countdownValue}`} key={`countdown-${countdownValue}`}>
            {countdownValue}
          </div>
          <button type="button" className="boardCountdown__skip" onClick={onSkipCountdown}>
            건너뛰기
          </button>
        </div>
      ) : null}
      {lastFewRemaining > 0 ? (
        <div className="boardHint boardHint--lastFew" aria-live="polite">
          마지막 후보! {lastFewRemaining}개 남음
        </div>
      ) : null}
      {isDev ? (
        <div className="board__coords">
          <div className="board__coordText" id="canvas-coord-readout">
            xFrac: -, yFrac: -
          </div>
          <Button id="canvas-coord-copy" variant="ghost" className="board__copy" disabled>
            좌표 복사
          </Button>
        </div>
      ) : null}
    </div>
  );
}
