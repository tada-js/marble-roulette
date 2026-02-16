import type { ResultUiState } from "../../../app/ui-store";
import { Button } from "../button";
import { ModalCard } from "../modal";

type ResultModalProps = {
  state: ResultUiState;
  onClose: () => void;
  onSkip: () => void;
  onCopy: () => void;
  onRestart: () => void;
};

export function ResultModal({ state, onClose, onSkip, onCopy, onRestart }: ResultModalProps) {
  const isCountdown = state.phase === "countdown";
  const revealCount =
    state.phase === "summary"
      ? state.items.length
      : Math.max(0, Math.min(state.items.length, Math.floor(state.revealIndex || 0)));
  const current = revealCount > 0 ? state.items[revealCount - 1] : null;
  const isSummary = state.phase === "summary";

  return (
    <ModalCard
      size="md"
      title="결과 보기"
      description={
        isCountdown
          ? "마지막 선택 결과를 공개합니다."
          : isSummary
            ? "이번 라운드 선택 결과입니다."
            : `순서대로 공개 중 ${revealCount}/${state.effectiveCount}`
      }
      onClose={onClose}
      footer={
        <div className="resultModal__actions">
          {isCountdown ? (
            <Button variant="ghost" type="button" onClick={onSkip}>
              바로 보기
            </Button>
          ) : isSummary ? (
            <>
              <Button variant="ghost" className="resultModal__copy" type="button" onClick={onCopy}>
                결과 복사
              </Button>
              <Button variant="accent" type="button" onClick={onRestart}>
                다시 시작
              </Button>
              <Button variant="ghost" type="button" onClick={onClose}>
                닫기
              </Button>
            </>
          ) : (
            <Button variant="ghost" type="button" onClick={onSkip}>
              모두 공개
            </Button>
          )}
        </div>
      }
    >
      <div className="resultModal__body">
        {isCountdown ? (
          <div className="resultCountdown">
            <div className={`resultCountdown__value resultCountdown__value--${state.countdownValue || 3}`}>
              {state.countdownValue || 3}
            </div>
          </div>
        ) : isSummary ? (
          <ol className="resultSummaryList">
            {state.items.map((item) => (
              <li key={`${item.rank}-${item.ballId}-${item.finishedAt}`} className="resultSummaryList__item">
                <span className="resultSummaryList__rank">#{item.rank}</span>
                <span className="resultSummaryList__name">{item.name}</span>
              </li>
            ))}
          </ol>
        ) : current ? (
          <div className={`resultRevealCard ${current.rank === 1 ? "is-major" : "is-light"}`}>
            <div className="resultRevealCard__rank">#{current.rank}</div>
            <div className="resultRevealCard__thumb">
              <img src={current.img || "data:,"} alt={current.name} />
            </div>
            <div className="resultRevealCard__name">{current.name}</div>
          </div>
        ) : (
          <div className="resultRevealWaiting">곧 첫 결과를 공개합니다.</div>
        )}
      </div>
    </ModalCard>
  );
}
