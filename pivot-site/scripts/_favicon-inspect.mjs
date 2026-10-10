// Zero-dependency PNG decoder (Node built-ins only: zlib + manual filters).
// Reads public/assets/favicon.svg, extracts the embedded base64 PNG, decodes to RGBA,
// and reports the background color and a rough layout so we can strip it faithfully.
import { readFileSync } from "node:fs";
import { Inflate } from "node:zlib";

function pngDecode(buf) {
  const ok =
    buf.readUInt32BE(0) === 0x89504e47 &&
    buf.readUInt32BE(4) === 0x0d0a1a0a;
  if (!ok) throw new Error("not a PNG");
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const bitDepth = buf[24];
  const colorType = buf[25];
  if (bitDepth !== 8) throw new Error(`unsupported bitDepth ${bitDepth}`);
  const chan =
    colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : colorType === 4 ? 2 : -1;
  if (chan < 0) throw new Error(`unsupported colorType ${colorType}`);

  // Parse chunks
  let off = 8;
  let idatParts = [];
  let palette = null;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("ascii", off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === "IDAT") idatParts.push(data);
    else if (type === "PLTE") palette = data;
    else if (type === "tRNS") { /* ignore for now */ }
    off += 12 + len;
  }
  const raw = new Inflate().update ? null : null; // placeholder
  const inflated = (() => {
    const inf = new Inflate();
    const chunks = [];
    for (const c of idatParts) {
      const r = inf.processSync(c);
      if (r) chunks.push(r);
    }
    return Buffer.concat(chunks);
  })();

  // Unfilter
  const stride = width * chan;
  const out = Buffer.alloc(height * stride);
  const prev = Buffer.alloc(stride);
  let p = 0;
  for (let y = 0; y < height; y++) {
    const filter = inflated[p++];
    const line = inflated.subarray(p, p + stride);
    const cur = out.subarray(y * stride, (y + 1) * stride);
    for (let i = 0; i < stride; i++) {
      const x = i - chan >= 0 ? cur[i - chan] : 0; // a
      const b = prev[i]; // b
      const c = i - chan >= 0 ? prev[i - chan] : 0; // c
      let v = line[i];
      switch (filter) {
        case 0: break nd
        case 1: v += x; break
        case 2: v += b; break
        case 3: v += (x + b) >> 1; break
        case 4: {
          const pa = Math.abs(b - c), pb = Math.abs(x - c), pc = Math.abs(x + b - 2 * c);
          v += pa <= pb && pa <= pc ? x : pb <= pc ? b : c;
          break
        }
        default: throw new Error(`bad filter ${filter}`)
      }
      cur[i] = v & 0xff;
    }
    line.copy(prev);
    p += stride;
  }
  return { width, height, chan, colorType, rgba: toRGBA(out, width, height, chan, colorType, palette) };
}

function toRGBA(px, w, h, chan, colorType, palette) {
  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const o = i * chan;
    let r, g, b, a = 255;
    if (colorType === 6) { r = px[o]; g = px[o + 1]; b = px[o + 2]; a = px[o + 3]; }
    else if (colorType === 2) { r = px[o]; g = px[o + 1]; b = px[o + 2]; }
    else if (colorType === 0) { r = g = b = px[o]; }
    else if (colorType === 4) { r = g = b = px[o]; a = px[o + 1]; }
    else if (colorType === 3) {
      const idx = px[o];
      if (palette) {
        r = palette[idx * 3]; g = palette[idx * 3 + 1]; b = palette[idx * 3 + 2];
      } else { r = g = b = idx; }
    }
    const d = i * 4;
    rgba[d] = r; rgba[d + 1] = g; rgba[d + 2] = b; rgba[d + 3] = a;
  }
  return rgba;
}

const svg = readFileSync("public/assets/favicon.svg", "utf8");
const m = svg.match(/base64,([A-Za-z0-9+/=]+)/);
if (!m) { console.log("no embedded base64"); process.exit(1); }
const png = Buffer.from(m[1], "base64");
const info = pngDecode(png.smallBuffer ?? png); // handle typed wrappers
// Decode directly:
const img = pngDecode(Buffer.from(m[1], "base64"));

const { width: W, height: H, rgba } = img;
console.log(`size ${W}x${H} colorType ${img.colorType}`);
// Find most common opaque color (background candidate = the color that touches the 4 corners / frame)
const counts = new Map();
for (let i = 0; i < W * H; i++) {
  const d = i * 4;
  if (rgba[d + 3] === 0) continue;
  const key = `${rgba[d]},${rgba[d + 1]},${rgba[d + 2]}`;
  counts.set(key, (counts.get(key) || 0) + 1);
}
const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
console.log("top opaque colors (r,g,b) -> count:");
for (const [k, n] of top) console.log(`  ${k} ${n} (${((n / (W * H)) * 100).toFixed(1)}%)`);

// Corner / frame colors
function corner(cx, cy) {
  const d = (cy * W + cx) * 4;
  return rgba[d + 3] === 0 ? "transparent" : `rgb(${rgba[d]},${rgba[d + 1]},${rgba[d + 2]})`;
}
console.log("corners:", corner(0, 0), corner(W - 1, 0), corner(0, H - 1), corner(W - 1, H - 1));
// Sample a vertical center strip colors
const strip = [];
for (let y = 0; y < H; y += Math.max(1, H >> 3)) {
  const d = (y * W + (W >> 1)) * 4;
  strip.push(rgba[d + 3] === 0 ? "t" : `#${[0,1,2].map(i=>rgba[d+i].toString(16).padStart(2,"0")).join("")}`);
}
console.log("center vert strip:", strip.join(" "));
