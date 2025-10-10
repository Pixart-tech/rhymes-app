
import { QuestionnaireAnswers } from '../types';

// Simulates saving a selection to the backend and S3
export const saveSelection = async (answers: Record<string, QuestionnaireAnswers>, schoolId: string): Promise<{ ok: boolean; id: string }> => {
  console.log('Saving selection for school:', schoolId, answers);
  
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 500));

  const selectionId = `sel_${Date.now()}`;
  
  // Simulate saving to localStorage (as a mock DB)
  try {
    const selectionData = { id: selectionId, schoolId, data: answers, createdAt: new Date().toISOString() };
    localStorage.setItem(`selection_${selectionId}`, JSON.stringify(selectionData));
    
    // Simulate S3 upload
    console.log(`Simulating upload to S3: selections/${schoolId}/${new Date().toISOString()}.json`);
  } catch (error) {
    console.error("Failed to save selection to localStorage", error);
    return { ok: false, id: '' };
  }

  return { ok: true, id: selectionId };
};

// Simulates getting a pre-signed URL for an S3 upload
export const getPresignedUrl = async (bookId: string, filename: string): Promise<{ uploadUrl: string; key: string; publicUrl: string; }> => {
  console.log('Getting presigned URL for:', { bookId, filename });
  
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 300));
  
  const key = `books/${bookId}/preview.pdf`;
  const mockUploadUrl = `https://mock-s3-upload.com/${key}?signature=...`;
  const mockPublicUrl = `https://your-cdn.com/${key}`;

  return {
    uploadUrl: mockUploadUrl,
    key: key,
    publicUrl: mockPublicUrl,
  };
};

// Simulates the actual file upload to S3
export const uploadFileToS3 = async (uploadUrl: string, file: File): Promise<Response> => {
    console.log(`Simulating PUT request to: ${uploadUrl} for file ${file.name}`);
    await new Promise(resolve => setTimeout(resolve, 1000));
    // In a real app, this would be:
    // return fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
    
    // Return a mock successful response
    return new Response(null, { status: 200, statusText: "OK" });
};


// --- IndexedDB for PDF Previews ---

const DB_NAME = 'BookPreviewDB';
const STORE_NAME = 'pdfStore';
const DB_VERSION = 1;

let db: IDBDatabase | null = null;

const initDb = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    if (db) {
      return resolve(db);
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('IndexedDB error:', request.error);
      reject('Error opening DB');
    };

    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const dbInstance = (event.target as IDBOpenDBRequest).result;
      if (!dbInstance.objectStoreNames.contains(STORE_NAME)) {
        // Store objects with an 'id' property and the 'file' itself
        dbInstance.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
};

export const savePdf = async (id: string, file: File): Promise<void> => {
  const db = await initDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put({ id, file });

    request.onsuccess = () => resolve();
    request.onerror = () => {
      console.error('Error saving PDF:', request.error);
      reject(request.error);
    };
  });
};

export const getPdf = async (id: string): Promise<File | null> => {
  const db = await initDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onsuccess = () => {
      resolve(request.result ? request.result.file : null);
    };
    request.onerror = () => {
      console.error('Error getting PDF:', request.error);
      reject(request.error);
    };
  });
};

export const deletePdf = async (id: string): Promise<void> => {
    const db = await initDb();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(id);

        request.onsuccess = () => resolve();
        request.onerror = () => {
            console.error('Error deleting PDF:', request.error);
            reject(request.error);
        }
    });
};

export const listPdfKeys = async (): Promise<string[]> => {
    const db = await initDb();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAllKeys();

        request.onsuccess = () => {
            // The result can be an array of any type, so we cast to string
            resolve(request.result.map(key => String(key)));
        };
        request.onerror = () => {
            console.error('Error listing keys:', request.error);
            reject(request.error);
        }
    });
};

export const clearPdfs = async (): Promise<void> => {
    const db = await initDb();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.clear();

        request.onsuccess = () => resolve();
        request.onerror = () => {
            console.error('Error clearing PDF store:', request.error);
            reject(request.error);
        }
    });
};