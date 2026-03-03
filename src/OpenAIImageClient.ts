/**
 * AI image client with provider orchestration.
 *
 * Depends on: `ImageProcessor` render-size type only.
 * Used by: `StyleExplorer` and `BatchGenerator`.
 *
 * @see DEC-001 Gemini-first, OpenAI fallback.
 */
import fs from 'node:fs/promises';
import OpenAI from 'openai';
import sharp from 'sharp';
import type { ImageRenderSize } from './ImageProcessor.js';

export interface OpenAIImageClientOptions {
  model?: 'gpt-image-1.5' | 'gpt-image-1' | 'gpt-image-1-mini';
}

export interface StyleReferenceResult {
  image: Buffer;
  revisedPrompt?: string;
  responseId?: string;
}

export class OpenAIImageClient {
  private static readonly STYLE_REFERENCE_MAX_ATTEMPTS = 3;
  private readonly client: OpenAI | null;
  private readonly model: 'gpt-image-1.5' | 'gpt-image-1' | 'gpt-image-1-mini';
  private readonly geminiModel: string;

  constructor(options?: OpenAIImageClientOptions) {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    this.client = apiKey ? new OpenAI({ apiKey }) : null;
    this.model = options?.model ?? 'gpt-image-1.5';
    this.geminiModel = process.env.GEMINI_IMAGE_MODEL?.trim() || 'gemini-3.1-flash-image-preview';
  }

  private getOpenAIModelCandidates(): Array<'gpt-image-1.5' | 'gpt-image-1' | 'gpt-image-1-mini'> {
    const ordered: Array<'gpt-image-1.5' | 'gpt-image-1' | 'gpt-image-1-mini'> = [this.model, 'gpt-image-1', 'gpt-image-1-mini'];
    return Array.from(new Set(ordered));
  }

  public async generateStyleReference(prompt: string, inspirationImagePath?: string): Promise<StyleReferenceResult> {
    const inspirationImage = inspirationImagePath ? await fs.readFile(inspirationImagePath) : null;
    const inspirationB64 = inspirationImage?.toString('base64');
    const mergedPrompt = inspirationB64 ? `${prompt} Use the uploaded image as structural reference.` : prompt;

    const basePrompt = `${mergedPrompt} Transparent background. Return one PNG image.`;
    for (let attempt = 1; attempt <= OpenAIImageClient.STYLE_REFERENCE_MAX_ATTEMPTS; attempt += 1) {
      const strictSuffix =
        attempt === 1
          ? ''
          : ' CRITICAL: Do not paint checkerboard, gray-white transparency tiles, or any background grid.';
      const fullPrompt = `${basePrompt}${strictSuffix}`;
      try {
        const image = await this.generateWithGemini({
          prompt: fullPrompt,
          images: inspirationB64 ? [{ mimeType: 'image/png', data: inspirationB64 }] : undefined,
        });
        const sanitized = await this.sanitizeStyleReferenceBuffer(image);
        const quality = await this.analyzeStyleReferenceQuality(sanitized);
        if (!quality.hasCheckerboard || attempt === OpenAIImageClient.STYLE_REFERENCE_MAX_ATTEMPTS) {
          return { image: sanitized };
        }
      } catch (error) {
        if (!this.shouldFallbackToOpenAI(error)) {
          throw error;
        }
        const image = await this.generateWithOpenAI(fullPrompt, inspirationB64);
        const sanitized = await this.sanitizeStyleReferenceBuffer(image);
        const quality = await this.analyzeStyleReferenceQuality(sanitized);
        if (!quality.hasCheckerboard || attempt === OpenAIImageClient.STYLE_REFERENCE_MAX_ATTEMPTS) {
          return { image: sanitized };
        }
      }
    }

    throw new Error('Failed to generate style reference without checkerboard artifacts.');
  }

  public async restyleAsset(params: {
    sourceAssetPath: string;
    styleReferencePath: string;
    prompt: string;
    renderSize?: ImageRenderSize;
  }): Promise<Buffer> {
    const sourceBuffer = await fs.readFile(params.sourceAssetPath);
    return this.restyleAssetBuffer({
      sourceAsset: sourceBuffer,
      styleReferencePath: params.styleReferencePath,
      prompt: params.prompt,
      renderSize: params.renderSize,
    });
  }

