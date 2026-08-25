import type { ButtonHTMLAttributes } from "react";
import styles from "./Button.module.css";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  fullWidth?: boolean;
  variant?: "primary" | "secondary" | "ghost";
};

export function Button({
  className = "",
  fullWidth = false,
  type = "button",
  variant = "primary",
  ...props
}: ButtonProps) {
  return (
    <button
      className={`${styles.button} ${styles[variant]} ${fullWidth ? styles.fullWidth : ""} ${className}`}
      type={type}
      {...props}
    />
  );
}
