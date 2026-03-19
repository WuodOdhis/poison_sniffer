import test from "node:test";
import assert from "node:assert/strict";

import {
  assessSendRisk,
  buildAddressDiffViewModel,
  scoreAddressSimilarity
} from "../src/index.js";

const NOW = Date.parse("2025-03-19T17:00:00Z");
const TRUSTED_EXCHANGE = "0x1a3f90b2c4d6e8f0112233445566778899c7d2e1";
const POISON_LOOKALIKE = "0x1a3f90b2c4d6e8f0112233445566778899a7d2e1";
const CLEAN_NEW_ADDRESS = "0x8b7f10c2d4e6a8f0011223344556677889900abc";

test("scores high risk for a recent low-value lookalike introduction", () => {
  const assessment = assessSendRisk({
    currentTimestamp: NOW,
    destinationAddress: POISON_LOOKALIKE,
    trustedAddresses: [
      { address: TRUSTED_EXCHANGE, label: "Main Exchange" }
    ],
    recentTransactions: [
      {
        hash: "0xpoison",
        from: POISON_LOOKALIKE,
        to: "0xuser000000000000000000000000000000000001",
        valueNative: 0,
        timestamp: NOW - 10 * 60 * 1000
      }
    ],
    historicalTransactions: []
  });

  assert.equal(assessment.shouldBlock, true);
  assert.ok(assessment.score >= 0.8);
  assert.equal(assessment.severity, "high");
  assert.deepEqual(
    assessment.reasons.map((reason) => reason.code),
    [
      "low_value_introduction",
      "rapid_followup_after_introduction",
      "looks_like_trusted_address",
      "no_meaningful_prior_history"
    ]
  );
});

test("does not block a clean new address even when it appears recently", () => {
  const assessment = assessSendRisk({
    currentTimestamp: NOW,
    destinationAddress: CLEAN_NEW_ADDRESS,
    trustedAddresses: [
      { address: TRUSTED_EXCHANGE, label: "Main Exchange" }
    ],
    recentTransactions: [
      {
        hash: "0xlegit-small",
        from: CLEAN_NEW_ADDRESS,
        to: "0xuser000000000000000000000000000000000001",
        valueNative: 0.0001,
        timestamp: NOW - 10 * 60 * 1000
      }
    ],
    historicalTransactions: []
  });

  assert.equal(assessment.shouldBlock, false);
  assert.ok(assessment.score < 0.8);
});

test("does not block a trusted address with meaningful prior history", () => {
  const assessment = assessSendRisk({
    currentTimestamp: NOW,
    destinationAddress: TRUSTED_EXCHANGE,
    trustedAddresses: [
      { address: TRUSTED_EXCHANGE, label: "Main Exchange" }
    ],
    recentTransactions: [],
    historicalTransactions: [
      {
        hash: "0xprior",
        from: "0xuser000000000000000000000000000000000001",
        to: TRUSTED_EXCHANGE,
        valueNative: 1.2,
        timestamp: NOW - 3 * 24 * 60 * 60 * 1000
      }
    ]
  });

  assert.equal(assessment.shouldBlock, false);
  assert.equal(assessment.severity, "medium");
});

test("similarity scoring weights matching prefix and suffix heavily", () => {
  const highSimilarity = scoreAddressSimilarity(POISON_LOOKALIKE, TRUSTED_EXCHANGE);
  const lowSimilarity = scoreAddressSimilarity(CLEAN_NEW_ADDRESS, TRUSTED_EXCHANGE);

  assert.ok(highSimilarity.score > 0.9);
  assert.ok(lowSimilarity.score < 0.6);
});

test("diff view model marks mismatched characters", () => {
  const diff = buildAddressDiffViewModel(TRUSTED_EXCHANGE, POISON_LOOKALIKE);
  const mismatches = diff.segments.filter((segment) => !segment.matches);

  assert.equal(mismatches.length, 1);
  assert.equal(mismatches[0].reference, "c");
  assert.equal(mismatches[0].candidate, "a");
});
