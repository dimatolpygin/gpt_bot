import { setupStart }      from './start.js';
import { setupChat }       from './chat.js';
import { setupCallbacks }  from './callbacks.js';
import { setupNanoBanana } from './nanoBanana.js';
import { setupVideoGen }   from './videoGen.js';
import { setupProfile }    from './profile.js';
import { setupShop }       from './shop.js';

export const setupHandlers = (bot) => {
  setupCallbacks(bot);
  setupNanoBanana(bot);
  setupVideoGen(bot);
  setupProfile(bot);
  setupShop(bot);
  setupStart(bot);
  setupChat(bot);
};
