import test from "node:test";
import assert from "node:assert/strict";

import {
  applyUserAction,
  createBlocklistHttpClient,
  createMemoryAddressStore,
  evaluateSendProtection
} from "../src/index.js";

const NOW = Date.parse("2025-03-19T17:00:00Z");
const TRUSTED_EXCHANGE = "0x1a3f90b2c4d6e8f0112233445566778899c7d2e1";
const POISON_LOOKALIKE = "0x1a3f90b2c4d6e8f0112233445566778899a7d2e1";
const CLEAN_NEW_ADDRESS = "0x8b7f10c2d4e6a8f0011223344556677889900abc";

function buildBaseInput(destinationAddress) {
  return {
    currentTimestamp: NOW,
    destinationAddress,
    trustedAddresses: [{ address: TRUSTED_EXCHANGE, label: "Main Exchange" }],
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
  };
}

test("requires review and returns modal state for a high-risk send attempt", async () => {
  const store = createMemoryAddressStore();
  const result = await evaluateSendProtection(buildBaseInput(POISON_LOOKALIKE), {
    addressStore: store,
    blocklistClient: {
      async checkAddress() {
        return { listed: false, entry: null };
      }
    }
  });

  assert.equal(result.decision, "review_required");
  assert.equal(result.intervention.type, "modal");
  assert.equal(result.intervention.actions.length, 3);
  assert.equal(result.intervention.diff.segments.filter((segment) => !segment.matches).length, 1);
});

test("shared blocklist forces review even when heuristic score alone would not block", async () => {
  const store = createMemoryAddressStore();
  const result = await evaluateSendProtection(buildBaseInput(CLEAN_NEW_ADDRESS), {
    addressStore: store,
    blocklistClient: {
      async checkAddress() {
        return {
          listed: true,
          address: CLEAN_NEW_ADDRESS,
          entry: { riskLevel: "high", source: "community" }
        };
      }
    }
  });

  assert.equal(result.decision, "review_required");
  assert.equal(result.intervention.type, "modal");
  assert.equal(result.riskAssessment.reasons[0].code, "shared_blocklist_match");
});

test("local allowlist bypasses modal review", async () => {
  const store = createMemoryAddressStore({ allowlist: [POISON_LOOKALIKE] });
  const result = await evaluateSendProtection(buildBaseInput(POISON_LOOKALIKE), {
    addressStore: store
  });

  assert.equal(result.decision, "allowed");
  assert.equal(result.intervention.type, "none");
});

test("user proceed action suppresses one follow-up review", async () => {
  const store = createMemoryAddressStore();
  applyUserAction(store, POISON_LOOKALIKE, "proceed");

  const result = await evaluateSendProtection(buildBaseInput(POISON_LOOKALIKE), {
    addressStore: store
  });

  assert.equal(result.decision, "allowed");
  assert.equal(result.intervention.type, "modal");
});

test("local blocklist hard-blocks destination before heuristic evaluation", async () => {
  const store = createMemoryAddressStore({ blocklist: [POISON_LOOKALIKE] });
  const result = await evaluateSendProtection(buildBaseInput(POISON_LOOKALIKE), {
    addressStore: store
  });

  assert.equal(result.decision, "blocked");
  assert.equal(result.intervention.type, "blocked");
  assert.equal(result.riskAssessment, null);
});

test("http blocklist client normalizes addresses and parses JSON payloads", async () => {
  const client = createBlocklistHttpClient({
    endpoint: "https://sentinel.test",
    fetchImpl: async (url) => {
      assert.equal(
        String(url),
        "https://sentinel.test/v1/blocklist/check?address=0x1a3f90b2c4d6e8f0112233445566778899a7d2e1"
      );

      return {
        ok: true,
        async json() {
          return { listed: true, entry: { riskLevel: "high" } };
        }
      };
    }
  });

  const result = await client.checkAddress("0x1A3F90B2C4D6E8F0112233445566778899A7D2E1");
  assert.equal(result.listed, true);
  assert.equal(result.entry.riskLevel, "high");
});
