import http from "node:http";

const DEFAULT_BLOCKLIST = new Map([
  [
    "0x1a3f90b2c4d6e8f0112233445566778899a7d2e1",
    {
      riskLevel: "high",
      reasonCodes: ["community_blocklist", "lookalike_attack"],
      source: "seed"
    }
  ]
]);

function normalizeAddress(address) {
  return String(address || "").trim().toLowerCase();
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(body));
}

export function resolveRequest({ method, url, host = "localhost", blocklist = DEFAULT_BLOCKLIST }) {
  const parsedUrl = new URL(url || "/", `http://${host}`);

  if (method === "GET" && parsedUrl.pathname === "/health") {
    return {
      statusCode: 200,
      body: { status: "ok" }
    };
  }

  if (method === "GET" && parsedUrl.pathname === "/v1/blocklist/check") {
    const address = normalizeAddress(parsedUrl.searchParams.get("address"));

    if (!address) {
      return {
        statusCode: 400,
        body: { error: "address query parameter is required" }
      };
    }

    const hit = blocklist.get(address);

    return {
      statusCode: 200,
      body: {
        address,
        listed: Boolean(hit),
        entry: hit || null
      }
    };
  }

  return {
    statusCode: 404,
    body: { error: "not_found" }
  };
}

export function createServer(options = {}) {
  const blocklist = options.blocklist || DEFAULT_BLOCKLIST;

  return http.createServer((request, response) => {
    const result = resolveRequest({
      method: request.method,
      url: request.url,
      host: request.headers.host,
      blocklist
    });

    sendJson(response, result.statusCode, result.body);
  });
}

export function startServer({ port = 3000, blocklist } = {}) {
  const server = createServer({ blocklist });

  return new Promise((resolve) => {
    server.listen(port, () => {
      resolve(server);
    });
  });
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const port = Number(process.env.PORT || 3000);
  const server = await startServer({ port });

  process.on("SIGINT", () => {
    server.close(() => process.exit(0));
  });
}
