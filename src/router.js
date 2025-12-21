import * as Proxy  from './proxy.js';
import * as Routes from './allroutes.js';

export async function route(request, env, ctx) {
  Routes.AUTH_LOAD(env);
  const proxyResponse = await Proxy.getProxyResponse(request);
  if (proxyResponse) return proxyResponse;
  return Routes.errorNotFound((new URL(request.url).pathname));
}