import Head from "next/head";
import { useRouter } from "next/router";
import { OrderDetail } from "../../features/orders/OrdersViews";

export default function OrderPage() {
  const value = useRouter().query.orderId;
  const orderId = typeof value === "string" ? value : undefined;
  return (
    <>
      <Head>
        <title>Order details | StubHub lab</title>
      </Head>
      <OrderDetail orderId={orderId} />
    </>
  );
}
