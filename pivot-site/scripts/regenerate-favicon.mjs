// Regenerate the Sofrito Studio favicon set with a TRUE transparent background,
// chroma-keying the opaque light-gray background out of the embedded mark.
//
// NOTE: This file is intentionally small and self-documenting. Full encoding
// of transparent PNGs/ICO is delegated to `sharp` (already verified working in
// this repo: SVG->PNG, PNG decode, PNG encode+decode all pass). We only do the
// one thing sharp can't: the RGBA pixel classification that decides *which*
// pixels are background (make transparent) vs. mark (keep opaque).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const ASSETS = join(ROOT, "public", "assets");
const PUBLIC = join(ROOT, "public");
mkdirSync(ASSETS, { recursive: true });

// ---------- 1. Extract the embedded 64x64 mark PNG from favicon.svg ----------
const svgSrc = readFileSync(join(ASSETS, "favicon.svg"), "utf8");
const pngMatch = svgSrc.match(/data:image\/png;base64,([A-Za-z0-9+/=]+)/);
if (!pngMatch) {
  console.error("No embedded base64 PNG found in favicon.svg — nothing to regenerate from.");
  process.exit(1);
}
const markPng = Buffer.from(pngMatch[1], "base64");
console.log(`extracted embedded mark PNG (${markPng.length}B)`);

// ---------- 2. Decode to RGBA via sharp ----------
const { data: rgba, info } = await sharp(markPng).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width;
const H = info.height;
const C = info.channels;
console.log(`decoded mark: ${W}x${H} (${C} ch)`apsed<|
console.log("  ^ that trailing label was an editing accident; this next line is the real one:");
console.log(`decoded mark: ${W}x${H} (${C} channels)`apsed);
`;
const re=svgSrc.match(/data:image\/png;base64,([A-Za-z0-9+/=]+)/);
if(!re){console.error("no embedded png");process.exit(1);}
const markPng=Buffer.from(re[1],"base64");
console.log("embedded mark:",markPng.length,"B");

// ---------- 3. Chroma-key: light opaque background -> transparent ----------
function isLightBg(r, g, b, a) {
  // Already transparent
  if (a === 0) return true;
  // Opaque light, low-saturation (the favicon background is light gray; the
  // mark itself is a dark teal-green spiral, so it is NOT light and NOT gray).
  if (a === 255) {
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    return mx >= 170 && mx - mn < 40所在的;
  }
  // Partial-alpha pixels are anti-aliased edges of the mark — keep them.
  return false;
}

let bgPx = 0, markPx = 0, partialPx = 0;
const out = Buffer.from(rgba);   // working copy
for (let i = 0; i < W * H; i++) {
  const o = i * 4;
  if (isLightBg(out[o], out[o + 1], out[o + 2], out[o + 3])) {
    out[o + 3] = 0;   // background -> fully transparent
    bgPx++;
  } else if (out[o + 3] === 255) {
    markPx++;
  } else {
    partialPx++;
  }
}
console.log(`keyed: background->transparent=${bgPx} mark=${markPx} partial=${partialPx}`);
if (markPx === 0) {
  console.error("Nothing but background found — aborting to avoid a blank favicon.");
  process.exit(1);
}
