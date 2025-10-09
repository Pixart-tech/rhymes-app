import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from './ui/button';
import { cn } from '../lib/utils';

const COVER_SELECTION_STORAGE_KEY = 'cover-selection-preferences';

const themeCatalogue = [
  {
    id: 'theme1',
    label: 'Theme 1',
    number: 1,
    colours: [
      { id: 'colour1', label: 'Colour 1', number: 1 },
      { id: 'colour2', label: 'Colour 2', number: 2 }
    ]
  },
  {
    id: 'theme2',
    label: 'Theme 2',
    number: 2,
    colours: [
      { id: 'colour1', label: 'Colour 1', number: 1 }
    ]
  }
];

const restorePersistedSelection = () => {
  if (typeof window === 'undefined' || !window.sessionStorage) {
    return null;
  }

  try {
    const storedValue = window.sessionStorage.getItem(COVER_SELECTION_STORAGE_KEY);

    if (!storedValue) {
      return null;
    }

    const parsed = JSON.parse(storedValue);

    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    return {
      themeId: typeof parsed.themeId === 'string' ? parsed.themeId : undefined,
      colourId: typeof parsed.colourId === 'string' ? parsed.colourId : undefined
    };
  } catch (error) {
    console.warn('Unable to restore cover selection state from session storage.', error);
    return null;
  }
};

const formatAssetName = (key) => {
  const withoutPrefix = key.replace(/^[./]+/, '');
  const [, ...rest] = withoutPrefix.split('/');
  const filename = rest[rest.length - 1] || withoutPrefix;
  return filename.replace(/\.svg$/i, '').replace(/[-_]+/g, ' ');
};

const buildPreviewItems = (assetMap, prefix) =>
  Object.entries(assetMap)
    .filter(([key]) => key.startsWith(prefix))
    .sort(([keyA], [keyB]) => keyA.localeCompare(keyB, undefined, { numeric: true }))
    .map(([key, value]) => ({
      id: key,
      title: formatAssetName(key),
      src: value
    }));

