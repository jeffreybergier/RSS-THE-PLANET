import * as Router  from './router.js';
import * as XP from './xp.js';

export default {
  async fetch(request, env, ctx) {
    // XP.initKV(env.URL_STORE);
    return Router.route(request, env, ctx);
  }
}