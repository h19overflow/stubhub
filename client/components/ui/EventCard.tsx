import Image from "next/image";
import type { ComponentProps } from "react";
import styles from "./EventCard.module.css";

type EventCardProps = {
  date: string;
  dateTime: string;
  imageAlt: string;
  imagePosition?: string;
  imageSizes: string;
  imageSrc: ComponentProps<typeof Image>["src"];
  location: string;
  title: string;
  venue: string;
};

export function EventCard({
  date,
  dateTime,
  imageAlt,
  imagePosition,
  imageSizes,
  imageSrc,
  location,
  title,
  venue,
}: EventCardProps) {
  return (
    <article className={styles.card} data-reveal>
      <Image
        alt={imageAlt}
        className={styles.image}
        data-reveal-image
        fill
        sizes={imageSizes}
        src={imageSrc}
        style={imagePosition ? { objectPosition: imagePosition } : undefined}
      />
      <div className={styles.shade} />
      <div className={styles.copy}>
        <h3>{title}</h3>
        <p>
          <time dateTime={dateTime}>{date}</time> · {location} · {venue}
        </p>
      </div>
    </article>
  );
}
