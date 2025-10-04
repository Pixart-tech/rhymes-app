import React, { useMemo } from 'react';
import { cn } from '../lib/utils';
import { sanitizeRhymeSvgContent } from '../lib/svgUtils';

const InlineSvg = ({
  markup,
  className,
  ariaLabel,
  role,
  sanitize = true,
  emptyFallback = null
}) => {
  const processedMarkup = useMemo(() => {
    if (typeof markup !== 'string') {
      return '';
    }

    const trimmed = markup.trim();
    if (!trimmed) {
      return '';
    }

    if (!sanitize) {
      return trimmed;
    }

    return sanitizeRhymeSvgContent(trimmed);
  }, [markup, sanitize]);

  if (!processedMarkup) {
    if (emptyFallback) {
      return <div className={cn('inline-svg-renderer empty', className)}>{emptyFallback}</div>;
    }

    return <div className={cn('inline-svg-renderer empty', className)} role="presentation" aria-hidden="true" />;
  }

  const resolvedRole = role || (ariaLabel ? 'img' : undefined);

  return (
    <div
      className={cn('inline-svg-renderer', className)}
      role={resolvedRole}
      aria-label={ariaLabel}
      dangerouslySetInnerHTML={{ __html: processedMarkup }}
    />
  );
};

export default InlineSvg;
