import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import styles from "./ActionLink.module.css";

type ActionLinkProps = {
  children: ReactNode;
  href: ComponentProps<typeof Link>["href"];
  variant: "primary" | "secondary";
};

export function ActionLink({ children, href, variant }: ActionLinkProps) {
  const variantClassName = variant === "primary" ? styles.primary : styles.secondary;

  return (
    <Link className={`${styles.action} ${variantClassName}`} href={href}>
      {children}
    </Link>
  );
}
