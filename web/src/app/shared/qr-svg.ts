/**
 * QR code as an SVG string. `qrcode` is loaded lazily so it only ships with the pages that draw codes.
 * Results are cached per text (a label sheet can repeat the same render on size changes).
 */
const cache = new Map<string, Promise<string>>();

export function qrSvg(text: string): Promise<string> {
  let p = cache.get(text);
  if (!p) {
    p = import('qrcode').then((m) => (m.default ?? m).toString(text, { type: 'svg', errorCorrectionLevel: 'M', margin: 0 }));
    p.catch(() => cache.delete(text));
    cache.set(text, p);
  }
  return p;
}

/** Triggers a browser download of an SVG string. */
export function downloadSvg(svg: string, fileName: string): void {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
