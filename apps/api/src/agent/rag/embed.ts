import { env, pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";
import { ALLOW_DOWNLOAD, EMBED_DIM, MODEL_ID, MODELS_DIR } from "./config.ts";

env.cacheDir = MODELS_DIR;
env.localModelPath = MODELS_DIR;
env.allowLocalModels = true;
env.allowRemoteModels = ALLOW_DOWNLOAD;

let extractorPromise: Promise<FeatureExtractionPipeline> | undefined;

function getExtractor(): Promise<FeatureExtractionPipeline> {
  extractorPromise ??= pipeline("feature-extraction", MODEL_ID, {
    dtype: "q8",
  }) as Promise<FeatureExtractionPipeline>;
  return extractorPromise;
}

interface TensorOutput {
  dims: number[];
  data: Float32Array | number[];
}

async function embed(inputs: string[]): Promise<Float32Array[]> {
  if (inputs.length === 0) return [];
  const extractor = await getExtractor();
  const output = (await extractor(inputs, {
    pooling: "mean",
    normalize: true,
  })) as unknown as TensorOutput;

  const dim = output.dims[output.dims.length - 1] ?? EMBED_DIM;
  const data =
    output.data instanceof Float32Array ? output.data : Float32Array.from(output.data as number[]);

  const vectors: Float32Array[] = [];
  for (let offset = 0; offset + dim <= data.length; offset += dim) {
    vectors.push(data.slice(offset, offset + dim));
  }
  return vectors;
}

/** E5 convention: documents are prefixed with "passage: ". */
export function embedPassages(texts: string[]): Promise<Float32Array[]> {
  return embed(texts.map((text) => `passage: ${text}`));
}

/** E5 convention: queries are prefixed with "query: ". */
export async function embedQuery(text: string): Promise<Float32Array> {
  const [vector] = await embed([`query: ${text}`]);
  if (!vector) throw new Error("Embedding model returned no vector");
  return vector;
}

export async function warmUp(): Promise<void> {
  await embed(["passage: warmup"]);
}
