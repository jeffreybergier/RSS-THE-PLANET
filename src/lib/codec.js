import { Endpoint } from '../serve/service.js';
import * as Crypto from '../adapt/crypto.js';
import { Option } from './option.js';

export class Codec {
  /**
   * Aggressively strips tracking wrappers and query parameters.
   */
  static stripTracking(targetURL) {
    if (!(targetURL instanceof URL)) return targetURL;
    const urlString = targetURL.toString();

    // 1. List of known tracking domains that wrap the real URL
    const trackers = ["podtrac.com", "swap.fm", "pscrb.fm", "advenn.com", "chrt.fm"];

    // 2. List of known "Safe" hosting domains where the real file lives
    const hostingMarkers = [
      "stitcher.simplecastaudio.com",
      "traffic.libsyn.com",
      "traffic.megaphone.fm",
      "api.spreaker.com",
      "traffic.omny.fm",
      "www.omnycontent.com",
      "waaa.wnyc.org",
      "media.transistor.fm",
    ];

    // Check if the URL is wrapped by a known tracker
    const matchedTracker = trackers.find(t => urlString.includes(t));

    if (matchedTracker) {
      // Look for a safe hosting marker to "anchor" our cleaning
      const marker = hostingMarkers.find(m => urlString.includes(m));

      if (marker) {
        const startIndex = urlString.indexOf(marker);
        // Discard everything before the marker and everything after the '?'
        const [cleanPath] = urlString.substring(startIndex).split('?');
        
        console.log(`[Codec.strip] Stripped ${matchedTracker} wrapper -> ${marker}`);
        return new URL("https://" + cleanPath);
      } else {
        console.error(`[Codec.strip.ERROR] Tracker found (${matchedTracker}) but no hosting marker matched: ${urlString}`);
      }
    }

    // 3. SPECIAL CASE: Blubrry (Uses a path-segment based wrapper rather than a full URL)
    if (targetURL.hostname.includes("media.blubrry.com")) {
      const [pathOnly] = urlString.split('?');
      const segments = pathOnly.split('/');
      if (segments.length > 4) {
        const cleanPath = segments.slice(4).join('/');
        console.log(`[Codec.strip] Stripped blubrry -> https://${cleanPath}`);
        return new URL("https://" + cleanPath);
      }
    }

    return targetURL;
  }

  /**
   * Sanitizes a filename for legacy systems by removing non-ASCII characters
   * and trimming the length to ensure compatibility with old XML parsers.
   */
  static sanitizeFileName(rawPath, targetOption, maxLength = 15) {
    // 1. Get the last segment
    let fileName = rawPath.split('/').filter(Boolean).pop() || "file.bin";

    if (targetOption === Option.image) {
      // 2. Identify the extension
      const lastDot = fileName.lastIndexOf('.');
      const extension = lastDot !== -1 ? fileName.substring(lastDot).toLowerCase() : "";
      const nameWithoutExt = lastDot !== -1 ? fileName.substring(0, lastDot) : fileName;

      // 3. If it's a known non-JPG image extension, replace it with .jpg
      const nonJpgExts = [".png", ".webp", ".gif", ".bmp", ".tiff", ".heic"];
      if (nonJpgExts.includes(extension) || extension === "") {
        // Always force JPEG because we downsample all image requests
        // And they get changed to JPEG in the process
        fileName = nameWithoutExt + ".jpg";
      }
    }

    // 4. Sanitize special characters
    const sanitized = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');

    // 5. Trim to last N characters (ensuring we keep the .jpg)
    return sanitized.length > maxLength 
      ? sanitized.substring(sanitized.length - maxLength) 
      : sanitized;
  }

  static encode(targetURL, targetOption, baseURL, authKey) {  
    if (!(targetURL  instanceof URL)
     || !(baseURL instanceof URL)
     || typeof authKey !== "string") 
    { throw new Error(`Parameter Error: targetURL(${targetURL}), baseURL(${baseURL}), targetOption(${targetOption}), authKey(${authKey})`); }
    
    if (!baseURL.toString().endsWith(Endpoint.proxy)) {
      console.log(`[WARNING] BaseURL does not end with ${Endpoint.proxy}: ${baseURL.toString()}`);
    }
    
    // get the target filename
    const strippedTargetURL = Codec.stripTracking(targetURL);
    const fileName = Codec.sanitizeFileName(strippedTargetURL.pathname, targetOption);
    
    // encode the targetURL
    const targetURI = encodeURIComponent(strippedTargetURL.toString());
    const targetBase = btoa(targetURI);
    const targetEncoded = encodeURIComponent(targetBase);
    
    // construct the encoded url
    const encodedPath = `${targetEncoded}/${fileName}`;
    const encodedURL = new URL(encodedPath, baseURL);
    encodedURL.searchParams.set("key", authKey);
    if (targetOption) encodedURL.searchParams.set("option", targetOption);
    
    return encodedURL;
  }

  static decode(requestURL) {
    if (!(requestURL instanceof URL)) throw new Error("Parameter Error: Invalid URL");
    
    // url.pathname ignores the query string (?key=...) 
    // so splitting this is safe from parameters.
    const pathComponents = requestURL.pathname.split('/'); 
    
    // Path: /proxy/ENCODED_STRING/file.mp3
    // Path: /proxy/ENCODED_STRING/
    // Path: /proxy/ENCODED_STRING
    // Components: ["", "proxy", "ENCODED_STRING", "file.mp3"]
    const proxyIndex = pathComponents.indexOf("proxy");
    if (proxyIndex === -1 || !pathComponents[proxyIndex + 1]) {
      return null; 
    }
    const targetEncoded = pathComponents[proxyIndex + 1];
    try {
      const targetBase = decodeURIComponent(targetEncoded);
      const targetURI = atob(targetBase);
      const targetURLString = decodeURIComponent(targetURI);
      const targetURL = new URL(targetURLString);
      console.log(`[Codec.decode] Base64 ${targetURLString}`);
      return targetURL;
    } catch (error) {
      console.error(`[Codec.decode] Base64 failed ${error.message}`);
      return null;
    }
  }
}
