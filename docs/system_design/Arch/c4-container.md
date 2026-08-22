# C4 Level 2 — Container Diagram

**Source of truth:** `../../service-boundary.md`

This level expands the Ticket Marketplace into four visual layers: the React
client, backend services, service-owned data, and shared infrastructure.
Technologies and transports that have not been selected remain unnamed.

The diagram uses Mermaid flowchart layout to render the C4 container model with
explicit layers and straight relationships.

```mermaid
%%{init: {"theme": "base", "themeVariables": {"darkMode": true, "background": "#0B1120", "primaryTextColor": "#F8FAFC", "lineColor": "#CBD5E1", "edgeLabelBackground": "#0F172A", "clusterBkg": "#111827", "clusterBorder": "#64748B", "fontFamily": "Inter, Segoe UI, sans-serif"}, "flowchart": {"curve": "stepAfter", "nodeSpacing": 80, "rankSpacing": 90, "htmlLabels": true}}}%%
flowchart LR
    user["<b>Marketplace User</b><br/>Lists, discovers, purchases, and pays for tickets"]
    stripe["<b>Stripe</b><br/>External payment gateway"]

    subgraph marketplace["Ticket Marketplace"]
        direction LR

        subgraph client_layer["Client"]
            direction TB
            web["<b>React Web Client</b><br/><i>React</i><br/>Identity, listings, checkout, payment, and order history"]
        end

        subgraph service_layer["Backend Services"]
            direction TB
            identity["<b>Identity Service</b><br/>Accounts, credentials, authentication, and sessions"]
            tickets["<b>Tickets Service</b><br/>Listings, pricing, availability, reservations, and sold state"]
            orders["<b>Orders Service</b><br/>Order lifecycle, price snapshots, payment, expiration, and history"]

        end

        subgraph data_layer["Service-Owned Data"]
            direction TB
            identity_data[("<b>Identity Data Store</b><br/>Accounts, credentials, and sessions")]
            tickets_data[("<b>Tickets Data Store</b><br/>Listings and reservation state")]
            orders_data[("<b>Orders Data Store</b><br/>Lifecycle, deadlines, snapshots, and safe payment data")]

        end

        subgraph infrastructure_layer["Shared Infrastructure"]
            direction TB
            event_bus[["<b>Redis Streams</b><br/>Shared durable event delivery; contracts and connections deferred"]]
        end
    end

    user -->|"Uses in browser"| web

    web -->|"Accounts"| identity
    web -->|"Listings"| tickets
    web -->|"Purchases and orders"| orders

    identity --> identity_data
    tickets --> tickets_data
    orders --> orders_data

    orders -->|"Availability decisions"| tickets
    orders -->|"Payments"| stripe

    classDef person fill:#075985,stroke:#38BDF8,color:#F8FAFC,stroke-width:2px
    classDef external fill:#475569,stroke:#CBD5E1,color:#F8FAFC,stroke-width:2px
    classDef client fill:#1D4ED8,stroke:#93C5FD,color:#F8FAFC,stroke-width:2px
    classDef service fill:#0F4C81,stroke:#7DD3FC,color:#F8FAFC,stroke-width:2px
    classDef datastore fill:#166534,stroke:#86EFAC,color:#F8FAFC,stroke-width:2px
    classDef infrastructure fill:#92400E,stroke:#FCD34D,color:#F8FAFC,stroke-width:2px

    class user person
    class stripe external
    class web client
    class identity,tickets,orders service
    class identity_data,tickets_data,orders_data datastore
    class event_bus infrastructure

    style marketplace fill:#0B1120,stroke:#94A3B8,stroke-width:2px,color:#F8FAFC
    style client_layer fill:#111827,stroke:#475569,stroke-width:1px,color:#E2E8F0
    style service_layer fill:#111827,stroke:#475569,stroke-width:1px,color:#E2E8F0
    style data_layer fill:#111827,stroke:#475569,stroke-width:1px,color:#E2E8F0
    style infrastructure_layer fill:#111827,stroke:#475569,stroke-width:1px,color:#E2E8F0

    linkStyle default stroke:#CBD5E1,color:#F8FAFC,stroke-width:2px
```

## Container decisions

- The visual layers organize the diagram; they are not additional deployable
  containers.
- The React Web Client never accesses a database directly.
- Identity, Tickets, and Orders own separate logical data stores and never share
  database access.
- Tickets alone changes ticket availability, reservation, release, and sold
  state.
- Orders owns Order state and coordinates with Tickets; it never modifies the
  Tickets data store.
- Payments and Expiration remain internal Orders capabilities, not separate
  services or containers.
- Redis Streams is the selected shared event-delivery infrastructure. Its
  relationships remain omitted until communication and event contracts are
  chosen.
- Authenticated identity propagation between backend services remains an open
  design question and is not invented in this diagram.

