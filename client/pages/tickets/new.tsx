import Head from "next/head";
import { NewTicket } from "../../features/tickets/NewTicket";

export default function NewTicketPage() {
  return (
    <>
      <Head>
        <title>Sell a ticket | StubHub lab</title>
      </Head>
      <NewTicket />
    </>
  );
}
