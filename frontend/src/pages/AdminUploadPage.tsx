
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { CATALOG } from '../data/catalog';
import { Book } from '../types';
import { savePdf, deletePdf, listPdfKeys, clearPdfs } from '../services/api';

interface UploadState {
  status: 'idle' | 'uploading' | 'success' | 'error';
  message: string;
}

const BookUploadRow: React.FC<{ book: Book, initialHasPdf: boolean, onUploadComplete: () => void }> = ({ book, initialHasPdf, onUploadComplete }) => {
  const [file, setFile] = useState<File | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>({ status: 'idle', message: '' });
  const [hasPdf, setHasPdf] = useState(initialHasPdf);

  useEffect(() => {
    setHasPdf(initialHasPdf);
  }, [initialHasPdf]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      if (e.target.files[0].type === 'application/pdf') {
        setFile(e.target.files[0]);
        setUploadState({ status: 'idle', message: '' });
      } else {
        setFile(null);
        e.target.value = ''; // Reset file input
        setUploadState({ status: 'error', message: 'Please select a PDF file.' });
      }
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setUploadState({ status: 'error', message: 'Please select a file first.' });
      return;
    }

    setUploadState({ status: 'uploading', message: 'Saving to database...' });
    
    try {
      await savePdf(book.id, file);
      setUploadState({ status: 'success', message: `Success! PDF is saved.` });
      setHasPdf(true);
      setFile(null);
      onUploadComplete();
    } catch (error) {
      console.error(error);
      const message = error instanceof Error && error.message.includes('QuotaExceededError') 
        ? 'Save failed. Browser storage may be full.'
        : 'An unexpected error occurred.';
      setUploadState({ status: 'error', message });
    }
  };
  
  const handleReplace = async () => {
    setUploadState({ status: 'idle', message: '' });
    try {
      await deletePdf(book.id);
      setHasPdf(false); // Update UI to show upload controls
    } catch (error) {
      console.error("Failed to delete PDF", error);
      setUploadState({ status: 'error', message: "Could not remove existing PDF." });
    }
  };
  
  return (
    <li className="bg-white p-4 rounded-md shadow-sm border border-gray-200 grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
      <div className="md:col-span-2">
        <p className="font-semibold text-gray-800">{book.variant}</p>
        <p className="text-sm text-gray-500">{book.class_level} - {book.subject}</p>
        <p className="text-xs font-mono text-gray-400 mt-1">{book.id}</p>
      </div>
      <div className="flex items-center space-x-2">
        {hasPdf ? (
          <span className="px-2 py-1 text-xs font-semibold text-green-800 bg-green-100 rounded-full">Uploaded</span>
        ) : (
          <span className="px-2 py-1 text-xs font-semibold text-red-800 bg-red-100 rounded-full">Missing PDF</span>
        )}
      </div>
      <div>
        {hasPdf ? (
          <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-4 space-y-2 sm:space-y-0">
            <Link 
              to={`/pdf/${book.id}`} 
              target="_blank" 
              className="text-center w-full sm:w-auto bg-primary-600 text-white px-3 py-2 rounded-md text-sm font-medium hover:bg-primary-700 transition-colors"
            >
              View PDF
            </Link>
             <button onClick={handleReplace} className="text-sm text-gray-500 hover:text-gray-700 hover:underline">Replace</button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <input
                type="file"
                id={`file-${book.id}`}
                onChange={handleFileChange}
                accept="application/pdf"
                className="block w-full text-sm text-gray-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100"
                required
              />
              <button
                onClick={handleUpload}
                disabled={!file || uploadState.status === 'uploading'}
                className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:bg-gray-400"
              >
                {uploadState.status === 'uploading' ? '...' : 'Upload'}
              </button>
            </div>
            {uploadState.message && (
              <p className={`text-xs ${
                uploadState.status === 'error' ? 'text-red-600' : 
                uploadState.status === 'success' ? 'text-green-600' : 'text-blue-600'
              }`}>
                {uploadState.message}
              </p>
            )}
          </div>
        )}
      </div>
    </li>
  );
};


const AdminUploadPage: React.FC = () => {
  const [uploadedPdfIds, setUploadedPdfIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isClearing, setIsClearing] = useState(false);

  const fetchKeys = async () => {
    setIsLoading(true);
    try {
        const keys = await listPdfKeys();
        setUploadedPdfIds(new Set(keys));
    } catch (error) {
        console.error("Could not fetch PDF keys from DB", error);
    } finally {
        setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchKeys();
  }, []);
  
  const handleClearAll = async () => {
    if (window.confirm('Are you sure you want to delete all uploaded PDF previews? This cannot be undone.')) {
        setIsClearing(true);
        try {
            await clearPdfs();
            await fetchKeys(); // Refresh the list
            alert('All stored PDFs have been cleared.');
        } catch (error) {
            console.error('Failed to clear PDFs', error);
            alert('Could not clear stored PDFs. Please check the console for errors.');
        } finally {
            setIsClearing(false);
        }
    }
  };

  if (isLoading && !isClearing) {
    return <div className="text-center p-12">Loading PDF statuses...</div>;
  }

  return (
    <div className="container mx-auto max-w-5xl">
      <div className="bg-gray-50 p-4 sm:p-6 md:p-8 rounded-lg">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-2 gap-4">
            <h1 className="text-2xl font-bold text-gray-800">Manage Book PDF Previews</h1>
            <button
                onClick={handleClearAll}
                disabled={isClearing}
                className="bg-red-600 text-white px-3 py-2 rounded-md text-sm font-medium hover:bg-red-700 disabled:bg-gray-400 self-start sm:self-center"
            >
                {isClearing ? 'Clearing...' : 'Clear All PDFs'}
            </button>
        </div>
        <p className="text-gray-600 mb-6">Upload a PDF preview for each book. Uploaded files are stored in your browser and will persist between sessions.</p>
        <p className="text-sm text-gray-500 mb-6 italic">Note: A sample PDF for 'Nursery - English Skill - ABCD (Caps)' is pre-loaded for demonstration. You can override it by uploading your own file.</p>
        
        <ul className="space-y-4">
          {CATALOG.map(book => (
            <BookUploadRow 
              key={book.id} 
              book={book} 
              initialHasPdf={uploadedPdfIds.has(book.id)}
              onUploadComplete={fetchKeys} // Re-fetch keys to ensure list is up to date
            />
          ))}
        </ul>
      </div>
    </div>
  );
};

export default AdminUploadPage;