import path from "node:path";

export function dataDir(): string {
  return path.resolve(process.env.DATA_DIR || "./data");
}
