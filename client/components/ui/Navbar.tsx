import Link from "next/link";
import { useState } from "react";
import { Button } from "../primitives/Button";
import styles from "./Navbar.module.css";

// Each item describes one destination. The parent decides which links the navbar shows.
type NavbarItem = {
  href: string;
  label: string;
};

// Props are the component's public inputs. `accountLabel` is optional; `items` is required.
type NavbarProps = {
  accountLabel?: string;
  items: readonly NavbarItem[];
};

// The parent passes props in JSX. Destructuring gives us the two values by name.
export function Navbar({ accountLabel, items }: NavbarProps) {
  // State belongs to this navbar because only this component needs to know whether its menu is open.
  const [open, setOpen] = useState(false);

  return (
    <header className={styles.header}>
      <nav aria-label="Primary navigation" className={styles.navbar}>
        <div className={styles.bar}>
          {/* `Link` changes routes in the browser without doing a full page reload. */}
          <Link className={styles.brand} href="/" onClick={() => setOpen(false)}>
            StubHub<span>lab</span>
          </Link>

          <div className={styles.controls}>
            {/* Optional props can conditionally render UI. No label means no account text. */}
            {accountLabel ? <span className={styles.account}>{accountLabel}</span> : null}
            {/* The button updates `open`; the ARIA props expose the same state to assistive technology. */}
            <Button
              aria-controls="primary-menu"
              aria-expanded={open}
              aria-label={open ? "Close navigation" : "Open navigation"}
              className={styles.menuButton}
              onClick={() => setOpen((current) => !current)}
              variant="ghost"
            >
              <span aria-hidden="true" className={`${styles.menuIcon} ${open ? styles.menuIconOpen : ""}`}>
                <span />
                <span />
              </span>
              Menu
            </Button>
          </div>
        </div>

        {/* Conditional rendering mounts the menu only while `open` is true. */}
        {open ? (
          <div className={styles.menu} id="primary-menu">
            <p className={styles.menuLabel}>Navigate</p>
            <div className={styles.links}>
              {/* One data item becomes one link. `key` lets React track each rendered item. */}
              {items.map((item, index) => (
                <Link
                  className={styles.link}
                  href={item.href}
                  key={item.href}
                  onClick={() => setOpen(false)}
                  style={{ animationDelay: `${index * 70}ms` }}
                >
                  <span>0{index + 1}</span>
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        ) : null}
      </nav>
    </header>
  );
}
