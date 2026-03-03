/**
 * Shared domain model for configuration and pack manifests.
 *
 * Depends on: no internal modules.
 * Used by: almost every module (`config`, `cli`, `BatchGenerator`, `AssetPackWriter`).
 *
 * @see DEC-002 Engine-agnostic metadata passthrough.
 */
export type AssetKind = 'image' | 'spritesheet';
export type AssetCategory = 'character' | 'resource' | 'effect' | 'prop' | 'icon' | 'scene' | 'font';

/**
 * Common fields for all asset definitions in a restyle config.
 *
 * Invariants:
 * - `sourceFile` is resolved relative to the config directory (see DEC-003).
 * - `outputFile` is relative to the generated pack directory.
 * - `metadata` is intentionally free-form and passed through unchanged (see DEC-002).
 */
export interface AssetDefinitionBase {
  id: string;
  sourceFile: string;
  outputFile: string;
  kind: AssetKind;
  category?: AssetCategory;
  width: number;
  height: number;
  promptHint: string;
  metadata?: Record<string, unknown>;
}

export interface ImageAssetDefinition extends AssetDefinitionBase {
  kind: 'image';
}

/**
 * Configuration for spritesheet assets.
 *
 * Invariants:
 * - `frameWidth` and `frameHeight` describe one frame.
 * - `frameCount` describes how many frames are extracted.
 * - `frameDirection` determines whether frames advance on the x- or y-axis.
 */
export interface SpriteSheetAssetDefinition extends AssetDefinitionBase {
  kind: 'spritesheet';
  frameWidth: number;
  frameHeight: number;
  frameCount: number;
  frameDirection: 'vertical' | 'horizontal';
}

export type AssetDefinition = ImageAssetDefinition | SpriteSheetAssetDefinition;

export interface StyleReference {
  packName: string;
  prompt: string;
  imagePath: string;
}

/**
 * Manifest entry written per generated asset.
 *
 * The shape is engine-agnostic by design. Consumers can use `metadata` for
 * runtime-specific keys without changing this package API (see DEC-002).
 */
export interface AssetPackManifestEntry {
  id: string;
  file: string;
  kind: AssetKind;
  width: number;
  height: number;
  frameWidth?: number;
  frameHeight?: number;
  frameCount?: number;
  frameDirection?: 'vertical' | 'horizontal';
  metadata?: Record<string, unknown>;
}

export interface AssetPackManifest {
  name: string;
  description: string;
  createdAt: string;
  styleReferenceImage?: string;
  assets: AssetPackManifestEntry[];
}

export interface RestyleSpritesConfig {
  outputDir: string;
  assets: AssetDefinition[];
  sampleSprites: string[];
  defaultActivePack?: string;
}
