import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import InlineSvg from './InlineSvg';
import DocumentPage from './DocumentPage';
import { Button } from './ui/button';
import { API_BASE_URL, cn } from '../lib/utils';
import { decodeSvgPayload, prepareRhymeSvgPages } from '../lib/svgUtils';

const parsePagesValue = (value) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const normalizeSlot = (value, fallback = 'top') => {
  if (value == null) {
    return fallback;
  }

  const normalized = value.toString().trim().toLowerCase();
  if (normalized === 'top' || normalized === 'bottom') {
    return normalized;
  }

  return fallback;
};

const API = API_BASE_URL || '/api';

const initialSlotState = {
  status: 'idle',
  svg: '',
  error: null
};

const createPageState = () => ({
  top: { ...initialSlotState },
  bottom: { ...initialSlotState }
});

const buildPages = (selections = []) => {
  if (!Array.isArray(selections)) {
    return [];
  }

  const pagesByIndex = new Map();

  selections.forEach((selection) => {
    if (!selection) return;
    const pageIndex = Number(selection.page_index ?? 0);
    if (!pagesByIndex.has(pageIndex)) {
      pagesByIndex.set(pageIndex, {
        pageIndex,
        top: null,
        bottom: null,
        layout: 'dual'
      });
    }

    const page = pagesByIndex.get(pageIndex);
    const pagesValue = parsePagesValue(selection.pages);

    if (pagesValue === 1) {
      page.top = selection;
      page.bottom = null;
      page.layout = 'full';
      return;
    }

    const slot = normalizeSlot(selection.position, 'top');
    if (slot === 'top') {
      page.top = selection;
    } else {
      page.bottom = selection;
    }
  });

  return Array.from(pagesByIndex.values()).sort((a, b) => a.pageIndex - b.pageIndex);
};

