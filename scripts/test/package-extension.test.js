import test from "node:test";
import assert from "node:assert/strict";

import {
  rewriteAdapterImports,
  rewritePopupImports
} from "../package-extension.mjs";

test("rewritePopupImports vendors adapter imports into extension output", () => {
  const source = 'import { evaluateSendProtection } from "../../packages/sentinel-adapter/src/index.js";';
  const rewritten = rewritePopupImports(source);

  assert.equal(
    rewritten,
    'import { evaluateSendProtection } from "./vendor/sentinel-adapter.js";'
  );
});

test("rewriteAdapterImports vendors core imports into extension output", () => {
  const source = 'import { assessSendRisk } from "../../sentinel-core/src/index.js";';
  const rewritten = rewriteAdapterImports(source);

  assert.equal(rewritten, 'import { assessSendRisk } from "./sentinel-core.js";');
});
