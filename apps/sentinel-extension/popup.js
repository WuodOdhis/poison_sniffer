import {
  applyUserAction,
  createBlocklistHttpClient,
  createMemoryAddressStore,
  evaluateSendProtection
} from "../../packages/sentinel-adapter/src/index.js";
import {
  STORAGE_KEY,
  buildEvaluationInput,
  createDemoState,
  summarizeAssessment
} from "./src/app-model.js";

const state = loadState();
const elements = getElements();
const modalState = {
  lastAddress: null
};

hydrate();

elements.sendForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  syncStateFromInputs();
  await runAssessment();
});

elements.resetDemo.addEventListener("click", () => {
  Object.assign(state, createDemoState());
  persistState();
  hydrate();
  renderAssessment(null);
});

elements.contactButtons.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-address]");
  if (!button) {
    return;
  }

  state.destinationAddress = button.dataset.address;
  elements.destinationAddress.value = state.destinationAddress;
});

elements.cancelAction.addEventListener("click", () => {
  elements.riskModal.close();
  renderAssessment({
    decision: "cancelled",
    riskAssessment: null
  });
});

elements.blockAction.addEventListener("click", async () => {
  if (!modalState.lastAddress) {
    return;
  }

  const store = createMemoryAddressStore(state.localTrust);
  applyUserAction(store, modalState.lastAddress, "block");
  state.localTrust = extractStoreSnapshot(store, state.localTrust);
  persistState();
  elements.riskModal.close();
  await runAssessment();
});

elements.proceedAction.addEventListener("click", async () => {
  if (!modalState.lastAddress) {
    return;
  }

  const store = createMemoryAddressStore(state.localTrust);
  applyUserAction(store, modalState.lastAddress, "proceed");
  state.localTrust = extractStoreSnapshot(store, state.localTrust);
  persistState();
  elements.riskModal.close();
  await runAssessment();
});

function getElements() {
  return {
    sendForm: document.querySelector("#send-form"),
    destinationAddress: document.querySelector("#destination-address"),
    amountNative: document.querySelector("#amount-native"),
    apiEndpoint: document.querySelector("#api-endpoint"),
    resetDemo: document.querySelector("#reset-demo"),
    trustedContacts: document.querySelector("#trusted-contacts"),
    recentActivity: document.querySelector("#recent-activity"),
    assessmentOutput: document.querySelector("#assessment-output"),
    riskModal: document.querySelector("#risk-modal"),
    modalTitle: document.querySelector("#modal-title"),
    modalMessage: document.querySelector("#modal-message"),
    referenceDiff: document.querySelector("#reference-diff"),
    candidateDiff: document.querySelector("#candidate-diff"),
    reasonList: document.querySelector("#reason-list"),
    contactButtons: document.querySelector("#contact-buttons"),
    cancelAction: document.querySelector("#cancel-action"),
    blockAction: document.querySelector("#block-action"),
    proceedAction: document.querySelector("#proceed-action")
  };
}

function loadState() {
  const saved = globalThis.localStorage?.getItem(STORAGE_KEY);
  if (!saved) {
    return createDemoState();
  }

  try {
    return {
      ...createDemoState(),
      ...JSON.parse(saved)
    };
  } catch {
    return createDemoState();
  }
}

function persistState() {
  globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(state));
}

function syncStateFromInputs() {
  state.destinationAddress = elements.destinationAddress.value.trim();
  state.amountNative = elements.amountNative.value.trim();
  state.apiEndpoint = elements.apiEndpoint.value.trim();
  persistState();
}

function hydrate() {
  elements.destinationAddress.value = state.destinationAddress;
  elements.amountNative.value = state.amountNative;
  elements.apiEndpoint.value = state.apiEndpoint;
  renderTrustedContacts();
  renderRecentActivity();
  renderQuickFillButtons();
}

function renderTrustedContacts() {
  elements.trustedContacts.replaceChildren(
    ...state.trustedAddresses.map((contact) => createRow(contact.label, contact.address))
  );
}

function renderRecentActivity() {
  elements.recentActivity.replaceChildren(
    ...state.recentTransactions.map((transaction) =>
      createRow(
        `${transaction.valueNative} ETH from ${transaction.from.slice(0, 10)}...`,
        new Date(transaction.timestamp).toLocaleString()
      )
    )
  );
}

function renderQuickFillButtons() {
  const buttons = state.trustedAddresses.map((contact) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip";
    button.dataset.address = contact.address;
    button.textContent = `Use ${contact.label}`;
    return button;
  });

  const poisonButton = document.createElement("button");
  poisonButton.type = "button";
  poisonButton.className = "chip";
  poisonButton.dataset.address = "0x1a3f90b2c4d6e8f0112233445566778899a7d2e1";
  poisonButton.textContent = "Use Suspicious Address";

  elements.contactButtons.replaceChildren(...buttons, poisonButton);
}

