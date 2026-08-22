const services = [
  ["Identity", "Accounts, credentials, and authentication"],
  ["Tickets", "Listings, pricing, and availability"],
  ["Orders", "Purchases, payments, and expiration"],
] as const;

export default function Home() {
  return (
    <main>
      <p className="eyebrow">Local environment</p>
      <h1>Ticket marketplace services are ready to build.</h1>
      <p className="intro">
        Next.js owns presentation. Each backend service owns its data and business decisions.
      </p>
      <section aria-label="Backend services">
        {services.map(([name, responsibility]) => (
          <article key={name}>
            <span>Service</span>
            <h2>{name}</h2>
            <p>{responsibility}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
