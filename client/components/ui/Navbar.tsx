import Link from "next/link";
import { useState } from "react";
import styles from "./Navbar.module.css";

type NavbarItem = {
  href: string;
  label: string;
};

type NavbarProps = {
  accountLabel?: string;
  items: readonly NavbarItem[];
};

export function Navbar({ accountLabel, items }: NavbarProps) {
  const [open, setOpen] = useState(false);

  return (
    <header className={styles.header}>
      <nav aria-label="Primary navigation" className={styles.navbar}>
        <Link className={styles.brand} href="/" onClick={() => setOpen(false)}>
          StubHub <span>lab</span>
        </Link>

        <ul className={styles.desktopLinks}>
          {items.map((item) => (
            <li key={item.href}>
              <Link href={item.href}>{item.label}</Link>
            </li>
          ))}
        </ul>

        <div className={styles.controls}>
          <span
            aria-label={accountLabel ? `Signed in as ${accountLabel}` : "Account"}
            className={styles.account}
            role="img"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <circle cx="12" cy="8" r="3.25" />
              <path d="M5.75 19c.5-3.25 2.75-5 6.25-5s5.75 1.75 6.25 5" />
            </svg>
          </span>

          <button
            aria-controls="primary-menu"
            aria-expanded={open}
            aria-label={open ? "Close navigation menu" : "Open navigation menu"}
            className={styles.menuButton}
            onClick={() => setOpen((current) => !current)}
            type="button"
          >
            <span aria-hidden="true" className={`${styles.menuIcon} ${open ? styles.menuIconOpen : ""}`}>
              <span />
              <span />
            </span>
          </button>
        </div>

        {open ? (
          <div className={styles.mobilePanel} id="primary-menu">
            <ul>
              {items.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} onClick={() => setOpen(false)}>
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </nav>
    </header>
  );
}
