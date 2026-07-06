// Equipment OCR pipeline: Camera -> Grayscale/Contrast enhancement ->
// Tesseract.js -> regex parsing -> Equipment fields.
//
// Tesseract.js is loaded lazily via dynamic import only when a user actually
// taps "Scan Equipment" (per the design doc: keeps initial bundle small).
// It's fetched from a CDN as an ES module — no build step required. The
// service worker opportunistically caches it (and its worker/wasm/lang
// assets) on first successful load, so subsequent scans work fully offline.

import { loadImageFromFile } from './photoService.js';

const TESSERACT_CDN_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.esm.min.js';

let tesseractModulePromise = null;
function loadTesseract() {
  if (!tesseractModulePromise) {
    tesseractModulePromise = import(TESSERACT_CDN_URL);
  }
  return tesseractModulePromise;
}

// Grayscale + linear contrast stretch. Serial plates are often stamped metal
// with low contrast under indoor lighting — this measurably helps Tesseract.
async function preprocessForOcr(file) {
  const img = await loadImageFromFile(file);
  const maxDim = 1400;
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = imageData.data;
  let min = 255;
  let max = 0;
  for (let i = 0; i < d.length; i += 4) {
    const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    d[i] = d[i + 1] = d[i + 2] = gray;
    if (gray < min) min = gray;
    if (gray > max) max = gray;
  }
  const range = Math.max(1, max - min);
  for (let i = 0; i < d.length; i += 4) {
    const stretched = ((d[i] - min) / range) * 255;
    d[i] = d[i + 1] = d[i + 2] = stretched;
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

const KNOWN_MANUFACTURERS = [
  'Trane', 'Carrier', 'Rheem', 'Whirlpool', 'GE', 'Samsung', 'LG', 'Frigidaire',
  'Goodman', 'Lennox', 'Bradford White', 'A.O. Smith', 'AO Smith', 'Bosch',
  'Maytag', 'Kenmore', 'York', 'American Standard', 'Amana', 'KitchenAid',
  'Ruud', 'Rinnai', 'Navien', 'Honeywell', 'Payne', 'Coleman', 'Heil',
];

function parseEquipmentText(rawText, confidence) {
  const text = rawText || '';
  const upper = text.toUpperCase();
  const manufacturer = KNOWN_MANUFACTURERS.find((m) => upper.includes(m.toUpperCase())) || null;

  const modelMatch = text.match(/model\s*(no\.?|number|#)?[:\s]+([A-Z0-9][A-Z0-9\-\/]{3,})/i);
  const serialMatch = text.match(/(serial|s\/n|ser\.?)\s*(no\.?|number|#)?[:\s]+([A-Z0-9][A-Z0-9\-\/]{3,})/i);
  const yearMatch = text.match(/\b(19[8-9]\d|20[0-4]\d)\b/); // plausible manufacture year 1980-2049

  return {
    manufacturer,
    model: modelMatch ? modelMatch[2].toUpperCase() : null,
    serialNumber: serialMatch ? serialMatch[3].toUpperCase() : null,
    manufactureDate: yearMatch ? yearMatch[1] : null,
    confidence: typeof confidence === 'number' ? Math.round(confidence) : null,
    extractedText: text.trim().slice(0, 800),
  };
}

export const ocrService = {
  // Returns { manufacturer, model, serialNumber, manufactureDate, confidence, extractedText }
  async scanEquipmentPhoto(file, { onStatus } = {}) {
    onStatus?.('enhancing');
    const canvas = await preprocessForOcr(file);

    onStatus?.('loading-engine');
    let createWorker;
    try {
      ({ createWorker } = await loadTesseract());
    } catch (err) {
      throw new Error('Could not load the OCR engine. An internet connection is required the first time you scan equipment.');
    }

    onStatus?.('reading');
    const worker = await createWorker('eng');
    try {
      const { data } = await worker.recognize(canvas);
      return parseEquipmentText(data.text, data.confidence);
    } finally {
      await worker.terminate();
    }
  },

  estimateAge(manufactureDate) {
    const year = parseInt(manufactureDate, 10);
    if (!year || Number.isNaN(year)) return null;
    return new Date().getFullYear() - year;
  },
};