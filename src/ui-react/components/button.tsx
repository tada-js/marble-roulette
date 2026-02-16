import type { AriaAttributes, MouseEventHandler, ReactNode } from "react";

type ButtonVariant = "primary" | "ghost" | "danger" | "accent";
type ButtonSize = "sm" | "md" | "lg";
type ButtonWidth = "auto" | "sm" | "md" | "lg" | "full";

type ButtonProps = {
  id?: string;
  type?: "button" | "submit" | "reset";
  variant?: ButtonVariant;
  size?: ButtonSize;
  width?: ButtonWidth;
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
  ariaPressed?: boolean;
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
    width = "auto",
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
  const widthClass =
    width === "sm"
      ? "btn--w-sm"
      : width === "md"
        ? "btn--w-md"
        : width === "lg"
          ? "btn--w-lg"
          : width === "full"
            ? "btn--w-full"
            : "";

  return (
    <button
      id={id}
      type={type}
      className={`btn ${variantClass} ${sizeClass} ${widthClass} ${className}`.trim()}
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
    ariaPressed,
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
      aria-pressed={ariaPressed}
      aria-haspopup={ariaHasPopup}
      aria-expanded={ariaExpanded}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
