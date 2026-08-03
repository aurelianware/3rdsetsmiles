// One-off asset generator: social-share (OG) image + favicons.
// Run with: node scripts/gen-assets.js
// Requires `sharp` (a devDependency). Outputs into src/assets/ so Eleventy
// passthrough-copies them to /assets/ on build.
const sharp = require("sharp");
const path = require("path");
const fs = require("fs");

const ASSETS = path.join(__dirname, "..", "src", "assets");
const NAVY = "#0B1D3A";
const NAVY_LIGHT = "#132847";
const GOLD = "#C9A84C";
const GOLD_LIGHT = "#E0C97F";
const CREAM = "#FAF7F2";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function buildOgImage() {
  const W = 1200, H = 630;
  const photoW = 470;

  // Doctor photo cropped to a right-hand panel.
  const photo = await sharp(path.join(ASSETS, "dr-phillips.jpg"))
    .resize(photoW, H, { fit: "cover", position: sharp.strategy.attention })
    .toBuffer();

  // Background: navy diagonal gradient.
  const bg = Buffer.from(`
    <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="${NAVY}"/>
          <stop offset="0.6" stop-color="${NAVY_LIGHT}"/>
          <stop offset="1" stop-color="#1a3355"/>
        </linearGradient>
      </defs>
      <rect width="${W}" height="${H}" fill="url(#g)"/>
    </svg>`);

  // Feather the left edge of the photo into the navy so there's no hard seam.
  const feather = Buffer.from(`
    <svg width="${photoW}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="f" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="${NAVY}" stop-opacity="1"/>
          <stop offset="0.35" stop-color="${NAVY}" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <rect width="${photoW}" height="${H}" fill="url(#f)"/>
    </svg>`);

  // Text + branding on the left.
  const name = esc("3rd Set Smiles");
  const tagline = esc("Comprehensive Cosmetic & Family Dentistry");
  const doctor = esc("Dr. Matthew Phillips, DDS");
  const phone = esc("(480) 334-2752");
  const text = Buffer.from(`
    <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <style>
        .name { font-family: 'DejaVu Serif', serif; font-weight: 700; fill: ${CREAM}; }
        .tag  { font-family: 'DejaVu Sans', sans-serif; font-weight: 400; fill: ${GOLD_LIGHT}; }
        .doc  { font-family: 'DejaVu Sans', sans-serif; font-weight: 700; fill: #ffffff; }
        .loc  { font-family: 'DejaVu Sans', sans-serif; font-weight: 400; fill: #C9CEDA; letter-spacing: 2px; }
        .tel  { font-family: 'DejaVu Sans', sans-serif; font-weight: 700; fill: ${NAVY}; }
      </style>
      <text x="90" y="150" class="loc" font-size="24">TEMPE, ARIZONA &#183; VETERAN-OWNED</text>
      <text x="88" y="250" class="name" font-size="92">${name}</text>
      <rect x="92" y="288" width="120" height="5" rx="2.5" fill="${GOLD}"/>
      <text x="90" y="360" class="tag" font-size="34">${tagline}</text>
      <text x="90" y="450" class="doc" font-size="30">${doctor}</text>
      <rect x="90" y="500" width="290" height="66" rx="33" fill="${GOLD}"/>
      <text x="235" y="543" class="tel" font-size="30" text-anchor="middle">${phone}</text>
    </svg>`);

  await sharp(bg)
    .composite([
      { input: photo, left: W - photoW, top: 0 },
      { input: feather, left: W - photoW, top: 0 },
      { input: text, left: 0, top: 0 },
    ])
    .jpeg({ quality: 86, mozjpeg: true })
    .toFile(path.join(ASSETS, "og-image.jpg"));
  console.log("wrote og-image.jpg");
}

function faviconSvg(size) {
  // Navy rounded square with a gold "3" — ties to "3rd Set Smiles".
  const r = Math.round(size * 0.22);
  const fs = Math.round(size * 0.72);
  const y = Math.round(size * 0.735);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${r}" fill="${NAVY}"/>
  <text x="50%" y="${y}" text-anchor="middle" font-family="Georgia, 'DejaVu Serif', serif" font-weight="700" font-size="${fs}" fill="${GOLD}">3</text>
</svg>`;
}

async function buildFavicons() {
  // Scalable SVG favicon for modern browsers.
  fs.writeFileSync(path.join(ASSETS, "favicon.svg"), faviconSvg(64));
  console.log("wrote favicon.svg");

  // PNG fallbacks rasterized from the same mark.
  const targets = [
    { name: "favicon-32.png", size: 32 },
    { name: "favicon-16.png", size: 16 },
    { name: "apple-touch-icon.png", size: 180 },
  ];
  for (const t of targets) {
    await sharp(Buffer.from(faviconSvg(t.size)))
      .resize(t.size, t.size)
      .png()
      .toFile(path.join(ASSETS, t.name));
    console.log("wrote", t.name);
  }
}

(async () => {
  await buildOgImage();
  await buildFavicons();
  console.log("done");
})().catch((e) => { console.error(e); process.exit(1); });
