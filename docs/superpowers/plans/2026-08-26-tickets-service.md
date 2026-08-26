# Tickets Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a durable, Auth-structured Tickets service for authenticated listing creation, discovery, owner listing views, and owner-only price updates with local image uploads.

**Architecture:** Express 5 routes validate JWTs and transport input, then call small direct-SQL repository functions over one `node:sqlite` connection. Ticket metadata and idempotency state live in SQLite; bounded images live on the Tickets persistent volume and are served by an unauthenticated static route. Purchase and reservation transitions remain absent.

**Tech Stack:** Node.js 24+, TypeScript 7, Express 5, `node:sqlite`, Zod 4, JOSE 6, Multer 2, Kubernetes local PVC.

**Spec:** `docs/superpowers/specs/2026-08-26-tickets-service-design.md`

## Global Constraints

- Organize runtime code under `tickets/src` with `http`, `images`, `tickets`, and `tokens` feature folders, matching Auth's application/entrypoint pattern.
- Every listing API route requires an Identity-issued bearer JWT; `/health` and `/ticket-images/*` remain public.
- New Tickets are `available`; do not add purchase, reserve, release, sold, Orders, payment, or event-bus operations.
- Ticket owner always comes from JWT `sub`; never accept owner identity from request data.
- Price is a positive JavaScript-safe integer in USD cents.
- Upload exactly one JPEG, PNG, or WebP image, at most 5 MiB; validate bytes rather than trusting filename or multipart MIME.
- Use SQLite migrations and one process-wide `DatabaseSync`, not an ORM or shared service database.
- Keep local image storage single-replica and mount database plus uploads under `/data` in Kubernetes.
- Do not add or run automated tests. Use builds, typechecks, and the manual service journey required by repository guidance.
- Preserve unrelated untracked user files. The empty root-level Tickets stubs are in scope and are removed only after their `tickets/src` replacements exist.

---

### Task 1: Runtime dependencies, migration, and Ticket model

**Files:**
- Modify: `tickets/package.json`
- Modify: `package-lock.json`
- Create: `tickets/.env.example`
- Create: `tickets/migrations/001_create_tickets.sql`
- Create: `tickets/src/database.ts`
- Create: `tickets/src/tickets/ticket.ts`

**Interfaces:**
- Produces: `database: DatabaseSync` from `tickets/src/database.ts`.
- Produces: `TicketStatus`, `Ticket`, `TicketRow`, `toTicket(row)`, `TicketPage`, `TicketPagination`, and input/query types from `tickets/src/tickets/ticket.ts`.
- Consumes: no application interface from later tasks.

- [ ] **Step 1: Install only the required Tickets dependencies**

Run from the repository root:

```bash
npm install --workspace @stubhub/tickets jose@^6.2.10 multer@^2.0.2 zod@^4.4.3
npm install --workspace @stubhub/tickets --save-dev @types/multer@^2.0.0
```

Expected: `tickets/package.json` and the root `package-lock.json` change; no new framework, ORM, upload service, or test dependency appears.

- [ ] **Step 2: Align Tickets scripts and runtime with Auth**

Set `engines.node` to `>=24`. Keep `build` and `typecheck`; replace `dev`/`start` and add `migrate`:

```json
{
  "dev": "nodemon --watch src --watch migrations --ext ts,sql --exec \"npm run build && node --env-file-if-exists=.env dist/index.js\"",
  "build": "tsc -p tsconfig.json",
  "migrate": "npm run build && node --env-file-if-exists=.env dist/database.js",
  "start": "node --env-file-if-exists=.env dist/index.js",
  "typecheck": "tsc --noEmit"
}
```

Create `tickets/.env.example`:

```dotenv
PORT=3002
JWT_SECRET=local-development-jwt-secret-change-before-production
TICKETS_DB_PATH=./data/tickets.sqlite
TICKETS_UPLOAD_DIR=./data/uploads
```

- [ ] **Step 3: Create the strict SQLite schema**

Create `tickets/migrations/001_create_tickets.sql` with this schema:

