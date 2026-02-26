import fetch from 'node-fetch';
import { config } from '../config/index.js';

const BASE = 'https://api.wavespeed.ai/api/v3';
const HEADERS = () => ({
  'Authorization': `Bearer ${config.WAVESPEED_API_KEY}`,
  'Content-Type': 'application/json',
});

const pollResult = async (requestId) => {
  const MAX_ATTEMPTS = 30;
  const INTERVAL_MS  = 3000;
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    await new Promise(r => setTimeout(r, INTERVAL_MS));
    const res = await fetch(`${BASE}/predictions/${requestId}/fetch`, { headers: HEADERS() });
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
  }
  throw new Error('WaveSpeed: timeout — generation took too long');
};

export const nanoBananaTextToImage = async (prompt, size = '1:1') => {
  const body = { prompt, size, num_images: 1 };
  const res = await fetch(`${BASE}/google/nano-banana`, {
    method: 'POST', headers: HEADERS(), body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.detail || JSON.stringify(data));
  const requestId = data?.data?.id;
  if (!requestId) throw new Error('No request ID from WaveSpeed');
  return pollResult(requestId);
};

export const nanoBananaEdit = async (imageUrl, prompt, size = '1:1') => {
  const body = { image: imageUrl, prompt, size };
  const res = await fetch(`${BASE}/google/nano-banana/edit`, {
    method: 'POST', headers: HEADERS(), body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.detail || JSON.stringify(data));
  const requestId = data?.data?.id;
  if (!requestId) throw new Error('No request ID from WaveSpeed');
  return pollResult(requestId);
};
