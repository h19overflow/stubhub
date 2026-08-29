import Head from "next/head";
import { MyOrders } from "../../features/orders/MyOrders";

export default function OrdersPage() {
  return (
    <>
      <Head>
        <title>My orders | StubHub lab</title>
      </Head>
      <MyOrders />
    </>
  );
}
