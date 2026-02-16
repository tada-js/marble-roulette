/**
 * Shared React button component using the project's CSS design tokens/variants.
 *
 * @param {{
 *   id?: string;
 *   type?: "button" | "submit" | "reset";
 *   variant?: "primary" | "ghost" | "danger" | "accent";
 *   size?: "sm" | "md" | "lg";
 *   className?: string;
 *   disabled?: boolean;
 *   title?: string;
 *   ariaLabel?: string;
 *   ariaPressed?: boolean;
 *   ariaHasPopup?: string;
 *   ariaExpanded?: boolean;
 *   onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
 *   children?: import("react").ReactNode;
 * }} props
 */
export function Button(props) {
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
 *
 * @param {{
 *   id?: string;
 *   className?: string;
 *   disabled?: boolean;
 *   title?: string;
 *   ariaLabel: string;
 *   ariaHasPopup?: string;
 *   ariaExpanded?: boolean;
 *   onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
 *   children?: import("react").ReactNode;
 * }} props
 */
export function IconButton(props) {
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
