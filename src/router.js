import { ProxyHandler }  from './proxy.js'; // Import the class
import * as Auth from './auth.js';

export const AllRoutes = {
  proxy: Auth.PROXY_VALID_PATH,
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
  if (route === AllRoutes.proxy) {
    const proxy = new ProxyHandler(request); // Instantiate the class
    response = await proxy.handleRequest(); // Call the handleRequest method
  }
  if (!response) response = Auth.errorNotFound((new URL(request.url).pathname));
  return response
}