# Identity Service Limitations, Explained Simply

This guide explains what the Identity service cannot do yet, why that matters,
and when each limitation should be addressed.

The short version: the service is a good small learning implementation. It can
create accounts, verify emails, sign users in, create sessions, read the current
user, and sign users out. It is not yet a complete internet-facing identity
platform or a finished authentication boundary for the other services.

## First: what does “limitation” mean?

A limitation is not always a bug.

There are four different kinds here:

1. **A decision not made yet** — several valid designs exist, and choosing one
   changes how services trust each other.
2. **A feature intentionally not built** — the current product exercise does not
   need it yet.
3. **A known ceiling** — the simple implementation works until traffic,
   availability, or deployment requirements grow.
4. **A correctness or security gap** — current behavior should be improved before
   relying on it in a more serious environment.

Treating every limitation as an emergency produces unnecessary code. Treating
every limitation as harmless produces outages and security problems. The useful
question is: **what event makes this limitation matter?**

## The whole picture

| Limitation | Imagine this | Kind |
|---|---|---|
| Tickets and Orders cannot receive trusted identity | The front desk knows you, but the other rooms cannot see your wristband | Unmade integration decision |
| No Redis Streams identity events | The front desk does not announce changes over the building speaker | Unmade integration decision |
| No CORS or same-origin gateway | The browser sees the frontend and Identity as different buildings and blocks the trip | Browser integration blocker |
| No reset, email change, deletion, OAuth, profiles, or roles | Those rooms have not been built | Deliberate product scope |
| One SQLite writer replica | Everyone writes in one physical notebook | Scaling and availability ceiling |
| SMTP does not require TLS or authentication | Email is delivered to a local toy mailbox with no key | Deployment ceiling |
| `/health` checks only the process | The receptionist answers “open” without checking the vault or mailroom | Observability ceiling |
| Malformed JSON returns `500` | A customer writes a broken form, but the shop blames its own machinery | Correctness bug |
| Account lockout is the only request protection | One door has a lock, but the property has no fence | Security ceiling |

---

## 1. Tickets and Orders do not receive trusted identity

### Explain it like I am five

Identity is the front desk. It checks who you are and gives your browser a
session cookie, like a wristband.

Tickets and Orders are different rooms. They need to know which person is asking
to sell a ticket or buy one. Right now, those rooms do not have an accepted way
to inspect or trust the wristband.

### What works today

Identity can answer:

```text
Browser -> Identity -> “This session belongs to user 123”
```

Identity stores the account, password hash, and session. Tickets and Orders
correctly do not read the Identity database.

### What does not work yet

There is no accepted flow like:

```text
Browser -> Tickets -> trusted userId
Browser -> Orders  -> trusted userId
```

A browser-provided body such as this is not trustworthy:

```json
{
  "userId": "someone-elses-id"
}
```

The browser can change it. Tickets and Orders must receive identity through a
trusted backend mechanism, not believe a public `userId` field or header.

### Why this matters

Without trusted identity propagation:

- Tickets cannot safely prove who owns a listing.
- Orders cannot safely prove who is buying.
- An attacker could claim another user's ID if a service trusts public input.
- Each service may invent a different authentication method.

Sharing the Identity database would appear easy, but it breaks service ownership
and spreads credential access into services that should never have it.

### Common designs that could be chosen

No option has been accepted yet.

#### Option A: gateway or proxy validates the session

```text
Browser -> Gateway -> Identity/session validation -> Tickets or Orders
```

The gateway forwards a trusted identity value only after validation.

- Simple downstream request handling.
- The gateway becomes an important trust boundary.
- Public clients must not be able to bypass it or forge its internal header.

#### Option B: each service asks Identity

```text
Browser -> Tickets -> Identity: “Who owns this cookie?”
```

- Revocation is observed immediately.
- Every protected request depends on Identity being reachable.
- It adds a network call and a failure mode to every request.

#### Option C: Identity issues a signed token

Tickets and Orders verify the signature without calling Identity every time.

- Fewer synchronous calls to Identity.
- Revocation is less immediate unless tokens are short-lived or checked.
- Signing keys, rotation, claims, expiry, and audience rules must be designed.

### Decision trigger

This must be decided before Tickets or Orders accepts an authenticated mutation
such as creating a listing or starting a purchase.

The accepted design must answer:

- Who validates the browser credential?
- How does a backend know that `userId` is trusted?
- Can clients bypass the validating component?
- What happens when Identity is unavailable?
- How quickly must sign-out or revocation take effect?

---

