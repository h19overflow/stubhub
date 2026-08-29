import Head from "next/head";
import { TicketDiscovery } from "../../features/tickets/TicketDiscovery";

export default function TicketsPage() {
  return (
    <>
      <Head>
        <title>Explore tickets | StubHub lab</title>
        <meta content="Browse current ticket listings." name="description" />
      </Head>
      <TicketDiscovery />
    </>
  );
}
