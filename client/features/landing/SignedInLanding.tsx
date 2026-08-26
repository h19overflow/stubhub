import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import ScrollTrigger from "gsap/ScrollTrigger";
import Image from "next/image";
import Link from "next/link";
import { useRef } from "react";
import { Navbar } from "../../components/ui/Navbar";
import styles from "./SignedInLanding.module.css";

gsap.registerPlugin(useGSAP, ScrollTrigger);

type SignedInLandingProps = {
  email: string;
};

const navigation = [
  { href: "#market", label: "Marketplace" },
  { href: "#selling", label: "Selling" },
  { href: "#orders", label: "My orders" },
] as const;

export function SignedInLanding({ email }: SignedInLandingProps) {
  const landing = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

      gsap
        .timeline({ defaults: { ease: "power3.out" } })
        .fromTo(
          "[data-hero-copy] > *",
          { autoAlpha: 0, y: 24 },
          {
            autoAlpha: 1,
            clearProps: "opacity,visibility,transform",
            duration: 0.72,
            stagger: 0.08,
            y: 0,
          },
        )
        .fromTo(
          "[data-hero-image]",
          { autoAlpha: 0, scale: 1.035 },
          {
            autoAlpha: 1,
            clearProps: "opacity,visibility,transform",
            duration: 1.05,
            scale: 1,
          },
          0,
        );

      gsap.utils.toArray<HTMLElement>("[data-reveal-row]").forEach((row) => {
        const items = row.querySelectorAll<HTMLElement>("[data-reveal]");
        const images = row.querySelectorAll<HTMLElement>("[data-reveal-image]");

        gsap
          .timeline({
            scrollTrigger: {
              once: true,
              start: "top 92%",
              trigger: row,
            },
          })
          .fromTo(
            items,
            { autoAlpha: 0, y: 22 },
            {
              autoAlpha: 1,
              clearProps: "opacity,visibility,transform",
              duration: 0.7,
              ease: "power3.out",
              stagger: 0.08,
              y: 0,
            },
          )
          .fromTo(
            images,
            { scale: 0.96 },
            {
              clearProps: "transform",
              duration: 0.9,
              ease: "power3.out",
              scale: 1,
              stagger: 0.08,
            },
            0,
          );
      });
    },
    { scope: landing },
  );

  return (
    <>
      <Navbar accountLabel={email} items={navigation} />
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
              <Link className={styles.primaryAction} href="#market">
                Explore tickets
              </Link>
              <Link className={styles.secondaryAction} href="#selling">
                Sell a ticket
              </Link>
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

          <article className={styles.eventCard} data-reveal>
            <Image
              alt="The National standing together beneath a stormy sky"
              className={styles.eventImage}
              data-reveal-image
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 900px) 50vw, 58vw"
              src="/images/night-signal/band/band-portrait.png"
            />
            <div className={styles.eventShade} />
            <div className={styles.eventCopy}>
              <h3>The National</h3>
              <p>
                <time dateTime="2025-06-14">Jun 14, 2025</time> · New York, NY · Madison Square Garden
              </p>
            </div>
          </article>

          <article className={styles.eventCard} data-reveal>
            <Image
              alt="A packed basketball arena viewed from the upper sideline"
              className={styles.eventImage}
              data-reveal-image
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 900px) 50vw, 42vw"
              src="/images/night-signal/arena/basketball-arena.png"
            />
            <div className={styles.eventShade} />
            <div className={styles.eventCopy}>
              <h3>Knicks vs. Celtics</h3>
              <p>
                <time dateTime="2025-05-18">May 18, 2025</time> · New York, NY · Madison Square Garden
              </p>
            </div>
          </article>
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
