import { useEffect, useMemo, useRef, useState } from "react";
import type { ResultUiState } from "../../../app/ui-store";
import { Button } from "../Button";
import { ModalCard } from "../Modal";

type RollCandidate = {
  ballId: string;
  name: string;
  img: string;
};

type ResultModalProps = {
  state: ResultUiState;
  rollCandidates: RollCandidate[];
  onClose: () => void;
  onSkip: () => void;
  onSpinDone: () => void;
  onCopy: () => void;
  onRestart: () => void;
};

const SPIN_DURATION_MS = 3700;
const SPIN_SETTLE_MS = 130;
const REEL_ITEM_HEIGHT = 68;
const REEL_CENTER_Y = REEL_ITEM_HEIGHT;
const RESULT_BURST_DURATION_MS = 1100;

type ResultViewKind = "spinning" | "single" | "summary" | "waiting";

function easeOutCubic(t: number) {
  return 1 - (1 - t) ** 3;
}

function easeOutQuad(t: number) {
  return 1 - (1 - t) ** 2;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function formatArrivalTime(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "00:00:00";
  const totalMs = Math.max(0, Math.round(value * 1000));
  const minutes = Math.floor(totalMs / 60000);
  const seconds = Math.floor((totalMs % 60000) / 1000);
  const centiseconds = Math.floor((totalMs % 1000) / 10);
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  const cs = String(centiseconds).padStart(2, "0");
  return `${mm}:${ss}:${cs}`;
}

function getResultViewKind(params: {
  isSpinning: boolean;
  spinPlan: { items: Array<{ key: string; ballId: string; name: string; img: string }>; startY: number; stopY: number; overshootY: number } | null;
  isSingle: boolean;
  hasWinner: boolean;
  isSummary: boolean;
}): ResultViewKind {
  if (params.isSpinning && params.spinPlan) return "spinning";
  if (params.isSingle && params.hasWinner) return "single";
  if (params.isSummary) return "summary";
  return "waiting";
}

export function ResultModal({
  state,
  rollCandidates,
  onClose,
  onSkip,
  onSpinDone,
  onCopy,
  onRestart,
}: ResultModalProps) {
  const reelViewportRef = useRef<HTMLDivElement | null>(null);
  const reelTrackRef = useRef<HTMLDivElement | null>(null);
  const skipButtonRef = useRef<HTMLButtonElement | null>(null);
  const restartButtonRef = useRef<HTMLButtonElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const doneRef = useRef(false);
  const onSpinDoneRef = useRef(onSpinDone);
  const prevPhaseRef = useRef(state.phase);
  const [burstVisible, setBurstVisible] = useState(false);

  const finalWinner = state.items[0] || null;
  const isSpinning = state.phase === "spinning";
  const isSingle = state.phase === "single" && state.items.length === 1;
  const isSummary = state.phase === "summary" && state.items.length >= 2;

  useEffect(() => {
    onSpinDoneRef.current = onSpinDone;
  }, [onSpinDone]);

  useEffect(() => {
    const prevPhase = prevPhaseRef.current;
    const isRevealTransition =
      prevPhase === "spinning" &&
      (state.phase === "single" || state.phase === "summary");
    prevPhaseRef.current = state.phase;
    if (!isRevealTransition) return;

    setBurstVisible(true);
    const timer = window.setTimeout(() => setBurstVisible(false), RESULT_BURST_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [state.phase]);

  useEffect(() => {
    if (!state.open || state.phase === "idle" || state.phase === "spinning") {
      setBurstVisible(false);
    }
  }, [state.open, state.phase]);

  const spinPlan = useMemo(() => {
    if (!finalWinner) return null;

    const target: RollCandidate = {
      ballId: finalWinner.ballId,
      name: finalWinner.name,
      img: finalWinner.img,
    };
    const source =
      rollCandidates.length > 0
        ? rollCandidates
        : state.items.map((item) => ({
            ballId: item.ballId,
            name: item.name,
            img: item.img,
          }));

    const base = source.slice(0, 72);
    if (!base.some((entry) => entry.ballId === target.ballId)) {
      base.unshift(target);
    }
    if (!base.length) {
      base.push(target);
    }
    while (base.length < 6) {
      base.push(base[base.length % Math.max(1, source.length)] || target);
    }

    const targetIndex = Math.max(
      0,
      base.findIndex((entry) => entry.ballId === target.ballId)
    );
    const loops = Math.max(8, Math.ceil(30 / base.length));
    const stopIndex = loops * base.length + targetIndex;
    const totalItems = stopIndex + base.length * 2 + 5;
    const items = Array.from({ length: totalItems }, (_, index) => {
      const entry = base[index % base.length];
      return {
        key: `${index}-${entry.ballId}-${entry.name}`,
        ...entry,
      };
    });

    const startIndex = 1;
    const startY = REEL_CENTER_Y - startIndex * REEL_ITEM_HEIGHT;
    const stopY = REEL_CENTER_Y - stopIndex * REEL_ITEM_HEIGHT;
    const overshootY = stopY - 10;

    return {
      items,
      startY,
      stopY,
      overshootY,
    };
  }, [finalWinner, rollCandidates, state.items]);

  useEffect(() => {
    const trackEl = reelTrackRef.current;
    const viewportEl = reelViewportRef.current;
    if (frameRef.current != null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    if (!isSpinning || !spinPlan || !trackEl) return;

    doneRef.current = false;
    trackEl.style.transform = `translate3d(0, ${spinPlan.startY}px, 0)`;
    viewportEl?.classList.add("is-fast");

    let startedAt = 0;
    const tick = (now: number) => {
      if (!startedAt) startedAt = now;
      const elapsed = now - startedAt;

      if (elapsed <= SPIN_DURATION_MS) {
        const t = Math.min(1, elapsed / SPIN_DURATION_MS);
        const y = lerp(spinPlan.startY, spinPlan.overshootY, easeOutCubic(t));
        trackEl.style.transform = `translate3d(0, ${y.toFixed(3)}px, 0)`;
        if (t >= 0.48) viewportEl?.classList.remove("is-fast");
        else viewportEl?.classList.add("is-fast");
        frameRef.current = window.requestAnimationFrame(tick);
        return;
      }

      const settleElapsed = elapsed - SPIN_DURATION_MS;
      if (settleElapsed <= SPIN_SETTLE_MS) {
        const t = Math.min(1, settleElapsed / SPIN_SETTLE_MS);
        const y = lerp(spinPlan.overshootY, spinPlan.stopY, easeOutQuad(t));
        trackEl.style.transform = `translate3d(0, ${y.toFixed(3)}px, 0)`;
        viewportEl?.classList.remove("is-fast");
        frameRef.current = window.requestAnimationFrame(tick);
        return;
      }

      trackEl.style.transform = `translate3d(0, ${spinPlan.stopY}px, 0)`;
      viewportEl?.classList.remove("is-fast");
      frameRef.current = null;
      if (!doneRef.current) {
        doneRef.current = true;
        onSpinDoneRef.current();
      }
    };

    frameRef.current = window.requestAnimationFrame(tick);

    return () => {
      if (frameRef.current != null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      viewportEl?.classList.remove("is-fast");
    };
  }, [isSpinning, spinPlan]);

  useEffect(() => {
    if (!state.open) return;
    const target = isSpinning ? skipButtonRef.current : restartButtonRef.current;
    if (!target) return;
    const timer = window.setTimeout(() => {
      try {
        target.focus({ preventScroll: true });
      } catch {
        target.focus();
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [state.open, isSpinning, isSingle, isSummary]);

  const resultCountTitle = `당첨자 목록(${state.items.length})`;
  const title = isSpinning ? "결과 발표 대기중" : resultCountTitle;
  const viewKind = getResultViewKind({
    isSpinning,
    spinPlan,
    isSingle,
    hasWinner: Boolean(finalWinner),
    isSummary,
  });

  const renderBody = () => {
    if (viewKind === "spinning" && spinPlan) {
      return (
        <div className="resultSpinView">
          <div className="resultSpinView__status">결과 발표 대기중</div>
          <div className="resultSpinView__viewport" ref={reelViewportRef} aria-live="polite">
            <div className="resultSpinView__track" ref={reelTrackRef}>
              {spinPlan.items.map((item) => (
                <div className="resultSpinView__item" key={item.key}>
                  <div className="resultSpinView__thumb">
                    <img src={item.img || "data:,"} alt={item.name} width={44} height={44} loading="lazy" decoding="async" />
                  </div>
                  <div className="resultSpinView__name">{item.name}</div>
                </div>
              ))}
            </div>
            <div className="resultSpinView__center" aria-hidden="true"></div>
            <div className="resultSpinView__fade resultSpinView__fade--top" aria-hidden="true"></div>
            <div className="resultSpinView__fade resultSpinView__fade--bottom" aria-hidden="true"></div>
          </div>
        </div>
      );
    }

    if (viewKind === "single" && finalWinner) {
      return (
        <div className="resultSingleCard">
          <div className="resultSingleCard__thumb">
            <img src={finalWinner.img || "data:,"} alt={finalWinner.name} width={128} height={128} decoding="async" />
          </div>
          <div className="resultSingleCard__name">{finalWinner.name}</div>
          <div className="resultSingleCard__time">{formatArrivalTime(finalWinner.finishedAt)}</div>
        </div>
      );
    }

    if (viewKind === "summary") {
      return (
        <ol className="resultSummaryList">
          {state.items.map((item) => (
            <li key={`${item.rank}-${item.ballId}-${item.finishedAt}`} className={`resultSummaryList__item ${item.rank === 1 ? "is-top" : ""}`}>
              <span className="resultSummaryList__rank">#{item.rank}</span>
              <span className="resultSummaryList__name">{item.name}</span>
              <span className="resultSummaryList__time">{formatArrivalTime(item.finishedAt)}</span>
            </li>
          ))}
        </ol>
      );
    }

    return <div className="resultRevealWaiting">결과를 준비하고 있어요.</div>;
  };

  const renderFooter = () => {
    if (isSpinning) {
      return (
        <div className="resultModal__actions">
          <Button variant="ghost" type="button" buttonRef={skipButtonRef} onClick={onSkip}>
            바로 보기
          </Button>
        </div>
      );
    }

    return (
      <div className="resultModal__actions">
        <Button variant="ghost" className="resultModal__copy" type="button" onClick={onCopy}>
          결과 복사
        </Button>
        <Button variant="accent" type="button" buttonRef={restartButtonRef} onClick={onRestart}>
          다시 시작
        </Button>
        <Button variant="ghost" type="button" onClick={onClose}>
          닫기
        </Button>
      </div>
    );
  };

  return (
    <ModalCard size="md" title={title} onClose={onClose} footer={renderFooter()}>
      <div className="resultModal__body">
        {burstVisible ? (
          <div className="resultModal__burst winner__confetti" aria-hidden="true">
            <span className="c"></span>
            <span className="c"></span>
            <span className="c"></span>
            <span className="c"></span>
            <span className="c"></span>
            <span className="c"></span>
            <span className="c"></span>
            <span className="c"></span>
            <span className="c"></span>
            <span className="c"></span>
            <span className="c"></span>
            <span className="c"></span>
          </div>
        ) : null}
        {renderBody()}
      </div>
    </ModalCard>
  );
}
