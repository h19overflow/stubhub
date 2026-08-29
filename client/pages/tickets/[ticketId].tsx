import Head from "next/head";
import { useRouter } from "next/router";
import { TicketDetail } from "../../features/tickets/TicketDetail";

export default function TicketPage() {
  const value = useRouter().query.ticketId;
  const ticketId = typeof value === "string" ? value : undefined;
  return (
    <>
      <Head>
        <title>Ticket details | StubHub lab</title>
      </Head>
      <TicketDetail ticketId={ticketId} />
    </>
  );
}
