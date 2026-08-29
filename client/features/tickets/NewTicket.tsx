import { useRouter } from "next/router";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { Button } from "../../components/primitives/Button";
import { TextField } from "../../components/primitives/TextField";
import { useCreateTicket } from "../../hooks/tickets/useCreateTicket";
import { AppFrame } from "../commerce/AppFrame";
import styles from "./TicketsViews.module.css";

type Fields = {
  eventName: string;
  description: string;
  eventStartsAt: string;
  eventEndsAt: string;
  ticketInfo: string;
  place: string;
  price: string;
};

function listingFields(data: FormData) {
  return Object.fromEntries(
    ["eventName", "description", "eventStartsAt", "eventEndsAt", "ticketInfo", "place", "price"].map(
      (key) => [key, String(data.get(key) ?? "").trim()],
    ),
  ) as Fields;
}

function listingErrors(value: Fields, image: FormDataEntryValue | null) {
  const errors: Record<string, string> = {};
  if (!value.eventName) errors.eventName = "Event name is required.";
  if (!value.description) errors.description = "Description is required.";
  if (!value.eventStartsAt) errors.eventStartsAt = "Start date and time are required.";
  if (!value.ticketInfo) errors.ticketInfo = "Ticket information is required.";
  if (!value.place) errors.place = "Place is required.";
  if (!(Number(value.price) > 0)) errors.price = "Enter a positive price.";
  if (!(image instanceof File) || image.size === 0) {
    errors.image = "Choose one JPEG, PNG, or WebP image.";
  }
  if (value.eventEndsAt && Date.parse(value.eventEndsAt) <= Date.parse(value.eventStartsAt)) {
    errors.eventEndsAt = "End must be after start.";
  }
  return errors;
}

export function NewTicket() {
  const router = useRouter();
  const creation = useCreateTicket();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState("");

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const value = listingFields(data);
    const image = data.get("image");
    const nextErrors = listingErrors(value, image);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length || !(image instanceof File)) return;

    try {
      const ticket = await creation.submit({
        ...value,
        eventStartsAt: new Date(value.eventStartsAt).toISOString(),
        eventEndsAt: value.eventEndsAt ? new Date(value.eventEndsAt).toISOString() : undefined,
        priceCents: Math.round(Number(value.price) * 100),
        image,
      });
      await router.push(`/tickets/${ticket.id}`);
    } catch {}
  }

  function selectImage(file: File | undefined) {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(file ? URL.createObjectURL(file) : "");
  }

  return (
    <AppFrame>
      <header className={styles.heading}>
        <p className={styles.eyebrow}>New listing</p>
        <h1>Sell a ticket</h1>
        <p>Tickets validates the listing and uploaded image.</p>
      </header>
      <form className={styles.createForm} onSubmit={submit} noValidate>
        <TextField
          error={errors.eventName}
          id="eventName"
          label="Event name"
          maxLength={120}
          name="eventName"
          required
        />
        <label>
          Description
          <textarea
            aria-invalid={errors.description ? true : undefined}
            maxLength={2000}
            name="description"
            required
          />
        </label>
        {errors.description ? <p className={styles.error}>{errors.description}</p> : null}
        <TextField
          error={errors.eventStartsAt}
          id="eventStartsAt"
          label="Event starts"
          name="eventStartsAt"
          required
          type="datetime-local"
        />
        <TextField
          error={errors.eventEndsAt}
          id="eventEndsAt"
          label="Event ends (optional)"
          name="eventEndsAt"
          type="datetime-local"
        />
        <label>
          Ticket information
          <textarea
            aria-invalid={errors.ticketInfo ? true : undefined}
            maxLength={1000}
            name="ticketInfo"
            required
          />
        </label>
        {errors.ticketInfo ? <p className={styles.error}>{errors.ticketInfo}</p> : null}
        <TextField
          error={errors.place}
          id="place"
          label="Venue and city"
          maxLength={200}
          name="place"
          required
        />
        <TextField
          error={errors.price}
          id="price"
          label="Price (USD)"
          min="0.01"
          name="price"
          required
          step="0.01"
          type="number"
        />
        <label>
          Listing image
          <input
            accept="image/jpeg,image/png,image/webp"
            aria-invalid={errors.image ? true : undefined}
            name="image"
            onChange={(event) => selectImage(event.target.files?.[0])}
            required
            type="file"
          />
        </label>
        {errors.image ? <p className={styles.error}>{errors.image}</p> : null}
        {preview ? (
          <img alt="Selected listing preview" className={styles.preview} src={preview} />
        ) : null}
        {creation.error ? (
          <p aria-live="polite" className={styles.error}>
            {creation.error}
          </p>
        ) : null}
        <Button disabled={creation.state === "submitting"} type="submit">
          {creation.state === "submitting" ? "Creating…" : "Create listing"}
        </Button>
      </form>
    </AppFrame>
  );
}
