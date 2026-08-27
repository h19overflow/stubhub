import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import ScrollTrigger from "gsap/ScrollTrigger";
import type { RefObject } from "react";

gsap.registerPlugin(useGSAP, ScrollTrigger);

export function useLandingMotion(scope: RefObject<HTMLElement | null>) {
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
    { scope },
  );
}
