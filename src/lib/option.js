export const Option = {
  auto:  "auto",
  feed:  "feed",
  html:  "html",
  asset: "asset",
  image: "image",
  avatar: "avatar",
  getOption(parameter) {
    if (typeof parameter !== 'string') return this.auto;
    const normalized = parameter.toLowerCase();
    const validOptions = [this.auto, this.feed, this.html, this.asset, this.image, this.avatar];
    return validOptions.includes(normalized) ? normalized : this.auto;
  },
  async fetchAutoOption(targetURL) {
    try {
      let response = await fetch(targetURL, { method: 'HEAD' });
      if (!response.ok) return null;
      const contentType = response.headers.get("Content-Type") || "";
      console.log(`[Option] autodetected Content-Type: ${contentType}`);
      if (contentType.includes("xml"))   return Option.feed; 
      if (contentType.includes("rss"))   return Option.feed;
      if (contentType.includes("atom"))  return Option.feed;
      if (contentType.includes("html"))  return Option.html;
      if (contentType.includes("image")) return Option.image;
      return Option.asset;
    } catch (e) {
      console.error(`[Option.getAuto] error: ${e.message}`);
      return null;
    }
  }
};

Object.freeze(Option);