## 2. Identity does not publish Redis Streams events

### Explain it like I am five

Identity knows when something happened, but it does not announce it over the
building speaker.

For example, Identity may know that an account was created or an email was
verified. No durable message is currently sent to another service.

### What works today

Identity's own database remains authoritative for accounts and sessions. Normal
signup, verification, and sign-in do not require Redis.

This is good: Redis should not decide whether a password is correct or whether a
session is valid.

### What does not work yet

Another service cannot asynchronously react to an Identity fact through Redis
Streams. Event names, payloads, consumers, versions, ordering keys, and recovery
rules have not been accepted.

Names such as `UserCreated` or `EmailVerified` are only examples. They are not
current contracts.

### Why not publish an event immediately?

A durable event is more than calling `redis.xadd()`.

With at-least-once delivery:

- a consumer may receive the same event twice;
- events may arrive late or out of order;
- a database commit may succeed while publication fails;
- consumers need idempotency records;
- abandoned pending messages need recovery; and
- old event versions may still exist while code changes.

Publishing before those rules exist creates messages that look reliable but are
not.

### Decision trigger

Add an Identity event only when a real consumer needs a committed fact without
an immediate response.

Before adding it, define:

1. the fact and its owner;
2. why the consumer cannot use a synchronous API or its own data;
3. the minimum non-secret payload;
4. duplicate and out-of-order behavior;
5. an outbox or equivalent publication recovery rule; and
6. event versioning.

Never put passwords, password hashes, session tokens, or challenge codes in an
event.

---

## 3. The browser cannot call Identity across origins

### Explain it like I am five

Browsers have a safety guard. If a page from one address tries to call another
address, the guard asks the second address for permission.

These are different origins because the ports differ:

```text
Frontend: http://localhost:3000
Identity: http://localhost:3001
```

Identity does not currently send that permission, so a browser blocks the
frontend's direct request.

### Why curl can work while the browser fails

CORS is a browser safety rule. `curl`, Postman, and backend services do not
enforce the browser's same-origin policy.

This can therefore happen:

```text
curl request       -> works
browser JavaScript -> blocked by browser
```

The service itself may be healthy in both cases.

### Why cookies make this stricter

Identity uses an `HttpOnly` session cookie. A cross-origin browser request needs
both sides configured deliberately:

- the frontend request normally uses `credentials: "include"`;
- Identity allows one exact trusted frontend origin;
- Identity sends `Access-Control-Allow-Credentials: true`; and
- cookie `SameSite`, `Secure`, domain, and HTTPS behavior match the deployment.

Using `Access-Control-Allow-Origin: *` together with credentialed cookies is not
a valid safe shortcut.

### Two normal solutions

#### Option A: one public origin

A gateway or reverse proxy exposes browser routes under one origin:

```text
https://stubhub.example/auth/*    -> Identity
https://stubhub.example/tickets/* -> Tickets
https://stubhub.example/orders/*  -> Orders
```

The browser sees one building. This usually simplifies cookie behavior.

#### Option B: explicit credentialed CORS

The frontend and Identity remain on separate origins. Identity allows only the
known frontend origin and credentialed methods/headers.

This is valid, but the CORS and cookie policy must be correct in local and
deployed environments.

### Decision trigger

Choose one before connecting the browser UI directly to Identity. The choice
should be made for the whole HTTP architecture, not independently inside every
service.

---

## 4. Several account features do not exist

### Explain it like I am five

The house has a front door, but it does not yet have every possible room.

The service supports the current learning journey:

```text
sign up -> verify email -> sign in -> session -> sign out
```

It does not currently support:

- password reset;
- changing an email address;
- deleting an account;
- signing in with Google, GitHub, or another OAuth provider;
- profiles or preferences; or
- buyer, seller, or administrator roles.

### This is mostly scope, not breakage

The product currently uses one authenticated user type. The same user may list,
edit, and purchase tickets. Adding roles would invent a rule the product has not
requested.

OAuth, profiles, and preferences also introduce new ownership and data rules.
They should not be added “for later.”

### Some missing features become serious at a real launch

A forgotten password currently means the user has no recovery path. Account
deletion may become a legal or product requirement. Email changes require
re-verification and careful uniqueness/session rules.

These need full journeys, not isolated endpoints. For example, password reset
requires:

- a non-enumerating request response;
- a short-lived, one-use reset secret;
- safe storage of only its hash;
- retry and attempt limits;
- password replacement;
- a decision about revoking existing sessions; and
- email-delivery recovery.

### Decision trigger