  public async restyleAssetBuffer(params: {
    sourceAsset: Buffer;
    styleReferencePath: string;
    prompt: string;
    renderSize?: ImageRenderSize;
  }): Promise<Buffer> {
    const styleBuffer = await fs.readFile(params.styleReferencePath);
    const sanitizedStyleBuffer = await this.sanitizeStyleReferenceBuffer(styleBuffer);
    const sourceB64 = params.sourceAsset.toString('base64');
    const styleB64 = sanitizedStyleBuffer.toString('base64');
    try {
      const generated = await this.generateWithGemini({
        prompt: `${params.prompt} Return one PNG image at ${params.renderSize ?? '1024x1024'}.`,
        images: [
          { mimeType: 'image/png', data: sourceB64 },
          { mimeType: 'image/png', data: styleB64 },
        ],
      });
      return this.sanitizeStyleReferenceBuffer(generated);
    } catch (error) {
      if (!this.shouldFallbackToOpenAI(error)) {
        throw error;
      }
      const generated = await this.generateWithOpenAIRestyle(params.prompt, sourceB64, styleB64, params.renderSize);
      return this.sanitizeStyleReferenceBuffer(generated);
    }
  }

  private async generateWithOpenAI(prompt: string, inspirationB64?: string): Promise<Buffer> {
    if (!this.client) {
      throw new Error('OpenAI client is not configured (missing OPENAI_API_KEY).');
    }
    const content: Array<
      { type: 'input_text'; text: string } | { type: 'input_image'; image_url: string; detail: 'high' }
    > = [
      { type: 'input_text', text: prompt },
      { type: 'input_text', text: 'Return one transparent PNG image.' },
    ];
    if (inspirationB64) {
      content.push({
        type: 'input_image',
        image_url: `data:image/png;base64,${inspirationB64}`,
        detail: 'high',
      });
    }
    let lastError: unknown;
    for (const model of this.getOpenAIModelCandidates()) {
      try {
        const response = await this.client.responses.create({
          model,
          input: [{ role: 'user', content }],
          tools: [{ type: 'image_generation' }],
        });
        const imageOutput = response.output.find((item) => item.type === 'image_generation_call');
        const imageBase64 = imageOutput && 'result' in imageOutput ? imageOutput.result : undefined;
        if (!imageBase64) {
          throw new Error(`OpenAI did not return an image for style generation (model=${model}).`);
        }
        return Buffer.from(imageBase64, 'base64');
      } catch (error) {
        lastError = error;
        if (!this.isModelNotFound(error)) {
          throw error;
        }
      }
    }
    throw lastError instanceof Error ? lastError : new Error('OpenAI style generation failed.');
  }

  private async generateWithOpenAIRestyle(
    prompt: string,
    sourceB64: string,
    styleB64: string,
    renderSize?: ImageRenderSize
  ): Promise<Buffer> {
    if (!this.client) {
      throw new Error('OpenAI client is not configured (missing OPENAI_API_KEY).');
    }
    let lastError: unknown;
    for (const model of this.getOpenAIModelCandidates()) {
      try {
        const response = await this.client.responses.create({
          model,
          input: [
            {
              role: 'user',
              content: [
                { type: 'input_text', text: prompt },
                { type: 'input_text', text: `Return one PNG image at ${renderSize ?? '1024x1024'}.` },
                { type: 'input_image', image_url: `data:image/png;base64,${sourceB64}`, detail: 'high' },
                { type: 'input_image', image_url: `data:image/png;base64,${styleB64}`, detail: 'high' },
              ],
            },
          ],
          tools: [{ type: 'image_generation' }],
        });
        const imageOutput = response.output.find((item) => item.type === 'image_generation_call');
        const imageBase64 = imageOutput && 'result' in imageOutput ? imageOutput.result : undefined;
        if (!imageBase64) {
          throw new Error(`OpenAI did not return image bytes for restyle (model=${model}).`);
        }
        return Buffer.from(imageBase64, 'base64');
      } catch (error) {
        lastError = error;
        if (!this.isModelNotFound(error)) {
          throw error;
        }
      }
    }
    throw lastError instanceof Error ? lastError : new Error('OpenAI restyle failed.');
  }

  private shouldFallbackToOpenAI(_error: unknown): boolean {
    return this.client !== null;
  }

