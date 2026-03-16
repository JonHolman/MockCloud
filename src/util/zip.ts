import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import JSZip from 'jszip';

function resolveEntryPath(destinationDir: string, entryName: string): string {
  const normalizedName = entryName.replace(/\\/g, '/');
  const targetPath = resolve(destinationDir, normalizedName);
  const rel = relative(destinationDir, targetPath);

  if (rel === '' || (!rel.startsWith('..') && rel !== '..' && !isAbsolute(rel))) {
    return targetPath;
  }

  throw new Error(`Zip entry escapes destination: ${entryName}`);
}

export async function extractZipBufferToDirectory(zipBuffer: Buffer, destinationDir: string): Promise<string[]> {
  const archive = await JSZip.loadAsync(zipBuffer);
  const extractedFiles: string[] = [];

  for (const entry of Object.values(archive.files)) {
    if (entry.dir) continue;

    const targetPath = resolveEntryPath(destinationDir, entry.name);
    mkdirSync(dirname(targetPath), { recursive: true });
    writeFileSync(targetPath, await entry.async('nodebuffer'));
    extractedFiles.push(targetPath);
  }

  return extractedFiles;
}
