export const getCroppedImg = (imageSrc: string, pixelCrop: any): Promise<string> => {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.src = imageSrc;
    image.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject('Could not get canvas context');
        return;
      }

      canvas.width = pixelCrop.width;
      canvas.height = pixelCrop.height;

      ctx.drawImage(
        image,
        pixelCrop.x,
        pixelCrop.y,
        pixelCrop.width,
        pixelCrop.height,
        0,
        0,
        pixelCrop.width,
        pixelCrop.height
      );

      resolve(canvas.toDataURL('image/jpeg'));
    };
    image.onerror = (error) => {
      reject(error);
    };
  });
};

export const compressImage = (dataUrl: string, quality = 0.8): Promise<string> => {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.src = dataUrl;
    image.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject('Could not get canvas context');
        return;
      }

      canvas.width = image.width;
      canvas.height = image.height;
      ctx.drawImage(image, 0, 0);

      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    image.onerror = (error) => {
      reject(error);
    };
  });
};