import { access, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export async function writeTextFile(filePath: string, contents: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, contents, "utf8");
}

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function isDirectory(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isDirectory();
  } catch {
    return false;
  }
}

export async function readTextFileIfExists(filePath: string): Promise<string | undefined> {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return undefined;
  }
}

export async function findFilesByExtension(
  rootPath: string,
  extensions: string[],
  ignoredDirectories = new Set(["node_modules", ".git", "dist", "build"]),
): Promise<string[]> {
  const matches: string[] = [];

  async function visit(directoryPath: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(directoryPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const entryPath = path.join(directoryPath, entry.name);
      if (entry.isDirectory()) {
        if (!ignoredDirectories.has(entry.name)) {
          await visit(entryPath);
        }
      } else if (extensions.some((extension) => entry.name.endsWith(extension))) {
        matches.push(entryPath);
      }
    }
  }

  await visit(rootPath);
  return matches;
}

export async function findFiles(
  rootPath: string,
  ignoredDirectories = new Set(["node_modules", ".git", "dist", "build", "reports"]),
): Promise<string[]> {
  const matches: string[] = [];

  async function visit(directoryPath: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(directoryPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const entryPath = path.join(directoryPath, entry.name);
      if (entry.isDirectory()) {
        if (!ignoredDirectories.has(entry.name)) {
          await visit(entryPath);
        }
      } else if (entry.isFile()) {
        matches.push(entryPath);
      }
    }
  }

  await visit(rootPath);
  return matches;
}