```sql
CREATE TABLE tickets (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  event_name TEXT NOT NULL,
  description TEXT NOT NULL,
  event_starts_at INTEGER NOT NULL,
  event_ends_at INTEGER CHECK (
    event_ends_at IS NULL OR event_ends_at > event_starts_at
  ),
  ticket_info TEXT NOT NULL,
  place TEXT NOT NULL,
  price_cents INTEGER NOT NULL CHECK (price_cents > 0),
  currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  image_filename TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'reserved', 'sold')),
  locked_by_order_id TEXT,
  lock_expires_at INTEGER,
  idempotency_key TEXT NOT NULL,
  request_fingerprint TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (owner_id, idempotency_key)
) STRICT;

CREATE INDEX tickets_available_discovery
  ON tickets(status, event_starts_at, id);

CREATE INDEX tickets_owner_created
  ON tickets(owner_id, created_at DESC, id);
```

Do not add a foreign key for `owner_id`; Identity owns users in another database.

- [ ] **Step 4: Port Auth's checked migration runner into Tickets**

Create `tickets/src/database.ts` using the same migration-ledger algorithm as `auth/src/database.ts`, with these Tickets-specific values:

```ts
const migrationsPath = fileURLToPath(new URL("../migrations/", import.meta.url));
const defaultPath = fileURLToPath(new URL("../data/tickets.sqlite", import.meta.url));
const databasePath = process.env.TICKETS_DB_PATH ?? defaultPath;
```

Keep SHA-256 migration checksums, contiguous version enforcement, `BEGIN IMMEDIATE`, rollback on failure, `PRAGMA foreign_keys = ON`, and `PRAGMA journal_mode = WAL`. Error messages must say `Tickets`, not `Identity`. Export the single `database` connection. The direct-run output is:

```ts
console.log(
  `Tickets database is current: ${migrationResult.total} migrations, ${migrationResult.applied} applied`,
);
```

- [ ] **Step 5: Define the public Ticket and storage-row types**

Create `tickets/src/tickets/ticket.ts` around these exact public fields:

```ts
type TicketStatus = "available" | "reserved" | "sold";

type Ticket = {
  id: string;
  ownerId: string;
  eventName: string;
  description: string;
  eventStartsAt: string;
  eventEndsAt: string | null;
  ticketInfo: string;
  place: string;
  priceCents: number;
  currency: "USD";
  imageUrl: string;
  status: TicketStatus;
  createdAt: string;
  updatedAt: string;
};

type TicketPagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

type TicketPage = { tickets: Ticket[]; pagination: TicketPagination };
```

Define `TicketRow` with snake-case database fields, including internal lock/idempotency fields. `toTicket(row)` maps only the public fields and derives:

```ts
imageUrl: `/ticket-images/${row.image_filename}`
```

Convert epoch milliseconds with `new Date(value).toISOString()`. Do not expose lock fields, image filename, idempotency key, or fingerprint.

- [ ] **Step 6: Verify foundation compilation and migration startup**

Run:

```bash
npm run build --workspace @stubhub/tickets
npm run typecheck --workspace @stubhub/tickets
```

Then run `npm run migrate --workspace @stubhub/tickets` with `TICKETS_DB_PATH` set to an OS-temporary `.sqlite` path. Expected output: one Tickets migration applied and no generated database committed under `tickets/`.

- [ ] **Step 7: Commit the foundation**

```bash
git add tickets/package.json package-lock.json tickets/.env.example tickets/migrations/001_create_tickets.sql tickets/src/database.ts tickets/src/tickets/ticket.ts
git commit -m "feat(tickets): add durable ticket storage"
```

---

### Task 2: Application shell, JWT authentication, and centralized errors

**Files:**
- Create: `tickets/src/tokens/token-config.ts`
- Create: `tickets/src/tokens/access-token.ts`
- Create: `tickets/src/http/require-auth.ts`
- Create: `tickets/src/http/error-handler.ts`
- Create: `tickets/src/app.ts`
- Modify: `tickets/src/index.ts`

**Interfaces:**
- Consumes: no repository API.
- Produces: `AuthenticatedUser`, `verifyAccessToken(header)`, `requireAuth`, `HttpError`, `errorHandler`, and exported Express `app`.

