# Authentication requirements

## Identity-owned user information

The Identity Service owns and returns this authenticated user shape:

- `id`: immutable user identifier.
- `email`: normalized sign-in identifier.
- `emailVerified`: whether email verification has completed.
- `role`: authorization role, currently `user` or `admin`.

New accounts and existing migrated accounts default to `role: "user"`. The database rejects any other role. Password hashes, verification codes, refresh tokens, and other secrets must never appear in API responses or access tokens.

## Access tokens

Access tokens must be signed, short-lived JWTs containing `sub` (the user ID), `email`, `emailVerified`, and `role`. Every backend service verifies the signature, issuer, audience, and expiration before trusting these claims.

`GET /current-user` returns the user projection from the verified access token. Other services do not call this route for each request; they verify the same token locally.

A role change is reflected after the client receives a newly issued access token. An already-issued token keeps its old role until it expires or a future revocation mechanism rejects it.

## Payment information boundary

Payment-method connection state is not an Identity field or JWT claim. Orders owns payment orchestration, and payment eligibility must be checked against its authoritative current state when checkout begins. Copying that state into Identity or a JWT would create stale authorization data and could permit an invalid purchase.

## Authorization rule

Authentication proves who the caller is. A protected operation must separately check the verified `role` against the roles allowed for that operation. Adding the claim enables role checks; each authorization-sensitive route must still enforce its own policy.
