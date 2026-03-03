import sharp from 'sharp';
import * as iq from 'image-q';
import { AssetCategory } from './types.js';

interface RawImage {
  data: Buffer;
  width: number;
  height: number;
}

export interface PixelArtPostProcessorOptions {
  maxColors?: number;
  alphaThreshold?: number;
  sourceReference?: Buffer;
  category?: AssetCategory;
}

interface AlphaBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export class PixelArtPostProcessor {
  private static readonly DEFAULT_MAX_COLORS = 24;
  private static readonly DEFAULT_ALPHA_THRESHOLD = 128;

  public async process(
    rawBuffer: Buffer,
    targetWidth: number,
    targetHeight: number,
    options?: PixelArtPostProcessorOptions
  ): Promise<Buffer> {
    const alphaThreshold = options?.alphaThreshold ?? PixelArtPostProcessor.DEFAULT_ALPHA_THRESHOLD;
    const maxColors = options?.maxColors ?? PixelArtPostProcessor.DEFAULT_MAX_COLORS;

    const isLayoutSensitiveCategory = options?.category === 'font' || options?.category === 'scene';
    const binarized = await this.binarizeAlpha(rawBuffer, alphaThreshold);
    const processedBase = isLayoutSensitiveCategory ? binarized : await this.alphaTightCrop(binarized);
    const quantized = await this.quantizeColors(processedBase, maxColors);
    const resized = isLayoutSensitiveCategory
      ? await this.resizeNearest(quantized, targetWidth, targetHeight)
      : await this.resizeWithReferenceGeometry({
          content: quantized,
          targetWidth,
          targetHeight,
          sourceReference: options?.sourceReference,
          alphaThreshold,
        });
    const cleaned = await this.finalAlphaCleanup(resized, alphaThreshold);
    if (!isLayoutSensitiveCategory && options?.sourceReference) {
      const masked = await this.applySourceMask(cleaned, options.sourceReference, targetWidth, targetHeight);
      return this.zeroRgbOnTransparent(masked);
    }
    return this.zeroRgbOnTransparent(cleaned);
  }

  public async extractPalette(sourceBuffer: Buffer, maxColors = PixelArtPostProcessor.DEFAULT_MAX_COLORS): Promise<string[]> {
    const quantized = await this.quantizeColors(sourceBuffer, maxColors);
    const raw = await this.toRawImage(quantized);
    const colors = new Set<string>();

    for (let index = 0; index < raw.data.length; index += 4) {
      const alpha = raw.data[index + 3];
      if (alpha === 0) {
        continue;
      }
      const red = raw.data[index];
      const green = raw.data[index + 1];
      const blue = raw.data[index + 2];
      colors.add(this.rgbToHex(red, green, blue));
      if (colors.size >= maxColors) {
        break;
      }
    }

    return Array.from(colors);
  }

  public async stripLegacyBackground(sourceBuffer: Buffer, tolerance = 34): Promise<Buffer> {
    const raw = await this.toRawImage(sourceBuffer);
    if (!this.isFullyOpaque(raw)) {
      return this.zeroRgbOnTransparent(sourceBuffer);
    }

    const keyColor = this.estimateBackgroundColor(raw.data, raw.width, raw.height);
    for (let index = 0; index < raw.data.length; index += 4) {
      const red = raw.data[index];
      const green = raw.data[index + 1];
      const blue = raw.data[index + 2];
      const distance = Math.sqrt((red - keyColor.r) ** 2 + (green - keyColor.g) ** 2 + (blue - keyColor.b) ** 2);
      if (distance > tolerance) {
        raw.data[index + 3] = 255;
        continue;
      }
      raw.data[index + 3] = 0;
      raw.data[index] = 0;
      raw.data[index + 1] = 0;
      raw.data[index + 2] = 0;
    }
    return this.fromRawImage(raw);
  }

  public async binarizeAlpha(buffer: Buffer, threshold = PixelArtPostProcessor.DEFAULT_ALPHA_THRESHOLD): Promise<Buffer> {
    const raw = await this.toRawImage(buffer);
    for (let index = 3; index < raw.data.length; index += 4) {
      raw.data[index] = raw.data[index] < threshold ? 0 : 255;
    }
    return this.fromRawImage(raw);
  }

  public async alphaTightCrop(buffer: Buffer): Promise<Buffer> {
    const raw = await this.toRawImage(buffer);
    let minX = raw.width;
    let minY = raw.height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < raw.height; y += 1) {
      for (let x = 0; x < raw.width; x += 1) {
        const pixelOffset = (y * raw.width + x) * 4;
        const alpha = raw.data[pixelOffset + 3];
        if (alpha === 0) {
          continue;
        }
        if (x < minX) {
          minX = x;
        }
        if (y < minY) {
          minY = y;
        }
        if (x > maxX) {
          maxX = x;
        }
        if (y > maxY) {
          maxY = y;
        }
      }
    }

    if (maxX < minX || maxY < minY) {
      return this.createTransparentPixel();
    }