- [ ] **Step 1: Add Tickets-local JWT configuration**

Create `tickets/src/tokens/token-config.ts` with Auth's accepted verification contract:

```ts
const JWT_ALGORITHM = "HS256";
const JWT_ISSUER = "stubhub-identity";
const JWT_AUDIENCE = "stubhub-api";

const configuredSecret = process.env.JWT_SECRET;
if (!configuredSecret || Buffer.byteLength(configuredSecret, "utf8") < 32) {
  throw new Error("JWT_SECRET must contain at least 32 bytes");
}

const JWT_SECRET = new TextEncoder().encode(configuredSecret);

export { JWT_ALGORITHM, JWT_AUDIENCE, JWT_ISSUER, JWT_SECRET };
```

Do not import Auth source code or add a shared package.

- [ ] **Step 2: Verify Identity access tokens locally**

Create `tickets/src/tokens/access-token.ts`. Validate `sub`, `email`, `emailVerified`, and `role` with Zod after `jwtVerify`. Export:

```ts
type AuthenticatedUser = {
  id: string;
  email: string;
  emailVerified: boolean;
  role: "user" | "admin";
};

async function verifyAccessToken(
  authorizationHeader: string | undefined,
): Promise<AuthenticatedUser | null>;
```

Require one exact bearer token, `HS256`, issuer `stubhub-identity`, audience `stubhub-api`, and `typ: "JWT"`. Return `null` for every malformed/expired/invalid token without leaking verification errors.

- [ ] **Step 3: Add route authentication and safe errors**

Create `tickets/src/http/require-auth.ts` with the Auth behavior:

```ts
const requireAuth: RequestHandler = async (request, response, next) => {
  const user = await verifyAccessToken(request.headers.authorization);
  if (!user) {
    response.setHeader("WWW-Authenticate", "Bearer");
    response.status(401).json({ error: "Authentication required" });
    return;
  }
  response.locals.user = user;
  next();
};
```

Create `tickets/src/http/error-handler.ts` with `HttpError(status, message)`. Map malformed JSON to `400`, `MulterError` with `LIMIT_FILE_SIZE` to `413`, other Multer request-shape errors to `400`, expected `HttpError` instances to their safe status/message, and unexpected errors to logged `500 { "error": "Internal server error" }`. Delegate if `response.headersSent`.

- [ ] **Step 4: Split application construction from process startup**

Create `tickets/src/app.ts`:

```ts
const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "16kb" }));
app.get("/health", (_request, response) => {
  response.json({ service: "tickets", status: "ok" });
});
app.use(errorHandler);

export { app };
```

Replace `tickets/src/index.ts` with the Auth-shaped entrypoint:

```ts
import { app } from "./app.js";

const port = Number(process.env.PORT ?? 3002);
app.listen(port, "0.0.0.0", () => {
  console.log(`Tickets service listening on port ${port}`);
});
```

- [ ] **Step 5: Verify the actual health surface**

Build and launch with a 32-byte-or-longer `JWT_SECRET`. Request `GET /health` and verify exactly:

```json
{ "service": "tickets", "status": "ok" }
```

Stop the process cleanly. Also launch once without `JWT_SECRET` after a protected route imports the token module in Task 3; startup must fail rather than silently accept unsigned operation.

- [ ] **Step 6: Commit the HTTP shell**

```bash
git add tickets/src/tokens tickets/src/http/require-auth.ts tickets/src/http/error-handler.ts tickets/src/app.ts tickets/src/index.ts
git commit -m "feat(tickets): add authenticated service shell"
```

---

### Task 3: Authenticated discovery, details, and owner listings

**Files:**
- Create: `tickets/src/tickets/schemas.ts`
- Create: `tickets/src/tickets/ticket-repo.ts`
- Create: `tickets/src/http/routes/list-tickets.ts`
- Create: `tickets/src/http/routes/list-my-tickets.ts`
- Create: `tickets/src/http/routes/get-ticket.ts`
- Modify: `tickets/src/app.ts`

