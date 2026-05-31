import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export async function writeTextFile(filePath: string, contents: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, contents, "utf8");
}
