import express from 'express';
import fetch from 'node-fetch';
import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';

const app = express();
app.use(express.json({ limit: '10mb' }));

const PORT = process.env.PORT || 3000;
const BASE_URL =
  process.env.BASE_URL || 'https://autovectors-render.onrender.com';

const DEFAULT_BASE_IMAGE_URL =
  'https://cdn.shopify.com/s/files/1/0884/4771/3613/files/VECTORS_PPF_PRECUT_PATTERN_TEMPLATES_DOWNLOAD.png?v=1776328409';

const BRAND_LOGOS = {
  bmw: 'https://cdn.shopify.com/s/files/1/0884/4771/3613/files/bmw.png?v=1776328323',
};

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

function estimateTextWidth(text, fontSize, weightFactor = 0.58) {
  return String(text || '').length * fontSize * weightFactor;
}

function fitFontSize({
  text = '',
  maxWidth = 600,
  startSize = 56,
  minSize = 24,
  weightFactor = 0.58,
}) {
  let size = startSize;

  while (size > minSize && estimateTextWidth(text, size, weightFactor) > maxWidth) {
    size -= 1;
  }

  return size;
}

function buildSvgOverlay({ width, height, line1, line2, line3 = '' }) {
  const text1 = escapeXml(line1);
  const text2 = escapeXml(line2);
  const text3 = escapeXml(line3);

  const centerX = Math.round(width * 0.455);
  const baseY = Math.round(height * 0.39);

  const titleMaxWidth = Math.round(width * 0.49);
  const subMaxWidth = Math.round(width * 0.37);
  const descMaxWidth = Math.round(width * 0.41);

  const line1FontSize = fitFontSize({
    text: line1,
    maxWidth: titleMaxWidth,
    startSize: 58,
    minSize: 30,
    weightFactor: 0.57,
  });

  const line2FontSize = fitFontSize({
    text: line2,
    maxWidth: subMaxWidth,
    startSize: 37,
    minSize: 24,
    weightFactor: 0.56,
  });

  const line3FontSize = fitFontSize({
    text: line3,
    maxWidth: descMaxWidth,
    startSize: 24,
    minSize: 18,
    weightFactor: 0.56,
  });

  return `
  <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="glowStrong" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="4.8" result="blur"/>
        <feMerge>
          <feMergeNode in="blur"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>

      <filter id="glowSoft" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="3.2" result="blur"/>
        <feMerge>
          <feMergeNode in="blur"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
    </defs>

    <text
      x="${centerX}"
      y="${baseY}"
      text-anchor="middle"
      font-family="Arial, Helvetica, sans-serif"
      font-size="${line1FontSize}"
      font-weight="800"
      fill="#ffffff"
      filter="url(#glowStrong)"
    >${text1}</text>

    <text
      x="${centerX}"
      y="${baseY + 72}"
      text-anchor="middle"
      font-family="Arial, Helvetica, sans-serif"
      font-size="${line2FontSize}"
      font-weight="700"
      fill="#affcff"
      filter="url(#glowSoft)"
    >${text2}</text>

    <text
      x="${centerX}"
      y="${baseY + 136}"
      text-anchor="middle"
      font-family="Arial, Helvetica, sans-serif"
      font-size="${line3FontSize}"
      font-weight="700"
      letter-spacing="1.1"
      fill="#bafcff"
      filter="url(#glowSoft)"
    >${text3}</text>
  </svg>
  `;
}

async function fetchBuffer(url, errorMessage) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(errorMessage);
  }
  return Buffer.from(await response.arrayBuffer());
}

app.get('/', (req, res) => {
  res.send('AutoVectors Render API veikia');
});

app.use('/renders', express.static(path.join(process.cwd(), 'public', 'renders')));

app.post('/render-product-image', async (req, res) => {
  try {
    const {
      base_image_url = DEFAULT_BASE_IMAGE_URL,
      brand = '',
      brand_logo_url = '',
      line1 = '',
      line2 = '',
      line3 = '',
      file_name = 'product-cover',
    } = req.body || {};

    const resolvedLogoUrl =
      brand_logo_url || BRAND_LOGOS[String(brand).toLowerCase()] || '';

    const imageBuffer = await fetchBuffer(
      base_image_url,
      'Failed to fetch base image'
    );

    const image = sharp(imageBuffer);
    const metadata = await image.metadata();

    const width = metadata.width || 1600;
    const height = metadata.height || 1600;

    const svg = buildSvgOverlay({
      width,
      height,
      line1,
      line2,
      line3,
    });

    const composites = [
      {
        input: Buffer.from(svg),
        top: 0,
        left: 0,
      },
    ];

    if (resolvedLogoUrl) {
      const logoBuffer = await fetchBuffer(
        resolvedLogoUrl,
        'Failed to fetch brand logo'
      );

      const logoTargetHeight = 60;
      const logoMaxWidth = Math.round(width * 0.13);

      const resizedLogo = await sharp(logoBuffer)
        .ensureAlpha()
        .trim()
        .resize({
          width: logoMaxWidth,
          height: logoTargetHeight,
          fit: 'contain',
          withoutEnlargement: true,
        })
        .png()
        .toBuffer();

      const logoMeta = await sharp(resizedLogo).metadata();
      const logoWidth = logoMeta.width || logoMaxWidth;

      const baseY = Math.round(height * 0.39);
      const logoCenterX = Math.round(width * 0.455);
      const logoLeft = Math.round(logoCenterX - logoWidth / 2);
      const logoTop = baseY + 158;

      composites.push({
        input: resizedLogo,
        top: logoTop,
        left: logoLeft,
      });
    }

    const outputName = `${safeFileName(file_name)}-${Date.now()}.png`;
    const outputPath = path.join(OUTPUT_DIR, outputName);

    await image
      .composite(composites)
      .png()
      .toFile(outputPath);

    return res.json({
      success: true,
      image_url: `${BASE_URL}/renders/${outputName}`,
      file_name: outputName,
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Render failed',
      details: error.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`Render service running on port ${PORT}`);
});
