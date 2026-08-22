# Identity Access Journey — Step 1

**Status:** Drafted.

This journey records what the person does and observes. Technical implementation
details belong in the later service and API design.

## Sign-up

```text
Journey selected: Sign-up

Actor:
An unauthenticated visitor who wants to create an account.

Starting condition:
The visitor is on a landing page that explains the website and offers calls to
action to sign up or sign in.

Action the actor takes:
The visitor chooses sign-up, enters an email address and password, and submits
the form.

Successful outcome:
The account is created, the visitor is recognized as signed in, and they are
redirected to the tickets index page.

Reasons the attempt should be rejected:
- The email address is not valid.
- The password is not valid.
- The request cannot be completed because sign-up is temporarily unavailable.

What the actor observes after rejection:
- Invalid fields are identified so the visitor can correct and resubmit them.
- When sign-up is temporarily unavailable, the visitor is told to try again
  later.
- The visitor remains on the sign-up page.
```

## Sign-in

```text
Journey selected: Sign-in

Actor:
An unauthenticated visitor who already has an account.

Starting condition:
The visitor is on the landing page or sign-in page and wants to access the
website.

Action the actor takes:
The visitor enters their email address and password and submits the form.

Successful outcome:
The credentials are accepted, the visitor is recognized as signed in, and they
are redirected to the tickets index page.

Reasons the attempt should be rejected:
- The provided credentials do not match an account.
- The request cannot be completed because sign-in is temporarily unavailable.

What the actor observes after rejection:
- When the credentials are not accepted, the visitor is prompted to check and
  re-enter them without being told whether the email or password was incorrect.
- When sign-in is temporarily unavailable, the visitor is told to try again
  later.
- The visitor remains on the sign-in page.
```
