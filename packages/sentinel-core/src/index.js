const DEFAULT_CONFIG = {
  lowValueThresholdNative: 0.0005,
  highRiskThreshold: 0.8,
  meaningfulTransactionThresholdNative: 0.01,
  recentIntroductionWindowMs: 60 * 60 * 1000,
  weights: {
    lowValue: 0.35,
    similarity: 0.4,
    noMeaningfulHistory: 0.15,
    rapidFollowup: 0.1
  }
};

function normalizeAddress(address) {
  return String(address || "").trim().toLowerCase();
}

function normalizeTimestamp(value) {
  if (typeof value === "number") {
    return value;
  }

  return new Date(value).getTime();
}

function countMatchingPrefix(left, right) {
  let count = 0;

  while (count < left.length && count < right.length && left[count] === right[count]) {
    count += 1;
  }

  return count;
}

function countMatchingSuffix(left, right) {
  let count = 0;

  while (
    count < left.length &&
    count < right.length &&
    left[left.length - 1 - count] === right[right.length - 1 - count]
  ) {
    count += 1;
  }

  return count;
}

function levenshteinDistance(left, right) {
  const matrix = Array.from({ length: left.length + 1 }, () => []);

  for (let row = 0; row <= left.length; row += 1) {
    matrix[row][0] = row;
  }

  for (let column = 0; column <= right.length; column += 1) {
    matrix[0][column] = column;
  }

  for (let row = 1; row <= left.length; row += 1) {
    for (let column = 1; column <= right.length; column += 1) {
      const cost = left[row - 1] === right[column - 1] ? 0 : 1;
      matrix[row][column] = Math.min(
        matrix[row - 1][column] + 1,
        matrix[row][column - 1] + 1,
        matrix[row - 1][column - 1] + cost
      );
    }
  }

  return matrix[left.length][right.length];
}

export function scoreAddressSimilarity(candidateAddress, referenceAddress) {
  const candidate = normalizeAddress(candidateAddress);
  const reference = normalizeAddress(referenceAddress);

  if (!candidate || !reference || candidate.length !== reference.length) {
    return {
      score: 0,
      prefixMatch: 0,
      suffixMatch: 0,
      normalizedEditSimilarity: 0
    };
  }

  const prefixMatch = Math.max(0, countMatchingPrefix(candidate, reference) - 2);
  const suffixMatch = countMatchingSuffix(candidate, reference);
  const editDistance = levenshteinDistance(candidate, reference);
  const normalizedEditSimilarity = 1 - editDistance / candidate.length;

  const prefixScore = Math.min(prefixMatch, 5) / 5;
  const suffixScore = Math.min(suffixMatch, 4) / 4;
  const score = Math.min(
    1,
    prefixScore * 0.45 + suffixScore * 0.35 + normalizedEditSimilarity * 0.2
  );

  return {
    score,
    prefixMatch,
    suffixMatch,
    normalizedEditSimilarity
  };
}

function findBestTrustedMatch(candidateAddress, trustedAddresses) {
  let bestMatch = null;

  for (const trustedAddress of trustedAddresses) {
    const similarity = scoreAddressSimilarity(candidateAddress, trustedAddress.address);

    if (!bestMatch || similarity.score > bestMatch.similarity.score) {
      bestMatch = {
        trustedAddress,
        similarity
      };
    }
  }

  return bestMatch;
}

function hasMeaningfulPriorInteraction(candidateAddress, historicalTransactions, config) {
  const normalizedCandidate = normalizeAddress(candidateAddress);

  return historicalTransactions.some((transaction) => {
    const from = normalizeAddress(transaction.from);
    const to = normalizeAddress(transaction.to);
    const value = Number(transaction.valueNative || 0);

    if (value < config.meaningfulTransactionThresholdNative) {
      return false;
    }

    return from === normalizedCandidate || to === normalizedCandidate;
  });
}

