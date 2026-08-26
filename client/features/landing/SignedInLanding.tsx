import Link from "next/link";
import { Navbar } from "../../components/ui/Navbar";
import styles from "./SignedInLanding.module.css";

type SignedInLandingProps = {
  email: string;
};

function displayNameFromEmail(email: string) {
  return email
    .slice(0, email.lastIndexOf("@"))
    .replace(/[._+-]+/g, " ")
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

// Hash links such as `#market` scroll to an element with the matching `id`.
const navigation = [
  { href: "#market", label: "Marketplace" },
  { href: "#selling", label: "Selling" },
  { href: "#orders", label: "My orders" },
  { href: "/auth", label: "Auth shell" },
] as const;

const highlights = [
  { detail: "Friday · 8:00 PM", label: "The National", meta: "Brooklyn, NY" },
  { detail: "Sunday · 7:30 PM", label: "Knicks vs. Celtics", meta: "New York, NY" },
] as const;

export function SignedInLanding({ email }: SignedInLandingProps) {
  const displayName = displayNameFromEmail(email);
  return (
    <>
      <Navbar accountLabel={email} items={navigation} />
      <main className={styles.main}>
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>Welcome back</p>
            <h1>{displayName}, your next great night starts here.</h1>
            <p className={styles.lead}>
              Discover tickets, manage listings, and keep every order in one calm place.
            </p>
            <Link className={styles.primaryLink} href="#market">
              Browse the market <span aria-hidden="true">↘</span>
            </Link>
          </div>

          <div className={styles.spotlightShell}>
            <article className={styles.spotlight}>
              <div>
                <p>Tonight&apos;s spotlight</p>
                <h2>Live music under the city lights.</h2>
              </div>
              <span>Brooklyn · 20:00</span>
            </article>
          </div>
        </section>

        <section aria-labelledby="market-heading" className={styles.market} id="market">
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.eyebrow}>Curated near you</p>
              <h2 id="market-heading">Worth leaving home for.</h2>
            </div>
            <p>Demo content for the future ticket discovery experience.</p>
          </div>

          <div className={styles.eventGrid}>
            {highlights.map((event, index) => (
              <article className={styles.eventShell} key={event.label}>
                <div className={styles.eventCard}>
                  <span>0{index + 1}</span>
                  <div>
                    <p>{event.detail}</p>
                    <h3>{event.label}</h3>
                    <p>{event.meta}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.utilityGrid}>
          <article id="selling">
            <p className={styles.eyebrow}>Selling</p>
            <h2>Turn an extra seat into someone&apos;s best night.</h2>
            <Link href="/auth">Create a listing later</Link>
          </article>
          <article id="orders">
            <p className={styles.eyebrow}>My orders</p>
            <h2>No active orders in this demo account.</h2>
            <span>Order history will live here.</span>
          </article>
        </section>
      </main>
    </>
  );
}
