import React from 'react';
import { cn } from '../lib/utils';

const sectionClasses = 'flex-1 flex items-center justify-center overflow-hidden';

const DocumentPage = ({ topSlot, bottomSlot, showBottom = true, className }) => {
  return (
    <div className={cn('flex w-full justify-center', className)}>
      <div className="w-[210mm] h-[290mm] bg-white flex flex-col">
        <div className={sectionClasses}>{topSlot}</div>
        {showBottom && <div className={sectionClasses}>{bottomSlot}</div>}
      </div>
    </div>
  );
};

export default DocumentPage;
