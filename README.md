# Sentinel

Sentinel is a client-side transaction safety system for detecting and interrupting address poisoning attacks before funds are sent.

The current implementation targets the most common and operationally costly failure mode in retail wallet flows: a malicious address is introduced through a dust or near-zero transaction, the address visually resembles a legitimate recipient, and the user later pastes or selects the poisoned address when preparing a transfer.

## Objective

Milestone 1 is intentionally narrow.

Sentinel does not attempt to solve every form of recipient risk. It focuses on one concrete invariant:

- if a destination address was recently introduced through a low-value transaction
- and that address closely resembles a trusted or previously used address
- then the send flow should be interrupted and the user should be forced to verify the destination

This constraint is deliberate. In the first release, precision is more important than breadth.

## Design Principles

- Deterministic before probabilistic. High-impact security decisions should be explainable.
- Block only on high-confidence signals. Excessive friction degrades trust in the system.
- Keep the critical path local. The wallet should retain protection even if external services are unavailable.
- Separate scoring, integration, and presentation. Risk logic must remain testable and portable across wallet surfaces.

## System Structure

### `packages/sentinel-core`

The core scoring engine.

Responsibilities:

- low-value transaction detection
- address similarity scoring
- prior-interaction checks
- send-risk assessment
- visual diff model generation for user review

Primary entry points:

- [packages/sentinel-core/src/index.js](/home/badman/Projects/poisonsniffer/packages/sentinel-core/src/index.js)

### `packages/sentinel-adapter`

The wallet-facing orchestration layer.

Responsibilities:

- evaluating send attempts against the core engine
- merging local allowlist, blocklist, and proceed-once overrides
- consulting a shared blocklist endpoint
- returning modal-ready intervention state for UI consumers

Primary entry points:

- [packages/sentinel-adapter/src/index.js](/home/badman/Projects/poisonsniffer/packages/sentinel-adapter/src/index.js)

### `apps/sentinel-api`

The minimal shared intelligence API for milestone 1.

Responsibilities:

- blocklist lookups
- response contract for shared poison-address intelligence

Primary entry points:

- [apps/sentinel-api/src/server.js](/home/badman/Projects/poisonsniffer/apps/sentinel-api/src/server.js)

### `apps/sentinel-extension`

A self-contained browser-extension MVP that demonstrates the protected send flow.

Responsibilities:

- send form simulation
- trusted contact and recent transaction presentation
- mandatory high-risk modal
- local user actions: cancel, block, proceed

Primary entry points:

- [apps/sentinel-extension/popup.html](/home/badman/Projects/poisonsniffer/apps/sentinel-extension/popup.html)
- [apps/sentinel-extension/popup.js](/home/badman/Projects/poisonsniffer/apps/sentinel-extension/popup.js)
- [apps/sentinel-extension/src/app-model.js](/home/badman/Projects/poisonsniffer/apps/sentinel-extension/src/app-model.js)

## Detection Model

Milestone 1 uses a weighted heuristic model. The implementation is deterministic and does not depend on machine learning.

Current signals include:

- recent low-value introduction of the destination address
- strong similarity to a trusted address
- lack of meaningful prior history with the destination
- short time interval between introduction and send attempt

The current model is designed to fire only when multiple signals align. A low-value transaction alone is not sufficient. A similar-looking address alone is not sufficient. The block condition requires both structural similarity and suspicious introduction context.

## User Intervention Model

For high-confidence cases, Sentinel interrupts the send flow with a mandatory review modal.

The modal provides:

- side-by-side visual diffing between the trusted address and the candidate address
- a human-readable explanation of the triggered risk signals
- explicit user actions:
  - cancel the send
  - add the destination to the local blocklist
  - proceed once despite the warning

This preserves user autonomy while preventing silent failure.

## Milestone 1 Deliverable

The implemented milestone consists of:

- a reusable heuristic scoring engine
- a wallet-facing send-time adapter
- a shared blocklist API contract
- a packaged browser-extension MVP demonstrating the protected flow
- automated tests covering attack and non-attack scenarios

This is not yet a full wallet integration with live chain indexing, provenance analysis, or model-based inference. Those belong to subsequent phases.

## Development

Install dependencies:

```bash
npm install
```

Run the verification suite:

```bash
npm test
npm run typecheck
npm run build
```

## Loadable Extension Build

Produce a self-contained unpacked extension:

```bash
npm run package:extension
```

This emits a browser-loadable build in:

- [dist/extension](/home/badman/Projects/poisonsniffer/dist/extension)

Load it in a Chromium-compatible browser:

1. Open `chrome://extensions`
2. Enable Developer mode
3. Click `Load unpacked`
4. Select `dist/extension`

## Demonstration Flow

The packaged extension includes a default high-risk scenario.

To observe the protection path:

1. Open the extension popup
2. Leave the default suspicious destination address in place
3. Click `Review Send`

Expected behavior:

- the send attempt is escalated to mandatory review
- the visual diff highlights the mismatched character
- the risk reasons are listed
- the user must explicitly cancel, block, or proceed

For a clean path comparison:

1. Click `Use Main Exchange`
2. Click `Review Send`

Expected behavior:

- no blocking modal is shown

## Test Coverage

Representative tests are located in:

- [packages/sentinel-core/test/assess-send-risk.test.js](/home/badman/Projects/poisonsniffer/packages/sentinel-core/test/assess-send-risk.test.js)
- [packages/sentinel-adapter/test/evaluate-send-protection.test.js](/home/badman/Projects/poisonsniffer/packages/sentinel-adapter/test/evaluate-send-protection.test.js)
- [apps/sentinel-api/test/server.test.js](/home/badman/Projects/poisonsniffer/apps/sentinel-api/test/server.test.js)
- [apps/sentinel-extension/test/app-model.test.js](/home/badman/Projects/poisonsniffer/apps/sentinel-extension/test/app-model.test.js)
- [scripts/test/package-extension.test.js](/home/badman/Projects/poisonsniffer/scripts/test/package-extension.test.js)

## Roadmap

Planned next-stage work includes:

- provenance analysis for suspected poisoning addresses
- live wallet integration rather than popup simulation
- transaction history labeling and suppression
- address-book insertion safeguards
- optional model-based scoring for lower-confidence edge cases

## Status

Sentinel milestone 1 is implemented, packaged as a loadable extension, and verified through automated tests, type checking, and build validation.
