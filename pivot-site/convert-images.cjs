const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const publicDir = path.join(__dirname, 'public');
const images = ['image-2.jpeg', 'image-4.jpeg', 'image-5.jpeg'];

async function convertImage(inputPath, outputPath, maxSizeKB = 150) {
  let quality = 85;
  let buffer = await sharp(inputPath)
    .webp({ quality })
    .toBuffer();
  // binary search for quality to meet size constraint
  while (buffer.length > maxSizeKB * 1024 && quality > 10) {
    quality -= 5;
    buffer = await sharp(inputPath)
      .webp({ quality })
      .toBuffer();
  }
  // if still too low quality, just accept
  await fs.promises.writeFile(outputPath, buffer);
  const sizeKB = (buffer.length / 1024).toFixed(1);
  console.log(`${path.basename(inputPath)} -> ${path.basename(outputPath)} (${sizeKB} KB, quality ${quality})`);
}

(async () => {
  for (const img of images) {
    const input = path.join(publicDir, img);
    const output = path.join(publicDir, img.replace(/\.jpeg$/, '.webp'));
    if (!fs.existsSync(input)) {
      console.warn(`Missing ${input}`);
      continue;
    }
    try {
      await convertImage(input, output);
    } catch (err) {
      console.error(`Failed to convert ${img}:`, err);
    }
  }
  console.log('Conversion complete.');
})();
