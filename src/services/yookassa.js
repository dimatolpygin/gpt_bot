// Архитектура интеграции YooKassa.
// Сейчас используется как заглушка. После заполнения env
// (YOOKASSA_SHOP_ID, YOOKASSA_SECRET_KEY, YOOKASSA_RETURN_URL)
// можно добавить реальную реализацию создания платежа.

import crypto from 'crypto';
import fetch from 'node-fetch';
import { config } from '../config/index.js';

const API_URL = 'https://api.yookassa.ru/v3/payments';

const shopId     = config.YOOKASSA_SHOP_ID;
const secretKey  = config.YOOKASSA_SECRET_KEY;
const returnUrl  = config.YOOKASSA_RETURN_URL;

export const hasYooKassaConfig = () => !!(shopId && secretKey && returnUrl);

const authHeader = () =>
  'Basic ' + Buffer.from(`${shopId}:${secretKey}`).toString('base64');

const makeIdempotenceKey = () => crypto.randomUUID();

/**
 * createYooPayment
 * Архитектурный контракт:
 * - amount: { value: string, currency: 'RUB' }
 * - description: string (например, "Покупка тарифа ...")
 * - metadata: объект (userId, tariffId и т.п.)
 *
 * Возвращает: { id, confirmation_url }
 */
export const createYooPayment = async ({ amount, description, metadata = {} }) => {
  if (!hasYooKassaConfig()) {
    throw new Error('YooKassa is not configured (env vars missing)');
  }

  const body = {
    amount,
    capture: true,
    description,
    confirmation: {
      type: 'redirect',
      return_url: returnUrl,
    },
    metadata,
  };

  // Заглушка: сейчас просто возвращаем mock-URL, чтобы не бить реальный API
  // Когда будешь готов подключать ЮKassa, раскомментируй код ниже и убери mock.

  /*
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Authorization':    authHeader(),
      'Idempotence-Key':  makeIdempotenceKey(),
      'Content-Type':     'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok) {
    console.error('[YooKassa] createPayment error:', data);
    throw new Error('YooKassa payment create failed');
  }

  const confirmationUrl = data.confirmation?.confirmation_url;
  return { id: data.id, confirmation_url: confirmationUrl };
  */

  return {
    id: 'mock_payment_id',
    confirmation_url: 'https://yookassa.ru/dev/mock-payment',
  };
};
