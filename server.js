import express from 'express';
import fetch from 'node-fetch';
import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';

const app = express();
app.use(express.json({ limit: '10mb' }));

const PORT = process.env.PORT || 3000;
const BASE_URL =
  process.env.BASE_URL || 'https://animosity-countdown-harvest.ngrok-free.dev';
const OUTPUT_DIR = path.join(process.cwd(), 'public', 'renders');

await fs.mkdir(OUTPUT_DIR, { recursive: true });

function escapeXml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function safeFileName(value = '') {
  return String(value || 'product')
    .toLowerCase()
    .trim()
    .replace(/[–—]/g, '-')
    .replace(/[\/]/g, '-')
    .replace(/\(/g, '')
    .replace(/\)/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function buildSvgOverlay({ width, height, line1, line2, line3 = '' }) {
  const text1 = escapeXml(line1);
  const text2 = escapeXml(line2);
  const text3 = escapeXml(line3);

  // pritaikyta pagal tavo dabartinį cover:
  // tekstas centre pagal plotį, bet kiek aukščiau negu buvo
  const centerX = width / 2;
  const baseY = Math.round(height * 0.37);

  return `
  <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <text
      x="${centerX}"
      y="${baseY}"
      text-anchor="middle"
      font-family="Arial, Helvetica, sans-serif"
      font-size="54"
      font-weight="700"
      fill="#ffffff"
    >${text1}</text>

    <text
      x="${centerX}"
      y="${baseY + 60}"
      text-anchor="middle"
      font-family="Arial, Helvetica, sans-serif"
      font-size="34"
      font-weight="700"
      fill="#9ffcff"
    >${text2}</text>

    <text
      x="${centerX}"
      y="${baseY + 110}"
      text-anchor="middle"
      font-family="Arial, Helvetica, sans-serif"
      font-size="22"
      font-weight="700"
      letter-spacing="1.5"
      fill="#9ffcff"
    >${text3}</text>
  </svg>
  `;
}

app.use('/renders', express.static(path.join(process.cwd(), 'public', 'renders')));

app.post('/render-product-image', async (req, res) => {
  try {
    const {
      base_image_url,
      line1 = '',
      line2 = '',
      line3 = '',
      file_name = 'product-cover'
    } = req.body || {};

    if (!base_image_url) {
      return res.status(400).json({ error: 'base_image_url is required' });
    }

    const imageResponse = await fetch(base_image_url);
    if (!imageResponse.ok) {
      return res.status(400).json({ error: 'Failed to fetch base image' });
    }

    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
    const image = sharp(imageBuffer);
    const metadata = await image.metadata();

    const width = metadata.width || 1600;
    const height = metadata.height || 1600;

    const svg = buildSvgOverlay({
      width,
      height,
      line1,
      line2,
      line3
    });

    const outputName = `${safeFileName(file_name)}-${Date.now()}.png`;
    const outputPath = path.join(OUTPUT_DIR, outputName);

    await image
      .composite([
        {
          input: Buffer.from(svg),
          top: 0,
          left: 0
        }
      ])
      .png()
      .toFile(outputPath);

    return res.json({
      success: true,
      image_url: `${BASE_URL}/renders/${outputName}`,
      file_name: outputName
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Render failed',
      details: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`Render service running on port ${PORT}`);
});