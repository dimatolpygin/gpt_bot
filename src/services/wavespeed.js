import fetch from 'node-fetch';
import { config } from '../config/index.js';

const BASE = 'https://api.wavespeed.ai/api/v3';
const HEADERS = () => ({
  'Authorization': `Bearer ${config.WAVESPEED_API_KEY}`,
  'Content-Type': 'application/json',
});

// ── Nano Banana 1 ─────────────────────────────────────────────────────────────

export const nanoBananaTextToImage = async (prompt, aspectRatio = '1:1') => {
  const res = await fetch(`${BASE}/google/nano-banana/text-to-image`, {
    method: 'POST',
    headers: HEADERS(),
    body: JSON.stringify({ prompt, aspect_ratio: aspectRatio, output_format: 'png', enable_sync_mode: false }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || JSON.stringify(data));
  return pollResult(data?.data?.id);
};

export const nanoBananaEdit = async (imageUrl, prompt, aspectRatio = '1:1') => {
  const res = await fetch(`${BASE}/google/nano-banana/edit`, {
    method: 'POST',
    headers: HEADERS(),
    body: JSON.stringify({ images: [imageUrl], prompt, aspect_ratio: aspectRatio, output_format: 'png', enable_sync_mode: false }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || JSON.stringify(data));
  return pollResult(data?.data?.id);
};

// ── Nano Banana 2 ─────────────────────────────────────────────────────────────

export const nanoBanana2TextToImage = async (prompt, aspectRatio = '1:1', resolution = '1k') => {
  const res = await fetch(`${BASE}/google/nano-banana-2/text-to-image`, {
    method: 'POST',
    headers: HEADERS(),
    body: JSON.stringify({ prompt, aspect_ratio: aspectRatio, resolution, output_format: 'png', enable_sync_mode: false }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || JSON.stringify(data));
  return pollResult(data?.data?.id);
};

export const nanoBanana2Edit = async (imageUrl, prompt, aspectRatio = '1:1', resolution = '1k') => {
  const res = await fetch(`${BASE}/google/nano-banana-2/edit`, {
    method: 'POST',
    headers: HEADERS(),
    body: JSON.stringify({ images: [imageUrl], prompt, aspect_ratio: aspectRatio, resolution, output_format: 'png', enable_sync_mode: false }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || JSON.stringify(data));
  return pollResult(data?.data?.id);
};

// ── Polling ───────────────────────────────────────────────────────────────────

const pollResult = async (requestId) => {
  if (!requestId) throw new Error('WaveSpeed: no request ID');
  const MAX_ATTEMPTS = 30;
  const INTERVAL_MS  = 3000;

  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    await new Promise(r => setTimeout(r, INTERVAL_MS));
    const res  = await fetch(`${BASE}/predictions/${requestId}/result`, { headers: HEADERS() });
    const data = await res.json();
    const status = data?.data?.status;

    if (status === 'completed') {
      const url = data?.data?.outputs?.[0];
      if (!url) throw new Error('WaveSpeed: completed but no output URL');
      return url;
    }
    if (status === 'failed') {
      throw new Error(`WaveSpeed failed: ${data?.data?.error || 'unknown'}`);
    }
  }
  throw new Error('WaveSpeed: timeout');
};
