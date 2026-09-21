# JEV Wrapper

**English in. Typed decisions out.** A small, inspectable bridge between a conversational LLM and [TypeSafe's JEV](https://docs.typesafe.ai/).

**Canonical project home: [kencox.com/jevwrapper](https://kencox.com/jevwrapper/)** · [Source](https://github.com/bouncerguy/jevwrapper) · [MIT license](LICENSE)

Describe a decision in English. Inspect the questions, choices, and criteria. Run them through JEV. Get the actual structured answers, probability distributions, and a readable summary without a second model rewriting the decision.

```text
English + context → small LLM → inspect/edit typed plan → JEV API
                                                        ↓
                         readable result + unchanged raw JSON
```

## Quick start

Requires Node.js 22 or newer. No runtime dependencies or build step.

```sh
git clone https://github.com/bouncerguy/jevwrapper.git
cd jevwrapper
cp .env.example .env
# Add OPENAI_API_KEY, TYPESAFE_API_KEY, and a random OWNER_TOKEN to .env.
# Generate an owner token with: openssl rand -hex 32
npm start
```

Open **http://127.0.0.1:3187/jevwrapper/**. The illustrative browser demo works without keys. For live mode, enter the owner token in the interface. The token stays in page memory and is cleared on reload; API keys stay on the server. The hosted canonical page offers the public demo and documentation; its paid live gateway is for the owner. Fork and run your own instance to use your own accounts.

Get a TypeSafe API key from [the TypeSafe console](https://console.typesafe.ai/keys). Get your OpenAI API key from your OpenAI account. This project does not include JEV model weights, API credits, or provider access. Provider terms apply separately from the MIT license on this code.

## What it does

- **Interpret:** OpenAI Responses API with a strict JSON schema translates English into a plan. It asks for clarification when material criteria are missing.
- **Inspect:** the browser exposes the original context, atomic questions, options, and rubric before evaluation. You can edit the plan.
- **Decide:** validated questions are submitted to the documented TypeSafe `POST /v1/systemone` endpoint.
- **Preserve:** outputs retain the original result values. The readable summary uses deterministic formatting, not a model that could alter a decision.
- **Review:** a configurable threshold marks uncertain outputs `needs_review`. This tool returns recommendations; it never sends mail, transfers funds, or executes downstream actions.

The OpenAI interpreter is an initial adapter, not a requirement for the decision library. Any model or hand-authored workflow can produce the documented plan shape and call `decide()`. Other providers are not bundled or tested in this release.

## Library usage

```js
import { interpret, decide } from './src/index.js';

const { plan } = await interpret({
  message: 'Route this ticket to billing (payments), technical (software bugs), or sales (new purchases).',
  context: 'My invoice was charged twice.'
});

// Show plan to your user; resolve clarifications and inspect the rubric.
if (plan.clarifications.length === 0) {
  const result = await decide({ plan, threshold: 0.7 });
  console.log(result.results, result.raw);
}
```

See [examples/english.js](examples/english.js) and [examples/direct.js](examples/direct.js). Reuse approved plans to bypass the interpreter on repeated work. Pass `{apiKey, model, fetchImpl}` as the optional second argument to either function for explicit configuration or testing. No provider key is included in returned objects.

## Plan contract

```json
{
  "summary": "Route a support ticket",
  "state": "My invoice was charged twice.",
  "clarifications": [],
  "questions": [{
    "id": "department",
    "type": "choice",
    "instructions": "Which team should handle this ticket?",
    "options": [
      {"label": "billing", "description": "Payments and invoices"},
      {"label": "technical", "description": "Software bugs"}
    ]
  }]
}
```

Questions are independent; JEV evaluates each against the same state. One question cannot refer to another's output. Compose dependent decisions in your own code as separate calls.

| Type | Plan options | Actual output | Review signal |
| --- | --- | --- | --- |
| `choice` | 2–50 labeled criteria | Chosen label + full probabilities | Provider `confidence` |
| `score` | 2–10 ordered rubric levels | Probability-weighted index, possibly fractional, from 0 to N−1 | Provider `confidence` |
| `noul` | Empty array | Probability of yes, 0–1 | Wrapper `max(p, 1−p)`, explicitly **not** provider confidence |

Choice/Score confidence is a statistic of the probability distribution; it is not the chosen option's probability or a guarantee of accuracy. The default review threshold, 0.7, is an adjustable demonstration policy, not an empirically calibrated operating recommendation. Evaluate thresholds on your own examples before relying on outcomes. Type correctness does not guarantee factual correctness or faithful interpretation.

## HTTP API

All routes are under `BASE_PATH` (default `/jevwrapper`).

- `GET /api/config`: safe capability/configuration flags; no keys.
- `POST /api/interpret`: `{message, context, history?: [{role, content}], mode: "live"}` → `{plan, mode, model, usage}`.
- `POST /api/decide`: `{plan, threshold?: 0.7, mode: "live"}` → `{results, summary, raw, request, mode, model, usage, elapsedMs, threshold}`.

POSTs require `Content-Type: application/json` and `Authorization: Bearer OWNER_TOKEN`. Live web calls are disabled until both provider keys and a token of at least 24 characters are configured. Errors use `{error: string}` and an appropriate non-2xx status; there is no silent simulated fallback.

## Configuration and deployment

| Variable | Default | Purpose |
| --- | --- | --- |
| `OPENAI_API_KEY` | unset | Server-side interpreter credential |
| `TYPESAFE_API_KEY` | unset | Server-side JEV credential |
| `OWNER_TOKEN` | unset | Protect paid web endpoints; at least 24 characters |
| `OPENAI_MODEL` | `gpt-5-mini` | Structured-output interpreter model |
| `JEV_MODEL` | `jev-latest` | TypeSafe model alias |
| `HOST` | `127.0.0.1` | Bind interface |
| `PORT` | `3187` | Local port |
| `BASE_PATH` | `/jevwrapper` | URL prefix; empty string for root |
| `MAX_REQUESTS_PER_DAY` | `200` | Per-process web API call limit (UTC; resets on restart) |

Use a reverse proxy with HTTPS and leave Node bound to localhost. See [deploy/](deploy/). Set file permissions on your environment file to 600. Do not expose provider credentials in browser code, analytics, or a repository. The in-memory rate limit is designed for one small owner-operated instance; multi-user deployments need durable quotas, user authentication, and a shared limiter. Model/API usage is billed by the respective providers; this project has no end-to-end cost or latency benchmark.

## Privacy and limits

The app does not persist submitted conversations, plans, or API credentials, and does not log request bodies. Your original request/context goes to OpenAI for interpretation and to TypeSafe for evaluation. OpenAI requests set `store: false`; provider retention policies still apply. Avoid sending information you are not authorized to share. The browser demo uses illustrative fixtures and makes no model call. Third-party font requests may be made by the public page.

Translation can still be wrong. Inspect criteria, provide sufficient context, and test with representative cases. Scores and thresholds should not be mistaken for validated business rules. This release is a small initial reference implementation; it is not a general reasoning system, a local JEV model, or a production multi-tenant service.

## Development

```sh
npm test
npm run check
```

Tests exercise API translation, uncertainty behavior, fractional scoring, invalid/provider responses, clarification gates, original-context preservation, and HTTP access protection. Provider calls are mocked in the automated suite; live checks require your own credentials.

Contributions and practical examples welcome. Please report reproducible issues without credentials or private data. See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).

## Sources

- [TypeSafe API contract](https://docs.typesafe.ai/api)
- [TypeSafe confidence semantics](https://docs.typesafe.ai/confidence)
- [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs)

Independent project by [Ken Cox](https://kencox.com/). Not affiliated with or endorsed by TypeSafe or OpenAI. MIT applies to this repository's original code, not third-party models or services.
