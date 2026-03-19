export const DEMO_TRUSTED_ADDRESSES = [
  {
    label: "Main Exchange",
    address: "0x1a3f90b2c4d6e8f0112233445566778899c7d2e1"
  },
  {
    label: "Treasury Vault",
    address: "0x9b8f70a2c4d6e8f0112233445566778899ff4421"
  }
];

export const DEMO_RECENT_TRANSACTIONS = [
  {
    hash: "0xpoison0001",
    from: "0x1a3f90b2c4d6e8f0112233445566778899a7d2e1",
    to: "0xuser000000000000000000000000000000000001",
    valueNative: 0,
    timestamp: "2025-03-19T16:50:00Z"
  },
  {
    hash: "0xrefund0002",
    from: "0x8b7f10c2d4e6a8f0011223344556677889900abc",
    to: "0xuser000000000000000000000000000000000001",
    valueNative: 0.0001,
    timestamp: "2025-03-19T16:15:00Z"
  }
];

export const DEMO_HISTORICAL_TRANSACTIONS = [
  {
    hash: "0xhistory0001",
    from: "0xuser000000000000000000000000000000000001",
    to: "0x1a3f90b2c4d6e8f0112233445566778899c7d2e1",
    valueNative: 1.35,
    timestamp: "2025-03-10T12:00:00Z"
  }
];

export const STORAGE_KEY = "sentinel-demo-state";

export function createDemoState() {
  return {
    currentTimestamp: Date.parse("2025-03-19T17:00:00Z"),
    trustedAddresses: DEMO_TRUSTED_ADDRESSES,
    recentTransactions: DEMO_RECENT_TRANSACTIONS,
    historicalTransactions: DEMO_HISTORICAL_TRANSACTIONS,
    destinationAddress: "0x1a3f90b2c4d6e8f0112233445566778899a7d2e1",
    amountNative: "1.2500",
    apiEndpoint: "",
    localTrust: {
      allowlist: [],
      blocklist: [],
      overrides: {}
    }
  };
}

export function buildEvaluationInput(state, overrides = {}) {
  return {
    currentTimestamp: state.currentTimestamp,
    destinationAddress: overrides.destinationAddress ?? state.destinationAddress,
    amountNative: overrides.amountNative ?? state.amountNative,
    trustedAddresses: state.trustedAddresses,
    recentTransactions: state.recentTransactions,
    historicalTransactions: state.historicalTransactions
  };
}

export function serializeReason(reason) {
  switch (reason.code) {
    case "shared_blocklist_match":
      return "Shared blocklist already marks this address as suspicious.";
    case "low_value_introduction":
      return `Recent low-value introduction detected (${reason.details.valueNative} ETH).`;
    case "rapid_followup_after_introduction":
      return "Send attempt follows shortly after the suspicious transaction.";
    case "looks_like_trusted_address":
      return `Looks similar to ${reason.details.label || "a trusted address"}.`;
    case "no_meaningful_prior_history":
      return "No prior meaningful transaction history with this address.";
    default:
      return reason.code;
  }
}

export function summarizeAssessment(result) {
  if (!result.riskAssessment) {
    return {
      severity: "high",
      scoreLabel: "Blocked locally",
      lines: ["This destination is in your local blocklist."]
    };
  }

  return {
    severity: result.riskAssessment.severity,
    scoreLabel: `Risk Score: ${result.riskAssessment.score.toFixed(2)}`,
    lines: result.riskAssessment.reasons.map(serializeReason)
  };
}
