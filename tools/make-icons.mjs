// Renders every icon and the share image from the SVG masters:
//
//   public/icons/icon.svg  ->  icon-192.png, icon-512.png   (rounded, transparent corners)
//                              apple-touch-icon.png (180)   (full square; iOS rounds it)
//                              maskable-512.png             (full bleed, mark inside the safe zone)
//   public/favicon.svg     ->  icons/favicon-16.png, icons/favicon-32.png, favicon.ico (16, 32, 48)
//   (built here)           ->  og-image.png (1200x630, no text, for links shared on social media and chat)
//
// Edit the SVGs, then run:  node tools/make-icons.mjs
// Needs Playwright with Chromium (not a dependency of the app). Set
// PLAYWRIGHT=/path/to/playwright/index.mjs if it is not found by name.

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PUB = path.join(ROOT, 'public');
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright').catch(() => import('/opt/node22/lib/node_modules/playwright/index.mjs'));

const icon = fs.readFileSync(path.join(PUB, 'icons', 'icon.svg'), 'utf8');
const favicon = fs.readFileSync(path.join(PUB, 'favicon.svg'), 'utf8');

/** Full square, no rounding and no outer edge: for iOS and maskable icons. */
function square(svg, scale = 1) {
  let out = svg.replaceAll('rx="116"', 'rx="0"').replace(/\s*<!-- light catching[^\n]*\n\s*<rect[^>]*\/>/, '');
  if (scale !== 1) out = out.replace('<g id="mark">', `<g id="mark" transform="translate(256 256) scale(${scale}) translate(-256 -256)">`);
  return out;
}

const browser = await chromium.launch();
const page = await browser.newPage();

async function render(svg, size, file, transparent = true) {
  await page.setViewportSize({ width: size, height: size });
  const bg = transparent ? 'transparent' : '#000';
  await page.setContent(`<style>html,body{margin:0;background:${bg}}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  const png = await page.screenshot({ omitBackground: transparent, type: 'png' });
  if (file) fs.writeFileSync(path.join(PUB, file), png);
  return png;
}

await render(icon, 192, 'icons/icon-192.png');
await render(icon, 512, 'icons/icon-512.png');
await render(square(icon), 180, 'icons/apple-touch-icon.png', false);
await render(square(icon, 0.8), 512, 'icons/maskable-512.png', false);
const ico = [];
for (const size of [16, 32, 48]) {
  const png = await render(favicon, size, size === 48 ? null : `icons/favicon-${size}.png`);
  ico.push({ size, png });
}
fs.writeFileSync(path.join(PUB, 'favicon.ico'), makeIco(ico));

// Share image: only the mark, centred in its glow. No text.
const mark = square(icon)
  .replace(/<rect id="bg"[^>]*\/>/, '') // the page's own glow shows through instead
  .replace(/<rect[^>]*fill="url\(#spot\)"[^>]*\/>/, '')
  .replace('<svg ', '<svg width="600" height="600" ');
await page.setViewportSize({ width: 1200, height: 630 });
await page.setContent(`<!doctype html><meta charset="utf-8">
<style>
  html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; }
  body {
    display: grid; place-items: center;
    background: radial-gradient(38% 62% at 50% 50%, rgba(94,154,230,.2), transparent 72%), #000;
  }
</style>
${mark}`);
fs.writeFileSync(path.join(PUB, 'og-image.png'), await page.screenshot({ type: 'png' }));

await browser.close();
console.log('icons, favicon.ico and og-image.png written to public/');

/** An .ico file holding PNG images (supported by every current browser). */
function makeIco(images) {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // icon
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, png }, k) => {
    const e = 6 + 16 * k;
    header.writeUInt8(size >= 256 ? 0 : size, e);
    header.writeUInt8(size >= 256 ? 0 : size, e + 1);
    header.writeUInt8(0, e + 2);
    header.writeUInt8(0, e + 3);
    header.writeUInt16LE(1, e + 4);
    header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(png.length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...images.map((i) => i.png)]);
}
