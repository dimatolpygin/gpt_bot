import { setupStart }     from './start.js';
import { setupChat }      from './chat.js';
import { setupCallbacks } from './callbacks.js';

export const setupHandlers = (bot) => {
  setupCallbacks(bot);
  setupStart(bot);
  setupChat(bot);
};
