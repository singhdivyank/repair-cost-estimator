// Handles turning a <input type="file" capture="environment"> selection into
// storable blobs. No external dependency — plain Canvas APIs.

const THUMBNAIL_MAX_DIM = 320;

export function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve(img);
      URL.revokeObjectURL(url);
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });
}

async function makeThumbnail(img, maxDim = THUMBNAIL_MAX_DIM) {
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.75));
}

export const photoService = {
  // Takes the raw File from a camera/file input and returns the full-size
  // blob plus a small thumbnail blob for fast list rendering.
  async processCapturedFile(file) {
    const img = await loadImageFromFile(file);
    const thumbnailBlob = await makeThumbnail(img);
    return { blob: file, thumbnailBlob };
  },

  // Object URLs must be revoked once the <img> using them is discarded, or
  // the browser leaks memory. Screens track their own created URLs and call
  // this on every re-render before rebuilding the DOM.
  revokeAll(urlSet) {
    urlSet.forEach((url) => URL.revokeObjectURL(url));
    urlSet.clear();
  },
};