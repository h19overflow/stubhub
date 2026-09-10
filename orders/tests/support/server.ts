import type { Server } from "node:http";
import { app } from "../../src/app.js";

type TestServer = { origin: string; close(): Promise<void> };

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

export function startTestServer(): Promise<TestServer> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        void closeServer(server).finally(() =>
          reject(new Error("Test server did not bind a TCP port")),
        );
        return;
      }

      resolve({
        origin: `http://127.0.0.1:${address.port}`,
        close: () => closeServer(server),
      });
    });

    server.once("error", reject);
  });
}

export type { TestServer };
