import * as Proxy  from './proxy.js';
import * as Auth from './auth.js';

export const AllRoutes = {
  proxy: "/proxy",
  getRoute(pathname) {
    if (pathname.startsWith(this.proxy)) return this.proxy;
    return null;
  }
};

Object.freeze(AllRoutes);

export async function route(request, env, ctx) {
  Auth.AUTH_LOAD(env);
  const requestURL = new URL(request.url);
  const route = AllRoutes.getRoute(requestURL.pathname);
  let response;
  if (route === AllRoutes.proxy) response = await Proxy.getProxyResponse(request);
  if (!response) response = Auth.errorNotFound((new URL(request.url).pathname));
  return response
}