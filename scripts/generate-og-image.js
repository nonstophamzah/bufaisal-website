const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// SVG template for the OG image
const generateSVG = () => {
  const width = 1200;
  const height = 630;
  const brandColor = '#F5A623'; // Gold/Yellow
  const bgColor = '#000000'; // Black
  const textColor = '#FFFFFF'; // White

  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <!-- Background -->
      <rect width="${width}" height="${height}" fill="${bgColor}"/>

      <!-- Decorative top accent line -->
      <line x1="0" y1="80" x2="${width}" y2="80" stroke="${brandColor}" stroke-width="3"/>

      <!-- Main heading: "Bu Faisal General Trading" -->
      <text
        x="${width / 2}"
        y="200"
        font-size="72"
        font-weight="700"
        font-family="Arial, sans-serif"
        text-anchor="middle"
        fill="${textColor}"
        letter-spacing="2"
      >
        BU FAISAL
      </text>

      <!-- Subheading: "General Trading" -->
      <text
        x="${width / 2}"
        y="270"
        font-size="42"
        font-weight="500"
        font-family="Arial, sans-serif"
        text-anchor="middle"
        fill="${brandColor}"
        letter-spacing="1"
      >
        GENERAL TRADING
      </text>

      <!-- Decorative divider -->
      <line x1="250" y1="310" x2="${width - 250}" y2="310" stroke="${brandColor}" stroke-width="2"/>

      <!-- Tagline: "UAE's Largest Second-Hand Market" -->
      <text
        x="${width / 2}"
        y="370"
        font-size="38"
        font-weight="600"
        font-family="Arial, sans-serif"
        text-anchor="middle"
        fill="${textColor}"
        letter-spacing="0.5"
      >
        UAE'S LARGEST SECOND-HAND MARKET
      </text>

      <!-- Sub-tagline: "5 Showrooms in Ajman | Since 2009" -->
      <text
        x="${width / 2}"
        y="420"
        font-size="28"
        font-weight="400"
        font-family="Arial, sans-serif"
        text-anchor="middle"
        fill="${brandColor}"
      >
        5 SHOWROOMS IN AJMAN | SINCE 2009
      </text>

      <!-- Bottom accent line -->
      <line x1="0" y1="550" x2="${width}" y2="550" stroke="${brandColor}" stroke-width="3"/>

      <!-- Small decorative corners -->
      <circle cx="50" cy="50" r="8" fill="${brandColor}" opacity="0.6"/>
      <circle cx="${width - 50}" cy="50" r="8" fill="${brandColor}" opacity="0.6"/>
      <circle cx="50" cy="${height - 50}" r="8" fill="${brandColor}" opacity="0.6"/>
      <circle cx="${width - 50}" cy="${height - 50}" r="8" fill="${brandColor}" opacity="0.6"/>
    </svg>
  `;

  return svg;
};

const generateOGImage = async () => {
  try {
    const svg = generateSVG();
    const outputPath = path.join(
      __dirname,
      '..',
      'public',
      'og-image.png'
    );

    // Ensure public directory exists
    const publicDir = path.dirname(outputPath);
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }

    // Convert SVG to PNG using sharp
    await sharp(Buffer.from(svg))
      .png()
      .toFile(outputPath);

    console.log(`✓ OG image generated successfully at ${outputPath}`);
    console.log(`  Dimensions: 1200x630 pixels`);
    console.log(`  Format: PNG`);
  } catch (error) {
    console.error('Error generating OG image:', error);
    process.exit(1);
  }
};

generateOGImage();
