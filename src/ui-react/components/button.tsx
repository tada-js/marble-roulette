import type { AriaAttributes, MouseEventHandler, ReactNode } from "react";

type ButtonVariant = "primary" | "ghost" | "danger" | "accent";
type ButtonSize = "sm" | "md" | "lg";

type ButtonProps = {
  id?: string;
  type?: "button" | "submit" | "reset";
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  disabled?: boolean;
  title?: string;
  ariaLabel?: string;
  ariaPressed?: boolean;
  ariaHasPopup?: AriaAttributes["aria-haspopup"];
  ariaExpanded?: boolean;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  children?: ReactNode;
};

type IconButtonProps = {
  id?: string;
  className?: string;
  disabled?: boolean;
  title?: string;
  ariaLabel: string;
  ariaHasPopup?: AriaAttributes["aria-haspopup"];
  ariaExpanded?: boolean;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  children?: ReactNode;
};

/**
 * Shared React button component using the project's CSS design tokens/variants.
 */
export function Button(props: ButtonProps) {
  const {
    id,
    type = "button",
    variant = "ghost",
    size = "md",
    className = "",
    disabled = false,
    title,
    ariaLabel,
    ariaPressed,
    ariaHasPopup,
    ariaExpanded,
    onClick,
    children,
  } = props;

  const variantClass =
    variant === "primary"
      ? "btn--primary"
      : variant === "danger"
        ? "btn--danger"
        : variant === "accent"
          ? "btn--accent"
          : "btn--ghost";
  const sizeClass = size === "sm" ? "btn--sm" : size === "lg" ? "btn--lg" : "btn--md";

  return (
    <button
      id={id}
      type={type}
      className={`btn ${variantClass} ${sizeClass} ${className}`.trim()}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      aria-pressed={ariaPressed}
      aria-haspopup={ariaHasPopup}
      aria-expanded={ariaExpanded}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/**
 * Icon-only button variant.
 */
export function IconButton(props: IconButtonProps) {
  const {
    id,
    className = "",
    disabled = false,
    title,
    ariaLabel,
    ariaHasPopup,
    ariaExpanded,
    onClick,
    children,
  } = props;

  return (
    <button
      id={id}
      type="button"
      className={`iconBtn ${className}`.trim()}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      aria-haspopup={ariaHasPopup}
      aria-expanded={ariaExpanded}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
