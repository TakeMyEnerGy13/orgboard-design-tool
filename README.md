# OrgBoard

A working org design tool for Forma, a fictional e-commerce brand growing from $2M toward $5M in monthly revenue. Explore how 13 roles fit together, assign ownership and see where the founder needs to step in.

[Download the narrated walkthrough](walkthrough/orgboard-walkthrough.mp4) · [English captions](walkthrough/captions.vtt)

## A two-minute tour

1. In **Structure**, open the marketing team. Olivia Brooks meets her own KPI, but her card is orange because someone in her team is below target.
2. Open Olivia, then the alert for Ethan Miller. Change his actual from **12 to 20 videos** and save. His personal result and Olivia’s team signal update immediately. Other branches keep their own issues.
3. Open the vacant **CRM Manager** role and assign an employee. Missing actuals are shown as missing data rather than poor performance.
4. In **Metrics**, open any row or card to review the plan, or select its actual to update it directly. **Goals** has two separate, measurable objectives with named owners.
5. Choose **Discuss with AI** on any role. Ask a question or propose a change. OrgBoard previews the exact fields; apply the proposal to update the organization.

## Product decisions

- **A card is a role, not a person.** Hiring, reassigning and changing managers preserve the outcome and KPI of the role. Removing a manager requires a new home for their direct reports.
- **A missed target is not a missed deadline.** An actual is compared to its target according to the metric direction. The prototype has no time series, so it does not infer pace or lateness.
- **Keep personal and team results separate.** A manager can meet their KPI while a descendant misses a target. Individual KPIs and additional goals both matter. Missing data and vacancies remain distinct.
- **Each visitor gets their own demo.** The organization persists in local storage on refresh. Forma → Restore demo resets the sample. There are no accounts or shared production database.
- **AI changes are proposals.** Only requests sent to the assistant share the current organization snapshot with the configured provider. Role IDs, fields and tree rules are validated before changes can be applied.

## Run locally

Use Node.js 22 or later. No production packages are required.

```sh
npm start
```

Open http://127.0.0.1:4188. The UI kit is available at /src/ui-kit.html. The organization tools work without a provider key.

To enable the assistant, copy .env.example to .env and set one server-side provider key. OpenRouter defaults to openai/gpt-5-mini; direct OpenAI is also supported. Never include .env in source control or public assets.

## Verify and deploy

```sh
npm test
npm run build
```

The browser suites in tests/browser.cjs, tests/clarity-assistant.cjs and tests/ui-kit.cjs use Playwright. Provide Playwright in the test environment, start the server, and run each script with Node. Set TEST_URL for another deployment and TEST_BROWSER for a specific Chromium executable. The assistant suite uses simulated provider responses.

For Vercel, use the included project configuration and add the provider key as a **sensitive Production environment variable**. The build publishes only the app, its assets and the walkthrough; the AI endpoint runs in a serverless function. For a standalone Node host, set HOST=0.0.0.0 and PUBLIC_ORIGIN to the public HTTPS origin.
