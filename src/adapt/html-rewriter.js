export let HTMLRewriter;

if (globalThis.HTMLRewriter) {
  console.log("[adapter.HTMLRewriter] Using HTMLRewriter from Cloudflare");
  HTMLRewriter = globalThis.HTMLRewriter;
} else {
  console.log("[adapter.HTMLRewriter] Using HTMLRewriter from @miniflare");
  const packageName = "@miniflare/html-rewriter"; 
  const mod = await import(packageName);
  HTMLRewriter = mod.HTMLRewriter;
}
