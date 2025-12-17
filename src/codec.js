
export function encode(requestURLString, targetURLString, endpoint) {
  console.log(`[codec.encode] encode ${targetURLString}`);
  const requestURL = new URL(requestURLString);
  const targetURL = new URL(targetURLString);
  if (!targetURL || !requestURL) {
    console.error(`[codec.encode] invalid request or target`);
    return null;
  }
  
  // get the target filename
  const pathComponents = targetURL.pathname.split('/');
  // Filter out empty strings in case of trailing slashes
  let fileName = pathComponents.filter(Boolean).pop() || "";
  
  // encode the targetURL
  const encodedTarget = encodeURIComponent(btoa(targetURLString));
  
  // construct the encoded url
  const protocol = "http://";
  const serverOrigin = requestURL.host;
  const encoded = `${protocol}${serverOrigin}${endpoint}/${encodedTarget}/${fileName}`;
  console.log(`[codec.encode] encode ${encoded}`);
  return encoded;
}

export function decode(requestURLString) {
  console.log(`[codec.decode] ${requestURLString}`);
  const requestURL = new URL(requestURLString);
  if (!requestURL) {
    console.error(`[codec.encode] invalid URL ${requestURLString}`);
    return null;
  }
  
  // url.pathname ignores the query string (?key=...) 
  // so splitting this is safe from parameters.
  const pathComponents = requestURL.pathname.split('/'); 
  
  // Path: /asset/ENCODED_STRING/file.mp3
  // Components: ["", "asset", "ENCODED_STRING", "file.mp3"]
  // The encoded string is always at index 2 (if the path is /asset/...)
  const encodedTarget = pathComponents[2];
  if (!encodedTarget) {
    console.error(`[codec.decode] invalid pathComponents`);
    return null;
  }

  try {
    const base64Encoded = decodeURIComponent(encodedTarget);
    const targetURLString = atob(base64Encoded);
    console.log(`[codec.decode] decoded ${targetURLString}`);
    return targetURLString;
  } catch (error) {
    console.error(`[codec.decode] error ${error.message}`);
    return null;
  }
}