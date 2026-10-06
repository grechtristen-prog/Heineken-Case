# Public demo with live n8n

The public jury demo needs a server-side proxy. GitHub holds the code; Vercel
hosts the public site and its `/api` functions. The GitHub repository can stay
private. Do not use GitHub Pages for the live n8n version.

## Interim Vercel-only link

Current production URL: https://heineken-retention-copilot.vercel.app

The checked-in production build currently permits the clearly labelled local
fallback (`VITE_REQUIRE_N8N=false`). This lets the app work on Vercel before
n8n is configured, but it is **not** the final live-n8n jury demo. The raw
CSVs are excluded from Vercel CLI uploads by `.vercelignore`.

If GitHub repository permissions prevent importing it into Vercel, deploy this
local checkout with `vercel link` and `vercel deploy --prod`. This creates a
public production URL without connecting GitHub; later pushes will not deploy
automatically. Sign in to Vercel on this machine when the CLI prompts.

When n8n is ready, configure the three server variables below and set the
Vercel Production build variable `VITE_REQUIRE_N8N=true`. Redeploy and verify
both workflow calls before using the URL as the final assignment link.

## 1. Activate n8n workflows

Import both files in `n8n/workflows/` into your n8n instance. In each Webhook
node, configure a Header Auth credential named `x-webhook-secret` with the same
strong secret. Activate both workflows and copy their **production** webhook
URLs (`/webhook/...`), not their editor-only test URLs (`/webhook-test/...`).
The full import and credential procedure is in [n8n/README.md](n8n/README.md).

The workflows only prepare simulated scripts and task instructions. They do
not contact customers or write to a live CRM.

## 2. Import the GitHub repository into Vercel

1. In Vercel, choose **Add New → Project → Import Git Repository** and authorize
   access to `grechtristen-prog/Heineken-Case`. The repo need not be public.
2. Use `main` as the production branch and the repository root as the root
   directory. Vercel should detect the Vite framework. The checked-in
   `vercel.json` sets `npm run build` and `dist` explicitly.
3. Before deploying, add these **Production** environment variables in the
   Vercel project. Enter their real values in Vercel, never in GitHub or code:

   | Name | Value |
   | --- | --- |
   | `N8N_ACTION_WEBHOOK_URL` | Active Prepare Action production webhook URL |
   | `N8N_OUTCOME_WEBHOOK_URL` | Active Record Outcome production webhook URL |
   | `N8N_WEBHOOK_SECRET` | The shared Header Auth secret configured in n8n |

4. Deploy the project. If you add or change a variable after a deployment,
   redeploy so the functions receive it. Use the project's stable production
   domain (typically `project-name.vercel.app`) for the assignment, not a
   preview or commit-specific deployment URL.
5. In **Settings → Deployment Protection**, make sure the production domain is
   accessible without a Vercel login.

## 3. Verify the jury link

Open the production URL in a private browser window. Select a ranked account,
click **Prepare action**, and confirm the source badge says **n8n workflow**.
Approve, simulate contact, record an outcome, and confirm the success message
says **Outcome recorded through n8n** and a follow-up task appears. Reload and
check that the task persists in this browser.

The production build requires live n8n and displays an error if a call fails.
Local development still offers a labelled fallback. If the public site shows
an integration error, check the three Vercel variables, active n8n workflows,
production webhook URLs, and n8n execution logs before recording the video.

The representative interactions remain simulated even when n8n is live.
Browser local storage holds the demo tasks, so another visitor starts with a
fresh session.

Vercel setup references: [Vite deployment](https://vercel.com/docs/frameworks/frontend/vite),
[environment variables](https://vercel.com/docs/environment-variables), and
[deployment protection](https://vercel.com/docs/deployment-protection).
