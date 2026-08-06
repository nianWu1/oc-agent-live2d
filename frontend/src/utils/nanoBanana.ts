import { invoke } from '@tauri-apps/api/core';

const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com';
const DEFAULT_MODEL = 'gemini-3-pro-image-preview';

export interface GenerateImageParams {
  prompt: string;
  imageBase64?: string;
  imageMimeType?: string;
  aspectRatio?: string;
  temperature?: number;
  topP?: number;
  model?: string;
  apiKey: string;
  baseUrl?: string;
}

export interface GenerateImageResult {
  imageBase64: string;
  mimeType: string;
  text?: string;
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function base64ToImage(base64: string, mimeType: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = `data:${mimeType};base64,${base64}`;
  });
}

export async function generateImage(params: GenerateImageParams): Promise<GenerateImageResult> {
  if (!params.apiKey) throw new Error('请先在设置中填写 Gemini API Key');

  const model = params.model || DEFAULT_MODEL;
  const baseUrl = params.baseUrl || DEFAULT_BASE_URL;
  const url = `${baseUrl}/v1beta/models/${model}:generateContent?key=${params.apiKey}`;

  const parts: Record<string, unknown>[] = [];

  if (params.imageBase64 && params.imageMimeType) {
    parts.push({
      inlineData: {
        mimeType: params.imageMimeType,
        data: params.imageBase64,
      },
    });
  }

  parts.push({
    text: `Please generate an image that matches the following prompt: ${params.prompt}`,
  });

  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      maxOutputTokens: 32768,
      responseModalities: ['IMAGE'],
      temperature: params.temperature ?? 1.0,
      topP: params.topP ?? 0.95,
      ...(params.aspectRatio ? { imageConfig: { aspectRatio: params.aspectRatio } } : {}),
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
    ],
  };

  // Use Tauri backend proxy to bypass CORS
  const respText = await invoke('proxy_post', { url, body: JSON.stringify(body) }) as string;
  const data = JSON.parse(respText);
  const candidates = data.candidates;
  if (!candidates || candidates.length === 0) throw new Error('No candidates in response');

  const responseParts = candidates[0].content?.parts;
  if (!responseParts) throw new Error('No parts in response');

  let imageBase64 = '';
  let mimeType = 'image/png';
  let text = '';

  for (const part of responseParts) {
    if (part.inlineData) {
      imageBase64 = part.inlineData.data;
      mimeType = part.inlineData.mimeType || 'image/png';
    }
    if (part.text) text = part.text;
  }

  if (!imageBase64) throw new Error('No image data in response');
  return { imageBase64, mimeType, text };
}
