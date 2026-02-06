
export let HTMLRewriter;
if (globalThis.HTMLRewriter) {
  console.log("[proxy] Using HTMLRewriter from Cloudflare");
  HTMLRewriter = globalThis.HTMLRewriter;
} else {
  console.log("[proxy] Using HTMLRewriter from @miniflare");
  const packageName = "@miniflare/html-rewriter"; 
  const mod = await import(packageName);
  HTMLRewriter = mod.HTMLRewriter;
}