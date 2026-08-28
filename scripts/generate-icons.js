import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

// Helper to write a valid uncompressed/deflated PNG file in pure Node.js
function createPng(width, height, drawFn) {
  const buffer = Buffer.alloc(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const [r, g, b, a] = drawFn(x, y, width, height);
      buffer[idx] = r;
      buffer[idx + 1] = g;
      buffer[idx + 2] = b;
      buffer[idx + 3] = a;
    }
  }

  // PNG filter byte (0 = None) before each scanline
  const scanlineLength = width * 4 + 1;
  const rawData = Buffer.alloc(scanlineLength * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * scanlineLength;
    rawData[rowOffset] = 0; // Filter None
    buffer.copy(rawData, rowOffset + 1, y * width * 4, (y + 1) * width * 4);
  }

  const compressedData = zlib.deflateSync(rawData);

  // PNG chunks
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  function makeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);

    const typeBuffer = Buffer.from(type, 'ascii');
    const crcBuffer = Buffer.concat([typeBuffer, data]);

    // CRC32 calculation
    let crc = 0xffffffff;
    for (let i = 0; i < crcBuffer.length; i++) {
      const byte = crcBuffer[i];
      crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    }
    crc = (crc ^ 0xffffffff) >>> 0;

    const crcOut = Buffer.alloc(4);
    crcOut.writeUInt32BE(crc, 0);

    return Buffer.concat([len, typeBuffer, data, crcOut]);
  }

  // CRC table
  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      if (c & 1) {
        c = 0xedb88320 ^ (c >>> 1);
      } else {
        c = c >>> 1;
      }
    }
    crcTable[n] = c;
  }

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 8 bits per channel
  ihdr[9] = 6; // Color type 6: RGBA
  ihdr[10] = 0; // Compression 0
  ihdr[11] = 0; // Filter 0
  ihdr[12] = 0; // Interlace 0

  const ihdrChunk = makeChunk('IHDR', ihdr);
  const idatChunk = makeChunk('IDAT', compressedData);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

// Color definitions:
// Agro Dark: #0B3D2E -> (11, 61, 46)
// Agro Forest: #07261D -> (7, 38, 29)
// Agro Light: #78C89A -> (120, 200, 154)
// White: #FFFFFF -> (255, 255, 255)

// Standard icon drawing function for AgroCore
function drawStandardIcon(x, y, w, h) {
  const cx = w / 2;
  const cy = h / 2;
  const cornerRadius = w * 0.22;

  // Background rounded rectangle
  const dx = Math.max(0, Math.abs(x - cx) - (cx - cornerRadius));
  const dy = Math.max(0, Math.abs(y - cy) - (cy - cornerRadius));
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist > cornerRadius) {
    return [0, 0, 0, 0]; // Transparent outside rounded corner
  }

  // Base background is #0B3D2E
  let baseR = 11, baseG = 61, baseB = 46, baseA = 255;

  // Normalized coords inside icon (-1 to 1)
  const nx = (x - cx) / (w * 0.5);
  const ny = (y - cy) / (h * 0.5);

  // AgroCore Symbol Geometry:
  // Center of glyph slightly offset to left to balance the leaf
  const gx = nx + 0.05;
  const gy = ny;

  // 1. Central Core Circle: radius ~ 0.18
  const coreDist = Math.sqrt(gx * gx + gy * gy);
  if (coreDist <= 0.20) {
    return [255, 255, 255, 255]; // White Core
  }

  // 2. Outer "C" Arc: radius ~ 0.52 to 0.68, opening on right between angle -35deg and +35deg
  const arcDist = Math.sqrt(gx * gx + gy * gy);
  const angle = Math.atan2(gy, gx); // -PI to PI
  const isOpening = angle > -0.55 && angle < 0.55; // Open on right side like "C"

  if (arcDist >= 0.48 && arcDist <= 0.68 && !isOpening) {
    return [120, 200, 154, 255]; // Light Green Arc #78C89A
  }

  // 3. Dynamic Agricultural Leaf pointing upwards-right
  // Leaf center ~ (0.25, -0.28)
  const leafX = nx - 0.25;
  const leafY = ny + 0.28;
  const leafDist = Math.sqrt(leafX * leafX * 2.0 + leafY * leafY * 1.0);
  if (leafDist <= 0.32 && ny <= 0.02 && nx >= -0.05) {
    return [120, 200, 154, 255]; // Light Green Leaf #78C89A
  }

  return [baseR, baseG, baseB, baseA];
}

