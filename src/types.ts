export type AssetKind = 'image' | 'spritesheet';
export type AssetCategory = 'character' | 'resource' | 'effect' | 'prop' | 'icon' | 'scene' | 'font';

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
