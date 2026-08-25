import type { InputHTMLAttributes } from "react";
import styles from "./TextField.module.css";

type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id"> & {
  error?: string;
  hint?: string;
  id: string;
  label: string;
};

export function TextField({ error, hint, id, label, ...props }: TextFieldProps) {
  const messageId = error || hint ? `${id}-message` : undefined;

  return (
    <div className={styles.field}>
      <label htmlFor={id}>{label}</label>
      <div className={styles.inputShell}>
        <input
          aria-describedby={messageId}
          aria-invalid={error ? true : undefined}
          className={styles.input}
          id={id}
          {...props}
        />
      </div>
      {error ? (
        <p className={styles.error} id={messageId} role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className={styles.hint} id={messageId}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
