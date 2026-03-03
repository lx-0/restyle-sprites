import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { SpriteSheetAssetDefinition } from './types.js';

const execFileAsync = promisify(execFile);
export type ImageRenderSize = '256x256' | '512x512' | '1024x1024';

export class ImageProcessor {
  private parseRenderSize(renderSize: ImageRenderSize): number {
    return Number.parseInt(renderSize.split('x')[0] ?? '1024', 10);
  }

  public chooseRenderSize(width: number, height: number): ImageRenderSize {
    const maxDimension = Math.max(width, height);
    if (maxDimension <= 20) {
      return '256x256';
    }
    if (maxDimension <= 96) {
      return '512x512';
    }
    return '1024x1024';
  }

  private async loadAsPngBufferWithFallback(sourcePath: string): Promise<Buffer> {
    try {
      return await sharp(sourcePath).png().toBuffer();
    } catch {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'restyle-sprites-'));
      const tempPngPath = path.join(tempDir, 'source.png');
      try {
        await execFileAsync('sips', ['-s', 'format', 'png', sourcePath, '--out', tempPngPath]);
        return await fs.readFile(tempPngPath);
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    }
  }

  public async ensureDir(dirPath: string): Promise<void> {
    await fs.mkdir(dirPath, { recursive: true });
  }

  public async readAsPngBuffer(sourcePath: string): Promise<Buffer> {
    return this.loadAsPngBufferWithFallback(sourcePath);
  }

  public async convertToPng(sourcePath: string, outputPath: string): Promise<void> {
    await this.ensureDir(path.dirname(outputPath));
    try {
      await sharp(sourcePath).png().toFile(outputPath);
    } catch {
      await execFileAsync('sips', ['-s', 'format', 'png', sourcePath, '--out', outputPath]);
    }
  }

  public async writeBuffer(buffer: Buffer, outputPath: string): Promise<void> {
    await this.ensureDir(path.dirname(outputPath));
    await fs.writeFile(outputPath, buffer);
  }

  public async fitToExactSize(
    input: Buffer | string,
    width: number,
    height: number,
    outputPath?: string
  ): Promise<Buffer> {
    const normalizedInput = typeof input === 'string' ? await this.loadAsPngBufferWithFallback(input) : input;
    const buffer = await sharp(normalizedInput)
      .resize(width, height, {
        fit: 'contain',
        position: 'centre',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
        kernel: sharp.kernel.nearest,
      })
      .png()
      .toBuffer();

    if (outputPath) {
      await this.ensureDir(path.dirname(outputPath));
      await fs.writeFile(outputPath, buffer);
    }
    return buffer;
  }

  public async upscaleForGeneration(source: Buffer, renderSize: ImageRenderSize): Promise<Buffer> {
    const targetSize = this.parseRenderSize(renderSize);
    return sharp(source)
      .resize(targetSize, targetSize, {
        fit: 'contain',
        position: 'centre',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
        kernel: sharp.kernel.nearest,
      })
      .png()
      .toBuffer();
  }

  public async extractSpriteFrames(sourcePath: string, spriteSheet: SpriteSheetAssetDefinition): Promise<Buffer[]> {
    const normalizedSource = await this.loadAsPngBufferWithFallback(sourcePath);
    const frames: Buffer[] = [];
    for (let frameIndex = 0; frameIndex < spriteSheet.frameCount; frameIndex += 1) {
      const left = spriteSheet.frameDirection === 'horizontal' ? frameIndex * spriteSheet.frameWidth : 0;
      const top = spriteSheet.frameDirection === 'vertical' ? frameIndex * spriteSheet.frameHeight : 0;
      const frameBuffer = await sharp(normalizedSource)
        .extract({
          left,
          top,
          width: spriteSheet.frameWidth,
          height: spriteSheet.frameHeight,
        })
        .png()
        .toBuffer();
      frames.push(frameBuffer);
    }
    return frames;
  }

  public async stitchVerticalSpriteSheet(
    frames: Buffer[],
    frameWidth: number,
    frameHeight: number,
    outputPath: string
  ): Promise<void> {
    const canvasHeight = frameHeight * frames.length;
    const composite = frames.map((input, index) => ({
      input,
      left: 0,
      top: index * frameHeight,
    }));

    const output = await sharp({
      create: {
        width: frameWidth,
        height: canvasHeight,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite(composite)
      .png()
      .toBuffer();

    await this.ensureDir(path.dirname(outputPath));
    await fs.writeFile(outputPath, output);
  }
}