function createRow(title, subtitle) {
  const wrapper = document.createElement("div");
  wrapper.className = "row";

  const heading = document.createElement("strong");
  heading.textContent = title;

  const detail = document.createElement("small");
  detail.textContent = subtitle;

  wrapper.append(heading, detail);
  return wrapper;
}

function createStoreSnapshot(seed) {
  return createMemoryAddressStore(seed);
}

function extractStoreSnapshot(store, previous) {
  const snapshot = {
    allowlist: [],
    blocklist: [],
    overrides: {}
  };

  for (const address of previous.allowlist || []) {
    if (store.hasAllowlisted(address)) {
      snapshot.allowlist.push(address);
    }
  }

  for (const address of previous.blocklist || []) {
    if (store.hasBlocked(address)) {
      snapshot.blocklist.push(address);
    }
  }

  const knownAddresses = new Set([
    ...(previous.allowlist || []),
    ...(previous.blocklist || []),
    ...Object.keys(previous.overrides || {}),
    state.destinationAddress
  ]);

  for (const address of knownAddresses) {
    if (store.hasAllowlisted(address) && !snapshot.allowlist.includes(address)) {
      snapshot.allowlist.push(address);
    }

    if (store.hasBlocked(address) && !snapshot.blocklist.includes(address)) {
      snapshot.blocklist.push(address);
    }

    const override = store.getOverride(address);
    if (override) {
      snapshot.overrides[address] = override;
    }
  }

  return snapshot;
}

async function createBlocklistClient() {
  if (!state.apiEndpoint) {
    return {
      async checkAddress(address) {
        const normalized = address.toLowerCase();
        if (normalized === "0x1a3f90b2c4d6e8f0112233445566778899a7d2e1") {
          return {
            listed: true,
            address: normalized,
            entry: {
              riskLevel: "high",
              source: "seed",
              reasonCodes: ["community_blocklist", "lookalike_attack"]
            }
          };
        }

        return { listed: false, address: normalized, entry: null };
      }
    };
  }

  return createBlocklistHttpClient({ endpoint: state.apiEndpoint });
}

async function runAssessment() {
  const store = createStoreSnapshot(state.localTrust);
  const blocklistClient = await createBlocklistClient();
  const result = await evaluateSendProtection(buildEvaluationInput(state), {
    addressStore: store,
    blocklistClient
  });

  state.localTrust = extractStoreSnapshot(store, state.localTrust);
  persistState();
  renderAssessment(result);

  if (result.intervention.type === "modal") {
    modalState.lastAddress = state.destinationAddress;
    renderModal(result);
    elements.riskModal.showModal();
  }
}

function renderAssessment(result) {
  elements.assessmentOutput.textContent = "";

  if (!result) {
    const hint = document.createElement("p");
    hint.className = "hint";
    hint.textContent = "Run a send review to see the calculated risk and reasons.";
    elements.assessmentOutput.append(hint);
    return;
  }

  const summary = summarizeAssessment(result);
  const status = document.createElement("span");
  status.className = `status status-${summary.severity}`;
  status.textContent = summary.scoreLabel;

  const decision = document.createElement("p");
  decision.textContent = `Decision: ${result.decision}`;

  const lines = document.createElement("div");
  lines.className = "list";

  for (const line of summary.lines) {
    const item = document.createElement("div");
    item.className = "row";
    item.textContent = line;
    lines.append(item);
  }

  elements.assessmentOutput.append(status, decision, lines);
}

function renderModal(result) {
  elements.modalTitle.textContent = result.intervention.title;
  elements.modalMessage.textContent = result.intervention.message;

  renderDiffLine(elements.referenceDiff, result.intervention.diff.segments, "reference");
  renderDiffLine(elements.candidateDiff, result.intervention.diff.segments, "candidate");

  elements.reasonList.replaceChildren(
    ...result.riskAssessment.reasons.map((reason) => {
      const row = document.createElement("div");
      row.className = "row";
      row.textContent = summarizeAssessment({ riskAssessment: { severity: "high", score: 1, reasons: [reason] } }).lines[0];
      return row;
    })
  );
}

function renderDiffLine(container, segments, key) {
  container.textContent = "";

  for (const segment of segments) {
    const span = document.createElement("span");
    span.className = segment.matches ? "match" : "mismatch";
    span.textContent = segment[key] || " ";
    container.append(span);
  }
}

renderAssessment(null);
