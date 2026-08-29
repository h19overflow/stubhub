import Image from "next/image";
import { useRef } from "react";
import { ActionLink } from "../../components/ui/ActionLink";
import { EventCard } from "../../components/ui/EventCard";
import { Navbar } from "../../components/ui/Navbar";
import styles from "./SignedInLanding.module.css";
import { useLandingMotion } from "./useLandingMotion";
import { useSignOut } from "../../hooks/auth/useSignOut";

type SignedInLandingProps = {
  email: string;
};

const navigation = [
  { href: "/tickets", label: "Marketplace" },
  { href: "/tickets/new", label: "Selling" },
  { href: "/orders", label: "My orders" },
] as const;

const featuredEvents = [
  {
    date: "Jun 14, 2025",
    dateTime: "2025-06-14",
    imageAlt: "The National standing together beneath a stormy sky",
    imageSizes: "(max-width: 640px) 100vw, (max-width: 900px) 50vw, 58vw",
    imageSrc: "/images/night-signal/band/band-portrait.png",
    location: "New York, NY",
    title: "The National",
    venue: "Madison Square Garden",
  },
  {
    date: "May 18, 2025",
    dateTime: "2025-05-18",
    imageAlt: "A packed basketball arena viewed from the upper sideline",
    imagePosition: "center 54%",
    imageSizes: "(max-width: 640px) 100vw, (max-width: 900px) 50vw, 42vw",
    imageSrc: "/images/night-signal/arena/basketball-arena.png",
    location: "New York, NY",
    title: "Knicks vs. Celtics",
    venue: "Madison Square Garden",
  },
] as const;

export function SignedInLanding({ email }: SignedInLandingProps) {
  const landing = useRef<HTMLElement>(null);

  const onClickSignOut = useSignOut();
  
  useLandingMotion(landing);
  return (
    <>
      <Navbar accountLabel={email} items={navigation} onSignOut={onClickSignOut} />
      <main className={styles.main} ref={landing}>
        <section aria-labelledby="landing-title" className={styles.hero}>
          <div className={styles.heroMedia} data-hero-image>
            <Image
              alt=""
              className={styles.heroImage}
              fill
              preload
              sizes="(max-width: 640px) 100vw, 68vw"
              src="/images/night-signal/hero/hero-concert.png"
            />
          </div>

          <div className={styles.heroCopy} data-hero-copy>
            <h1 id="landing-title">
              <span>Find the night</span>{" "}
              <span>worth remembering.</span>
            </h1>
            <p>Discover and sell tickets to unforgettable live events.</p>
            <div className={styles.heroActions}>
              <ActionLink href="/tickets" variant="primary">
                Explore tickets
              </ActionLink>
              <ActionLink href="/tickets/new" variant="secondary">
                Sell a ticket
              </ActionLink>
            </div>
          </div>
        </section>

        <section
          aria-labelledby="featured-events-title"
          className={styles.featuredGrid}
          data-reveal-row
          id="market"
        >
          <h2 className={styles.visuallyHidden} id="featured-events-title">
            Featured events
          </h2>

          {featuredEvents.map((event) => (
            <EventCard key={`${event.title}-${event.dateTime}`} {...event} />
          ))}
        </section>

        <section aria-labelledby="night-guide-title" className={styles.lowerGrid} data-reveal-row>
          <h2 className={styles.visuallyHidden} id="night-guide-title">
            Plan your next night out
          </h2>

          <section aria-labelledby="event-list-title" className={styles.eventList} data-reveal id="selling">
            <h3 className={styles.visuallyHidden} id="event-list-title">
              More upcoming events
            </h3>

            <details name="event-list">
              <summary>
                <span>Lana Del Rey</span>
                <time dateTime="2025-05-30">May 30, 2025</time>
              </summary>
            </details>

            <details name="event-list" open>
              <summary>
                <span>Tyler, The Creator</span>
                <time dateTime="2025-06-06">Jun 6, 2025</time>
              </summary>
              <div className={styles.performerMedia}>
                <Image
                  alt="A performer silhouetted above a live concert crowd"
                  className={styles.performerImage}
                  data-reveal-image
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 900px) 50vw, 33vw"
                  src="/images/night-signal/hero/hero-concert.png"
                />
              </div>
            </details>

            <details name="event-list">
              <summary>
                <span>Sabrina Carpenter</span>
                <time dateTime="2025-06-21">Jun 21, 2025</time>
              </summary>
            </details>

            <details name="event-list">
              <summary>
                <span>ODESZA</span>
                <time dateTime="2025-07-12">Jul 12, 2025</time>
              </summary>
            </details>
          </section>

          <section aria-labelledby="venues-title" className={styles.venues} data-reveal>
            <h3 id="venues-title">Trusted venues</h3>
            <p>
              Madison Square Garden&nbsp; • &nbsp;Barclays Center&nbsp; • &nbsp;Fenway Park&nbsp; •
              &nbsp;Hollywood Bowl&nbsp; • &nbsp;United Center&nbsp; • &nbsp;Red Rocks Amphitheatre&nbsp; •
              &nbsp;The Forum&nbsp; • &nbsp;Bridgestone Arena
            </p>
          </section>

          <figure className={styles.testimonial} data-reveal id="orders">
            <span aria-hidden="true" className={styles.quoteMark}>
              “
            </span>
            <blockquote>
              “Got my tickets in seconds and the seats were even better than I expected. StubHub lab makes it easy
              to go to the best events.”
            </blockquote>
            <figcaption>
              <strong>Jasmine R.</strong>
              <span>Brooklyn, NY</span>
            </figcaption>
          </figure>
        </section>
      </main>
    </>
  );
}
