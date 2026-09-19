#!/usr/bin/env node
/**
 * End-to-end check for the WhatsApp bridge pipeline.
 *
 * Requires the Rafiki API running (default http://localhost:3001) with OPENCODE_API_KEY set.
 * It exercises the same path a tagged group message takes: POST /api/chat/final (normalizer →
 * public RAG agent → formatter) plus the relay's own `ask` mode. It does not post to WhatsApp.
 *
 * Run: node e2e.mjs   (or `npm run e2e`)
 */
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const AI_BASE_URL = (process.env.OPENWA_AI_URL ?? "http://localhost:3001").replace(/\/$/, "");
const HERE = dirname(fileURLToPath(import.meta.url));

let failures = 0;
function check(name, condition, detail = "") {
  const ok = Boolean(condition);
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail && !ok ? ` — ${detail}` : ""}`);
}

async function askFinal(message) {
  const response = await fetch(`${AI_BASE_URL}/api/chat/final`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      sessionId: `e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      message,
    }),
  });
  const body = await response.json().catch(() => null);
  return { status: response.status, body };
}

// 1. Provider is configured.
const statusResponse = await fetch(`${AI_BASE_URL}/api/status`).catch(() => null);
const status = statusResponse ? await statusResponse.json().catch(() => null) : null;
check("API reachable and provider configured", status?.hasEnvKey === true, JSON.stringify(status));

// 2. Out-of-scope question is rejected, not answered.
const outOfScope = await askFinal("Who won the 2022 FIFA World Cup?");
check(
  "out-of-scope request flagged",
  outOfScope.status === 201 && outOfScope.body?.outOfScope === true,
  JSON.stringify(outOfScope.body)?.slice(0, 200),
);
check(
  "out-of-scope reply is a scope notice, not an answer",
  /outside the Stats SA studies/i.test(outOfScope.body?.answer ?? ""),
  outOfScope.body?.answer,
);

// 3. In-scope slang is translated and answered from the RAG, by the wrapper model.
const inScope = await askFinal("do homes in GP have wifi?");
check(
  "in-scope answer is present",
  typeof inScope.body?.answer === "string" && inScope.body.answer.trim().length > 0,
  JSON.stringify(inScope.body)?.slice(0, 200),
);
check(
  "query was normalized",
  typeof inScope.body?.normalizedQuery === "string" && inScope.body.normalizedQuery.length > 0,
);
check(
  "formatter ran on deepseek-v4.1-flash",
  String(inScope.body?.formatterModel ?? "").includes("deepseek-v4.1-flash"),
  inScope.body?.formatterModel,
);
check("formatter did not fall back", inScope.body?.usedFallback === false);
check(
  "answer carries no citation markers",
  !/\[[^\]]+#\d+\]|\[factstore:/.test(inScope.body?.answer ?? ""),
  inScope.body?.answer,
);

// 4. The relay's own ask mode (the exact call the tagged path makes) produces an answer.
try {
  const output = execFileSync(
    process.execPath,
    [
      resolve(HERE, "relay.mjs"),
      "ask",
      "What percentage of households had access to the internet in 2025?",
    ],
    {
      cwd: HERE,
      encoding: "utf8",
      timeout: 180_000,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  check("relay ask returns an answer", output.trim().length > 0, output.slice(0, 160));
} catch (error) {
  check(
    "relay ask returns an answer",
    false,
    error instanceof Error ? error.message : String(error),
  );
}

console.log(`\n${failures === 0 ? "E2E PASS" : `E2E FAIL (${failures})`}`);
process.exit(failures === 0 ? 0 : 1);