**Interfaces:**
- Consumes: `database`, `Ticket`, `TicketPage`, `toTicket`, `requireAuth`, `HttpError`.
- Produces: `listAvailableTickets(filters: TicketFilters): TicketPage`, `listOwnedTickets(ownerId: string, page: number, pageSize: number): TicketPage`, `findTicketById(id: string): Ticket | null`, query schemas, and three Express routers.
- Produces for Task 4: `createTicket(input)` and create result types will be added to the same repository without changing read signatures.
- Produces for Task 5: `updateTicketPrice(ownerId, ticketId, priceCents)` will be added without changing read signatures.

- [ ] **Step 1: Define strict query and identifier schemas**

Create `tickets/src/tickets/schemas.ts` with:

```ts
const parseQueryNumber = (value: unknown): unknown =>
  typeof value === "string" && value.trim() !== "" ? Number(value) : value;

const ticketIdSchema = z.uuid();
const paginationSchema = z.object({
  page: z.preprocess(
    parseQueryNumber,
    z.number().int().min(1),
  ).default(1),
  pageSize: z.preprocess(
    parseQueryNumber,
    z.number().int().min(1).max(100),
  ).default(20),
}).strict();

const listTicketsQuerySchema = paginationSchema.extend({
  q: z.string().trim().min(1).max(100).optional(),
  place: z.string().trim().min(1).max(200).optional(),
  startsAfter: z.iso.datetime({ offset: true }).optional(),
  startsBefore: z.iso.datetime({ offset: true }).optional(),
  minPriceCents: z.preprocess(
    parseQueryNumber,
    z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
  ),
  maxPriceCents: z.preprocess(
    parseQueryNumber,
    z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
  ),
}).superRefine((query, context) => {
  if (
    query.startsAfter &&
    query.startsBefore &&
    Date.parse(query.startsAfter) > Date.parse(query.startsBefore)
  ) {
    context.addIssue({
      code: "custom",
      path: ["startsAfter"],
      message: "startsAfter must not be later than startsBefore",
    });
  }
  if (
    query.minPriceCents !== undefined &&
    query.maxPriceCents !== undefined &&
    query.minPriceCents > query.maxPriceCents
  ) {
    context.addIssue({
      code: "custom",
      path: ["minPriceCents"],
      message: "minPriceCents must not exceed maxPriceCents",
    });
  }
});
```

Because only strings enter `parseQueryNumber`, array/object query values reach `z.number()` unchanged and are rejected.

- [ ] **Step 2: Implement direct-SQL read functions**

Create `tickets/src/tickets/ticket-repo.ts` and export:

```ts
type TicketFilters = {
  q?: string;
  place?: string;
  startsAfter?: number;
  startsBefore?: number;
  minPriceCents?: number;
  maxPriceCents?: number;
  page: number;
  pageSize: number;
};

function listAvailableTickets(filters: TicketFilters): TicketPage;
function listOwnedTickets(ownerId: string, page: number, pageSize: number): TicketPage;
function findTicketById(id: string): Ticket | null;
```