  private isModelNotFound(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }
    const message = error.message.toLowerCase();
    return message.includes('model_not_found') || (message.includes('requested model') && message.includes('not found'));
  }

  private async generateWithGemini(params: {
    prompt: string;
    images?: Array<{ mimeType: string; data: string }>;
  }): Promise<Buffer> {
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      throw new Error('Gemini request failed because GEMINI_API_KEY is missing.');
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.geminiModel)}:generateContent?key=${encodeURIComponent(geminiApiKey)}`;
    const requestParts: Array<Record<string, unknown>> = [{ text: params.prompt }];
    for (const image of params.images ?? []) {
      requestParts.push({
        inlineData: {
          mimeType: image.mimeType,
          data: image.data,
        },
      });
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: requestParts }],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE'],
        },
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Gemini request failed (${response.status}): ${body}`);
    }

    const payload = (await response.json()) as {
      promptFeedback?: unknown;
      candidates?: Array<{
        content?: {
          parts?: Array<{
            inlineData?: { data?: string };
            inline_data?: { data?: string };
            text?: string;
          }>;
        };
        finishReason?: string;
      }>;
    };
    const responseParts = payload.candidates?.[0]?.content?.parts ?? [];
    const imagePart = responseParts.find((part) => part.inlineData?.data || part.inline_data?.data);
    const encoded = imagePart?.inlineData?.data ?? imagePart?.inline_data?.data;
    if (!encoded) {
      const textPart = responseParts.find((part) => typeof part.text === 'string' && part.text.length > 0)?.text;
      const finishReason = payload.candidates?.[0]?.finishReason;
      throw new Error(
        `Gemini did not return image bytes (model=${this.geminiModel}, finishReason=${String(finishReason ?? 'unknown')}, text=${textPart ?? 'none'}, promptFeedback=${JSON.stringify(payload.promptFeedback ?? null)}).`
      );
    }
    return Buffer.from(encoded, 'base64');
  }

  private async sanitizeStyleReferenceBuffer(buffer: Buffer): Promise<Buffer> {
    const raw = await sharp(buffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const width = raw.info.width;
    const height = raw.info.height;
    const data = Buffer.from(raw.data);
    const visited = new Uint8Array(width * height);
    const queue: Array<[number, number]> = [];

    const push = (x: number, y: number): void => {
      if (x < 0 || y < 0 || x >= width || y >= height) {
        return;
      }
      const index = y * width + x;
      if (visited[index] === 1) {
        return;
      }
      visited[index] = 1;
      queue.push([x, y]);
    };

    for (let x = 0; x < width; x += 1) {
      push(x, 0);
      push(x, height - 1);
    }
    for (let y = 0; y < height; y += 1) {
      push(0, y);
      push(width - 1, y);
    }

    while (queue.length > 0) {
      const point = queue.pop();
      if (!point) {
        continue;
      }
      const [x, y] = point;
      const pixelOffset = (y * width + x) * 4;
      const alpha = data[pixelOffset + 3];
      if (alpha === 0) {
        continue;
      }
      const red = data[pixelOffset];
      const green = data[pixelOffset + 1];
      const blue = data[pixelOffset + 2];
      if (!this.isNeutralCheckerColor(red, green, blue)) {
        continue;
      }
      data[pixelOffset + 3] = 0;
      push(x + 1, y);
      push(x - 1, y);
      push(x, y + 1);
      push(x, y - 1);
    }

    return sharp(data, {
      raw: {
        width,
        height,
        channels: 4,
      },
    })
      .png()
      .toBuffer();
  }

  private async analyzeStyleReferenceQuality(buffer: Buffer): Promise<{ hasCheckerboard: boolean }> {
    const raw = await sharp(buffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const width = raw.info.width;
    const height = raw.info.height;
    const data = raw.data;
    const visited = new Uint8Array(width * height);
    const queue: Array<[number, number]> = [];
    let neutralEdgeOpaque = 0;

    const push = (x: number, y: number): void => {
      if (x < 0 || y < 0 || x >= width || y >= height) {
        return;
      }
      const index = y * width + x;
      if (visited[index] === 1) {
        return;
      }
      visited[index] = 1;
      queue.push([x, y]);
    };

    for (let x = 0; x < width; x += 1) {
      push(x, 0);
      push(x, height - 1);
    }
    for (let y = 0; y < height; y += 1) {
      push(0, y);
      push(width - 1, y);
    }

    while (queue.length > 0) {
      const point = queue.pop();
      if (!point) {
        continue;
      }
      const [x, y] = point;
      const pixelOffset = (y * width + x) * 4;
      if (data[pixelOffset + 3] === 0) {
        continue;
      }
      const red = data[pixelOffset];
      const green = data[pixelOffset + 1];
      const blue = data[pixelOffset + 2];
      if (!this.isNeutralCheckerColor(red, green, blue)) {
        continue;
      }
      neutralEdgeOpaque += 1;
      push(x + 1, y);
      push(x - 1, y);
      push(x, y + 1);
      push(x, y - 1);
    }

    return { hasCheckerboard: neutralEdgeOpaque > Math.max(64, Math.floor(width * height * 0.01)) };
  }

  private isNeutralCheckerColor(red: number, green: number, blue: number): boolean {
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    const saturation = max === 0 ? 0 : (max - min) / max;
    return saturation < 0.16 && max > 70;
  }
}
