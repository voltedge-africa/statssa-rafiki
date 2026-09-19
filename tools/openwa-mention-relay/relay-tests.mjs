import { test } from "node:test";
import assert from "node:assert/strict";
import { composePrompt, renderTable, splitForWhatsApp } from "./relay.mjs";

// The bot's WIDs plus the tagger's WID and resolved phone, as handleInbound builds them.
const strip = new Set(["27729332671", "19555623690423", "187866634317840", "27678415634"]);

test("composePrompt: tag only, no quote", () => {
  const { prompt } = composePrompt({ body: "@19555623690423 what is the population?" }, strip);
  assert.equal(prompt, "what is the population?");
});

test("composePrompt: quote only (tag with no other text)", () => {
  const { prompt } = composePrompt(
    {
      body: "@19555623690423 ",
      quotedMessage: { id: "q", body: "50 women die from food poisoning daily" },
    },
    strip,
  );
  assert.equal(prompt, "50 women die from food poisoning daily");
});

test("composePrompt: quote first, then the tagger text", () => {
  const { prompt } = composePrompt(
    {
      body: "@19555623690423 confirm if this is actually true",
      quotedMessage: { id: "q", body: "50 women die daily" },
    },
    strip,
  );
  assert.equal(prompt, "50 women die daily\n\nconfirm if this is actually true");
});

test("composePrompt: dedupes when the tagger repeats the quote", () => {
  const { prompt } = composePrompt(
    {
      body: "@19555623690423 50 women die daily",
      quotedMessage: { id: "q", body: "50 women die daily" },
    },
    strip,
  );
  assert.equal(prompt, "50 women die daily");
});

test("composePrompt: strips bot tokens from the quoted message too", () => {
  const { prompt } = composePrompt(
    {
      body: "@19555623690423 is this right?",
      quotedMessage: { id: "q", body: "@19555623690423 50 women die daily" },
    },
    strip,
  );
  assert.equal(prompt, "50 women die daily\n\nis this right?");
});

test("renderTable: pads columns into a monospace block", () => {
  const out = renderTable({
    title: "Demo",
    columns: ["Asset", "Rural (%)"],
    rows: [
      ["Refrigerator", 73.5],
      ["TV", 61],
    ],
  });
  assert.match(out, /^Demo\n```\n/);
  assert.match(out, /Asset\s+Rural \(%\)/);
  assert.match(out, /Refrigerator\s+73\.5/);
  assert.match(out, /```$/);
});

test("renderTable: no columns yields nothing", () => {
  assert.equal(renderTable({ columns: [], rows: [] }), "");
});

test("splitForWhatsApp: bounded and lossless", () => {
  const para = "Some reasonably long sentence that simulates a real answer. ".repeat(3);
  const long = Array.from({ length: 80 }, (_, i) => `#${i + 1} ${para}`).join("\n\n");
  const chunks = splitForWhatsApp(long, 4096 - 15);
  assert.ok(chunks.length > 1, "expected more than one chunk");
  assert.ok(
    chunks.every((chunk) => chunk.length <= 4096 - 15),
    "every chunk must respect the limit",
  );
  assert.equal(
    chunks.join("").replace(/\s+/g, ""),
    long.replace(/\s+/g, ""),
    "content must be lossless",
  );
});

test("splitForWhatsApp: a short message is a single chunk", () => {
  assert.deepEqual(splitForWhatsApp("hello", 100), ["hello"]);
});