Add one of these features when an accepted product journey requires it. Do not
bundle all of them into a generic “user management platform.”

---

## 5. SQLite allows one active writer replica

### Explain it like I am five

SQLite is one notebook stored on disk. One Identity process can read and write
that notebook safely.

Adding more Identity pods is like giving several people pens and asking them to
write in the same physical notebook from different rooms. The Kubernetes volume
and the application were not designed for that.

### What works today

- One Identity replica owns one SQLite file.
- The `ReadWriteOnce` persistent volume keeps the file when the pod restarts.
- WAL mode improves reads and writes inside the current SQLite setup.
- A five-second busy timeout handles short lock contention.
- Transactions protect challenge issuance and consumption.

This is a reasonable small learning setup.

### What the ceiling means

The service cannot safely gain availability or write throughput by increasing
`replicas` from one to several.

`ReadWriteOnce` means the volume is writable from one Kubernetes node at a time.
Even if multiple pods happen to mount it on one node, multiple independent
application processes sharing a network-mounted SQLite file are not the accepted
design.

Consequences include:

- one active application writer;
- no normal active-active failover;
- pod or node recovery may briefly make Identity unavailable; and
- write capacity is limited to this process and database file.

### When to replace SQLite

Move to a network database such as PostgreSQL when the exercise requires:

- multiple Identity replicas;
- independent database backups and restore operations;
- higher concurrent write throughput;
- stronger availability objectives; or
- operational access from dedicated database tooling.

Do not migrate only because “production uses PostgreSQL.” Migrate when the
single-notebook ceiling becomes a real requirement.

---

## 6. SMTP does not require TLS or authentication

### Explain it like I am five

Mailpit is a toy mailbox inside the local playground. Anyone in the playground
can drop in a letter, so it does not need a username, password, or locked tunnel.

A real email provider is outside the playground. It normally requires proof of
who is sending and an encrypted connection.

### Current configuration

Nodemailer currently uses:

```text
host: SMTP_HOST or 127.0.0.1
port: SMTP_PORT or 1025
secure: false
authentication: none
```

`secure: false` means the connection does not begin with implicit TLS.
Nodemailer may opportunistically upgrade with STARTTLS when the server offers
it, but this code does not require encrypted transport or configure provider
credentials.

Kubernetes points it at the local Mailpit service. This is correct for learning
and manual email inspection.

### Why this is not enough for real email

An external provider normally requires some combination of:

- SMTP username and password or an API key;
- TLS or STARTTLS;
- verified sender domains;
- secrets stored outside source code;
- bounce and complaint handling;
- retry behavior; and
- delivery monitoring.

Without these, delivery may fail or credentials/content could be exposed on an
untrusted network.

### Related reliability limit

Email sending and the SQLite transaction are not connected by an outbox.
Account creation can succeed while email delivery fails. Signup reports this as
`emailSent: false`, and the verification-request endpoint provides recovery
after the challenge cooldown.

### Decision trigger

Add provider authentication, encryption, secret management, and delivery
recovery before sending real user email outside the local learning environment.

---

## 7. `/health` does not check SQLite or SMTP

### Explain it like I am five

The health endpoint asks the receptionist, “Are the doors open?”

The receptionist says yes if the HTTP process can answer. They do not walk to
the vault to test the database or send a letter through the mailroom.

### What `/health` proves

A `200` response proves:

- the Node process is running;
- Express is listening; and
- this request reached the route.

It does not prove:

- SQLite can execute a query;
- the persistent volume is healthy;
- migrations are correct beyond successful startup;
- Mailpit or an SMTP provider is reachable; or
- a full signup/sign-in journey works.

### Why not check everything in liveness?

Kubernetes restarts a container when its liveness probe fails.

If liveness depended on SMTP, an email-provider outage would repeatedly restart
a healthy Identity process. Restarting Identity does not repair the email
provider and can make the incident worse.

Different checks answer different questions:

| Check | Question |
|---|---|
| Liveness | Is this process stuck and should Kubernetes restart it? |
| Readiness | Should this pod receive requests right now? |
| Dependency monitoring | Is SQLite or SMTP available? |
| End-to-end journey | Can a user actually complete authentication? |

### Better future shape

A later deployment could:

- keep liveness shallow;
- make readiness run a cheap SQLite query if database access is required for
  every useful request;
- monitor SMTP separately rather than restarting Identity; and
- run a controlled end-to-end synthetic journey outside the request path.

### Decision trigger

Improve probes when deployment reliability work begins. Do not claim database,
email, or end-to-end health from the current `/health` response.

