// Environment loading is handled by the Nest bootstrap (`loadEnvFile` in main.ts).

export const PROVIDER = {
  id: "opencode-go",
  label: "OpenCode Go",
  envKey: "OPENCODE_API_KEY",
} as const;

export const MODEL = process.env.PI_MODEL ?? "muse-spark-1.3-contributor";

export function hasProviderKey(): boolean {
  return Boolean(process.env[PROVIDER.envKey]);
}
