import { ProxyService } from './serve/proxy.js';
import { OPMLService } from './serve/opml.js';
import * as Auth from './lib/auth.js';

const SERVICES = [
  ProxyService,
  OPMLService
];

export async function route(request, env, ctx) {
  Auth.AUTH_LOAD(env);
  
  for (const ServiceClass of SERVICES) {
    if (ServiceClass.canHandle(request)) {
      const service = new ServiceClass(request, env, ctx);
      return await service.handleRequest();
    }
  }

  return Auth.errorNotFound((new URL(request.url).pathname));
}