function findRecentLowValueIntroduction(candidateAddress, recentTransactions, currentTimestamp, config) {
  const normalizedCandidate = normalizeAddress(candidateAddress);

  return recentTransactions.find((transaction) => {
    const from = normalizeAddress(transaction.from);
    const to = normalizeAddress(transaction.to);
    const value = Number(transaction.valueNative || 0);
    const timestamp = normalizeTimestamp(transaction.timestamp);
    const ageMs = currentTimestamp - timestamp;

    if (ageMs < 0 || ageMs > config.recentIntroductionWindowMs) {
      return false;
    }

    if (value > config.lowValueThresholdNative) {
      return false;
    }

    return from === normalizedCandidate || to === normalizedCandidate;
  }) || null;
}

function buildReasons({
  introductionTransaction,
  bestMatch,
  hasPriorMeaningfulHistory,
  currentTimestamp,
  config
}) {
  const reasons = [];

  if (introductionTransaction) {
    reasons.push({
      code: "low_value_introduction",
      weight: config.weights.lowValue,
      details: {
        transactionHash: introductionTransaction.hash || null,
        valueNative: Number(introductionTransaction.valueNative || 0)
      }
    });

    const deltaMs = currentTimestamp - normalizeTimestamp(introductionTransaction.timestamp);
    if (deltaMs <= config.recentIntroductionWindowMs) {
      reasons.push({
        code: "rapid_followup_after_introduction",
        weight: config.weights.rapidFollowup,
        details: {
          deltaMs
        }
      });
    }
  }

  if (bestMatch && bestMatch.similarity.score > 0) {
    reasons.push({
      code: "looks_like_trusted_address",
      weight: config.weights.similarity * bestMatch.similarity.score,
      details: {
        trustedAddress: bestMatch.trustedAddress.address,
        label: bestMatch.trustedAddress.label || null,
        similarity: bestMatch.similarity
      }
    });
  }

  if (!hasPriorMeaningfulHistory) {
    reasons.push({
      code: "no_meaningful_prior_history",
      weight: config.weights.noMeaningfulHistory,
      details: {}
    });
  }

  return reasons;
}

export function assessSendRisk(input, overrides = {}) {
  const config = {
    ...DEFAULT_CONFIG,
    ...overrides,
    weights: {
      ...DEFAULT_CONFIG.weights,
      ...(overrides.weights || {})
    }
  };

  const currentTimestamp = normalizeTimestamp(input.currentTimestamp);
  const bestMatch = findBestTrustedMatch(input.destinationAddress, input.trustedAddresses || []);
  const introductionTransaction = findRecentLowValueIntroduction(
    input.destinationAddress,
    input.recentTransactions || [],
    currentTimestamp,
    config
  );
  const hasPriorMeaningfulHistory = hasMeaningfulPriorInteraction(
    input.destinationAddress,
    input.historicalTransactions || [],
    config
  );

  const reasons = buildReasons({
    introductionTransaction,
    bestMatch,
    hasPriorMeaningfulHistory,
    currentTimestamp,
    config
  });

  let score = 0;

  if (introductionTransaction) {
    score += config.weights.lowValue;
    score += config.weights.rapidFollowup;
  }

  if (bestMatch) {
    score += config.weights.similarity * bestMatch.similarity.score;
  }

  if (!hasPriorMeaningfulHistory) {
    score += config.weights.noMeaningfulHistory;
  }

  score = Math.min(1, Number(score.toFixed(4)));

  const shouldBlock = Boolean(
    introductionTransaction &&
      bestMatch &&
      bestMatch.similarity.score >= 0.75 &&
      score >= config.highRiskThreshold
  );

  return {
    score,
    shouldBlock,
    severity: shouldBlock ? "high" : score >= 0.4 ? "medium" : "low",
    matchedTrustedAddress: bestMatch
      ? {
          address: bestMatch.trustedAddress.address,
          label: bestMatch.trustedAddress.label || null
        }
      : null,
    introductionTransactionHash: introductionTransaction?.hash || null,
    reasons
  };
}

export function buildAddressDiffViewModel(referenceAddress, candidateAddress) {
  const reference = normalizeAddress(referenceAddress);
  const candidate = normalizeAddress(candidateAddress);
  const length = Math.max(reference.length, candidate.length);
  const segments = [];

  for (let index = 0; index < length; index += 1) {
    const expected = reference[index] || "";
    const actual = candidate[index] || "";

    segments.push({
      index,
      reference: expected,
      candidate: actual,
      matches: expected === actual
    });
  }

  return {
    reference,
    candidate,
    segments
  };
}
