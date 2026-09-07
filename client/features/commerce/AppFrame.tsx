import type { ReactNode } from "react";
import { Navbar } from "../../components/ui/Navbar";
import { useSignOut } from "../../hooks/auth/useSignOut";
import type { Currency } from "../../lib/api/commerce-types";
import styles from "./AppFrame.module.css";

const navigation = [
  { href: "/tickets", label: "Explore" },
  { href: "/tickets/new", label: "Sell" },
  { href: "/tickets/mine", label: "My tickets" },
  { href: "/orders", label: "My orders" },
] as const;

export function AppFrame({ children }: { children: ReactNode }) {
  const signOut = useSignOut();
  return (
    <>
      <Navbar items={navigation} onSignOut={signOut} />
      <main className={styles.main}>{children}</main>
    </>
  );
}

export { formatDate, formatMoney } from "../../lib/format";
