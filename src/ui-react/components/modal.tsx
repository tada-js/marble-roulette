import type { ReactNode } from "react";
import { IconButton } from "./button";

type ModalCardProps = {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  closeLabel?: string;
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
  } = props;

  return (
    <div className={`twModal__card ${className}`.trim()}>
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
