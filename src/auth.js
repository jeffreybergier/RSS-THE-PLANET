
export let VALID_KEYS = null;

export function AUTH_LOAD(env) {
  if (VALID_KEYS) { 
    console.log(`[routes.auth] Recycled: ${VALID_KEYS.size}`);
    return; 
  }
  try {
    VALID_KEYS = new Set(JSON.parse(env.VALID_KEYS));
    console.log(`[routes.auth] Loaded: ${VALID_KEYS.size}`);
  } catch (e) {
    console.error(`[routes.auth] Failed ${e.message}`);
    VALID_KEYS = new Set();
  }
}

export function errorNotFound(pathname) {
  const htmlContent = `
  <!DOCTYPE html>
  <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>404 Not Found</title>
    </head>
    <body>
      <h1>404 Not Found</h1>
      <p>The requested resource was not found on this server.</p>
    </body>
  </html>
  `;
  console.log(`[error 404] ${pathname}`)
  return new Response(htmlContent, {
    headers: { "Content-Type": "text/html" },
    status: 404
  });
}

export function errorUnauthorized(pathname) {
  const htmlContent = `
  <!DOCTYPE html>
  <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>401 Unauthorized</title>
    </head>
    <body>
      <h1>401 Unauthorized</h1>
      <p>The key parameter was missing or incorrect</p>
    </body>
  </html>
  `;
  console.log(`[error 401] ${pathname}`)
  return new Response(htmlContent, {
    headers: { "Content-Type": "text/html" },
    status: 401
  });
}

export function errorInternalServer(pathname) {
  const htmlContent = `
  <!DOCTYPE html>
  <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>500 Internal Server Error</title>
    </head>
    <body>
      <h1>500 Internal Server Error</h1>
      <p>The target could not be reached</p>
    </body>
  </html>
  `;
  console.log(`[error 500] ${pathname}`)
  return new Response(htmlContent, {
    headers: { "Content-Type": "text/html" },
    status: 500
  });
}

export function errorTargetUnreachable(pathname) {
  const htmlContent = `
  <!DOCTYPE html>
  <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>501 Target Unreachable</title>
    </head>
    <body>
      <h1>501 Target Unreachable</h1>
      <p>The target could not be reached</p>
    </body>
  </html>
  `;
  console.log(`[error 502] ${pathname}`)
  return new Response(htmlContent, {
    headers: { "Content-Type": "text/html" },
    status: 502
  });
}