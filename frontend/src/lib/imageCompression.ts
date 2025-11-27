const DEFAULT_MAX_DIMENSION = 256;
const DEFAULT_QUALITY = 0.7;

const readAsDataURL = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Unable to read image'));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') {
        resolve(result);
      } else {
        reject(new Error('Unexpected result while reading image'));
      }
    };
    reader.readAsDataURL(blob);
  });

const loadImageElement = (dataUrl: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Unable to load image'));
    image.src = dataUrl;
  });

const canvasToBlob = (
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number
): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) {
        resolve(result);
      } else {
        reject(new Error('Failed to compress image'));
      }
    }, mimeType, quality);
  });

export interface CompressedImageResult {
  blob: Blob;
  dataUrl: string;
  base64: string;
  mimeType: string;
}

export interface CompressionOptions {
  maxDimension?: number;
  quality?: number;
}

export const compressImageFile = async (
  file: File,
  options?: CompressionOptions
): Promise<CompressedImageResult> => {
  const maxDimension = options?.maxDimension ?? DEFAULT_MAX_DIMENSION;
  const quality = options?.quality ?? DEFAULT_QUALITY;
  const mimeType = 'image/jpeg';

  const originalDataUrl = await readAsDataURL(file);
  const image = await loadImageElement(originalDataUrl);

  const ratio = Math.min(maxDimension / image.width, maxDimension / image.height, 1);
  const targetWidth = Math.max(1, Math.round(image.width * ratio));
  const targetHeight = Math.max(1, Math.round(image.height * ratio));

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Unable to obtain drawing context');
  }
  context.drawImage(image, 0, 0, targetWidth, targetHeight);

  const blob = await canvasToBlob(canvas, mimeType, quality);
  const dataUrl = await readAsDataURL(blob);
  const [, base64 = ''] = dataUrl.split(',');

  return { blob, dataUrl, base64, mimeType };
};
