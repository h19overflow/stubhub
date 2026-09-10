import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

export type FakeReservationState = {
  outcome?: "reserved" | "not_found" | "conflict" | "unavailable";
  priceCents?: number;
  sellerUserId?: string;
  eventName?: string;
};

export type FakeTicketsServer = {
  origin: string;
  setState(state: FakeReservationState): void;
  close(): Promise<void>;
};

export function startFakeTicketsServer(initialState: FakeReservationState = {}): Promise<FakeTicketsServer> {
  let state: FakeReservationState = {
    outcome: "reserved",
    priceCents: 12500,
    sellerUserId: "11111111-1111-4111-8111-111111111111",
    eventName: "Taylor Swift The Eras Tour",
    ...initialState,
  };

  return new Promise((resolve, reject) => {
    const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

      if (req.method === "PUT" && url.pathname.includes("/reservation")) {
        const parts = url.pathname.split("/");
        const ticketId = parts[3];

        if (state.outcome === "not_found") {
          res.writeHead(404, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "Ticket not found", code: "ticket_not_found" }));
          return;
        }

        if (state.outcome === "conflict") {
          res.writeHead(409, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "Reservation deadline conflicts", code: "reservation_conflict" }));
          return;
        }

        if (state.outcome === "unavailable") {
          res.writeHead(409, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "Ticket is unavailable", code: "ticket_unavailable" }));
          return;
        }

        // Buffer the body to extract orderId and expiresAt
        let body = "";
        req.on("data", (chunk) => { body += chunk; });
        req.on("end", () => {
          let orderId = "order-123";
          let expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
          try {
            const parsed = JSON.parse(body);
            if (parsed.orderId) orderId = parsed.orderId;
            if (parsed.expiresAt) expiresAt = parsed.expiresAt;
          } catch {}

          res.writeHead(201, { "content-type": "application/json" });
          res.end(JSON.stringify({
            outcome: "reserved",
            reservation: {
              ticketId,
              orderId,
              sellerUserId: state.sellerUserId ?? "11111111-1111-4111-8111-111111111111",
              expiresAt,
              priceCents: state.priceCents ?? 12500,
              currency: "USD",
              ticket: {
                eventName: state.eventName ?? "Taylor Swift The Eras Tour",
                description: "Floor Seats Section A",
                place: "SoFi Stadium, Los Angeles",
                ticketInfo: "Row 5, Seat 12",
                eventStartsAt: new Date(Date.now() + 86400_000).toISOString(),
                eventEndsAt: null,
              },
            },
          }));
        });
        return;
      }

      if (req.method === "GET" && url.pathname.includes("/reservation/")) {
        const parts = url.pathname.split("/");
        const ticketId = parts[3];
        const orderId = parts[5];

        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({
          reservation: {
            ticketId,
            orderId,
            sellerUserId: state.sellerUserId ?? "11111111-1111-4111-8111-111111111111",
            expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
            priceCents: state.priceCents ?? 12500,
            currency: "USD",
            ticket: {
              eventName: state.eventName ?? "Taylor Swift The Eras Tour",
              description: "Floor Seats Section A",
              place: "SoFi Stadium, Los Angeles",
              ticketInfo: "Row 5, Seat 12",
              eventStartsAt: new Date(Date.now() + 86400_000).toISOString(),
              eventEndsAt: null,
            },
          },
        }));
        return;
      }

      if (req.method === "POST" && url.pathname.includes("/release")) {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ outcome: "released" }));
        return;
      }

      res.writeHead(404);
      res.end();
    });

    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Fake Tickets server failed to bind port"));
        return;
      }

      resolve({
        origin: `http://127.0.0.1:${address.port}`,
        setState: (newState: FakeReservationState) => {
          state = { ...state, ...newState };
        },
        close: () => new Promise((res, rej) => {
          server.close((err) => (err ? rej(err) : res()));
        }),
      });
    });

    server.once("error", reject);
  });
}