// Maskable icon drawing function (safe zone inside center 80%)
function drawMaskableIcon(x, y, w, h) {
  const cx = w / 2;
  const cy = h / 2;

  // Full bleed background: #0B3D2E
  let baseR = 11, baseG = 61, baseB = 46, baseA = 255;

  const scale = 0.55;
  const nx = (x - cx) / (w * scale);
  const ny = (y - cy) / (h * scale);

  const gx = nx + 0.05;
  const gy = ny;

  const coreDist = Math.sqrt(gx * gx + gy * gy);
  if (coreDist <= 0.20) {
    return [255, 255, 255, 255];
  }

  const arcDist = Math.sqrt(gx * gx + gy * gy);
  const angle = Math.atan2(gy, gx);
  const isOpening = angle > -0.55 && angle < 0.55;

  if (arcDist >= 0.48 && arcDist <= 0.68 && !isOpening) {
    return [120, 200, 154, 255];
  }

  const leafX = nx - 0.25;
  const leafY = ny + 0.28;
  const leafDist = Math.sqrt(leafX * leafX * 2.0 + leafY * leafY * 1.0);
  if (leafDist <= 0.32 && ny <= 0.02 && nx >= -0.05) {
    return [120, 200, 154, 255];
  }

  return [baseR, baseG, baseB, baseA];
}

// Ensure public directories
const publicDir = path.resolve('public');
const iconsDir = path.resolve('public/icons');

if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir, { recursive: true });

console.log('Generating AgroCore PWA and system icons...');

// 1. icon-192x192.png
const icon192 = createPng(192, 192, drawStandardIcon);
fs.writeFileSync(path.join(iconsDir, 'icon-192x192.png'), icon192);
console.log('Created public/icons/icon-192x192.png (192x192)');

// 2. icon-512x512.png
const icon512 = createPng(512, 512, drawStandardIcon);
fs.writeFileSync(path.join(iconsDir, 'icon-512x512.png'), icon512);
console.log('Created public/icons/icon-512x512.png (512x512)');

// 3. maskable-icon-512x512.png
const maskable512 = createPng(512, 512, drawMaskableIcon);
fs.writeFileSync(path.join(iconsDir, 'maskable-icon-512x512.png'), maskable512);
console.log('Created public/icons/maskable-icon-512x512.png (512x512 maskable)');

// 4. apple-touch-icon-180x180.png
const appleIcon180 = createPng(180, 180, drawStandardIcon);
fs.writeFileSync(path.join(iconsDir, 'apple-touch-icon-180x180.png'), appleIcon180);
console.log('Created public/icons/apple-touch-icon-180x180.png (180x180)');

// 5. favicon-32x32.png
const favicon32 = createPng(32, 32, drawStandardIcon);
fs.writeFileSync(path.join(iconsDir, 'favicon-32x32.png'), favicon32);
console.log('Created public/icons/favicon-32x32.png (32x32)');

// 6. favicon-16x16.png
const favicon16 = createPng(16, 16, drawStandardIcon);
fs.writeFileSync(path.join(iconsDir, 'favicon-16x16.png'), favicon16);
console.log('Created public/icons/favicon-16x16.png (16x16)');

// 7. Generate SVG Favicon in public/favicon.svg
const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
  <rect width="32" height="32" rx="7" fill="#0B3D2E"/>
  <path d="M21 9.5C19.5 8 17.4 7 15 7C10.03 7 6 11.03 6 16C6 20.97 10.03 25 15 25C17.4 25 19.5 24 21 22.5" stroke="#78C89A" stroke-width="2.5" stroke-linecap="round"/>
  <circle cx="15" cy="16" r="3.2" fill="#FFFFFF"/>
  <path d="M15 13C15 13 18.5 10 24 10C24 15.5 21 19 21 19C21 19 19.5 15.5 15 13Z" fill="#78C89A"/>
</svg>`;
fs.writeFileSync(path.join(publicDir, 'favicon.svg'), faviconSvg, 'utf-8');
console.log('Created public/favicon.svg');
