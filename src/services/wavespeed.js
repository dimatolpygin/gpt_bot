import fetch from 'node-fetch';
import { config } from '../config/index.js';

const BASE = 'https://api.wavespeed.ai/api/v3';
const HEADERS = () => ({
  'Authorization': `Bearer ${config.WAVESPEED_API_KEY}`,
  'Content-Type': 'application/json',
});

/**
 * Text-to-image: Google Nano Banana
 */
export const nanoBananaTextToImage = async (prompt, aspectRatio = '1:1') => {
  const res = await fetch(`${BASE}/google/nano-banana/text-to-image`, {
    method: 'POST',
    headers: HEADERS(),
    body: JSON.stringify({
      prompt,
      aspect_ratio: aspectRatio,
      output_format: 'png',
      enable_sync_mode: false,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || JSON.stringify(data));

  const requestId = data?.data?.id;
  if (!requestId) throw new Error('WaveSpeed: no request ID');
  return pollResult(requestId);
};

/**
 * Image-to-image edit: Google Nano Banana Edit
 * imageUrl — публичный URL исходного фото
 */
export const nanoBananaEdit = async (imageUrl, prompt, aspectRatio = '1:1') => {
  const res = await fetch(`${BASE}/google/nano-banana/edit`, {
    method: 'POST',
    headers: HEADERS(),
    body: JSON.stringify({
      images: [imageUrl],
      prompt,
      aspect_ratio: aspectRatio,
      output_format: 'png',
      enable_sync_mode: false,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || JSON.stringify(data));

  const requestId = data?.data?.id;
  if (!requestId) throw new Error('WaveSpeed: no request ID');
  return pollResult(requestId);
};

/**
 * Polling результата
 */
const pollResult = async (requestId) => {
  const MAX_ATTEMPTS = 30;
  const INTERVAL_MS  = 3000;

  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    await new Promise(r => setTimeout(r, INTERVAL_MS));

    const res  = await fetch(`${BASE}/predictions/${requestId}/result`, {
      headers: HEADERS(),
    });
    const data = await res.json();
    const status = data?.data?.status;

    if (status === 'completed') {
      const url = data?.data?.outputs?.[0];
      if (!url) throw new Error('WaveSpeed: completed but no output URL');
      return url;
    }
    if (status === 'failed') {
      throw new Error(`WaveSpeed generation failed: ${data?.data?.error || 'unknown'}`);
    }
    // 'created' | 'processing' — продолжаем
  }
  throw new Error('WaveSpeed: timeout — generation took too long');
};
