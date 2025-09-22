import React from 'react';
import { cn } from '../lib/utils';

const DocumentPage = ({ topSlot, bottomSlot, showBottom = true, className }) => {

  const isFullPage = !showBottom;

  return (
    <div className={cn('w-full flex justify-center', className)}>
      <div className="w-[210mm] h-[290mm] bg-white flex flex-col">
        {isFullPage ? (
          <div className="flex-1 flex items-center justify-center">
            {topSlot}
          </div>
        ) : (
          <>
            <div className="flex-1 flex items-center justify-center">
              {topSlot}
            </div>
            <div className="flex-1 flex items-center justify-center">
              {bottomSlot}
            </div>
          </>
        )}

      </div>
    </div>
  );
};

export default DocumentPage;
