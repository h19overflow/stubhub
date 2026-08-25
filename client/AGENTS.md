# Frontend Agent Guidance

This file applies to everything under `client/`. The frontend is a Next.js Pages Router application. Preserve the existing hierarchy; add code at the lowest layer that correctly owns it.

## Current structure

```text
client/
├── pages/                  URL routes and app entrypoint
├── components/
│   ├── primitives/         App-agnostic interactive building blocks
│   └── ui/                 Shared application-level compositions
├── features/               Feature-specific UI and local interaction logic
├── hooks/                  React orchestration around API clients
└── lib/api/                Framework-free HTTP clients and DTOs
```

Use this dependency direction:

```text
pages → features → hooks → lib/api
  │         │
  └─────────┴→ components/ui → components/primitives
```

Imports must not point upward or reverse this flow.

## Placement rules

### `pages/`

A file in `pages/` is a route. Keep pages thin:

- set route metadata with `next/head`;
- compose feature components;
- pass route-level parameters or initial props;
- keep route-only layout styles in a colocated CSS Module.

Do not put reusable components, raw `fetch` calls, form validation, or business logic in a page. `_app.tsx` owns global CSS and app-wide providers only.

### `components/primitives/`

Use for small, reusable building blocks such as `Button` and `TextField`.

Primitives must:

- be application-agnostic and prop-driven;
- extend native HTML attributes when practical;
- preserve labels, focus behavior, keyboard access, and ARIA state;
- use a colocated `ComponentName.module.css` file;
- avoid API calls, route knowledge, feature state, and business vocabulary.

Do not create a primitive for one isolated element. Extract one when reuse or interaction complexity makes it useful.

### `components/ui/`

Use for shared application compositions such as `Navbar`.

Shared UI may compose primitives and Next.js navigation. It must remain configurable through props rather than hardcoding one feature's state or routes. It must not call service APIs directly.

### `features/<feature>/`

Use for business-facing presentation such as `features/auth/AuthForm.tsx` or `features/landing/SignedInLanding.tsx`.

A feature may own:

- feature-specific markup and interaction state;
- client-side validation used for immediate feedback;
- composition of shared UI and primitives;
- calls to hooks from `hooks/<feature>/` once integration exists.

Keep CSS beside the component as `ComponentName.module.css`. Split a feature only when a component has a separate responsibility or is reused; do not create speculative subfolders.

Client-side validation improves feedback but never replaces backend validation or authoritative business decisions.

### `hooks/<feature>/`

Hooks coordinate React state with an API client. They may expose data, loading state, errors, and user actions.

Hooks must not:

- render JSX;
- call `fetch` directly when a `lib/api` client exists;
- contain authoritative availability, authentication, payment, or expiration decisions;
- import pages or components.

`hooks/auth/` is intentionally scaffolded and currently contains no implementation. Add hooks only when an integration task defines their observable behavior.

### `lib/api/<service>/`

This layer owns framework-free HTTP transport:

- endpoint paths and request methods;
- request and response DTOs;
- JSON parsing and normalized HTTP errors;
- credentials and authorization headers;
- service base URL configuration already established by the project.

It must not import React, hooks, pages, or visual components. Components must not call raw service endpoints; they call a hook, which calls this layer.

`lib/api/auth/` is intentionally scaffolded and currently contains no implementation. Do not add fake responses, no-op functions, or placeholder exports.

## Authentication integration boundary

When auth connectivity is requested, inspect the current contracts in `../auth/src/http/routes/` before writing the client. Current operations include:

```text
POST /signup
POST /signin
POST /signin/code
POST /verify-email/request
POST /verify-email
POST /refresh
GET  /current-user
POST /signout
```

Rules:

- communicate through HTTP; never import runtime code from `auth/src` into the client;
- keep the access token in memory, not `localStorage`;
- send refresh requests with `credentials: "include"` because the refresh token is an HttpOnly cookie;
- after an access-token `401`, refresh and retry the original request at most once;
- keep backend error messages representable at form and page level;
- treat the current signed-in landing identity as demo content until real auth state replaces it.

## Styling and design

The root `../DESIGN.md` is the visual source of truth. Read it before UI work.

Current direction:

- near-black surfaces: `#121212`, `#181818`, `#1f1f1f`;
- white primary text and `#b3b3b3` secondary text;
- `#1ed760` only for functional emphasis such as active state or primary CTA;
- `#f3727f` for errors;
- compact typography and dense application spacing;
- pill buttons, circular controls, 6–8px cards, and strong dark elevation shadows.

Use CSS Modules for component and route styles. Keep `pages/globals.css` limited to reset, document defaults, global focus treatment, and genuine global tokens. Do not add Tailwind, CSS-in-JS, an icon package, or another design system unless explicitly requested.

Respect `prefers-reduced-motion`. Animate `transform` and `opacity`; avoid layout-triggering animation. Every interactive control needs a visible focus state and an accessible name.

## Naming and imports

- Components and component files: `PascalCase.tsx`.
- Component CSS Modules: `PascalCase.module.css`.
- Hooks: `useSomething.ts` and `useSomething`.
- API modules: descriptive lower-case names based on the operation.
- Use direct imports. Do not add barrel `index.ts` files only to shorten paths.
- Keep exported props and DTOs explicit; do not add one-implementation interfaces or factories.

## Change workflow

1. Identify the owner: route, feature, shared UI, primitive, hook, or API client.
2. Reuse an existing lower-level component before adding another.
3. Keep pages thin and service calls below hooks.
4. Update every affected caller in the same change; do not leave compatibility aliases.
5. For UI changes, run `npm run build`, launch the client, and manually check the changed route and interaction when browser tooling is available.
6. When routing or layer responsibilities change, update `docs/nextjs-routing-and-components.md` in the same change.

Do not add automated tests unless the user explicitly requests them. Use the smallest relevant build and manual route journey instead.
