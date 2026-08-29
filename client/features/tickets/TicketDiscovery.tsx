import { useRouter } from "next/router";
import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { Button } from "../../components/primitives/Button";
import { TextField } from "../../components/primitives/TextField";
import { useTickets } from "../../hooks/tickets/useTickets";
import type { TicketFilters } from "../../lib/api/tickets/types";
import { AppFrame } from "../commerce/AppFrame";
import { Feedback } from "./Feedback";
import { TicketCard } from "./TicketCard";
import styles from "./TicketsViews.module.css";

type Query = Record<string, string | string[] | undefined>;

function queryValue(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

function dayBoundary(value: string, endOfDay: boolean) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const timestamp = `${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`;
  const date = new Date(timestamp);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

function positiveInteger(value: string) {
  if (!value) return undefined;
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function discoveryFilters(query: Query, page: number) {
  const startsAfterInput = queryValue(query.startsAfter);
  const startsBeforeInput = queryValue(query.startsBefore);
  const minPriceCents = positiveInteger(queryValue(query.minPriceCents));
  const maxPriceCents = positiveInteger(queryValue(query.maxPriceCents));
  const startsAfter = startsAfterInput ? dayBoundary(startsAfterInput, false) : undefined;
  const startsBefore = startsBeforeInput ? dayBoundary(startsBeforeInput, true) : undefined;
  const invalid =
    minPriceCents === null ||
    maxPriceCents === null ||
    (startsAfterInput !== "" && startsAfter === null) ||
    (startsBeforeInput !== "" && startsBefore === null);

  const filters: TicketFilters = {
    q: queryValue(query.q) || undefined,
    place: queryValue(query.place) || undefined,
    startsAfter: startsAfter ?? undefined,
    startsBefore: startsBefore ?? undefined,
    minPriceCents: minPriceCents ?? undefined,
    maxPriceCents: maxPriceCents ?? undefined,
    page,
  };

  return {
    filters,
    error: invalid ? "The URL contains an invalid date or price filter." : "",
  };
}

export function TicketDiscovery() {
  const router = useRouter();
  const page = positiveInteger(queryValue(router.query.page)) ?? 1;
  const parsed = useMemo(
    () => discoveryFilters(router.query, page),
    [router.query, page],
  );
  const { state, reload } = useTickets(parsed.filters, router.isReady && !parsed.error);
  const [filterError, setFilterError] = useState("");

  function filter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const startsAfter = String(data.get("startsAfter") ?? "");
    const startsBefore = String(data.get("startsBefore") ?? "");
    const minPrice = String(data.get("minPrice") ?? "").trim();
    const maxPrice = String(data.get("maxPrice") ?? "").trim();
    const minPriceNumber = minPrice ? Number(minPrice) : undefined;
    const maxPriceNumber = maxPrice ? Number(maxPrice) : undefined;
    const minPriceCents = minPriceNumber === undefined ? undefined : Math.round(minPriceNumber * 100);
    const maxPriceCents = maxPriceNumber === undefined ? undefined : Math.round(maxPriceNumber * 100);

    if (
      (minPriceNumber !== undefined && (!Number.isFinite(minPriceNumber) || minPriceNumber <= 0)) ||
      (maxPriceNumber !== undefined && (!Number.isFinite(maxPriceNumber) || maxPriceNumber <= 0)) ||
      (minPriceCents !== undefined && !Number.isSafeInteger(minPriceCents)) ||
      (maxPriceCents !== undefined && !Number.isSafeInteger(maxPriceCents))
    ) {
      setFilterError("Prices must be positive numbers with no more than two decimal places.");
      return;
    }
    if (minPriceCents !== undefined && maxPriceCents !== undefined && minPriceCents > maxPriceCents) {
      setFilterError("Minimum price cannot exceed maximum price.");
      return;
    }
    if (startsAfter && startsBefore && startsAfter > startsBefore) {
      setFilterError("The start date cannot be after the end date.");
      return;
    }

    const nextQuery: Record<string, string> = {};
    for (const name of ["q", "place", "startsAfter", "startsBefore"]) {
      const value = String(data.get(name) ?? "").trim();
      if (value) nextQuery[name] = value;
    }
    if (minPriceCents !== undefined) nextQuery.minPriceCents = String(minPriceCents);
    if (maxPriceCents !== undefined) nextQuery.maxPriceCents = String(maxPriceCents);

    setFilterError("");
    void router.push({ pathname: "/tickets", query: nextQuery });
  }

  const queryError = filterError || parsed.error;
  const currentQuery = router.query;

  return (
    <AppFrame>
      <header className={styles.heading}>
        <p className={styles.eyebrow}>Live inventory</p>
        <h1>Find tickets</h1>
        <p>Availability and prices come directly from Tickets.</p>
      </header>
      <form className={styles.filters} onSubmit={filter}>
        <TextField
          defaultValue={queryValue(currentQuery.q)}
          id="q"
          label="Search"
          name="q"
          placeholder="Event, venue, ticket details"
        />
        <TextField
          defaultValue={queryValue(currentQuery.place)}
          id="place"
          label="Place"
          name="place"
        />
        <TextField
          defaultValue={queryValue(currentQuery.startsAfter)}
          id="startsAfter"
          label="Starts after"
          name="startsAfter"
          type="date"
        />
        <TextField
          defaultValue={queryValue(currentQuery.startsBefore)}
          id="startsBefore"
          label="Starts before"
          name="startsBefore"
          type="date"
        />
        <TextField
          defaultValue={
            queryValue(currentQuery.minPriceCents)
              ? Number(queryValue(currentQuery.minPriceCents)) / 100
              : undefined
          }
          id="minPrice"
          label="Minimum price"
          min="0.01"
          name="minPrice"
          step="0.01"
          type="number"
        />
        <TextField
          defaultValue={
            queryValue(currentQuery.maxPriceCents)
              ? Number(queryValue(currentQuery.maxPriceCents)) / 100
              : undefined
          }
          id="maxPrice"
          label="Maximum price"
          min="0.01"
          name="maxPrice"
          step="0.01"
          type="number"
        />
        <Button type="submit">Apply filters</Button>
      </form>
      {queryError ? (
        <Feedback message={queryError} />
      ) : state.status === "loading" ? (
        <Feedback message="Loading current ticket availability…" />
      ) : state.status === "error" ? (
        <Feedback message={state.message} retry={() => void reload()} />
      ) : state.data.tickets.length === 0 ? (
        <Feedback message="No available tickets match these filters." />
      ) : (
        <>
          <div className={styles.grid}>
            {state.data.tickets.map((ticket) => (
              <TicketCard key={ticket.id} ticket={ticket} />
            ))}
          </div>
          <nav aria-label="Ticket pages" className={styles.pagination}>
            <Button
              disabled={page <= 1}
              onClick={() =>
                void router.push({
                  pathname: "/tickets",
                  query: { ...currentQuery, page: page - 1 },
                })
              }
              variant="secondary"
            >
              Previous
            </Button>
            <span>
              Page {state.data.pagination.page} of{" "}
              {Math.max(1, state.data.pagination.totalPages)}
            </span>
            <Button
              disabled={page >= state.data.pagination.totalPages}
              onClick={() =>
                void router.push({
                  pathname: "/tickets",
                  query: { ...currentQuery, page: page + 1 },
                })
              }
              variant="secondary"
            >
              Next
            </Button>
          </nav>
        </>
      )}
    </AppFrame>
  );
}
