import type { StatusTone } from "../../app/ui-store";
import { useI18n } from "../../i18n/react";
import { Button } from "./Button";
import { StatusBadge } from "./StatusBadge";

type GameCanvasStageProps = {
  isDev: boolean;
  countdownValue: number | null;
  statusLabel: string;
  statusTone: StatusTone;
  statusMetaText?: string | null;
  onSkipCountdown: () => void;
};

export function GameCanvasStage({
  isDev,
  countdownValue,
  statusLabel,
  statusTone,
  statusMetaText,
  onSkipCountdown,
}: GameCanvasStageProps) {
  const { t } = useI18n();

  return (
    <div className="board">
      <canvas id="game" width="900" height="1350"></canvas>
      <div className="boardStatus">
        <StatusBadge
          statusLabel={statusLabel}
          statusTone={statusTone}
          statusMetaText={statusMetaText}
          className="boardStatus__badge"
        />
      </div>
      {countdownValue != null ? (
        <div className="boardCountdown" aria-live="assertive">
          <div className={`boardCountdown__value boardCountdown__value--${countdownValue}`} key={`countdown-${countdownValue}`}>
            {countdownValue}
          </div>
          <button type="button" className="boardCountdown__skip" onClick={onSkipCountdown}>
            {t("board.skip")}
          </button>
        </div>
      ) : null}
      {isDev ? (
        <div className="board__coords">
          <div className="board__coordText" id="canvas-coord-readout">
            xFrac: -, yFrac: -
          </div>
          <Button id="canvas-coord-copy" variant="ghost" className="board__copy" disabled>
            {t("board.copyCoords")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
