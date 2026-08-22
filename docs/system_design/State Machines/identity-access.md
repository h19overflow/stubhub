# Identity Access State-Machine Worksheet

**Status:** Completed example.

Identity access uses two small machines because an account and an authenticated
session are different business entities.

## Account lifecycle

```text
Machine selected:
Account lifecycle

Business entity:
Account

Authoritative owner:
Identity Service

Relevant invariants:
IA-1, IA-5

Initial state:
active

Active states:
active

Terminal states:
None in the current scope.

Data that is not state:
userId, email, password hash, created time
```

### Transitions

| From | Trigger | Guard | To | User-visible outcome | Retry behavior |
|---|---|---|---|---|---|
| No account | Submit sign-up | Email and password are valid; email is unique | active | Account is created | The same attempt cannot create a duplicate account |

### Rejected actions

| Attempt | Reason | Result |
|---|---|---|
| Sign-up | Invalid email or password | No account is created |
| Sign-up | Email already belongs to an account | No second account is created |
| Sign-up | Identity access is unavailable | No partial account is exposed as successful |

### Race rule

If two sign-up attempts use the same email, only one may create the account.

## Authentication session lifecycle

```text
Machine selected:
Authentication session lifecycle

Business entity:
Authentication session

Authoritative owner:
Identity Service

Relevant invariants:
IA-2, IA-3, IA-4, IA-5

Initial state:
active

Active states:
active

Terminal states:
signed_out, expired

Data that is not state:
sessionId, userId, created time, expiration deadline
```

### Transitions

| From | Trigger | Guard | To | User-visible outcome | Retry behavior |
|---|---|---|---|---|---|
| No session | Successful sign-up or sign-in | Account exists and identity is accepted | active | User is signed in and sent to the tickets index | A retry must not create partial or conflicting authentication |
| active | Sign out | The named session is active | signed_out | User is signed out | Repeating sign-out leaves it signed out |
| active | Session deadline passes | The named session is active and expired | expired | User must sign in again | Repeating expiration leaves it expired |

### Rejected actions and non-transitions

| Attempt | Reason | Resulting state |
|---|---|---|
| Sign-in | Credentials are incorrect | No session is created |
| Sign-in | Identity access is unavailable | No session is created |
| Protected action | Session is signed out or expired | Session remains terminal; access is rejected |

Incorrect credentials use one generic response and do not reveal whether the
email or password was wrong.

## Relationship between the machines

- Creating an account does not automatically mean every session is active.
- Successful sign-up creates the account and establishes an active session.
- An account may remain active after all its sessions are signed out or expired.
- Sign-out or expiration applies only to the named session and cannot invalidate
  a newer session accidentally.

## Completion check

- One email creates at most one account.
- Invalid sign-up or sign-in causes no successful transition.
- Successful authentication establishes exactly one acting user identity.
- Signed-out and expired sessions never authorize protected actions.
- Repeated and concurrent attempts have deterministic outcomes.
