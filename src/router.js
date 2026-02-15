import { ProxyService } from './serve/proxy.js';
import { OPMLService } from './serve/opml.js';
import { MastoService } from './serve/masto.js';
import { renderError } from './ui/error.js';
import { Auth } from './lib/auth.js';

const SERVICES = [
  ProxyService,
  OPMLService,
  MastoService
];

export async function route(request, env, ctx) {
  Auth.load(env);
  
  for (const ServiceClass of SERVICES) {
    if (ServiceClass.canHandle(request)) {
      const service = new ServiceClass(request, env, ctx);
      return await service.handleRequest();
    }
  }

  const pathname = new URL(request.url).pathname;
  return renderError(404, "The requested resource was not found on this server.", pathname);
}
