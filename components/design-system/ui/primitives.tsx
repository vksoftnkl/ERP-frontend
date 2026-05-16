import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  LabelHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { cx } from "@/components/design-system/cx";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
};

export function Button({
  variant = "primary",
  size = "md",
  block = false,
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      className={cx(
        "ui-btn",
        `ui-btn--${variant}`,
        size !== "md" && `ui-btn--${size}`,
        block && "ui-btn--block",
        className,
      )}
      {...props}
    />
  );
}

export type CardProps = HTMLAttributes<HTMLElement> & {
  as?: "article" | "section" | "div";
};

export function Card({ as = "article", className, ...props }: CardProps) {
  const Component = as;
  return <Component className={cx("ui-card", className)} {...props} />;
}

export type CardSectionProps = HTMLAttributes<HTMLDivElement>;

export function CardHead({ className, ...props }: CardSectionProps) {
  return <div className={cx("ui-card__head", className)} {...props} />;
}

export function CardBody({ className, ...props }: CardSectionProps) {
  return <div className={cx("ui-card__body", className)} {...props} />;
}

export function CardFoot({ className, ...props }: CardSectionProps) {
  return <div className={cx("ui-card__foot", className)} {...props} />;
}

export type CardTitleProps = HTMLAttributes<HTMLHeadingElement>;

export function CardTitle({ className, ...props }: CardTitleProps) {
  return <h3 className={cx("ui-card__title", className)} {...props} />;
}

export type CardDescriptionProps = HTMLAttributes<HTMLParagraphElement>;

export function CardDescription({ className, ...props }: CardDescriptionProps) {
  return <p className={cx("ui-card__description", className)} {...props} />;
}

export type FieldProps = HTMLAttributes<HTMLDivElement>;

export function Field({ className, ...props }: FieldProps) {
  return <div className={cx("ui-field", className)} {...props} />;
}

export type LabelProps = LabelHTMLAttributes<HTMLLabelElement>;

export function Label({ className, ...props }: LabelProps) {
  return <label className={cx("ui-label", className)} {...props} />;
}

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export function Input({ className, ...props }: InputProps) {
  return <input className={cx("ui-input", className)} {...props} autoComplete="off" />;
}

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

export function Select({ className, ...props }: SelectProps) {
  return <select className={cx("ui-select", className)} {...props} />;
}

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export function Textarea({ className, ...props }: TextareaProps) {
  return <textarea className={cx("ui-textarea", className)} {...props} autoComplete="off" />;
}

export type FieldHelpProps = HTMLAttributes<HTMLParagraphElement>;

export function FieldHelp({ className, ...props }: FieldHelpProps) {
  return <p className={cx("ui-help", className)} {...props} />;
}

export type FieldErrorProps = HTMLAttributes<HTMLParagraphElement>;

export function FieldError({ className, ...props }: FieldErrorProps) {
  return <p className={cx("ui-error", className)} {...props} />;
}

type BadgeVariant = "neutral" | "info" | "success" | "warning" | "danger";

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: BadgeVariant;
};

export function Badge({ variant = "neutral", className, ...props }: BadgeProps) {
  return <span className={cx("ui-badge", `ui-badge--${variant}`, className)} {...props} />;
}

type AlertKind = "info" | "success" | "warning" | "danger";

export type AlertProps = HTMLAttributes<HTMLDivElement> & {
  kind?: AlertKind;
  title: ReactNode;
};

export function Alert({ kind = "info", title, className, children, ...props }: AlertProps) {
  return (
    <div className={cx("ui-alert", `ui-alert--${kind}`, className)} role="status" {...props}>
      <p className="ui-alert__title">{title}</p>
      {children ? <p className="ui-alert__description">{children}</p> : null}
    </div>
  );
}

type TrendDirection = "up" | "down" | "flat";

export type KpiProps = HTMLAttributes<HTMLDivElement> & {
  label: ReactNode;
  value: ReactNode;
  trend?: ReactNode;
  trendDirection?: TrendDirection;
};

export function Kpi({
  label,
  value,
  trend,
  trendDirection = "flat",
  className,
  ...props
}: KpiProps) {
  return (
    <article className={cx("ui-kpi", className)} {...props}>
      <p className="ui-kpi__label">{label}</p>
      <p className="ui-kpi__value">{value}</p>
      {trend ? (
        <p
          className={cx(
            "ui-kpi__trend",
            trendDirection !== "flat" && `ui-kpi__trend--${trendDirection}`,
          )}
        >
          {trend}
        </p>
      ) : null}
    </article>
  );
}

export type NavBarProps = HTMLAttributes<HTMLElement> & {
  actions?: ReactNode;
};

export function NavBar({ className, actions, children, ...props }: NavBarProps) {
  return (
    <nav className={cx("ui-navbar", className)} {...props}>
      {children}
      {actions}
    </nav>
  );
}

export type NavLinksProps = HTMLAttributes<HTMLDivElement>;

export function NavLinks({ className, ...props }: NavLinksProps) {
  return <div className={cx("ui-navlinks", className)} {...props} />;
}

export type NavLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  active?: boolean;
};

export function NavLink({ active = false, className, ...props }: NavLinkProps) {
  return <a className={cx("ui-navlink", active && "ui-navlink--active", className)} {...props} />;
}
