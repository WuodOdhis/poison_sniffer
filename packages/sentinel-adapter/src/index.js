import { assessSendRisk, buildAddressDiffViewModel } from "../../sentinel-core/src/index.js";

function normalizeAddress(address) {
  return String(address || "").trim().toLowerCase();
}

function createMemoryAddressStore(seed = {}) {
  const allowlist = new Set((seed.allowlist || []).map(normalizeAddress));
  const blocklist = new Set((seed.blocklist || []).map(normalizeAddress));
  const overrides = new Map(
    Object.entries(seed.overrides || {}).map(([address, value]) => [normalizeAddress(address), value])
  );

  return {
    hasAllowlisted(address) {
      return allowlist.has(normalizeAddress(address));
    },
    hasBlocked(address) {
      return blocklist.has(normalizeAddress(address));
    },
    getOverride(address) {
      return overrides.get(normalizeAddress(address)) || null;
    },
    allow(address) {
      const normalized = normalizeAddress(address);
      blocklist.delete(normalized);
      overrides.delete(normalized);
      allowlist.add(normalized);
    },
    block(address) {
      const normalized = normalizeAddress(address);
      allowlist.delete(normalized);
      overrides.delete(normalized);
      blocklist.add(normalized);
    },
    markOverride(address, value = "proceed_once") {
      overrides.set(normalizeAddress(address), value);
    }
  };
}

function summarizeReasons(riskAssessment, blocklistResult) {
  const reasons = [...riskAssessment.reasons];

  if (blocklistResult?.listed) {
    reasons.unshift({
      code: "shared_blocklist_match",
      weight: 1,
      details: blocklistResult.entry
    });
  }

  return reasons;
}

function buildIntervention({
  destinationAddress,
  riskAssessment,
  blocklistResult,
  overrideState
}) {
  if (overrideState === "allowlisted") {
    return {
      type: "none",
      title: null,
      message: "Destination address is allowlisted."
    };
  }

  if (overrideState === "blocked") {
    return {
      type: "blocked",
      title: "Blocked address",
      message: "This address is locally blocked and cannot be used."
    };
  }

  if (blocklistResult?.listed || riskAssessment.shouldBlock) {
    const referenceAddress =
      riskAssessment.matchedTrustedAddress?.address || blocklistResult?.address || destinationAddress;

    return {
      type: "modal",
      title: "Unverified address detected",
      message:
        "This destination looks like a recently introduced lookalike address. Verify before sending.",
      diff: buildAddressDiffViewModel(referenceAddress, destinationAddress),
      actions: [
        { id: "cancel", label: "This is wrong, cancel" },
        { id: "block", label: "Add to blocklist" },
        { id: "proceed", label: "This is correct, proceed anyway" }
      ]
    };
  }

  return {
    type: "none",
    title: null,
    message: null
  };
}

export async function evaluateSendProtection(input, dependencies = {}) {
  const {
    addressStore = createMemoryAddressStore(),
    blocklistClient = {
      async checkAddress() {
        return { listed: false, entry: null };
      }
    },
    scorer = assessSendRisk
  } = dependencies;

  const destinationAddress = normalizeAddress(input.destinationAddress);

  if (addressStore.hasBlocked(destinationAddress)) {
    return {
      decision: "blocked",
      riskAssessment: null,
      blocklist: null,
      intervention: buildIntervention({
        destinationAddress,
        riskAssessment: { shouldBlock: false, matchedTrustedAddress: null, reasons: [] },
        blocklistResult: null,
        overrideState: "blocked"
      })
    };
  }

  if (addressStore.hasAllowlisted(destinationAddress)) {
    const riskAssessment = scorer(input, input.config);

    return {
      decision: "allowed",
      riskAssessment,
      blocklist: null,
      intervention: buildIntervention({
        destinationAddress,
        riskAssessment,
        blocklistResult: null,
        overrideState: "allowlisted"
      })
    };
  }

  const riskAssessment = scorer(input, input.config);
  const blocklist = await blocklistClient.checkAddress(destinationAddress);
  const priorOverride = addressStore.getOverride(destinationAddress);
  const shouldBlock = blocklist.listed || riskAssessment.shouldBlock;

  return {
    decision: shouldBlock && priorOverride !== "proceed_once" ? "review_required" : "allowed",
    riskAssessment: {
      ...riskAssessment,
      reasons: summarizeReasons(riskAssessment, blocklist)
    },
    blocklist,
    intervention: buildIntervention({
      destinationAddress,
      riskAssessment,
      blocklistResult: blocklist,
      overrideState: priorOverride
    })
  };
}

export function applyUserAction(addressStore, address, action) {
  if (action === "block") {
    addressStore.block(address);
    return "blocked";
  }

  if (action === "proceed") {
    addressStore.markOverride(address, "proceed_once");
    return "overridden";
  }

  if (action === "allow") {
    addressStore.allow(address);
    return "allowlisted";
  }

  return "cancelled";
}

export function createBlocklistHttpClient({ endpoint, fetchImpl = globalThis.fetch } = {}) {
  if (!endpoint) {
    throw new Error("endpoint is required");
  }

  if (typeof fetchImpl !== "function") {
    throw new Error("fetch implementation is required");
  }

  return {
    async checkAddress(address) {
      const url = new URL("/v1/blocklist/check", endpoint);
      url.searchParams.set("address", normalizeAddress(address));

      const response = await fetchImpl(url);

      if (!response.ok) {
        throw new Error(`blocklist lookup failed with status ${response.status}`);
      }

      return response.json();
    }
  };
}

export { createMemoryAddressStore };
