import test from "node:test";
import assert from "node:assert/strict";

import {
  buildEvaluationInput,
  createDemoState,
  summarizeAssessment
} from "../src/app-model.js";

test("buildEvaluationInput maps demo state into adapter input", () => {
  const state = createDemoState();
  const input = buildEvaluationInput(state, {
    destinationAddress: "0xabc",
    amountNative: "2.5"
  });

  assert.equal(input.destinationAddress, "0xabc");
  assert.equal(input.amountNative, "2.5");
  assert.equal(input.trustedAddresses.length, 2);
  assert.equal(input.recentTransactions.length, 2);
});

test("summarizeAssessment formats local block decisions", () => {
  const summary = summarizeAssessment({
    riskAssessment: null
  });

  assert.equal(summary.scoreLabel, "Blocked locally");
  assert.equal(summary.lines[0], "This destination is in your local blocklist.");
});

test("summarizeAssessment formats human-readable reasons", () => {
  const summary = summarizeAssessment({
    riskAssessment: {
      severity: "high",
      score: 0.95,
      reasons: [
        {
          code: "looks_like_trusted_address",
          details: { label: "Main Exchange" }
        }
      ]
    }
  });

  assert.equal(summary.severity, "high");
  assert.equal(summary.scoreLabel, "Risk Score: 0.95");
  assert.equal(summary.lines[0], "Looks similar to Main Exchange.");
});
