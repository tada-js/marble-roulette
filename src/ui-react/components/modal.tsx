import type { ReactNode } from "react";
import { IconButton } from "./button";

type ModalCardSize = "sm" | "md" | "lg" | "xl";

type ModalCardProps = {
  title: ReactNode;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  closeLabel?: string;
  size?: ModalCardSize;
};

/**
 * Reusable modal card shell for header/body/footer consistency.
 */
export function ModalCard(props: ModalCardProps) {
  const {
    title,
    description = "",
    onClose,
    children,
    footer,
    className = "",
    closeLabel = "닫기",
    size = "lg",
  } = props;

  const sizeClass =
    size === "sm"
      ? "twModal__card--sm"
      : size === "md"
        ? "twModal__card--md"
        : size === "xl"
          ? "twModal__card--xl"
          : "twModal__card--lg";

  return (
    <div className={`twModal__card ${sizeClass} ${className}`.trim()}>
      <div className="twModal__header">
        <div className="twModal__headText">
          <div className="twModal__title">{title}</div>
          {description ? <div className="twModal__desc">{description}</div> : null}
        </div>
        <IconButton className="twModal__close" ariaLabel={closeLabel} title={closeLabel} onClick={onClose}>
          <span aria-hidden="true">×</span>
        </IconButton>
      </div>

      <div className="twModal__body">{children}</div>

      {footer ? <div className="twModal__footer">{footer}</div> : null}
    </div>
  );
}