---

## 8. Malformed JSON incorrectly returns `500`

### Explain it like I am five

There are two ways a form can be wrong.

#### The form is readable but contains a bad answer

```json
{
  "email": "not-an-email",
  "password": "short"
}
```

This is valid JSON. Express can read it, then Zod says the values are invalid.
The service correctly returns `400 Bad Request`.

#### The form itself is broken

```text
{ "email": "person@example.com", 
```

This is malformed JSON because it never closes. `express.json()` fails before
the signup route or Zod schema runs.

### Why it becomes `500` today

The current error handler understands `HttpError`. Everything else is treated as
an unexpected server failure.

The JSON parser throws a syntax error with a client-error status, but the handler
does not recognize that case. It logs the error and sends:

```json
{
  "error": "Internal server error"
}
```

with status `500`.

### Why this classification is wrong

HTTP status families communicate who can fix the request:

- `4xx`: the client must change its request;
- `5xx`: the server failed while handling a valid request.

The server cannot repair broken JSON. The client must resend valid JSON, so this
should be `400`, not `500`.

Incorrect `500` responses also create noisy server alerts and may trigger useless
client retries.

### Correct future behavior

The error middleware should recognize the JSON parser's malformed-body error and
return the normal error shape:

```json
{
  "error": "Invalid JSON"
}
```

with status `400`.

This is a small correctness fix, not a large architecture decision. It is the
clearest next code improvement in this list.

---

## 9. Account lockout is not edge rate limiting

### Explain it like I am five

Account lockout protects one door after someone tries the wrong key several
times.

Edge rate limiting is a fence around the whole property. It limits how quickly
one visitor can run between all the doors.

The service currently has the door lock, not the fence.

### What account lockout does

For a known account:

- each wrong password increments a database counter;
- the fifth wrong attempt starts a five-minute lock; and
- requests during the lock return `429`.

This slows repeated password guessing against one email address.

### What it does not do

An attacker can still:

- try one password against thousands of email addresses;
- send large numbers of signup or verification requests;
- rotate source IP addresses;
- consume CPU through repeated scrypt operations; or
- intentionally lock another user's account, causing denial of service.

Account lockout is therefore one control, not complete abuse protection.

### What edge rate limiting adds

A gateway, ingress, or service-level limiter can restrict requests before costly
work. Limits may use several dimensions:

- source IP or trusted proxy identity;
- normalized account/email where safe;
- route, such as stricter limits for `/signin` and challenge requests;
- short bursts and longer windows; and
- global service capacity.

A single IP limit is also incomplete because offices and mobile networks may
share IP addresses, while attackers can rotate them.

### Decision trigger

Add layered rate limits before exposing authentication endpoints to untrusted
internet traffic. Define trusted proxy handling, limits, storage, user-visible
`429` behavior, and monitoring rather than adding a random middleware default.

---

## Suggested learning order

This is not an accepted product roadmap. It is an order that exposes the next
concept without building everything at once.

1. **Fix malformed JSON classification.** Small, local, and clearly incorrect
   today.
2. **Choose browser integration.** Decide same-origin proxy versus credentialed
   CORS before wiring the frontend.
3. **Choose identity propagation.** Required before protected Tickets or Orders
   mutations.
4. **Add focused rate limiting.** Required before treating the service as
   internet-facing.
5. **Separate health signals.** Useful when practicing deployment and failure
   diagnosis.
6. **Configure real email delivery.** Required only when leaving local Mailpit.
7. **Add account recovery when the product requires it.** Build one complete
   journey rather than a generic account platform.
8. **Move away from SQLite when multiple replicas or stronger availability are
   required.**
9. **Publish an event only when a real consumer and recovery contract exist.**

## One-page memory aid

```text
Identity knows who the user is.
Tickets and Orders do not yet have a trusted way to learn it.

Identity stores facts locally.
It does not announce identity facts through Redis Streams.

The API works from curl.
A browser on another origin is blocked until CORS or a gateway is chosen.

The basic auth journey exists.
Recovery, account management, OAuth, profiles, and roles do not.

SQLite is one durable notebook.
It works for one writer, not horizontal scaling.

Mailpit is a local toy mailbox.
Real email needs encryption, credentials, secrets, and delivery recovery.

/health proves the HTTP process answers.
It does not prove SQLite, SMTP, or the full journey works.

Bad values in valid JSON return 400.
Broken JSON incorrectly returns 500 and should be fixed.

Account lockout protects one account.
Rate limiting protects the whole service from request floods.
```
