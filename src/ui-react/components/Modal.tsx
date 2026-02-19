import type { ReactNode } from "react";
import { useI18n } from "../../i18n/react";
import { IconButton } from "./Button";

type ModalCardSize = "sm" | "md" | "lg" | "xl";

const MODAL_CARD_SIZE_CLASS: Record<ModalCardSize, string> = {
  sm: "twModal__card--sm",
  md: "twModal__card--md",
  lg: "twModal__card--lg",
  xl: "twModal__card--xl",
};

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
  const { t } = useI18n();
  const {
    title,
    description = "",
    onClose,
    children,
    footer,
    className = "",
    closeLabel = t("common.close"),
    size = "lg",
  } = props;

  const sizeClass = MODAL_CARD_SIZE_CLASS[size];

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
