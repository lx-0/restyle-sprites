import fs from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';
import { AssetDefinition, RestyleSpritesConfig } from './types.js';

interface LoadedConfig {
  configPath: string;
  configDir: string;
  config: RestyleSpritesConfig;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function assertString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Invalid config field "${field}": expected non-empty string.`);
  }
  return value.trim();
}

function assertNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new Error(`Invalid config field "${field}": expected number.`);
  }
  return value;
}

function parseAssetDefinition(value: unknown, index: number): AssetDefinition {
  if (!isObject(value)) {
    throw new Error(`Invalid config field "assets[${index}]": expected object.`);
  }

  const kind = assertString(value.kind, `assets[${index}].kind`);
  const base = {
    id: assertString(value.id, `assets[${index}].id`),
    sourceFile: assertString(value.sourceFile, `assets[${index}].sourceFile`),
    outputFile: assertString(value.outputFile, `assets[${index}].outputFile`),
    kind,
    category: value.category as AssetDefinition['category'],
    width: assertNumber(value.width, `assets[${index}].width`),
    height: assertNumber(value.height, `assets[${index}].height`),
    promptHint: assertString(value.promptHint, `assets[${index}].promptHint`),
    metadata: isObject(value.metadata) ? value.metadata : undefined,
  };

  if (kind === 'image') {
    return {
      ...base,
      kind: 'image',
    };
  }

  if (kind === 'spritesheet') {
    return {
      ...base,
      kind: 'spritesheet',
      frameWidth: assertNumber(value.frameWidth, `assets[${index}].frameWidth`),
      frameHeight: assertNumber(value.frameHeight, `assets[${index}].frameHeight`),
      frameCount: assertNumber(value.frameCount, `assets[${index}].frameCount`),
      frameDirection: assertString(value.frameDirection, `assets[${index}].frameDirection`) as 'vertical' | 'horizontal',
    };
  }

  throw new Error(`Invalid config field "assets[${index}].kind": expected "image" or "spritesheet".`);
}

function validateConfig(data: unknown): RestyleSpritesConfig {
  if (!isObject(data)) {
    throw new Error('Invalid config: expected object at root.');
  }

  const assetsRaw = data.assets;
  if (!Array.isArray(assetsRaw) || assetsRaw.length === 0) {
    throw new Error('Invalid config field "assets": expected non-empty array.');
  }

  const sampleSpritesRaw = data.sampleSprites;
  if (!Array.isArray(sampleSpritesRaw) || sampleSpritesRaw.length === 0) {
    throw new Error('Invalid config field "sampleSprites": expected non-empty array.');
  }

  return {
    outputDir: assertString(data.outputDir, 'outputDir'),
    assets: assetsRaw.map((asset, index) => parseAssetDefinition(asset, index)),
    sampleSprites: sampleSpritesRaw.map((sample, index) => assertString(sample, `sampleSprites[${index}]`)),
    defaultActivePack:
      typeof data.defaultActivePack === 'string' && data.defaultActivePack.trim().length > 0
        ? data.defaultActivePack.trim()
        : undefined,
  };
}

export async function loadConfig(configPathArg: string): Promise<LoadedConfig> {
  const configPath = path.resolve(configPathArg);
  const configDir = path.dirname(configPath);
  const raw = await fs.readFile(configPath, 'utf8');
  const ext = path.extname(configPath).toLowerCase();

  const parsed =
    ext === '.yaml' || ext === '.yml'
      ? yaml.load(raw)
      : ext === '.json'
        ? JSON.parse(raw)
        : (() => {
            throw new Error(`Unsupported config extension "${ext}". Use .json, .yaml, or .yml`);
          })();

  return {
    configPath,
    configDir,
    config: validateConfig(parsed),
  };
}
