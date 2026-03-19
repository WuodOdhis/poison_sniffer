import test from "node:test";
import assert from "node:assert/strict";

import { resolveRequest } from "../src/server.js";

test("health endpoint responds with ok", async () => {
  const response = resolveRequest({
    method: "GET",
    url: "/health"
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, { status: "ok" });
});

test("blocklist endpoint returns listed entry for seeded address", async () => {
  const response = resolveRequest({
    method: "GET",
    url: "/v1/blocklist/check?address=0x1a3f90b2c4d6e8f0112233445566778899a7d2e1"
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.listed, true);
  assert.equal(response.body.entry.riskLevel, "high");
});

test("blocklist endpoint validates missing address", async () => {
  const response = resolveRequest({
    method: "GET",
    url: "/v1/blocklist/check"
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.error, "address query parameter is required");
});