    return sharp(buffer)
      .extract({
        left: minX,
        top: minY,
        width: maxX - minX + 1,
        height: maxY - minY + 1,
      })
      .png()
      .toBuffer();
  }

  public async quantizeColors(buffer: Buffer, maxColors = PixelArtPostProcessor.DEFAULT_MAX_COLORS): Promise<Buffer> {
    const raw = await this.toRawImage(buffer);
    const pointContainer = iq.utils.PointContainer.fromUint8Array(raw.data, raw.width, raw.height);
    const palette = iq.buildPaletteSync([pointContainer], {
      colors: maxColors,
      paletteQuantization: 'wuquant',
      colorDistanceFormula: 'euclidean',
    });
    const quantized = iq.applyPaletteSync(pointContainer, palette, {
      imageQuantization: 'nearest',
      colorDistanceFormula: 'euclidean',
    });

    const quantizedData = Buffer.from(quantized.toUint8Array());
    return this.fromRawImage({
      data: quantizedData,
      width: raw.width,
      height: raw.height,
    });
  }

  public async resizeNearest(buffer: Buffer, width: number, height: number): Promise<Buffer> {
    return sharp(buffer)
      .resize(width, height, {
        fit: 'contain',
        position: 'centre',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
        kernel: sharp.kernel.nearest,
      })
      .png()
      .toBuffer();
  }

  public async finalAlphaCleanup(buffer: Buffer, threshold = PixelArtPostProcessor.DEFAULT_ALPHA_THRESHOLD): Promise<Buffer> {
    return this.binarizeAlpha(buffer, threshold);
  }

  private async resizeWithReferenceGeometry(params: {
    content: Buffer;
    targetWidth: number;
    targetHeight: number;
    sourceReference?: Buffer;
    alphaThreshold: number;
  }): Promise<Buffer> {
    if (!params.sourceReference) {
      return this.resizeNearest(params.content, params.targetWidth, params.targetHeight);
    }

    const sourceBinarized = await this.binarizeAlpha(params.sourceReference, params.alphaThreshold);
    const sourceRaw = await this.toRawImage(sourceBinarized);
    const sourceBounds = this.getSourceContentBounds(sourceRaw);
    if (!sourceBounds) {
      return this.resizeNearest(params.content, params.targetWidth, params.targetHeight);
    }

    const desiredWidth = Math.max(1, Math.round((sourceBounds.width / sourceRaw.width) * params.targetWidth));
    const desiredHeight = Math.max(1, Math.round((sourceBounds.height / sourceRaw.height) * params.targetHeight));
    const xRatio = sourceBounds.x / sourceRaw.width;
    const yRatio = sourceBounds.y / sourceRaw.height;

    const fitted = await sharp(params.content)
      .resize(desiredWidth, desiredHeight, {
        fit: 'fill',
        kernel: sharp.kernel.nearest,
      })
      .png()
      .toBuffer();

    const left = this.clamp(Math.round(xRatio * params.targetWidth), 0, Math.max(0, params.targetWidth - desiredWidth));
    const top = this.clamp(Math.round(yRatio * params.targetHeight), 0, Math.max(0, params.targetHeight - desiredHeight));

    return sharp({
      create: {
        width: params.targetWidth,
        height: params.targetHeight,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([{ input: fitted, left, top }])
      .png()
      .toBuffer();
  }

  private getAlphaBounds(raw: RawImage): AlphaBounds | null {
    let minX = raw.width;
    let minY = raw.height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < raw.height; y += 1) {
      for (let x = 0; x < raw.width; x += 1) {
        const pixelOffset = (y * raw.width + x) * 4;
        if (raw.data[pixelOffset + 3] === 0) {
          continue;
        }
        if (x < minX) {
          minX = x;
        }
        if (y < minY) {
          minY = y;
        }
        if (x > maxX) {
          maxX = x;
        }
        if (y > maxY) {
          maxY = y;
        }
      }
    }

    if (maxX < minX || maxY < minY) {
      return null;
    }

    return {
      x: minX,
      y: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
    };
  }

  private getSourceContentBounds(raw: RawImage): AlphaBounds | null {
    const alphaBounds = this.getAlphaBounds(raw);
    if (!alphaBounds) {
      return null;
    }

    const allOpaque = this.isFullyOpaque(raw);
    if (!allOpaque) {
      return alphaBounds;
    }

    const keyColor = this.estimateBackgroundColor(raw.data, raw.width, raw.height);
    const keyedBounds = this.getColorKeyBounds(raw, keyColor, 16);
    return keyedBounds ?? alphaBounds;
  }

  private isFullyOpaque(raw: RawImage): boolean {
    for (let index = 3; index < raw.data.length; index += 4) {
      if (raw.data[index] !== 255) {
        return false;
      }
    }
    return true;
  }

  private getColorKeyBounds(raw: RawImage, keyColor: { r: number; g: number; b: number }, tolerance: number): AlphaBounds | null {
    let minX = raw.width;
    let minY = raw.height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < raw.height; y += 1) {
      for (let x = 0; x < raw.width; x += 1) {
        const pixelOffset = (y * raw.width + x) * 4;
        const red = raw.data[pixelOffset];
        const green = raw.data[pixelOffset + 1];
        const blue = raw.data[pixelOffset + 2];
        const distance = Math.sqrt((red - keyColor.r) ** 2 + (green - keyColor.g) ** 2 + (blue - keyColor.b) ** 2);
        if (distance <= tolerance) {
          continue;
        }
        if (x < minX) {
          minX = x;
        }
        if (y < minY) {
          minY = y;
        }
        if (x > maxX) {
          maxX = x;
        }
        if (y > maxY) {
          maxY = y;
        }
      }
    }

    if (maxX < minX || maxY < minY) {
      return null;
    }

    return {
      x: minX,
      y: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
    };
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  private async applySourceMask(
    rendered: Buffer,
    sourceReference: Buffer,
    targetWidth: number,
    targetHeight: number
  ): Promise<Buffer> {
    const resizedSource = await sharp(sourceReference)
      .resize(targetWidth, targetHeight, {
        fit: 'fill',
        kernel: sharp.kernel.nearest,
      })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const renderedRaw = await sharp(rendered)
      .resize(targetWidth, targetHeight, {
        fit: 'fill',
        kernel: sharp.kernel.nearest,
      })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    let hasTransparentSourcePixels = false;
    for (let index = 3; index < resizedSource.data.length; index += 4) {
      if (resizedSource.data[index] === 0) {
        hasTransparentSourcePixels = true;
        break;
      }
    }

    const keyColor = this.estimateBackgroundColor(resizedSource.data, resizedSource.info.width, resizedSource.info.height);
    const tolerance = 34;
    const output = Buffer.from(renderedRaw.data);

    for (let index = 0; index < resizedSource.data.length; index += 4) {
      if (hasTransparentSourcePixels) {
        output[index + 3] = resizedSource.data[index + 3] === 0 ? 0 : 255;
        continue;
      }
      const sr = resizedSource.data[index];
      const sg = resizedSource.data[index + 1];
      const sb = resizedSource.data[index + 2];
      const distance = Math.sqrt((sr - keyColor.r) ** 2 + (sg - keyColor.g) ** 2 + (sb - keyColor.b) ** 2);
      output[index + 3] = distance <= tolerance ? 0 : 255;
    }

    return sharp(output, {
      raw: {
        width: resizedSource.info.width,
        height: resizedSource.info.height,
        channels: 4,
      },
    })
      .png()
      .toBuffer();
  }

  private estimateBackgroundColor(data: Buffer, width: number, height: number): { r: number; g: number; b: number } {
    const samples: Array<{ r: number; g: number; b: number }> = [];
    const points = [
      [0, 0],
      [width - 1, 0],
      [0, height - 1],
      [width - 1, height - 1],
      [Math.floor(width / 2), 0],
      [Math.floor(width / 2), height - 1],
      [0, Math.floor(height / 2)],
      [width - 1, Math.floor(height / 2)],
    ];

    for (const [x, y] of points) {
      const index = (y * width + x) * 4;
      samples.push({ r: data[index], g: data[index + 1], b: data[index + 2] });
    }

    const r = Math.round(samples.reduce((sum, color) => sum + color.r, 0) / samples.length);
    const g = Math.round(samples.reduce((sum, color) => sum + color.g, 0) / samples.length);
    const b = Math.round(samples.reduce((sum, color) => sum + color.b, 0) / samples.length);
    return { r, g, b };
  }

  private async zeroRgbOnTransparent(buffer: Buffer): Promise<Buffer> {
    const raw = await this.toRawImage(buffer);
    for (let index = 0; index < raw.data.length; index += 4) {
      if (raw.data[index + 3] !== 0) {
        continue;
      }
      raw.data[index] = 0;
      raw.data[index + 1] = 0;
      raw.data[index + 2] = 0;
    }
    return this.fromRawImage(raw);
  }

  private async toRawImage(buffer: Buffer): Promise<RawImage> {
    const result = await sharp(buffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    return {
      data: result.data,
      width: result.info.width,
      height: result.info.height,
    };
  }

  private async fromRawImage(image: RawImage): Promise<Buffer> {
    return sharp(image.data, {
      raw: {
        width: image.width,
        height: image.height,
        channels: 4,
      },
    })
      .png()
      .toBuffer();
  }

  private async createTransparentPixel(): Promise<Buffer> {
    return sharp({
      create: {
        width: 1,
        height: 1,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .png()
      .toBuffer();
  }

  private rgbToHex(red: number, green: number, blue: number): string {
    return `#${this.toHex(red)}${this.toHex(green)}${this.toHex(blue)}`;
  }

  private toHex(value: number): string {
    return value.toString(16).padStart(2, '0');
  }
}
