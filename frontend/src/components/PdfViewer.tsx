import React from 'react';
import { FileText, AlertCircle } from 'lucide-react';

interface PdfViewerProps {
  link: string;
}

const PdfViewer: React.FC<PdfViewerProps> = ({ link }) => {
  // Logic to simulate PDF display.
  // In a real app, 'link' would be a real URL.
  // If the link is just a placeholder ID like 'pdf1', we show a dummy UI.
  
  const isRealUrl = link.startsWith('http');
  const displayUrl = isRealUrl ? link : null;

  if (!displayUrl) {
    return (
      <div className="w-full h-64 md:h-96 bg-slate-100 border border-slate-300 rounded-lg flex flex-col items-center justify-center p-6 text-slate-500">
        <FileText size={48} className="mb-4 text-slate-400" />
        <p className="text-lg font-medium">PDF Preview</p>
        <p className="text-sm">File ID: {link}</p>
        <div className="mt-4 p-4 bg-yellow-50 text-yellow-700 text-xs rounded border border-yellow-200 max-w-sm text-center flex items-start gap-2">
            <AlertCircle size={16} className="shrink-0 mt-0.5"/>
            <span>Note: This is a placeholder. In a production environment, the actual PDF file would render here in an iframe.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-64 md:h-96 bg-slate-100 border border-slate-300 rounded-lg overflow-hidden">
      <iframe 
        src={displayUrl} 
        title="PDF Preview"
        className="w-full h-full" 
      />
    </div>
  );
};

export default PdfViewer;