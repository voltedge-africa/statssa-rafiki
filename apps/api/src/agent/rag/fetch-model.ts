process.env.RAG_ALLOW_DOWNLOAD = "1";

const { MODEL_ID, MODELS_DIR } = await import("./config.ts");
const { warmUp } = await import("./embed.ts");

console.log(`Preparing local embedding model "${MODEL_ID}".`);
console.log(`Cache directory: ${MODELS_DIR}`);
console.log("This is the only RAG step that touches the network.\n");

await warmUp();

console.log("\nModel cached. The server and ingest now run fully offline.");
