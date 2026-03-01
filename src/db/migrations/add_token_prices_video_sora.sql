-- Цены за генерацию видео-моделей (пример, числа подправишь под себя)

INSERT INTO token_prices (action_key, label, tokens, active) VALUES
  ('vid_seedance1_3',  'Seedance V1 Pro 3 сек',   10, true),
  ('vid_seedance1_5',  'Seedance V1 Pro 5 сек',   15, true),
  ('vid_seedance1_7',  'Seedance V1 Pro 7 сек',   20, true),
  ('vid_seedance1_10', 'Seedance V1 Pro 10 сек',  25, true),

  ('vid_seedance15_3',  'Seedance V1.5 Spicy 3 сек',   15, true),
  ('vid_seedance15_5',  'Seedance V1.5 Spicy 5 сек',   20, true),
  ('vid_seedance15_7',  'Seedance V1.5 Spicy 7 сек',   25, true),
  ('vid_seedance15_10', 'Seedance V1.5 Spicy 10 сек',  30, true),

  ('vid_kling_3',   'Kling Video O3 Pro 3 сек',   20, true),
  ('vid_kling_5',   'Kling Video O3 Pro 5 сек',   25, true),
  ('vid_kling_7',   'Kling Video O3 Pro 7 сек',   30, true),
  ('vid_kling_10',  'Kling Video O3 Pro 10 сек',  35, true),
  ('vid_kling_15',  'Kling Video O3 Pro 15 сек',  40, true),

  ('vid_hailuo_6',  'Hailuo 2.3 Pro 6 сек',   25, true),
  ('vid_hailuo_10', 'Hailuo 2.3 Pro 10 сек',  35, true),

  ('vid_sora_5',   'OpenAI Sora 2 (I2V) 5 сек',   40, true),
  ('vid_sora_10',  'OpenAI Sora 2 (I2V) 10 сек',  60, true),
  ('vid_sora_15',  'OpenAI Sora 2 (I2V) 15 сек',  80, true)
ON CONFLICT (action_key) DO NOTHING;
