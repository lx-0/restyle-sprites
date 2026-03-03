#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import inquirer from 'inquirer';
import { AssetPackWriter } from './AssetPackWriter.js';
import { BatchGenerator } from './BatchGenerator.js';
import { loadConfig } from './config.js';
import { ImageProcessor } from './ImageProcessor.js';
import { OpenAIImageClient } from './OpenAIImageClient.js';
import { PixelArtPostProcessor } from './PixelArtPostProcessor.js';
import { StyleExplorer } from './StyleExplorer.js';
import { AssetPackManifestEntry } from './types.js';

function readArg(name: string): string | undefined {
  const args = process.argv.slice(2);
  const direct = args.find((arg) => arg.startsWith(`--${name}=`));
  if (direct) {
    return direct.slice(name.length + 3);
  }
  const index = args.indexOf(`--${name}`);
  if (index >= 0 && args[index + 1]) {
    return args[index + 1];
  }
  return undefined;
}

function requireArg(name: string): string {
  const value = readArg(name)?.trim();
  if (!value) {
    throw new Error(`Missing required argument --${name}`);
  }
  return value;
}

function loadLocalEnvironment(configDir: string): void {
  const envPath = path.join(configDir, '.env');
  loadEnv({ path: envPath, quiet: true });
}

async function resolvePackName(): Promise<string> {
  const fromArg = readArg('name');
  if (fromArg && fromArg.trim().length > 0) {
    return fromArg.trim();
  }
  const answer = await inquirer.prompt<{ packName: string }>([
    {
      type: 'input',
      name: 'packName',
      message: 'Asset pack name',
      validate: (value: string) => (value.trim().length > 0 ? true : 'Pack name is required.'),
    },
  ]);
  return answer.packName.trim();
}

async function ensurePackDirectories(outputRootDir: string, packName: string): Promise<{ packDir: string; spritesDir: string }> {
  const packDir = path.join(outputRootDir, packName);
  const spritesDir = path.join(packDir, 'sprites');
  await fs.mkdir(spritesDir, { recursive: true });
  return { packDir, spritesDir };
}

async function exploreStyle(packName: string, workspaceRoot: string, outputRootDir: string, sampleSprites: string[]): Promise<void> {
  const { packDir } = await ensurePackDirectories(outputRootDir, packName);
  const imageProcessor = new ImageProcessor();
  const styleExplorer = new StyleExplorer(new OpenAIImageClient(), {
    workspaceRoot,
    sampleSprites,
    imageProcessor,
  });
  const result = await styleExplorer.runInteractive(packDir);
  const writer = new AssetPackWriter();
  await writer.writeManifest({
    packDir,
    packName,
    description: `Style exploration draft for ${packName}. Style prompt: ${result.prompt}`,
    styleReferenceImage: path.basename(result.styleReferencePath),
    assets: [],
  });
  await writer.updatePackIndex({ packsRootDir: outputRootDir, activePack: 'default' });
  console.log(`Style reference stored at ${result.styleReferencePath}`);
}

async function exploreStyleOnce(
  packName: string,
  styleDirection: string,
  workspaceRoot: string,
  outputRootDir: string,
  sampleSprites: string[]
): Promise<void> {
  const { packDir } = await ensurePackDirectories(outputRootDir, packName);
  const client = new OpenAIImageClient();
  const imageProcessor = new ImageProcessor();
  const sampleSheet = await StyleExplorer.buildSampleSheetFromSources(workspaceRoot, imageProcessor, sampleSprites);
  const sampleSheetPath = path.join(packDir, 'style-source-sample.png');
  await fs.writeFile(sampleSheetPath, sampleSheet);
  const stylePrompt = StyleExplorer.buildStyleReferencePrompt(styleDirection);
  const styleResult = await client.generateStyleReference(stylePrompt, sampleSheetPath);
  const writer = new AssetPackWriter();
  const styleReferencePath = path.join(packDir, 'style-reference.png');
  await fs.writeFile(styleReferencePath, styleResult.image);
  await writer.writeManifest({
    packDir,
    packName,
    description: `Style exploration draft for ${packName}. Style direction: ${styleDirection}`,
    styleReferenceImage: path.basename(styleReferencePath),
    assets: [],
  });
  await writer.updatePackIndex({ packsRootDir: outputRootDir, activePack: 'default' });
  console.log(`Style reference stored at ${styleReferencePath}`);
}

async function readStylePromptFromManifest(packDir: string): Promise<string | null> {
  const manifestPath = path.join(packDir, 'manifest.json');
  try {
    const raw = await fs.readFile(manifestPath, 'utf8');
    const parsed = JSON.parse(raw) as { description?: string };
    if (!parsed.description) {
      return null;
    }
    const match = parsed.description.match(/Style (?:direction|prompt):\s*(.+)$/i);
    return match?.[1]?.trim() ?? null;
  } catch {
    return null;
  }
}

