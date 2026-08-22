# C4 Level 1 — System Context

**Source of truth:** `../../service-boundary.md`

This level treats the entire ticket marketplace as one software system. The
React client and backend services are intentionally hidden until the container
diagram.

The diagram uses Mermaid flowchart layout to render the C4 context model with a
straight reading direction and explicit dark-theme contrast.

```mermaid
%%{init: {"theme": "base", "themeVariables": {"darkMode": true, "background": "#0B1120", "primaryTextColor": "#F8FAFC", "lineColor": "#CBD5E1", "edgeLabelBackground": "#0F172A", "fontFamily": "Inter, Segoe UI, sans-serif"}, "flowchart": {"curve": "stepAfter", "nodeSpacing": 100, "rankSpacing": 120, "htmlLabels": true}}}%%
flowchart LR
    user["<b>Marketplace User</b><br/>Lists, discovers, purchases, and pays for tickets"]
    marketplace["<b>Ticket Marketplace</b><br/>Identity, listings, reservations, Orders, payment coordination, and expiration"]
    stripe["<b>Stripe</b><br/>External payment gateway"]

    user -->|"Uses in browser"| marketplace
    marketplace -->|"Payment attempts"| stripe

    classDef person fill:#075985,stroke:#38BDF8,color:#F8FAFC,stroke-width:2px
    classDef system fill:#1D4ED8,stroke:#93C5FD,color:#F8FAFC,stroke-width:2px
    classDef external fill:#475569,stroke:#CBD5E1,color:#F8FAFC,stroke-width:2px

    class user person
    class marketplace system
    class stripe external

    linkStyle default stroke:#CBD5E1,color:#F8FAFC,stroke-width:2px
```

## Boundary decisions

- There is one user type. The same authenticated user may list and purchase
  tickets, including their own listing.
- The Ticket Marketplace owns application identity, listings, reservations,
  orders, and expiration decisions.
- Stripe is outside the application boundary and does not own Order state.
- Internal services, data stores, and the React client appear at C4 Level 2.