const RhymeCarousel = ({ schoolId, grade, apiBaseUrl = API }) => {
  const [pages, setPages] = useState([]);
  const [pageStates, setPageStates] = useState(new Map());
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const svgCacheRef = useRef(new Map());
  const inFlightRequestsRef = useRef(new Map());

  const resolvedApi = apiBaseUrl || API;

  const fetchSvgForCode = useCallback(
    async (code) => {
      if (!code) {
        return '';
      }

      if (svgCacheRef.current.has(code)) {
        return svgCacheRef.current.get(code);
      }

      if (inFlightRequestsRef.current.has(code)) {
        return inFlightRequestsRef.current.get(code);
      }

      const fetchPromise = (async () => {
        try {
          const response = await axios.get(`${resolvedApi}/rhymes/svg/${code}`, {
            responseType: 'arraybuffer'
          });
          const decoded = decodeSvgPayload(response.data, response.headers);
          const rawPages = decoded && typeof decoded === 'object' && Array.isArray(decoded.pages)
            ? decoded.pages
            : decoded;
          const preparedPages = await prepareRhymeSvgPages(rawPages, code, resolvedApi);
          const svgContent = Array.isArray(preparedPages) && preparedPages.length > 0 ? preparedPages[0] : '';
          svgCacheRef.current.set(code, svgContent);
          return svgContent;
        } catch (fetchError) {
          console.error('Error fetching rhyme SVG:', fetchError);
          throw fetchError;
        } finally {
          inFlightRequestsRef.current.delete(code);
        }
      })();

      inFlightRequestsRef.current.set(code, fetchPromise);
      return fetchPromise;
    },
    [resolvedApi]
  );

const updateSlotState = useCallback((pageIndex, slot, updater) => {
  setPageStates((prev) => {
    const next = new Map(prev);
    const resolvedPage = prev.get(pageIndex) || createPageState();
    const slotState = resolvedPage[slot] || { ...initialSlotState };
    const updates = updater(slotState) || {};

    next.set(pageIndex, {
      ...resolvedPage,
      [slot]: { ...slotState, ...updates }
    });

    return next;
  });
}, []);

  const ensureSlotSvg = useCallback(
    async (pageIndex, slot, selection) => {
      if (!selection) {
        updateSlotState(pageIndex, slot, () => ({ status: 'empty', svg: '', error: null }));
        return;
      }

      if (svgCacheRef.current.has(selection.code)) {
        const cachedSvg = svgCacheRef.current.get(selection.code);
        updateSlotState(pageIndex, slot, () => ({ status: 'success', svg: cachedSvg, error: null }));
        return;
      }

      updateSlotState(pageIndex, slot, () => ({ status: 'loading', error: null }));

      try {
        const svg = await fetchSvgForCode(selection.code);
        updateSlotState(pageIndex, slot, () => ({ status: 'success', svg, error: null }));
      } catch (slotError) {
        updateSlotState(pageIndex, slot, () => ({ status: 'error', svg: '', error: slotError }));
      }
    },
    [fetchSvgForCode, updateSlotState]
  );

  const ensurePageAssets = useCallback(
    async (page) => {
      if (!page) return;
      const { pageIndex, top, bottom } = page;
      await Promise.all([
        ensureSlotSvg(pageIndex, 'top', top),
        ensureSlotSvg(pageIndex, 'bottom', bottom)
      ]);
    },
    [ensureSlotSvg]
  );

  const prefetchPage = useCallback(
    async (targetIndex) => {
      const targetPage = pages[targetIndex];
      if (!targetPage) return;

      await ensurePageAssets(targetPage);
    },
    [ensurePageAssets, pages]
  );

  const fetchSelections = useCallback(async () => {
    if (!schoolId || !grade) {
      setPages([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await axios.get(`${resolvedApi}/rhymes/selected/${schoolId}`);
      const gradeSelections = response.data?.[grade] || [];
      const pageData = buildPages(gradeSelections);
      setPages(pageData);
      setPageStates(new Map());
      setCurrentPageIndex(0);

      if (pageData.length > 0) {
        await ensurePageAssets(pageData[0]);
        if (pageData.length > 1) {
          ensurePageAssets(pageData[1]);
        }
      }
    } catch (fetchError) {
      console.error('Error fetching rhyme selections:', fetchError);
      setError('Unable to load rhymes for this grade.');
    } finally {
      setLoading(false);
    }
  }, [grade, schoolId, resolvedApi, ensurePageAssets]);

  useEffect(() => {
    fetchSelections();
  }, [fetchSelections]);

  useEffect(() => {
    if (pages.length === 0) {
      return;
    }

    const currentPage = pages[currentPageIndex];
    if (currentPage) {
      ensurePageAssets(currentPage);
    }

    const nextIndex = currentPageIndex + 1;
    if (nextIndex < pages.length) {
      prefetchPage(nextIndex);
    }
  }, [currentPageIndex, pages, ensurePageAssets, prefetchPage]);

  const currentPage = pages[currentPageIndex] || null;

  const pageState = useMemo(() => {
    if (!currentPage) {
      return createPageState();
    }

    return pageStates.get(currentPage.pageIndex) || createPageState();
  }, [currentPage, pageStates]);

  const isSlotReady = (slot) => {
    if (!currentPage) {
      return false;
    }

    const selection = currentPage[slot];
    if (!selection) {
      return true;
    }

    const slotState = pageState[slot];
    return slotState?.status === 'success';
  };

  const currentTopReady = isSlotReady('top');
  const currentBottomReady = isSlotReady('bottom');

  const canShowNextButton = currentTopReady && currentBottomReady;

  const handleNext = () => {
    setCurrentPageIndex((prev) => {
      if (prev + 1 < pages.length) {
        return prev + 1;
      }
      return prev;
    });
  };

  if (!schoolId || !grade) {
    return (
      <div className="w-full rounded-xl border border-dashed border-orange-200 bg-orange-50/60 p-6 text-center text-orange-700">
        Please provide both a school ID and grade to view the rhymes.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-[400px] w-full items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-orange-400 border-t-transparent"></div>
          <p className="text-sm text-gray-600">Loading rhymes...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full rounded-xl border border-red-200 bg-red-50 p-6 text-center text-red-600">
        {error}
      </div>
    );
  }

  if (!currentPage) {
    return (
      <div className="w-full rounded-xl border border-dashed border-gray-200 bg-white p-6 text-center text-gray-500">
        No rhymes have been selected for this grade yet.
      </div>
    );
  }

  const renderSlot = (slot) => {
    const selection = currentPage[slot];
    const slotState = pageState[slot];

    if (!selection) {
      return (
        <div className="flex h-full w-full items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50 p-6 text-sm text-gray-400">
          No rhyme selected for the {slot} container.
        </div>
      );
    }

    const slotStatus = slotState?.status || 'idle';

    if (slotStatus === 'idle') {
      return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 rounded-xl border border-gray-200 bg-white/80 p-6">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-orange-200 border-t-transparent" />
          <p className="text-sm font-medium text-gray-500">Preparing {selection.name}...</p>
        </div>
      );
    }

    if (slotStatus === 'loading') {
      return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 rounded-xl border border-gray-200 bg-white/80 p-6">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-orange-400 border-t-transparent"></div>
          <p className="text-sm font-medium text-gray-600">Loading {selection.name}...</p>
        </div>
      );
    }

    if (slotStatus === 'error') {
      return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50/80 p-6 text-center text-red-600">
          <p className="text-sm font-semibold">Unable to load {selection.name}</p>
          <p className="text-xs text-red-500">Please try again later.</p>
        </div>
      );
    }

    if (typeof slotState?.svg === 'string' && slotState.svg.trim().length > 0) {
      return (
        <div className="h-full w-full overflow-hidden rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <InlineSvg
            markup={slotState.svg}
            className="h-full w-full"
            sanitize={false}
            ariaLabel={`${selection.name} illustration`}
          />
        </div>
      );
    }

    return (
      <div className="flex h-full w-full items-center justify-center rounded-xl border border-gray-200 bg-white/70 p-6 text-sm text-gray-500">
        {selection.name} is ready but has no SVG to display.
      </div>
    );
  };

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-400">Grade</p>
          <h2 className="text-lg font-semibold text-gray-800">{grade}</h2>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wide text-gray-400">Page</p>
          <p className="text-lg font-semibold text-gray-800">
            {currentPageIndex + 1} <span className="text-sm text-gray-400">/ {pages.length}</span>
          </p>
        </div>
      </div>

      <DocumentPage
        topSlot={<div className="h-full w-full">{renderSlot('top')}</div>}
        bottomSlot={<div className="h-full w-full">{renderSlot('bottom')}</div>}
        showBottom={currentPage.layout !== 'full'}
        className="mx-auto"
      />

      <div className="flex justify-end">
        {canShowNextButton ? (
          <Button
            type="button"
            onClick={handleNext}
            disabled={currentPageIndex + 1 >= pages.length}
            className={cn(
              'min-w-[120px] bg-gradient-to-r from-orange-400 to-red-400 text-white hover:from-orange-500 hover:to-red-500',
              currentPageIndex + 1 >= pages.length && 'opacity-60'
            )}
          >
            {currentPageIndex + 1 >= pages.length ? 'End of Rhymes' : 'Next Page'}
          </Button>
        ) : null}
      </div>
    </div>
  );
};

export default RhymeCarousel;
