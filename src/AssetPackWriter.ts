import fs from 'node:fs/promises';
import path from 'node:path';
import { AssetPackManifest, AssetPackManifestEntry } from './types.js';

interface AssetPackIndex {
  activePack: string;
  packs: Array<{ name: string; manifest: string }>;
}

export class AssetPackWriter {
  public async writeManifest(params: {
    packDir: string;
    packName: string;
    description: string;
    styleReferenceImage?: string;
    assets: AssetPackManifestEntry[];
  }): Promise<AssetPackManifest> {
    const manifest: AssetPackManifest = {
      name: params.packName,
      description: params.description,
      createdAt: new Date().toISOString(),
      styleReferenceImage: params.styleReferenceImage,
      assets: params.assets,
    };

    const manifestPath = path.join(params.packDir, 'manifest.json');
    await fs.mkdir(params.packDir, { recursive: true });
    await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    return manifest;
  }

  public async updatePackIndex(params: { packsRootDir: string; activePack: string }): Promise<void> {
    const indexPath = path.join(params.packsRootDir, 'index.json');
    const dirEntries = await fs.readdir(params.packsRootDir, { withFileTypes: true });
    const packs = (
      await Promise.all(
        dirEntries
          .filter((entry) => entry.isDirectory())
          .map(async (entry) => {
            const manifestPath = path.join(params.packsRootDir, entry.name, 'manifest.json');
            try {
              await fs.access(manifestPath);
              return {
                name: entry.name,
                manifest: `${entry.name}/manifest.json`,
              };
            } catch {
              return null;
            }
          })
      )
    ).filter((item): item is { name: string; manifest: string } => Boolean(item));

    const content: AssetPackIndex = {
      activePack: packs.some((pack) => pack.name === params.activePack) ? params.activePack : 'default',
      packs: packs.sort((a, b) => a.name.localeCompare(b.name)),
    };

    await fs.writeFile(indexPath, `${JSON.stringify(content, null, 2)}\n`, 'utf8');
  }
}
