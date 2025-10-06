export const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    if (!file) {
      resolve('');
      return;
    }

    if (typeof FileReader === 'undefined') {
      reject(new Error('FileReader is not supported in this environment.'));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      resolve(result);
    };
    reader.onerror = () => {
      reject(reader.error || new Error('Unable to read file.'));
    };
    reader.onabort = () => {
      reject(new Error('File reading was aborted.'));
    };

    reader.readAsDataURL(file);
  });
