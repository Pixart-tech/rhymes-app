import React, { useEffect, useMemo, useRef, useState } from 'react';
import InlineSvg from './InlineSvg';
import { cn } from '../lib/utils';

const svgMarkupCache = new Map();
const assetPrefetchCache = new Set();

const deriveFolderUrl = (sourceUrl) => {
  if (!sourceUrl || typeof sourceUrl !== 'string') {
    return '';
  }

  try {
    const base = new URL(sourceUrl, typeof window !== 'undefined' ? window.location.href : 'http://localhost');
    base.hash = '';
    base.search = '';
    const pathname = base.pathname || '/';
    base.pathname = pathname.replace(/[^/]*$/, '');
    if (!base.pathname.endsWith('/')) {
      base.pathname = `${base.pathname}/`;
    }
    return base.toString();
  } catch (error) {
    return '';
  }
};

const rewriteSvgMarkup = (svgMarkup, sourceUrl) => {
  if (typeof svgMarkup !== 'string' || svgMarkup.trim().length === 0) {
    return { markup: '', assets: [] };
  }

  if (typeof window === 'undefined' || typeof window.DOMParser === 'undefined') {
    return { markup: svgMarkup, assets: [] };
  }

  try {
    const parser = new window.DOMParser();
    const doc = parser.parseFromString(svgMarkup, 'image/svg+xml');

    const parserError = doc.querySelector('parsererror');
    if (parserError) {
      return { markup: svgMarkup, assets: [] };
    }

    const folderUrl = deriveFolderUrl(sourceUrl);
    const assetUrls = new Set();

    const imageNodes = doc.querySelectorAll('image, img');
    imageNodes.forEach((node) => {
      if (!node) {
        return;
      }

      const candidates = [
        node.getAttribute('href'),
        node.getAttribute('xlink:href'),
        node.getAttribute('data-href'),
        node.getAttribute('src')
      ];

      const original = candidates.find((value) => typeof value === 'string' && value.trim().length > 0);
      if (!original) {
        return;
      }

      const trimmed = original.trim();
      if (/^data:/i.test(trimmed)) {
        return;
      }

      let resolvedUrl;
      try {
        resolvedUrl = new URL(trimmed, folderUrl || sourceUrl).toString();
      } catch (error) {
        return;
      }

      node.setAttribute('href', resolvedUrl);
      node.setAttribute('xlink:href', resolvedUrl);
      node.setAttribute('data-href', resolvedUrl);
      node.setAttribute('src', resolvedUrl);

      try {
        const parsed = new URL(resolvedUrl);
        const extension = (parsed.pathname || '').split('.').pop();
        if (extension && extension.toLowerCase() !== 'svg') {
          assetUrls.add(resolvedUrl);
        }
      } catch (error) {
        assetUrls.add(resolvedUrl);
      }
    });

    const serializer = new XMLSerializer();
    const serialized = serializer.serializeToString(doc.documentElement || doc);
    return { markup: serialized, assets: Array.from(assetUrls) };
  } catch (error) {
    console.error('Unable to parse SVG markup for asset rewriting:', error);
    return { markup: svgMarkup, assets: [] };
  }
};

const prefetchImageAssets = async (urls, signal) => {
  if (!Array.isArray(urls) || urls.length === 0) {
    return;
  }

  if (typeof window === 'undefined' || typeof window.Image === 'undefined') {
    return;
  }

  const tasks = urls
    .map((url) => {
      if (!url || assetPrefetchCache.has(url)) {
        return null;
      }

      return new Promise((resolve, reject) => {
        let aborted = false;
        const image = new window.Image();
        image.decoding = 'async';

        let abortHandler;

        const cleanup = () => {
          image.removeEventListener('load', handleLoad);
          image.removeEventListener('error', handleError);
          if (signal && abortHandler) {
            signal.removeEventListener('abort', abortHandler);
          }
        };

        const handleLoad = () => {
          if (aborted) {
            return;
          }
          cleanup();
          assetPrefetchCache.add(url);
          resolve();
        };

        const handleError = (event) => {
          cleanup();
          if (aborted || (signal && signal.aborted)) {
            resolve();
            return;
          }
          console.warn('Unable to prefetch linked SVG asset:', url, event);
          reject(event instanceof Error ? event : new Error('Failed to preload image asset.'));
        };

        abortHandler = () => {
          aborted = true;
          cleanup();
          image.src = '';
          reject(new DOMException('Aborted', 'AbortError'));
        };

        image.addEventListener('load', handleLoad, { once: true });
        image.addEventListener('error', handleError, { once: true });

        if (signal) {
          if (signal.aborted) {
            abortHandler();
            return;
          }
          signal.addEventListener('abort', abortHandler, { once: true });
        }

        try {
          image.src = url;
        } catch (error) {
          cleanup();
          reject(error);
        }
      });
    })
    .filter(Boolean);

  if (tasks.length > 0) {
    await Promise.all(tasks);
  }
};

