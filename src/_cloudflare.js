import * as Router  from './router.js';

export default {
  async fetch(request, env, ctx) {
    return Router.route(request, env, ctx);
  }
}
