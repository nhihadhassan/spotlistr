"use client";

/**
 * Rasterizes a DOM node to a PNG and downloads it.
 *
 * Two things reliably break this and are handled here:
 *
 * 1. CORS-tainted canvas. Any <img> loaded from another origin poisons the
 *    canvas and export fails with an opaque SecurityError. Every remote image
 *    in these tools must go through `proxied()` below.
 * 2. Safari. WebKit frequently rasterizes before webfonts settle, producing a
 *    PNG with fallback type. Rendering twice and discarding the first result
 *    is the standard workaround — the second pass hits a warm font cache.
 */

/** Routes a remote image through our own origin so the canvas stays clean. */
export function proxied(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("/") || url.startsWith("data:")) return url;
  return `/api/image-proxy?url=${encodeURIComponent(url)}`;
}

export async function renderToPng(
  node: HTMLElement,
  options: { scale?: number; background?: string } = {},
): Promise<string> {
  const { default: domToImage } = await import("dom-to-image-more");
  const scale = options.scale ?? 2;

  const config = {
    width: node.offsetWidth * scale,
    height: node.offsetHeight * scale,
    style: {
      transform: `scale(${scale})`,
      transformOrigin: "top left",
      width: `${node.offsetWidth}px`,
      height: `${node.offsetHeight}px`,
    },
    bgcolor: options.background,
    cacheBust: true,
  };

  await document.fonts?.ready;

  // First pass warms fonts and images; its output is unreliable on Safari.
  await domToImage.toPng(node, config);
  return domToImage.toPng(node, config);
}

export async function downloadPng(node: HTMLElement, filename: string) {
  const dataUrl = await renderToPng(node);
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename.endsWith(".png") ? filename : `${filename}.png`;
  link.click();
}
