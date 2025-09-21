import React from 'react';
import { cn } from '../lib/utils';

const DocumentPage = ({ topSlot, bottomSlot, showBottom = true, className }) => {
  return (
    <div className={cn('relative aspect-[210/297] w-full', className)}>
      <div className="flex h-full w-full min-h-0 min-w-0 overflow-hidden rounded-[32px] border border-gray-200 bg-white shadow-2xl">
        <div className={cn('grid h-full w-full min-h-0', showBottom ? 'grid-rows-2' : 'grid-rows-1')}>

          <div className="relative flex h-full min-h-0 w-full items-stretch overflow-hidden">{topSlot}</div>
          {showBottom && (
            <div className="relative flex h-full min-h-0 w-full items-stretch overflow-hidden">{bottomSlot}</div>
          )}

        </div>
      </div>
    </div>
  );
};

export default DocumentPage;
