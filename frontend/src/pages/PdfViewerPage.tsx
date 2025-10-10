
import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { CATALOG } from '../data/catalog';
import { getPdf } from '../services/api';

const PdfViewerPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const book = CATALOG.find(b => b.id === id);
  
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // This variable will hold the temporary URL for blobs.
    let objectUrl: string | null = null;

    const PRECONFIGURED_PDFS: Record<string, string> = {
      'NUR-ENG-SKILL-ABCD-C': 'https://firebasestorage.googleapis.com/v0/b/test-project-96eea.appspot.com/o/Nursery_English_Skill_Book.pdf?alt=media&token=143f5f67-a2f8-4b72-8877-628f86991b10'
    };

    const loadPdf = async () => {
      if (!id) {
        setIsLoading(false);
        setError("No book ID provided.");
        return;
      }

      try {
        // Priority 1: Check IndexedDB for a user-uploaded file
        const file = await getPdf(id);
        if (file) {
          // Create a temporary URL from the file blob
          objectUrl = URL.createObjectURL(file);
          setPdfUrl(objectUrl);
        } 
        // Priority 2: Fallback to a pre-configured PDF
        else if (PRECONFIGURED_PDFS[id]) {
            setPdfUrl(PRECONFIGURED_PDFS[id]);
        }
        // If neither, the component will render the "Not Available" message
      } catch (e) {
        console.error("Failed to load PDF from IndexedDB", e);
        setError("Could not load the PDF file.");
      } finally {
        setIsLoading(false);
      }
    };

    loadPdf();

    // Cleanup function: This is critical to prevent memory leaks.
    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [id]);

  if (!book) {
    return (
      <div className="container mx-auto max-w-4xl text-center py-16">
        <h1 className="text-3xl font-bold text-red-600">Book Not Found</h1>
        <p className="mt-4 text-gray-600">The book with ID "{id}" could not be found in our catalog.</p>
        <Link to="/" className="mt-8 inline-block bg-primary-600 text-white px-6 py-2 rounded-md hover:bg-primary-700">
          Back to Home
        </Link>
      </div>
    );
  }
  
  if (isLoading) {
    return (
        <div className="text-center py-12">
            <h2 className="text-2xl font-semibold text-gray-700">Loading PDF Preview...</h2>
        </div>
    );
  }

  return (
    <div className="container mx-auto max-w-6xl">
      <div className="bg-white p-4 sm:p-6 rounded-lg shadow-md border">
        <h1 className="text-2xl font-bold text-gray-800">{book.variant}</h1>
        <p className="text-md text-gray-500 mb-4">{book.subject} - {book.class_level}</p>
        
        {pdfUrl ? (
            <div>
              <div className="border rounded-md overflow-hidden bg-gray-200">
                <embed
                    src={pdfUrl}
                    type="application/pdf"
                    className="w-full h-[80vh]"
                />
              </div>
              <p className="text-center text-sm text-gray-500 mt-2">
                If the PDF does not appear, you can 
                <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className="ml-1 font-semibold text-primary-600 hover:underline">
                  open it in a new tab
                </a>.
              </p>
            </div>
        ) : (
            <div className="text-center py-12 bg-gray-100 rounded-lg">
                <h2 className="text-2xl font-semibold text-gray-700">PDF Preview Not Available</h2>
                <p className="mt-2 text-gray-500">A PDF for this book has not been uploaded yet.</p>
                {error && <p className="mt-2 text-red-500">{error}</p>}
                <Link 
                    to="/admin/upload" 
                    className="mt-6 inline-block bg-primary-600 text-white px-6 py-2 rounded-md hover:bg-primary-700 transition-colors"
                >
                    Go to Upload Page
                </Link>
            </div>
        )}
      </div>
    </div>
  );
};

export default PdfViewerPage;