async function generatePack(params: {
  packName: string;
  workspaceRoot: string;
  outputRootDir: string;
  stylePromptArg?: string;
  assets: import('./types.js').AssetDefinition[];
}): Promise<void> {
  const { packDir } = await ensurePackDirectories(params.outputRootDir, params.packName);
  const styleReferencePath = path.join(packDir, 'style-reference.png');
  await fs.access(styleReferencePath);
  const styleDirectionFromManifest = await readStylePromptFromManifest(packDir);
  const styleDirection =
    params.stylePromptArg?.trim() ??
    styleDirectionFromManifest ??
    'Stylized 2D game sprites, cohesive palette, clean edges, high contrast, tiny-sprite readability';

  const batchGenerator = new BatchGenerator(new OpenAIImageClient(), new ImageProcessor(), new PixelArtPostProcessor());
  const assets = await batchGenerator.generatePackAssets({
    workspaceRoot: params.workspaceRoot,
    assets: params.assets,
    styleReferencePath,
    outputPackDir: packDir,
    stylePrompt: styleDirection,
  });

  const writer = new AssetPackWriter();
  await writer.writeManifest({
    packDir,
    packName: params.packName,
    description: `AI restyled asset pack: ${params.packName}`,
    styleReferenceImage: 'style-reference.png',
    assets,
  });
  await writer.updatePackIndex({ packsRootDir: params.outputRootDir, activePack: params.packName });
  console.log(`Asset pack generated: ${packDir}`);
}

async function initDefaultPack(workspaceRoot: string, outputRootDir: string, assetsConfig: import('./types.js').AssetDefinition[]): Promise<void> {
  const imageProcessor = new ImageProcessor();
  const { packDir } = await ensurePackDirectories(outputRootDir, 'default');

  const assets: AssetPackManifestEntry[] = [];
  for (const asset of assetsConfig) {
    const sourcePath = path.join(workspaceRoot, asset.sourceFile);
    const outputPath = path.join(packDir, asset.outputFile);
    await imageProcessor.convertToPng(sourcePath, outputPath);
    assets.push({
      id: asset.id,
      metadata: asset.metadata,
      file: asset.outputFile,
      kind: asset.kind,
      width: asset.width,
      height: asset.height,
      frameWidth: asset.kind === 'spritesheet' ? asset.frameWidth : undefined,
      frameHeight: asset.kind === 'spritesheet' ? asset.frameHeight : undefined,
      frameCount: asset.kind === 'spritesheet' ? asset.frameCount : undefined,
      frameDirection: asset.kind === 'spritesheet' ? asset.frameDirection : undefined,
    });
  }

  const writer = new AssetPackWriter();
  await writer.writeManifest({
    packDir,
    packName: 'default',
    description: 'Baseline asset pack converted from source assets',
    assets,
  });
  await writer.updatePackIndex({ packsRootDir: outputRootDir, activePack: 'default' });
  console.log('Default asset pack generated.');
}

function printHelp(): void {
  console.log(
    [
      'restyle-sprites',
      '',
      'Commands:',
      '  explore       --name <pack> --config <path>',
      '  explore-once  --name <pack> --config <path> --prompt "<style direction>"',
      '  generate      --name <pack> --config <path> [--style "<style direction>"]',
      '  init-default  --config <path>',
      '',
      'Notes:',
      '  - --config supports .json, .yaml, .yml',
      '  - all source/output paths are resolved relative to the config file directory',
    ].join('\n')
  );
}

async function main(): Promise<void> {
  const command = process.argv[2];
  if (!command || command === '--help' || command === '-h' || command === 'help') {
    printHelp();
    return;
  }

  const configArg = readArg('config') ?? 'restyle.config.json';
  const { configDir, config } = await loadConfig(configArg);
  loadLocalEnvironment(configDir);

  const workspaceRoot = configDir;
  const outputRootDir = path.resolve(configDir, config.outputDir);
  await fs.mkdir(outputRootDir, { recursive: true });

  if (command === 'explore') {
    const packName = await resolvePackName();
    await exploreStyle(packName, workspaceRoot, outputRootDir, config.sampleSprites);
    return;
  }
  if (command === 'explore-once') {
    const packName = await resolvePackName();
    const styleDirection = requireArg('prompt');
    await exploreStyleOnce(packName, styleDirection, workspaceRoot, outputRootDir, config.sampleSprites);
    return;
  }
  if (command === 'generate') {
    const packName = await resolvePackName();
    await generatePack({
      packName,
      workspaceRoot,
      outputRootDir,
      stylePromptArg: readArg('style'),
      assets: config.assets,
    });
    return;
  }
  if (command === 'init-default') {
    await initDefaultPack(workspaceRoot, outputRootDir, config.assets);
    return;
  }

  console.error('Unknown command. Use one of: explore, explore-once, generate, init-default');
  process.exitCode = 1;
}

void main();
