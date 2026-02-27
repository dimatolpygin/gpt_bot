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
    method: 'POST', headers: HEADERS(),
    body: JSON.stringify({ prompt, aspect_ratio: aspectRatio, output_format: 'png', enable_sync_mode: false }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || JSON.stringify(data));
  return pollResult(data?.data?.id);
};

export const nanoBananaEdit = async (imageUrls, prompt, aspectRatio = '1:1') => {
  const images = Array.isArray(imageUrls) ? imageUrls : [imageUrls];
  const res = await fetch(`${BASE}/google/nano-banana/edit`, {
    method: 'POST', headers: HEADERS(),
    body: JSON.stringify({ images, prompt, aspect_ratio: aspectRatio, output_format: 'png', enable_sync_mode: false }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || JSON.stringify(data));
  return pollResult(data?.data?.id);
};

// ── Nano Banana 2 ─────────────────────────────────────────────────────────────

export const nanoBanana2TextToImage = async (prompt, aspectRatio = '1:1', resolution = '1k') => {
  const res = await fetch(`${BASE}/google/nano-banana-2/text-to-image`, {
    method: 'POST', headers: HEADERS(),
    body: JSON.stringify({ prompt, aspect_ratio: aspectRatio, resolution, output_format: 'png', enable_sync_mode: false }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || JSON.stringify(data));
  return pollResult(data?.data?.id);
};

export const nanoBanana2Edit = async (imageUrls, prompt, aspectRatio = '1:1', resolution = '1k') => {
  const images = Array.isArray(imageUrls) ? imageUrls : [imageUrls];
  const res = await fetch(`${BASE}/google/nano-banana-2/edit`, {
    method: 'POST', headers: HEADERS(),
    body: JSON.stringify({ images, prompt, aspect_ratio: aspectRatio, resolution, output_format: 'png', enable_sync_mode: false }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || JSON.stringify(data));
  return pollResult(data?.data?.id);
};

// ── Seedream V5 Lite ──────────────────────────────────────────────────────────

const SEEDREAM_SIZE_MAP = {
  '1:1': '2048*2048', '16:9': '2688*1536', '9:16': '1536*2688',
  '4:3': '2048*1536', '3:4':  '1536*2048',
};

export const seedreamTextToImage = async (prompt, aspectRatio = '1:1') => {
  const size = SEEDREAM_SIZE_MAP[aspectRatio] || '2048*2048';
  const res = await fetch(`${BASE}/bytedance/seedream-v5.0-lite`, {
    method: 'POST', headers: HEADERS(),
    body: JSON.stringify({ prompt, size, enable_sync_mode: false }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || JSON.stringify(data));
  return pollResult(data?.data?.id);
};

export const seedreamEdit = async (imageUrls, prompt, aspectRatio = '1:1') => {
  const images = Array.isArray(imageUrls) ? imageUrls : [imageUrls];
  const size   = SEEDREAM_SIZE_MAP[aspectRatio] || '2048*2048';
  const res = await fetch(`${BASE}/bytedance/seedream-v5.0-lite/edit`, {
    method: 'POST', headers: HEADERS(),
    body: JSON.stringify({ images, prompt, size, enable_sync_mode: false }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || JSON.stringify(data));
  return pollResult(data?.data?.id);
};

// ── Seedance V1 Pro i2v 720p ──────────────────────────────────────────────────

export const seedanceI2V = async (imageUrl, prompt = '', duration = 5, aspectRatio = '16:9', cameraFixed = false) => {
  const body = {
    image: imageUrl,
    duration,
    aspect_ratio: aspectRatio,
    camera_fixed: cameraFixed,
    seed: -1,
  };
  if (prompt) body.prompt = prompt;

  const res = await fetch(`${BASE}/bytedance/seedance-v1-pro-i2v-720p`, {
    method: 'POST', headers: HEADERS(),
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || JSON.stringify(data));
  return pollResult(data?.data?.id, 60, 5000); // видео дольше — 60 попыток * 5 сек
};

// ── Polling ───────────────────────────────────────────────────────────────────

const pollResult = async (requestId, maxAttempts = 30, intervalMs = 3000) => {
  if (!requestId) throw new Error('WaveSpeed: no request ID');
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, intervalMs));
    const res  = await fetch(`${BASE}/predictions/${requestId}/result`, { headers: HEADERS() });
    const data = await res.json();
    const status = data?.data?.status;
    if (status === 'completed') {
      const url = data?.data?.outputs?.[0];
      if (!url) throw new Error('WaveSpeed: completed but no output URL');
      return url;
    }
    if (status === 'failed') throw new Error(`WaveSpeed failed: ${data?.data?.error || 'unknown'}`);
  }
  throw new Error('WaveSpeed: timeout');
};
