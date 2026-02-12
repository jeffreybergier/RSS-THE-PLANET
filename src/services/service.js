export class Service {
  /**
   * Determines if this service can handle the given request.
   * Must be implemented by subclasses.
   * @param {Request} request 
   * @returns {boolean|string} - Returns true or a route identifier if it can handle the request.
   */
  static canHandle(request) {
    throw new Error("canHandle(request) must be implemented by subclass");
  }

  constructor(request, env, ctx) {
    this.request = request;
    this.env = env;
    this.ctx = ctx;
  }

  async handleRequest() {
    throw new Error("handleRequest() must be implemented by subclass");
  }
}
