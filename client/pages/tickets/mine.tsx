import Head from "next/head";
import { MyTickets } from "../../features/tickets/MyTickets";

export default function MyTicketsPage() {
  return (
    <>
      <Head>
        <title>My tickets | StubHub lab</title>
      </Head>
      <MyTickets />
    </>
  );
}
