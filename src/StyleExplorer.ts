/**
 * Interactive style-reference exploration loop.
 *
 * Depends on: `OpenAIImageClient` and `ImageProcessor`.
 * Used by: `cli` explore commands.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import inquirer from 'inquirer';
import sharp from 'sharp';
import { ImageProcessor } from './ImageProcessor.js';
import { OpenAIImageClient } from './OpenAIImageClient.js';

export interface StyleExplorerResult {
  prompt: string;
  styleReferencePath: string;
}

interface StyleExplorerOptions {
  workspaceRoot: string;
  sampleSprites: string[];
  imageProcessor: ImageProcessor;
}

interface SampleSpriteSource {
  sourceFile: string;
  left: number;
  top: number;
}

export class StyleExplorer {
  private static readonly SAMPLE_CELL_SIZE = 128;
  private static readonly DEFAULT_SAMPLE_COLS = 3;

  constructor(
    private readonly client: OpenAIImageClient,
    private readonly options: StyleExplorerOptions
  ) {}

  public static async buildSampleSheetFromSources(
    workspaceRoot: string,
    imageProcessor: ImageProcessor,
    sampleSprites: string[]
  ): Promise<Buffer> {
    if (sampleSprites.length === 0) {
      throw new Error('sampleSprites must contain at least one source path.');
    }

    const cols = Math.min(StyleExplorer.DEFAULT_SAMPLE_COLS, sampleSprites.length);
    const rows = Math.ceil(sampleSprites.length / cols);
    const sampleSources: SampleSpriteSource[] = sampleSprites.map((sourceFile, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      return {
        sourceFile,
        left: col * StyleExplorer.SAMPLE_CELL_SIZE,
        top: row * StyleExplorer.SAMPLE_CELL_SIZE,
      };
    });

    const composites = await Promise.all(
      sampleSources.map(async (sample) => {
        const absoluteSourcePath = path.join(workspaceRoot, sample.sourceFile);
        const cellImage = await imageProcessor.fitToExactSize(
          absoluteSourcePath,
          StyleExplorer.SAMPLE_CELL_SIZE,
          StyleExplorer.SAMPLE_CELL_SIZE
        );
        return {
          input: cellImage,
          left: sample.left,
          top: sample.top,
        };
      })
    );

    const width = StyleExplorer.SAMPLE_CELL_SIZE * cols;
    const height = StyleExplorer.SAMPLE_CELL_SIZE * rows;
    return sharp({
      create: {
        width,
        height,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite(composites)
      .png()
      .toBuffer();
  }

  public async runInteractive(packDir: string): Promise<StyleExplorerResult> {
    let styleDirection = await this.askInitialStyleDirection();
    let currentPrompt = StyleExplorer.buildStyleReferencePrompt(styleDirection);
    let attempt = 1;
    const sampleSheetPath = await this.writeSampleSheet(packDir);

    while (true) {
      const styleResult = await this.client.generateStyleReference(currentPrompt, sampleSheetPath);
      const previewPath = path.join(packDir, `style-preview-${attempt}.png`);
      await fs.mkdir(packDir, { recursive: true });
      await fs.writeFile(previewPath, styleResult.image);
      console.log(`Preview saved to ${previewPath}`);
      if (styleResult.revisedPrompt) {
        console.log(`Revised prompt: ${styleResult.revisedPrompt}`);
      }

      const decision = await inquirer.prompt<{ action: 'approve' | 'refine' | 'retry' }>([
        {
          type: 'list',
          name: 'action',
          message: 'Approve style reference?',
          choices: [
            { name: 'Approve and continue', value: 'approve' },
            { name: 'Refine prompt', value: 'refine' },
            { name: 'Retry same prompt', value: 'retry' },
          ],
        },
      ]);

      if (decision.action === 'approve') {
        const styleReferencePath = path.join(packDir, 'style-reference.png');
        await fs.writeFile(styleReferencePath, styleResult.image);
        return { prompt: currentPrompt, styleReferencePath };
      }

      if (decision.action === 'refine') {
        const refineAnswer = await inquirer.prompt<{ refinement: string }>([
          {
            type: 'input',
            name: 'refinement',
            message: 'How should the style direction be changed?',
            validate: (value: string) => (value.trim().length > 0 ? true : 'Please provide a refinement hint.'),
          },
        ]);
        styleDirection = `${styleDirection}. Refinement: ${refineAnswer.refinement.trim()}`;
        currentPrompt = StyleExplorer.buildStyleReferencePrompt(styleDirection);
      }

      attempt += 1;
    }
  }

  public static buildStyleReferencePrompt(styleDirection: string): string {
    return [
      'The attached image is a sample sheet of actual game sprites arranged in a grid.',
      'Each sprite is upscaled with nearest-neighbor so the original pixel structure is clearly visible.',
      'TASK: Redraw this exact sample sheet in a new consistent style.',
      `STYLE DIRECTION: ${styleDirection}.`,
      'RULES:',
      '- Keep the same grid layout with the same subjects in the same positions.',
      '- Preserve each sprite silhouette, proportions, and identity exactly.',
      '- Apply the style direction uniformly across all sprites.',
      '- Pixel art constraints: hard edges, no anti-aliasing, no blur, no gradients, 16-24 colors max.',
      '- Transparent background.',
      '- Never draw a checkerboard, grid, or fake transparency pattern into the image.',
      '- No text, no labels, no UI elements.',
      '- Every sprite must stay readable at small final sizes.',
      'Return exactly one PNG image.',
    ].join(' ');
  }

  private async writeSampleSheet(packDir: string): Promise<string> {
    const sampleSheet = await StyleExplorer.buildSampleSheetFromSources(
      this.options.workspaceRoot,
      this.options.imageProcessor,
      this.options.sampleSprites
    );
    const sampleSheetPath = path.join(packDir, 'style-source-sample.png');
    await fs.mkdir(packDir, { recursive: true });
    await fs.writeFile(sampleSheetPath, sampleSheet);
    return sampleSheetPath;
  }

  private async askInitialStyleDirection(): Promise<string> {
    const answer = await inquirer.prompt<{ stylePrompt: string }>([
      {
        type: 'input',
        name: 'stylePrompt',
        message: 'Describe your target sprite style',
        validate: (value: string) => (value.trim().length > 0 ? true : 'A style prompt is required.'),
      },
    ]);
    return answer.stylePrompt.trim();
  }
}
