import fs from 'node:fs/promises';
import path from 'node:path';
import { OpenAIImageClient } from './OpenAIImageClient.js';
import { ImageProcessor } from './ImageProcessor.js';
import { PixelArtPostProcessor } from './PixelArtPostProcessor.js';
import { AssetCategory, AssetDefinition, AssetPackManifestEntry } from './types.js';

export class BatchGenerator {
  private static readonly MAX_RENDER_ATTEMPTS = 2;
  private static readonly MAX_STYLE_PROMPT_CHARS = 400;
  private static readonly MAX_ASSET_HINT_CHARS = 400;

  constructor(
    private readonly openAI: OpenAIImageClient,
    private readonly imageProcessor: ImageProcessor,
    private readonly postProcessor: PixelArtPostProcessor
  ) {}

  public async generatePackAssets(params: {
    workspaceRoot: string;
    assets: AssetDefinition[];
    styleReferencePath: string;
    outputPackDir: string;
    stylePrompt: string;
  }): Promise<AssetPackManifestEntry[]> {
    const generated: AssetPackManifestEntry[] = [];

    for (const asset of params.assets) {
      const absoluteSourcePath = path.join(params.workspaceRoot, asset.sourceFile);
      const absoluteOutputPath = path.join(params.outputPackDir, asset.outputFile);
      const renderSize = this.imageProcessor.chooseRenderSize(asset.width, asset.height);
      if (await this.fileExists(absoluteOutputPath)) {
        console.log(`Skipping ${asset.id} (already generated).`);
        generated.push({
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
        continue;
      }
      console.log(`Generating ${asset.id} ...`);

      try {
        const sourceAssetRaw = await this.imageProcessor.readAsPngBuffer(absoluteSourcePath);
        const sourceAsset = await this.postProcessor.stripLegacyBackground(sourceAssetRaw);
        const sourcePalette = await this.postProcessor.extractPalette(sourceAsset);
        if (asset.kind === 'image') {
          const upscaledSource = await this.imageProcessor.upscaleForGeneration(sourceAsset, renderSize);
          const rendered = await this.renderWithRetry(
            async (prompt) =>
              this.openAI.restyleAssetBuffer({
                sourceAsset: upscaledSource,
                styleReferencePath: params.styleReferencePath,
                prompt,
                renderSize,
              }),
            asset.promptHint,
            params.stylePrompt,
            `${asset.width}x${asset.height}`,
            sourcePalette,
            asset.category
          );
          const processed = await this.postProcessor.process(rendered, asset.width, asset.height, {
            sourceReference: sourceAsset,
            category: asset.category,
          });
          await this.imageProcessor.writeBuffer(processed, absoluteOutputPath);
        } else {
          const sourceFramesRaw = await this.imageProcessor.extractSpriteFrames(absoluteSourcePath, asset);
          const sourceFrames = await Promise.all(sourceFramesRaw.map((frame) => this.postProcessor.stripLegacyBackground(frame)));
          const styledFrames: Buffer[] = [];
          for (let frameIndex = 0; frameIndex < sourceFrames.length; frameIndex += 1) {
            const upscaledFrame = await this.imageProcessor.upscaleForGeneration(sourceFrames[frameIndex], renderSize);
            const frameHint = `${asset.promptHint} Frame ${frameIndex + 1} of ${sourceFrames.length}. Keep animation continuity.`;
            const frame = await this.renderWithRetry(
              async (prompt) =>
                this.openAI.restyleAssetBuffer({
                  sourceAsset: upscaledFrame,
                  styleReferencePath: params.styleReferencePath,
                  prompt,
                  renderSize,
                }),
              frameHint,
              params.stylePrompt,
              `${asset.frameWidth}x${asset.frameHeight}`,
              sourcePalette,
              asset.category
            );
            const processedFrame = await this.postProcessor.process(frame, asset.frameWidth, asset.frameHeight, {
              sourceReference: sourceFrames[frameIndex],
              category: asset.category,
            });
            styledFrames.push(processedFrame);
          }
          await this.imageProcessor.stitchVerticalSpriteSheet(
            styledFrames,
            asset.frameWidth,
            asset.frameHeight,
            absoluteOutputPath
          );
        }
      } catch (error) {
        if (!this.isModerationBlocked(error)) {
          throw error;
        }
        console.warn(`Moderation blocked ${asset.id}; using source fallback for this asset.`);
        await this.imageProcessor.convertToPng(absoluteSourcePath, absoluteOutputPath);
      }

      generated.push({
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

    return generated;
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private isModerationBlocked(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }
    const message = error.message.toLowerCase();
    return message.includes('moderation_blocked') || message.includes('rejected by the safety system');
  }

  private buildFallbackPrompt(
    assetHint: string,
    targetSize: string,
    sourcePaletteHex: string[],
    category?: AssetCategory
  ): string {
    const shortHint = this.compactText(assetHint, BatchGenerator.MAX_ASSET_HINT_CHARS);
    const categoryContext = this.getCategoryPromptContext(category);
    const paletteConstraint = this.buildPaletteConstraint(sourcePaletteHex);
    return [
      'Image 1 is the source sprite, upscaled with nearest-neighbor so the original pixel grid is clear.',
      'Image 2 is the approved style reference.',
      'TASK: Redraw Image 1 in the style of Image 2.',
      categoryContext,
      `Asset details: ${shortHint}.`,
      'PRESERVE from Image 1: exact silhouette, proportions, object identity, pose, orientation, framing, and aspect ratio.',
      'CHANGE to match Image 2: palette, shading style, edge treatment, texture mood, and color harmony.',
      paletteConstraint,
      'PIXEL ART CONSTRAINTS: hard edges only, no anti-aliasing, no blur, no gradients, no soft shadows, no sub-pixel rendering, no dithering.',
      'Each visible pixel must be a clean square with a uniform color value.',
      'The subject must fill at least 80% of the canvas and remain centered.',
      `The output will be downscaled to ${targetSize} with nearest-neighbor, so detail must survive tiny scale.`,
      'OUTPUT: one centered sprite only, transparent PNG background, no text, no borders, no extra objects.',
    ].join(' ');
  }

  private async renderWithRetry(
    renderer: (prompt: string) => Promise<Buffer>,
    assetHint: string,
    stylePrompt: string,
    targetSize: string,
    sourcePaletteHex: string[],
    category?: AssetCategory
  ): Promise<Buffer> {
    const prompts = [
      this.buildPrompt(assetHint, stylePrompt, targetSize, sourcePaletteHex, category),
      this.buildFallbackPrompt(assetHint, targetSize, sourcePaletteHex, category),
    ];
    let lastError: unknown;
    for (let attempt = 0; attempt < BatchGenerator.MAX_RENDER_ATTEMPTS; attempt += 1) {
      try {
        return await renderer(prompts[attempt] ?? prompts[prompts.length - 1]);
      } catch (error) {
        lastError = error;
        if (!this.isModerationBlocked(error) || attempt >= BatchGenerator.MAX_RENDER_ATTEMPTS - 1) {
          throw error;
        }
        console.warn(`Retrying with safer prompt after moderation block (attempt ${attempt + 2}).`);
      }
    }
    throw lastError instanceof Error ? lastError : new Error('Asset rendering failed.');
  }

  private buildPrompt(
    assetHint: string,
    stylePrompt: string,
    targetSize: string,
    sourcePaletteHex: string[],
    category?: AssetCategory
  ): string {
    const shortStyle = this.compactText(stylePrompt, BatchGenerator.MAX_STYLE_PROMPT_CHARS);
    const shortHint = this.compactText(assetHint, BatchGenerator.MAX_ASSET_HINT_CHARS);
    const categoryContext = this.getCategoryPromptContext(category);
    const paletteConstraint = this.buildPaletteConstraint(sourcePaletteHex);
    return [
      'Image 1 is the SOURCE sprite, upscaled with nearest-neighbor so each original pixel appears as a clean square.',
      'Image 2 is the approved STYLE REFERENCE for target art direction.',
      'TASK: Redraw Image 1 in the style of Image 2.',
      categoryContext,
      `STYLE DIRECTION: ${shortStyle}.`,
      `Asset details: ${shortHint}.`,
      'PRESERVE from Image 1: exact silhouette and proportions (pixel-grid aligned), object identity, recognizable features, pose, orientation, framing, and aspect ratio.',
      'CHANGE to match Image 2: color palette, shading approach, surface texture, edge language, and overall visual mood.',
      paletteConstraint,
      'PIXEL ART CONSTRAINTS:',
      '- Hard pixel edges only. No anti-aliasing, no blur, no gradients, no soft shadows, no sub-pixel rendering, no dithering.',
      '- Maximum 16-24 distinct colors.',
      '- Keep pixel-grid consistency and block clarity with a 16-bit SNES sprite aesthetic.',
      '- Each visible pixel must be a clean square with a uniform color value.',
      '- The subject must fill at least 80% of the canvas and remain centered.',
      `- Output must remain readable after nearest-neighbor downscale to ${targetSize}.`,
      'OUTPUT: one centered sprite, transparent PNG background, no text, no border, no extra elements.',
    ].join(' ');
  }

  private buildPaletteConstraint(sourcePaletteHex: string[]): string {
    if (sourcePaletteHex.length === 0) {
      return 'Use a compact retro palette with 16-24 colors max.';
    }
    return `Use ONLY these colors (or very close variations): ${sourcePaletteHex.join(', ')}.`;
  }

  private getCategoryPromptContext(category?: AssetCategory): string {
    switch (category) {
      case 'character':
        return 'Category context: animation sprite frame. Maintain character identity, stable body proportions, and continuity across frames.';
      case 'resource':
        return 'Category context: top-down resource node. Keep a strong silhouette and immediate recognition at tiny scale.';
      case 'effect':
        return 'Category context: gameplay VFX icon. Keep lightweight form and high contrast over varied backgrounds.';
      case 'prop':
        return 'Category context: world prop. Preserve distinct shape language and clear readability across camera zoom levels.';
      case 'icon':
        return 'Category context: marker icon. Prioritize maximum readability at 16x16.';
      case 'scene':
        return 'Category context: full scene artwork. Preserve overall composition, layer depth, and camera perspective.';
      case 'font':
        return 'Category context: bitmap font strip. Preserve exact glyph grid, spacing, baseline, and character order.';
      default:
        return 'Category context: game sprite. Keep gameplay readability and clear shape separation.';
    }
  }

  private compactText(value: string, maxChars: number): string {
    const normalized = value.replace(/\s+/g, ' ').trim();
    if (normalized.length <= maxChars) {
      return normalized;
    }
    return `${normalized.slice(0, maxChars - 3)}...`;
  }
}
