import { setupStart }      from './start.js';
import { setupChat }       from './chat.js';
import { setupCallbacks }  from './callbacks.js';
import { setupNanoBanana } from './nanoBanana.js';

export const setupHandlers = (bot) => {
  setupCallbacks(bot);
  setupNanoBanana(bot);
  setupStart(bot);
  setupChat(bot);
};