Build `WHERE` clauses from fixed SQL fragments and bind every user value. Escape `\`, `%`, and `_` before `LIKE ... ESCAPE '\\'`. Search `event_name`, `description`, `ticket_info`, and `place` with `COLLATE NOCASE`; include `status = 'available'`. Run a count query with the same predicates, then the result query with `ORDER BY event_starts_at ASC, id ASC`, `LIMIT`, and `OFFSET`.

Owner results use `WHERE owner_id = ?` and `ORDER BY created_at DESC, id`; they do not filter status. Map every row through `toTicket`.

- [ ] **Step 3: Add the marketplace list route**

Create `tickets/src/http/routes/list-tickets.ts`:

```ts
router.get("/tickets", requireAuth, (request, response) => {
  const parsed = listTicketsQuerySchema.safeParse(request.query);
  if (!parsed.success) throw new HttpError(400, "Invalid ticket filters");
  const { startsAfter, startsBefore, ...filters } = parsed.data;
  response.json(listAvailableTickets({
    ...filters,
    startsAfter: startsAfter ? Date.parse(startsAfter) : undefined,
    startsBefore: startsBefore ? Date.parse(startsBefore) : undefined,
  }));
});
```

- [ ] **Step 4: Add My Tickets and details routes**

Create `tickets/src/http/routes/list-my-tickets.ts`. Parse only pagination, read `response.locals.user.id`, and return `listOwnedTickets` at `GET /tickets/mine`.

Create `tickets/src/http/routes/get-ticket.ts`. At `GET /tickets/:ticketId`, return `404 { "error": "Ticket not found" }` for malformed UUIDs and absent records; otherwise return `{ ticket }` in any state.

Wire routers in this order in `tickets/src/app.ts`:

```ts
app.use(listTickets, listMyTickets, getTicket);
app.use(errorHandler);
```

`listMyTickets` must be mounted before `getTicket` so `mine` cannot be treated as a Ticket ID.

- [ ] **Step 5: Verify route behavior without seeded records**

Build/typecheck, launch Tickets, and use one valid Auth-compatible JWT plus one invalid token. Confirm:

- no token: `GET /tickets` returns `401` and `WWW-Authenticate: Bearer`;
- valid token: `GET /tickets` returns an empty `tickets` array and zeroed pagination;
- valid token: `GET /tickets/mine` returns the same response shape;
- contradictory price/date ranges return `400`;
- `GET /tickets/not-a-uuid` returns `404`;
- no read creates or changes a database row.

- [ ] **Step 6: Commit discovery**

```bash
git add tickets/src/tickets/schemas.ts tickets/src/tickets/ticket-repo.ts tickets/src/http/routes/list-tickets.ts tickets/src/http/routes/list-my-tickets.ts tickets/src/http/routes/get-ticket.ts tickets/src/app.ts
git commit -m "feat(tickets): add ticket discovery routes"
```

---

### Task 4: Bounded image upload and idempotent listing creation

**Files:**
- Create: `tickets/src/images/image-upload.ts`
- Create: `tickets/src/http/routes/create-ticket.ts`
- Modify: `tickets/src/tickets/schemas.ts`
- Modify: `tickets/src/tickets/ticket-repo.ts`
- Modify: `tickets/src/app.ts`

**Interfaces:**
- Consumes: `database`, `requireAuth`, `HttpError`, `Ticket`, and existing repository row mapping.
- Produces: `ticketImageUpload`, `uploadDirectory`, `inspectImage(path)`, `fingerprintCreateRequest(data, path)`, `finalizeImage(path, ticketId, extension)`, `removeImage(path)`.
- Produces: `createTicket(input: CreateTicketInput): CreateTicketResult`, using the discriminated result union defined in Step 3.
- Produces: `POST /tickets` multipart route.

- [ ] **Step 1: Add create-field and idempotency schemas**

Extend `tickets/src/tickets/schemas.ts` with a create schema for trimmed `eventName`, `description`, `ticketInfo`, and `place`; parse `priceCents` from its multipart string into a positive safe integer. Parse ISO timestamps and normalize them with `new Date(value).toISOString()`. Treat an empty `eventEndsAt` as absent and reject an end at or before the start.

Add:

```ts
const idempotencyKeySchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[\x21-\x7e]+$/);
```

The API does not impose a future-only start-time rule.

- [ ] **Step 2: Implement disk-staged upload primitives**

Create `tickets/src/images/image-upload.ts`. Resolve defaults relative to `tickets/data/uploads`, create the final directory and `.staging`, and configure Multer disk storage:

```ts
const ticketImageUpload = multer({
  storage: multer.diskStorage({
    destination: (_request, _file, callback) => callback(null, stagingDirectory),
    filename: (_request, _file, callback) => callback(null, `${randomUUID()}.upload`),
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 7 },
});
```

Inspect only enough bytes to identify:

- JPEG: `ff d8 ff`;
- PNG: `89 50 4e 47 0d 0a 1a 0a`;
- WebP: `RIFF` at bytes 0–3 and `WEBP` at bytes 8–11.

Return server-owned extension and MIME, or throw `HttpError(415, "Image must be JPEG, PNG, or WebP")`. Hash the normalized JSON fields and the full staged file through `createReadStream` into SHA-256; do not read the 5 MiB body into another full buffer. `finalizeImage` renames within the upload filesystem to `<ticketId>.<detected-extension>`. `removeImage` uses `rm(path, { force: true })`.

- [ ] **Step 3: Add atomic idempotency handling to the repository**

Extend `tickets/src/tickets/ticket-repo.ts` with:

```ts
type CreateTicketInput = {
  id: string;
  ownerId: string;
  eventName: string;
  description: string;
  eventStartsAt: number;
  eventEndsAt: number | null;
  ticketInfo: string;
  place: string;
  priceCents: number;
  imageFilename: string;
  idempotencyKey: string;
  requestFingerprint: string;
};

type CreateTicketResult =
  | { outcome: "created"; ticket: Ticket }
  | { outcome: "replayed"; ticket: Ticket }
  | { outcome: "conflict" };

function createTicket(input: CreateTicketInput): CreateTicketResult;
```

Use one `BEGIN IMMEDIATE` transaction. Insert with `ON CONFLICT(owner_id, idempotency_key) DO NOTHING`. If inserted, read and return the new Ticket. If not inserted, read the existing owner/key row: matching fingerprint returns `replayed`; differing fingerprint returns `conflict`. Commit each expected outcome and roll back unexpected errors. A random image-filename uniqueness error remains unexpected and is not mistaken for an idempotency replay.

- [ ] **Step 4: Implement the authenticated multipart route**

Create `tickets/src/http/routes/create-ticket.ts` with middleware order:

```ts
router.post(
  "/tickets",
  requireAuth,
  ticketImageUpload.single("image"),
  async (request, response) => {
    let imagePath = request.file?.path;
    try {
      const key = idempotencyKeySchema.safeParse(request.get("Idempotency-Key"));
      const fields = createTicketSchema.safeParse(request.body);
      if (!key.success || !fields.success || !imagePath) {
        throw new HttpError(400, "Valid ticket fields, image, and Idempotency-Key are required");
      }

      const image = await inspectImage(imagePath);
      const requestFingerprint = await fingerprintCreateRequest(fields.data, imagePath);
      const id = randomUUID();
      imagePath = await finalizeImage(imagePath, id, image.extension);
      const result = createTicket({
        id,
        ownerId: response.locals.user.id,
        ...fields.data,
        eventStartsAt: Date.parse(fields.data.eventStartsAt),
        eventEndsAt: fields.data.eventEndsAt ? Date.parse(fields.data.eventEndsAt) : null,
        imageFilename: basename(imagePath),
        idempotencyKey: key.data,
        requestFingerprint,
      });

      if (result.outcome === "created") {
        imagePath = undefined;
        response.status(201).json({ ticket: result.ticket });
        return;
      }

      await removeImage(imagePath);
      imagePath = undefined;
      if (result.outcome === "replayed") {
        response.status(200).json({ ticket: result.ticket });
        return;
      }
      throw new HttpError(409, "Idempotency key was already used for different ticket data");
    } catch (error) {
      if (imagePath) await removeImage(imagePath);
      throw error;
    }
  },
);
```

The route owns cleanup. On invalid fields/key/image, it deletes the staged file before the error response. On `created`, it clears the cleanup pointer before sending `201`, so a response failure cannot delete a committed Ticket's image.

Mount the public static directory before listing routes:

```ts
app.use("/ticket-images", express.static(uploadDirectory, {
  dotfiles: "deny",
  index: false,
  redirect: false,
}));
app.use(createTicket, listTickets, listMyTickets, getTicket);
```

- [ ] **Step 5: Manually verify creation and replay semantics**

With temporary database/upload directories, a valid JWT, and one real 1×1 PNG:

1. Create a Ticket and observe `201`, `status: "available"`, `currency: "USD"`, and an opaque `imageUrl`.
2. Fetch `imageUrl` without Authorization and observe the original PNG bytes.
3. Repeat the exact multipart request with the same owner/key and observe `200` with the same Ticket ID and one database record.
4. Change one field under the same owner/key and observe `409` with one database record.
5. Reuse the same key under another JWT subject and observe a distinct `201` Ticket.
6. Upload a text file named `.png` and observe `415` with no new Ticket or retained file.
7. Exceed 5 MiB and observe `413` with no new Ticket.
8. Omit JWT and verify the service rejects before persisting the upload.

- [ ] **Step 6: Commit listing creation**

```bash
git add tickets/src/images/image-upload.ts tickets/src/http/routes/create-ticket.ts tickets/src/tickets/schemas.ts tickets/src/tickets/ticket-repo.ts tickets/src/app.ts
git commit -m "feat(tickets): add idempotent listing creation"
```

---

### Task 5: Owner-only available Ticket price updates

**Files:**
- Create: `tickets/src/http/routes/update-ticket-price.ts`
- Modify: `tickets/src/tickets/schemas.ts`
- Modify: `tickets/src/tickets/ticket-repo.ts`
- Modify: `tickets/src/app.ts`

**Interfaces:**
- Consumes: existing Ticket repository, JWT owner ID, `HttpError`, and `requireAuth`.
- Produces: `updateTicketPrice(ownerId, ticketId, priceCents)` result union and `PATCH /tickets/:ticketId/price`.

- [ ] **Step 1: Add exact price input validation**

Extend `tickets/src/tickets/schemas.ts`:

```ts
const updateTicketPriceSchema = z.object({
  priceCents: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
}).strict();
```

JSON strings, floats, extra keys, zero, negatives, and unsafe integers are invalid.

- [ ] **Step 2: Add the guarded repository update**

Extend `tickets/src/tickets/ticket-repo.ts`:

```ts
type UpdateTicketPriceResult =
  | { outcome: "updated"; ticket: Ticket }
  | { outcome: "not_found" }
  | { outcome: "unavailable" };

function updateTicketPrice(
  ownerId: string,
  ticketId: string,
  priceCents: number,
): UpdateTicketPriceResult;
```

Within one `BEGIN IMMEDIATE` transaction, run:

```sql
UPDATE tickets
SET price_cents = ?, updated_at = ?
WHERE id = ? AND owner_id = ? AND status = 'available'
```

If one row matches, read it and return `updated`. Otherwise query `id + owner_id`: absent returns `not_found`; present with reserved/sold status returns `unavailable`. Commit expected outcomes and rollback unexpected errors. Never update owner, content, image, state, or lock fields.

- [ ] **Step 3: Add and mount the PATCH route**

Create `tickets/src/http/routes/update-ticket-price.ts`. Validate UUID and body, read `response.locals.user.id`, call the repository, and map outcomes:

- `updated` → `200 { ticket }`;
- `not_found` → `404 { "error": "Ticket not found" }`;
- `unavailable` → `409 { "error": "Only available tickets can be edited" }`.

Mount it with the other routers before `errorHandler`.

- [ ] **Step 4: Manually verify ownership and state preservation**

Create one Ticket, then verify:

1. owner updates price and later index/detail/My Tickets reads show the new cents;
2. repeating the same price remains `200` and creates no new record;
3. another JWT subject receives `404` and the price does not change;
4. malformed/unsafe price receives `400`;
5. Ticket ID, owner, image, content, status, and `createdAt` remain unchanged.

Reserved/sold route verification is deferred with purchasing because this increment exposes no transition into those states; the repository's SQL guard is still present and reviewable.

- [ ] **Step 5: Commit price updates**

```bash
git add tickets/src/http/routes/update-ticket-price.ts tickets/src/tickets/schemas.ts tickets/src/tickets/ticket-repo.ts tickets/src/app.ts
git commit -m "feat(tickets): add owner price updates"
```

---

### Task 6: Persistent deployment, clean cutover, and end-to-end smoke

**Files:**
- Modify: `Dockerfile`
- Modify: `skaffold.yaml`
- Modify: `infra/k8s/tickets/deployment.yaml`
- Create: `infra/k8s/tickets/pvc.yaml`
- Remove after replacements exist: `tickets/index.ts`
- Remove after replacements exist: `tickets/app.ts`
- Remove after replacements exist: `tickets/database.ts`
- Remove after replacements exist: `tickets/api/create-ticket.ts`
- Remove after replacements exist: `tickets/api/list-tickets.ts`
- Remove after replacements exist: `tickets/api/purchase-ticket.ts`
- Remove after replacements exist: `tickets/api/types.ts`
- Remove after replacements exist: `tickets/api/update-ticket.ts`
- Remove after replacements exist: `tickets/api/user-tickets.ts`

**Interfaces:**
- Consumes: the complete Tickets service and migration directory.
- Produces: a container image containing compiled code plus migrations, and a single-replica Kubernetes deployment with writable durable storage.

- [ ] **Step 1: Package Tickets migrations in the production image**

In the final `tickets` Docker stage, add:

```dockerfile
COPY --from=tickets-build /app/tickets/migrations ./tickets/migrations
```

Keep `dist`, `package.json`, non-root user, healthcheck, and command unchanged.

- [ ] **Step 2: Add the Tickets persistent volume**

Create `infra/k8s/tickets/pvc.yaml`:

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: tickets-data
  namespace: stubhub
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 1Gi
```

In `infra/k8s/tickets/deployment.yaml`:

- set pod `fsGroup: 1000` alongside `seccompProfile`;
- set `TICKETS_DB_PATH=/data/tickets.sqlite`;
- set `TICKETS_UPLOAD_DIR=/data/uploads`;
- mount `tickets-data` at `/data`;
- add the PVC-backed `volumes` entry;
- keep `replicas: 1`.

- [ ] **Step 3: Sync migration edits in Skaffold development**

Under the `stubhub-tickets` artifact's manual sync rules, keep `tickets/src/**/*.ts` and add:

```yaml
- src: "tickets/migrations/**/*.sql"
  dest: /app/tickets/migrations
```

Do not sync local database or uploads into containers.

- [ ] **Step 4: Remove only the superseded empty stubs**

Confirm every listed root file is still zero bytes. Remove those empty files and the now-empty `tickets/api` directory only after `tickets/src` contains the working replacements. If any root stub gained content during implementation, preserve it and reconcile explicitly instead of deleting it.

- [ ] **Step 5: Run source and container checks**

Run:

```bash
npm run build --workspace @stubhub/tickets
npm run typecheck --workspace @stubhub/tickets
docker build --target tickets -t stubhub-tickets:local .
```

Expected: TypeScript succeeds; the production image contains `tickets/dist` and `tickets/migrations`; healthcheck points to port 3002. Do not claim a Kubernetes deployment from manifest inspection alone.

- [ ] **Step 6: Run the complete local service journey**

Launch the actual service with temporary `TICKETS_DB_PATH`, `TICKETS_UPLOAD_DIR`, `JWT_SECRET`, and port. Generate two Auth-compatible HS256 JWTs with distinct UUID `sub` claims. Exercise, in order:

1. public health;
2. authenticated create with a real PNG;
3. exact idempotent replay;
4. conflicting replay;
5. available list with `q`, place, date, and price filters;
6. page/pageSize metadata;
7. detail;
8. owner My Tickets;
9. owner price update;
10. non-owner price rejection;
11. unsupported image rejection;
12. unauthenticated API rejection;
13. public image retrieval;
14. restart against the same paths and re-read Ticket plus image;
15. `POST /tickets/:id/purchase` (or any reserve/release/sold route) returns `404` because purchasing is absent.

Record status codes and Ticket IDs from the real responses. Stop the service cleanly.

- [ ] **Step 7: Commit deployment and cleanup**

```bash
git add Dockerfile skaffold.yaml infra/k8s/tickets tickets
git commit -m "build(tickets): persist service data and uploads"
```

- [ ] **Step 8: Review against the specification**

Check `docs/superpowers/specs/2026-08-26-tickets-service-design.md` line by line against the diff. Block completion for missing auth, missing owner guards, leaked internal fields, non-durable idempotency, image validation by MIME alone, unbounded list responses, missing migration packaging, or any purchase/reservation implementation.
