import React from 'react';
import { cn } from '../lib/utils';

const DocumentPage = ({ topSlot, bottomSlot, showBottom = true, className }) => {



 

  const isFullPage = !showBottom;

  const slotWrapperClasses = 'flex-1 flex justify-center items-stretch';
  const slotInnerClasses = 'flex h-full w-full items-stretch justify-center';

  return (
    <div className={cn('w-full flex justify-center', className)}>
      <div className="w-[210mm] h-[290mm] bg-white flex flex-col">
        {isFullPage ? (
          <div className={slotWrapperClasses}>
            <div className={slotInnerClasses}>{topSlot}</div>
          </div>
        ) : (
          <>
            <div className={slotWrapperClasses}>
              <div className={slotInnerClasses}>{topSlot}</div>
            </div>
            <div className={slotWrapperClasses}>
              <div className={slotInnerClasses}>{bottomSlot}</div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default DocumentPage;
