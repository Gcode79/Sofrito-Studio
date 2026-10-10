// Verifies `sharp` works end-to-end for the favicon task (read-only, no file changes).
import { readFileSync } from "node:fs";
import sharp from "sharp";

const svg = readFileSync("C:/Users/josho/SofritoStudio/pivot-site/public/assets/favicon.svg", "utf8");
const m = svg.match(/data:image\/png;base64,([A-Za-z0-9+/=]+)/);
if (!m) { console.log("NO embedded png"); process.exit(1); }
const png = Buffer.from(m[1], "base64");

// 1) sharp can read the embedded PNG
try {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  console.log("sharp decode OK:", info.width + "x" + info.height, "channels:", info.channels, "bytes:", data.length);
} catch (e) {
  console.log("sharp decode FAIL:", e.message);
  process.exit(1);
}

// 2) build a tiny RGBA buffer (transparent bg + orange pixel) and encode via sharp
try {
  const w = 8, h = 8;
  const raw = Buffer.alloc(w * h * 4); // fully transparent
  // orange pixel at center
  const i = (4 * w + 4) * 4;
  raw[i] = 0xea; raw[i + 1] = 0x58; raw[i + 2] = 0x0c; raw[i + 3] = 0xff;
  const png2 = await sharp(raw, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
  const back = await sharp(png2).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let transparent = 0, opaque = 0;
  for (let p = 0; p < back.data.length; p += 4) {
    if (back.data[p + 3] === 0) transparent++;
    else if (back.data[p + 3] === 255) opaque++;
  }
  console.log("sharp encode+decode roundtrip OK: transparent px =", transparent, "opaque px =", opaque, "(w=" + back.info.width + ")");
} catch (e) {
  console.log("sharp encode FAIL:", e.message);
  process.exit(1);
}
console.log("ALL SHARP CHECKS PASSED");
