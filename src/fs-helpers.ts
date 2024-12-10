import fs from "node:fs/promises";

export async function mtime(path: string): Promise<number | undefined> {
  try {
    const stats = await fs.stat(path);
    return stats.mtimeMs;
  } catch (err: any) {
    if (err.code === "ENOENT") {
      return undefined;
    } else {
      throw err;
    }
  }
}
