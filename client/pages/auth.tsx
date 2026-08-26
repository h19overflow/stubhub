import Head from "next/head";
import { Navbar } from "../components/ui/Navbar";
import { AuthForm } from "../features/auth/AuthForm";
import styles from "./auth.module.css";

const navigation = [
  { href: "/#market", label: "Marketplace" },
  { href: "/#selling", label: "Selling" },
  { href: "/#orders", label: "My orders" },
] as const;

export default function AuthPage() {
  return (
    <>
      <Head>
        <title>Sign in | StubHub Marketplace</title>
        <meta name="description" content="Sign in or create a StubHub marketplace account" />
      </Head>
      <Navbar items={navigation} />
      <main className={styles.main}>
        <AuthForm />
      </main>
    </>
  );
}