const defaultLoadingIndicator = (
  <div className="flex h-full w-full items-center justify-center text-sm font-medium text-orange-500">
    Loading artwork…
  </div>
);

const defaultErrorIndicator = (message) => (
  <div className="flex h-full w-full items-center justify-center rounded-lg border border-dashed border-red-200 bg-red-50 px-3 py-4 text-center text-xs font-medium text-red-600">
    {message || 'Unable to load artwork.'}
  </div>
);

const defaultEmptyIndicator = (
  <div className="flex h-full w-full items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center text-xs font-medium text-slate-500">
    Artwork unavailable
  </div>
);

const NetworkSvgImage = ({
  src,
  className,
  svgClassName = 'h-full w-full',
  wrapperClassName,
  ariaLabel,
  role,
  sanitize = true,
  fallbackMarkup = '',
  loadingIndicator = defaultLoadingIndicator,
  errorIndicator,
  emptyIndicator = defaultEmptyIndicator
}) => {
  const [status, setStatus] = useState(() => {
    if (src && svgMarkupCache.has(src)) {
      return 'success';
    }
    if (!src) {
      return fallbackMarkup ? 'fallback' : 'idle';
    }
    return 'loading';
  });
  const [markup, setMarkup] = useState(() => {
    if (src && svgMarkupCache.has(src)) {
      return svgMarkupCache.get(src);
    }
    return '';
  });
  const [errorMessage, setErrorMessage] = useState('');
  const abortRef = useRef(null);

  useEffect(() => {
    if (!src) {
      setStatus(fallbackMarkup ? 'fallback' : 'idle');
      setMarkup('');
      setErrorMessage('');
      return undefined;
    }

    if (svgMarkupCache.has(src)) {
      setStatus('success');
      setMarkup(svgMarkupCache.get(src));
      setErrorMessage('');
      return undefined;
    }

    let isMounted = true;
    const controller = new AbortController();
    abortRef.current = controller;

    setStatus('loading');
    setMarkup('');
    setErrorMessage('');

    fetch(src, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Received ${response.status} ${response.statusText}`);
        }
        return response.text();
      })
      .then(async (svgText) => {
        if (!isMounted) {
          return;
        }
        const { markup: rewrittenMarkup, assets } = rewriteSvgMarkup(svgText, src);
        if (assets.length > 0) {
          await prefetchImageAssets(assets, controller.signal);
        }

        if (!isMounted || controller.signal.aborted) {
          return;
        }

        svgMarkupCache.set(src, rewrittenMarkup);
        setMarkup(rewrittenMarkup);
        setStatus('success');
        setErrorMessage('');
      })
      .catch((error) => {
        if (!isMounted || controller.signal.aborted) {
          return;
        }
        console.error('Error fetching remote SVG:', error);
        setErrorMessage(error?.message || 'Unable to load SVG.');
        setMarkup('');
        setStatus('error');
      })
      .finally(() => {
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
      });

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [src, fallbackMarkup]);

  useEffect(() => () => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  const content = useMemo(() => {
    if (status === 'success' && markup) {
      return (
        <InlineSvg
          markup={markup}
          className={cn(svgClassName)}
          ariaLabel={ariaLabel}
          role={role}
          sanitize={sanitize}
        />
      );
    }

    if (status === 'loading') {
      return loadingIndicator;
    }

    if (status === 'error') {
      if (fallbackMarkup) {
        return (
          <InlineSvg
            markup={fallbackMarkup}
            className={cn(svgClassName)}
            ariaLabel={ariaLabel}
            role={role}
            sanitize={sanitize}
          />
        );
      }
      return errorIndicator || defaultErrorIndicator(errorMessage);
    }

    if (status === 'fallback' && fallbackMarkup) {
      return (
        <InlineSvg
          markup={fallbackMarkup}
          className={cn(svgClassName)}
          ariaLabel={ariaLabel}
          role={role}
          sanitize={sanitize}
        />
      );
    }

    if (status === 'idle' && fallbackMarkup) {
      return (
        <InlineSvg
          markup={fallbackMarkup}
          className={cn(svgClassName)}
          ariaLabel={ariaLabel}
          role={role}
          sanitize={sanitize}
        />
      );
    }

    if (status === 'idle') {
      return emptyIndicator;
    }

    return emptyIndicator;
  }, [
    ariaLabel,
    emptyIndicator,
    errorIndicator,
    fallbackMarkup,
    loadingIndicator,
    markup,
    role,
    sanitize,
    status,
    svgClassName,
    errorMessage
  ]);

  return (
    <div
      className={cn(
        'network-svg-wrapper relative flex h-full w-full items-center justify-center overflow-hidden',
        className,
        wrapperClassName
      )}
    >
      {content}
    </div>
  );
};

export default NetworkSvgImage;
