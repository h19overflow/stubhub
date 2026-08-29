import { parseOrder, type Order, wrapped } from "../commerce-types";
import { apiRequest } from "../request";
import { parseOrderList } from "./parsers";

const base = "/api/orders";

export function listMyOrders(): Promise<Order[]> {
  return apiRequest(`${base}/orders/mine`, {
    parse: parseOrderList,
    protected: true,
  });
}

export function getOrder(orderId: string): Promise<Order> {
  return apiRequest(`${base}/orders/${encodeURIComponent(orderId)}`, {
    parse: wrapped("order", parseOrder),
    protected: true,
  });
}
