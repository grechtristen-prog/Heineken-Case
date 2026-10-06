# Verification report

Verification date: 2026-10-06

## Executed checks

`node n8n/tests/verify-workflows.mjs` executes the JavaScript from the exported n8n Code nodes, in workflow order, with a mocked Webhook payload. It covers:

- all three action branches;
- unresolved service issue precedence;
- missing/null evidence without zero substitution;
- invalid and unsupported Prepare Action requests;
- untrusted review text not being interpolated;
- all six outcome branches;
- calendar-day calculations from the supplied simulation `contactDate`;
- callback and monitoring requirements;
- strict approval enforcement;
- unsupported outcomes;
- deterministic task IDs across retries;
- relevant contact-reminder cancellation and preservation of service tasks; and
- the sustained-recovery caveat.

JSON parse checks are also run across every `.json` file under `n8n/`.

The UX integration adds and executes these separate checks:

- 17 Vitest checks for the contract adapter, local fallback, approval invalidation, all outcomes, deterministic IDs, duplicate prevention, and cancellation scope;
- 3 Node proxy checks using a local mock upstream, including secret forwarding, validation, and unconfigured behavior;
- 2 Playwright journeys covering desktop reload/reset and mobile usability while the unconfigured proxy exercises the labeled local fallback;
- a successful TypeScript/Vite production build and production-server smoke test; and
- 4 existing Python data-preparation checks.

## Pending checks

The following were not executed because no n8n instance or credentials were available in this workspace:

- importing the exports into the target n8n version;
- binding the `HEINEKEN Webhook Secret` Header Auth credential;
- executing test webhook URLs through n8n;
- confirming the installed n8n version accepts the exported node type versions and dynamic response code expression;
- activating/publishing either workflow;
- an actual app → server → n8n round trip (the implemented proxy test uses a mock upstream); and
- production webhook execution.

No AI node is included. Therefore AI-provider failure was not executed; the whole working workflow is the deterministic template fallback. No live business system was contacted or modified.
