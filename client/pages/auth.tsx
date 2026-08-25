import Head from "next/head";
import { Navbar } from "../components/ui/Navbar";
import { AuthForm } from "../features/auth/AuthForm";
import styles from "./auth.module.css";

// Route configuration is plain data. It is passed to Navbar through the `items` prop below.
const navigation = [
  { href: "/", label: "Demo home" },
  { href: "/auth", label: "Authentication" },
] as const;

// The filename `pages/auth.tsx` makes this component available at `/auth`.
export default function AuthPage() {
  return (
    <>
      <Head>
        <title>Sign in | StubHub Marketplace</title>
        <meta name="description" content="Sign in or create a StubHub marketplace account" />
      </Head>
      {/* `items={navigation}` passes the array above from this parent into Navbar. */}
      <Navbar items={navigation} />
      <main className={styles.main}>
        <aside className={styles.context}>
          <p className={styles.eyebrow}>One account. Every side of the market.</p>
          <h2>List the seat. Find the show. Keep the night moving.</h2>
          <dl>
            <div>
              <dt>01</dt>
              <dd>Buy and sell with the same identity.</dd>
            </div>
            <div>
              <dt>02</dt>
              <dd>Track reservations and purchases in one place.</dd>
            </div>
            <div>
              <dt>03</dt>
              <dd>Verify sensitive sign-ins by email code.</dd>
            </div>
          </dl>
        </aside>
        {/* AuthForm currently needs no props, so it is rendered without JSX attributes. */}
        <AuthForm />
      </main>
    </>
  );
}