const CoverSelection = () => {
  const persistedSelection = useMemo(restorePersistedSelection, []);
  const svgContext = useMemo(() => require.context('../unc_path', true, /\.svg$/), []);
  const assetMap = useMemo(() => {
    return svgContext.keys().reduce((accumulator, key) => {
      accumulator[key.replace(/^\.\//, '')] = svgContext(key);
      return accumulator;
    }, {});
  }, [svgContext]);

  const [selectedThemeId, setSelectedThemeId] = useState(
    () => persistedSelection?.themeId || themeCatalogue[0]?.id || ''
  );
  const [selectedColourId, setSelectedColourId] = useState(
    () => persistedSelection?.colourId || ''
  );
  const [shouldShowPreview, setShouldShowPreview] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [previewItems, setPreviewItems] = useState([]);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState('');

  const selectedTheme = useMemo(
    () => themeCatalogue.find((theme) => theme.id === selectedThemeId) || null,
    [selectedThemeId]
  );

  const selectedColour = useMemo(() => {
    if (!selectedTheme) {
      return null;
    }

    return selectedTheme.colours.find((colour) => colour.id === selectedColourId) || null;
  }, [selectedColourId, selectedTheme]);

  const themePreviewItems = useMemo(() => {
    if (!selectedTheme) {
      return [];
    }

    const themePrefix = `${selectedTheme.number} Theme/Theme SVGs/`;

    return buildPreviewItems(assetMap, themePrefix);
  }, [assetMap, selectedTheme]);

  const colourOptions = useMemo(() => {
    if (!selectedTheme) {
      return [];
    }

    return selectedTheme.colours.map((colour) => {
      const thumbnailKey = `${selectedTheme.number} Theme/Colour${colour.number}/thumbnail.svg`;
      const previewPrefix = `${selectedTheme.number} Theme/Colour${colour.number}/SVGs/`;

      return {
        ...colour,
        thumbnailSrc: assetMap[thumbnailKey],
        previewPrefix
      };
    });
  }, [assetMap, selectedTheme]);

  useEffect(() => {
    if (!selectedTheme) {
      setSelectedColourId('');
      return;
    }

    const colourExists = selectedTheme.colours.some((colour) => colour.id === selectedColourId);

    if (!colourExists) {
      setSelectedColourId('');
    }
  }, [selectedColourId, selectedTheme]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.sessionStorage) {
      return;
    }

    try {
      window.sessionStorage.setItem(
        COVER_SELECTION_STORAGE_KEY,
        JSON.stringify({ themeId: selectedThemeId, colourId: selectedColourId })
      );
    } catch (error) {
      console.warn('Unable to persist cover selection state to session storage.', error);
    }
  }, [selectedColourId, selectedThemeId]);

  useEffect(() => {
    if (!shouldShowPreview || !selectedTheme || !selectedColour) {
      return;
    }

    setIsLoadingPreview(true);
    setPreviewError('');

    const items = buildPreviewItems(assetMap, `${selectedTheme.number} Theme/Colour${selectedColour.number}/SVGs/`);

    setPreviewItems(items);
    setIsLoadingPreview(false);

    if (!items.length) {
      setPreviewError('No cover artwork has been uploaded for this theme and colour yet.');
    }
  }, [assetMap, selectedColour, selectedTheme, shouldShowPreview]);

  useEffect(() => {
    setPreviewItems([]);
    setPreviewError('');
    setShouldShowPreview(false);
  }, [selectedThemeId]);

  const handleSelectTheme = useCallback((event) => {
    setSelectedThemeId(event.target.value);
    setValidationError('');
  }, []);

  const handleSelectColour = useCallback((colourId) => {
    setSelectedColourId(colourId);
    setValidationError('');
  }, []);

  const handlePreview = useCallback(() => {
    if (!selectedTheme) {
      setValidationError('Please choose a theme before previewing.');
      return;
    }

    if (!selectedColour) {
      setValidationError('Please choose a colour before previewing the cover.');
      setShouldShowPreview(false);
      return;
    }

    setValidationError('');
    setShouldShowPreview(true);
  }, [selectedColour, selectedTheme]);

  const hasValidationError = Boolean(validationError);

  return (
    <section className="flex flex-col gap-8">
      <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Design your cover</h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">
              Browse the base theme artwork, pick a colour family, and preview how the complete cover set will look.
            </p>
          </div>
          <div className="flex flex-col">
            <label htmlFor="cover-theme" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Theme
            </label>
            <select
              id="cover-theme"
              value={selectedThemeId}
              onChange={handleSelectTheme}
              className="mt-2 w-48 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            >
              {themeCatalogue.map((theme) => (
                <option key={theme.id} value={theme.id}>
                  {theme.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>

      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Theme overview</h3>
        <p className="mt-1 text-sm text-slate-600">
          These thumbnails showcase every SVG uploaded for the selected theme. They are reference only and cannot be selected.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {themePreviewItems.length > 0 ? (
            themePreviewItems.map((item) => (
              <div
                key={item.id}
                className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition hover:border-indigo-200 hover:shadow-md"
              >
                <div className="aspect-[3/2] overflow-hidden rounded-lg bg-slate-50">
                  <img src={item.src} alt={`${selectedTheme?.label || 'Theme'} reference ${item.title}`} className="h-full w-full object-contain transition duration-300 group-hover:scale-[1.02]" />
                </div>
                <p className="mt-2 text-xs font-medium uppercase tracking-wide text-slate-500">{item.title}</p>
              </div>
            ))
          ) : (
            <div className="col-span-full flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
              <span className="font-medium">No theme thumbnails found.</span>
              <span className="text-xs text-slate-400">Upload SVG files to the Theme SVGs folder to populate this preview.</span>
            </div>
          )}
        </div>
      </div>

      <div
        className={cn(
          'rounded-2xl border bg-white p-6 shadow-sm transition',
          hasValidationError ? 'border-red-400 ring-2 ring-red-200' : 'border-slate-200 hover:border-indigo-200'
        )}
      >
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Pick a colour family</h3>
        <p className="mt-1 text-sm text-slate-600">Select a colour to highlight your cover. This choice updates the preview below.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {colourOptions.map((colour) => {
            const isSelected = colour.id === selectedColourId;

            return (
              <button
                type="button"
                key={colour.id}
                onClick={() => handleSelectColour(colour.id)}
                className={cn(
                  'flex h-full flex-col items-center justify-center rounded-xl border bg-slate-50 p-4 text-sm font-medium text-slate-600 transition duration-200 hover:-translate-y-1 hover:border-indigo-200 hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2',
                  isSelected ? 'border-indigo-500 bg-white shadow-lg ring-2 ring-indigo-400 ring-offset-2' : 'border-transparent shadow'
                )}
                aria-pressed={isSelected}
              >
                <div className="flex h-24 w-full items-center justify-center overflow-hidden rounded-lg bg-white">
                  {colour.thumbnailSrc ? (
                    <img src={colour.thumbnailSrc} alt={`${colour.label} thumbnail`} className="h-full w-full object-contain transition duration-300" />
                  ) : (
                    <span className="text-xs text-slate-400">Thumbnail missing</span>
                  )}
                </div>
                <span className="mt-3 text-sm font-semibold text-slate-700">{colour.label}</span>
              </button>
            );
          })}
        </div>
        {validationError && <p className="mt-3 text-sm font-semibold text-red-600">{validationError}</p>}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-slate-100 p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Preview covers</h3>
            <p className="mt-1 text-sm text-slate-600">
              The preview includes every SVG uploaded for the selected theme and colour combination.
            </p>
          </div>
          <Button
            type="button"
            onClick={handlePreview}
            disabled={!selectedTheme || !selectedColour || isLoadingPreview}
            className="self-start rounded-full bg-indigo-600 px-6 py-2 text-sm font-semibold text-white shadow-lg transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {isLoadingPreview ? 'Preparing preview…' : 'Preview cover'}
          </Button>
        </div>

        <div className="mt-6 min-h-[220px] rounded-xl border border-dashed border-slate-300 bg-white p-6">
          {!shouldShowPreview ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-slate-500">
              <span className="font-medium">Choose a colour, then click “Preview cover”.</span>
              <span className="text-xs text-slate-400">The preview will display every SVG for your selection.</span>
            </div>
          ) : isLoadingPreview ? (
            <div className="flex h-full items-center justify-center text-sm font-medium text-indigo-600">Loading preview…</div>
          ) : previewError ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-red-500">
              <span className="font-semibold">{previewError}</span>
              <span className="text-xs text-red-400">Upload SVGs to the colour folder to generate a preview.</span>
            </div>
          ) : previewItems.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {previewItems.map((item) => (
                <div
                  key={item.id}
                  className="group overflow-hidden rounded-xl border border-slate-200 bg-white p-3 shadow transition hover:-translate-y-1 hover:border-indigo-200 hover:shadow-lg"
                >
                  <div className="aspect-[3/2] overflow-hidden rounded-lg bg-slate-50">
                    <img src={item.src} alt={`${selectedTheme?.label || 'Theme'} ${item.title}`} className="h-full w-full object-contain transition duration-300 group-hover:scale-[1.03]" />
                  </div>
                  <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{item.title}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-slate-500">
              <span className="font-medium">No preview files found.</span>
              <span className="text-xs text-slate-400">Add SVG files to the selected colour folder to enable the preview.</span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default CoverSelection;
