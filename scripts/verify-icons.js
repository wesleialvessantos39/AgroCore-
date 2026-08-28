import fs from 'fs';
import path from 'path';

function inspectPngDimensions(filePath) {
  const buf = fs.readFileSync(filePath);
  if (buf.toString('ascii', 1, 4) !== 'PNG') {
    throw new Error(`${filePath} não é um PNG válido`);
  }
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  return { width, height, sizeBytes: buf.length };
}

const icons = [
  'public/icons/icon-192x192.png',
  'public/icons/icon-512x512.png',
  'public/icons/maskable-icon-512x512.png',
  'public/icons/apple-touch-icon-180x180.png',
  'public/icons/favicon-32x32.png',
  'dist/icons/icon-192x192.png',
  'dist/icons/icon-512x512.png',
  'dist/icons/maskable-icon-512x512.png',
  'dist/icons/apple-touch-icon-180x180.png',
  'dist/icons/favicon-32x32.png'
];

console.log('Inspeção física de dimensões dos ícones PNG:');
for (const iconPath of icons) {
  if (fs.existsSync(iconPath)) {
    const dim = inspectPngDimensions(iconPath);
    console.log(`- ${iconPath}: ${dim.width}x${dim.height}px (${dim.sizeBytes} bytes)`);
  } else {
    console.log(`- ${iconPath}: NÃO ENCONTRADO`);
  }
}
