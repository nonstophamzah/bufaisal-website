// One-shot branding asset generator (favicon set + OG image + square logo).
// Run: `node scripts/generate-branding.mjs` from the project root.
// Requires `sharp` (already a Next dependency). Deterministic — safe to re-run.
import sharp from 'sharp';
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const YELLOW = '#F9D923';
const BLACK = '#0A0A0A';

// ── BF monogram (icon / favicon / apple-icon / PWA) ──────────────────────────
// Full-bleed yellow with a small radius; bold black "BF". Reads cleanly at 16px.
function monogramSvg(size) {
  const r = Math.round(size * 0.18);
  const fs = Math.round(size * 0.62);
  const y = Math.round(size * 0.5);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${r}" ry="${r}" fill="${YELLOW}"/>
  <text x="50%" y="${y}" dy="0.35em" text-anchor="middle"
        font-family="Arial, Helvetica, sans-serif" font-weight="800"
        font-size="${fs}" letter-spacing="${-size * 0.02}" fill="${BLACK}">BF</text>
</svg>`;
}

// ── OG / share card (1200×630) ───────────────────────────────────────────────
function ogSvg() {
  const W = 1200, H = 630;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${YELLOW}"/>
  <rect x="26" y="26" width="${W - 52}" height="${H - 52}" rx="18" ry="18"
        fill="none" stroke="${BLACK}" stroke-width="6"/>
  <!-- corner accents -->
  <circle cx="70" cy="70" r="9" fill="${BLACK}"/>
  <circle cx="${W - 70}" cy="70" r="9" fill="${BLACK}"/>
  <circle cx="70" cy="${H - 70}" r="9" fill="${BLACK}"/>
  <circle cx="${W - 70}" cy="${H - 70}" r="9" fill="${BLACK}"/>

  <text x="50%" y="255" text-anchor="middle"
        font-family="Arial, Helvetica, sans-serif" font-weight="800"
        font-size="150" letter-spacing="4" fill="${BLACK}">BU FAISAL</text>

  <text x="50%" y="325" text-anchor="middle"
        font-family="Arial, Helvetica, sans-serif" font-weight="700"
        font-size="34" letter-spacing="10" fill="${BLACK}">GENERAL TRADING</text>

  <line x1="360" y1="378" x2="840" y2="378" stroke="${BLACK}" stroke-width="3"/>

  <text x="50%" y="450" text-anchor="middle"
        font-family="Arial, Helvetica, sans-serif" font-weight="700"
        font-size="46" fill="${BLACK}">UAE's Largest Used Goods Market</text>

  <text x="50%" y="510" text-anchor="middle"
        font-family="Arial, Helvetica, sans-serif" font-weight="700"
        font-size="30" letter-spacing="6" fill="${BLACK}">— SINCE 2009 —</text>
</svg>`;
}

const png = (svg, size) => sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();

// Minimal ICO encoder — packs PNG-compressed entries (Vista+ .ico convention).
function buildIco(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);            // reserved
  header.writeUInt16LE(1, 2);            // type: icon
  header.writeUInt16LE(pngs.length, 4); // image count

  const entries = [];
  const blobs = [];
  let offset = 6 + pngs.length * 16;
  for (const { size, data } of pngs) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0); // width  (0 => 256)
    e.writeUInt8(size >= 256 ? 0 : size, 1); // height
    e.writeUInt8(0, 2);                       // palette
    e.writeUInt8(0, 3);                       // reserved
    e.writeUInt16LE(1, 4);                    // color planes
    e.writeUInt16LE(32, 6);                   // bits per pixel
    e.writeUInt32LE(data.length, 8);          // size of PNG blob
    e.writeUInt32LE(offset, 12);              // offset of PNG blob
    offset += data.length;
    entries.push(e);
    blobs.push(data);
  }
  return Buffer.concat([header, ...entries, ...blobs]);
}

async function main() {
  await mkdir(join(ROOT, 'src/app'), { recursive: true });
  await mkdir(join(ROOT, 'public'), { recursive: true });

  // App-router icon file conventions
  await writeFile(join(ROOT, 'src/app/icon.png'), await png(monogramSvg(512), 512));
  await writeFile(join(ROOT, 'src/app/apple-icon.png'), await png(monogramSvg(512), 180));

  // PWA / manifest icons + square logo for JSON-LD
  await writeFile(join(ROOT, 'public/icon-192.png'), await png(monogramSvg(512), 192));
  await writeFile(join(ROOT, 'public/icon-512.png'), await png(monogramSvg(512), 512));

  // favicon.ico (16/32/48, PNG-compressed entries)
  const icoPngs = await Promise.all(
    [16, 32, 48].map(async (size) => ({ size, data: await png(monogramSvg(size), size) }))
  );
  await writeFile(join(ROOT, 'src/app/favicon.ico'), buildIco(icoPngs));

  // OG share card
  await writeFile(
    join(ROOT, 'public/og-default.png'),
    await sharp(Buffer.from(ogSvg())).resize(1200, 630).png().toBuffer()
  );

  console.log('Branding assets generated:');
  console.log('  src/app/icon.png (512)  src/app/apple-icon.png (180)  src/app/favicon.ico (16/32/48)');
  console.log('  public/icon-192.png  public/icon-512.png  public/og-default.png (1200×630)');
}

main().catch((e) => { console.error(e); process.exit(1); });
