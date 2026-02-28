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

// ── GPT Image 1.5 Edit ────────────────────────────────────────────────────────
// quality: 'low' | 'medium' | 'high'   size: '1024*1024' | '1024*1536' | '1536*1024'
export const gptImage15Edit = async (imageUrls, prompt, size = '1024*1024', quality = 'medium') => {
  const images = Array.isArray(imageUrls) ? imageUrls : [imageUrls];
  const res = await fetch(`${BASE}/openai/gpt-image-1.5/edit`, {
    method: 'POST', headers: HEADERS(),
    body: JSON.stringify({ images, prompt, size, quality, input_fidelity: 'high', output_format: 'png', enable_sync_mode: false }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || JSON.stringify(data));
  return pollResult(data?.data?.id);
};

// ── FLUX.2 [pro] Edit ─────────────────────────────────────────────────────────
// images: array 1-3 reference URLs
// size: 'width*height' (256-1536 per dimension)   $0.06/image
export const flux2ProEdit = async (imageUrls, prompt, size = '1024*1024', seed = -1) => {
  const images = Array.isArray(imageUrls) ? imageUrls : [imageUrls];
  const res = await fetch(`${BASE}/wavespeed-ai/flux-2-pro/edit`, {
    method: 'POST', headers: HEADERS(),
    body: JSON.stringify({ images, prompt, size, seed, enable_sync_mode: false }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || JSON.stringify(data));
  return pollResult(data?.data?.id);
};

// ── Seedance V1 Pro i2v 720p ──────────────────────────────────────────────────
export const seedanceI2V = async (imageUrl, prompt = '', duration = 5, aspectRatio = '16:9', cameraFixed = false) => {
  const body = { image: imageUrl, duration, aspect_ratio: aspectRatio, camera_fixed: cameraFixed, seed: -1 };
  if (prompt) body.prompt = prompt;
  const res = await fetch(`${BASE}/bytedance/seedance-v1-pro-i2v-720p`, {
    method: 'POST', headers: HEADERS(),
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || JSON.stringify(data));
  return pollResult(data?.data?.id, 60, 5000);
};

// ── Seedance V1.5 Pro Spicy ───────────────────────────────────────────────────
export const seedance15SpicyI2V = async (imageUrl, prompt = '', duration = 5, aspectRatio = '16:9') => {
  const body = { image: imageUrl, duration, aspect_ratio: aspectRatio };
  if (prompt) body.prompt = prompt;
  const res = await fetch(`${BASE}/bytedance/seedance-v1.5-pro/image-to-video-spicy`, {
    method: 'POST', headers: HEADERS(),
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || JSON.stringify(data));
  return pollResult(data?.data?.id, 60, 5000);
};

// ── Kling Video O3 Pro ────────────────────────────────────────────────────────
export const klingI2V = async (imageUrl, prompt = '', duration = 5, sound = false) => {
  const body = { image: imageUrl, duration, sound };
  if (prompt) body.prompt = prompt;
  const res = await fetch(`${BASE}/kwaivgi/kling-video-o3-pro/image-to-video`, {
    method: 'POST', headers: HEADERS(),
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || JSON.stringify(data));
  return pollResult(data?.data?.id, 60, 5000);
};

// ── Hailuo 2.3 Pro ───────────────────────────────────────────────────────────
export const hailuoI2V = async (imageUrl, prompt = '', duration = 6) => {
  const body = { image: imageUrl, duration, enable_prompt_expansion: true };
  if (prompt) body.prompt = prompt;
  const res = await fetch(`${BASE}/minimax/hailuo-2.3/i2v-pro`, {
    method: 'POST', headers: HEADERS(),
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || JSON.stringify(data));
  return pollResult(data?.data?.id, 60, 5000);
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
