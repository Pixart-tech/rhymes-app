import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from './ui/button';
import { cn, API_BASE_URL, normalizeAssetUrl } from '../lib/utils';
import { COVER_THEME_CATALOGUE } from '../theme';

const COVER_SELECTION_STORAGE_KEY = 'cover-selection-preferences';
const themeCatalogueFallback = COVER_THEME_CATALOGUE;
const GRADE_OPTIONS = [
  { id: 'P', label: 'Playgroup' },
  { id: 'N', label: 'Nursery' },
  { id: 'L', label: 'LKG' },
  { id: 'U', label: 'UKG' }
];
const resolveCoverUrl = (theme) => {
  const rawId = theme?.id || theme?.themeId;
  const id = typeof rawId === 'string' ? rawId.trim().replace(/\s+/g, '_') : rawId;
  if (!id) return '';
  return normalizeAssetUrl(`/public/cover-library/themes/${id}/cover.png`);
};

const normalizeLibraryPayload = (library) => {
  const themes = Array.isArray(library?.themes)
    ? library.themes.map((theme) => ({
        ...theme,
        coverUrl: resolveCoverUrl(theme),
        thumbnailUrl: '', // force use of original cover
        previewUrl: '',   // force use of original cover
      }))
    : [];

  const colours = {};
  Object.entries(library?.colours || {}).forEach(([version, grades]) => {
    const normalizedGrades = {};
    Object.entries(grades || {}).forEach(([grade, src]) => {
      normalizedGrades[grade] = normalizeAssetUrl(src);
    });
    colours[version] = normalizedGrades;
  });

  return {
    themes,
    colours,
    colour_versions: library?.colour_versions || [],
  };
};

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

const CoverSelection = () => {
  const persistedSelection = useMemo(restorePersistedSelection, []);
  const [library, setLibrary] = useState({ themes: [], colours: {}, colour_versions: [] });

  const [selectedThemeId, setSelectedThemeId] = useState(() => persistedSelection?.themeId || '');
  const [selectedColourId, setSelectedColourId] = useState(
    () => persistedSelection?.colourId || ''
  );
  const [shouldShowPreview, setShouldShowPreview] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [previewItems, setPreviewItems] = useState([]);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [libraryError, setLibraryError] = useState('');
  const [lightboxImage, setLightboxImage] = useState(null);
  const [pngAssignments, setPngAssignments] = useState({});

  const themeCatalogue = useMemo(() => {
    if (library?.themes?.length) return library.themes.map((t) => ({
      ...t,
      coverUrl: resolveCoverUrl(t),
      previewUrl: '',
      thumbnailUrl: '',
    }));
    return themeCatalogueFallback.map((t) => ({
      ...t,
      coverUrl: resolveCoverUrl(t),
      previewUrl: '',
      thumbnailUrl: '',
    }));
  }, [library]);

  useEffect(() => {
    const fetchLibrary = async () => {
      setLoadingLibrary(true);
      setLibraryError('');
      try {
        const base = API_BASE_URL || '/api';
        const response = await fetch(`${base}/cover-library`);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const payload = await response.json();
        if (payload?.library) {
          setLibrary(normalizeLibraryPayload(payload.library));
        } else if (payload?.themes) {
          setLibrary(normalizeLibraryPayload(payload));
        }
      } catch (error) {
        console.warn('Unable to load cover library', error);
        setLibraryError('Unable to load cover previews. Showing defaults.');
      } finally {
        setLoadingLibrary(false);
      }
    };
    void fetchLibrary();
  }, []);

  const selectedTheme = useMemo(
    () => themeCatalogue.find((theme) => theme.id === selectedThemeId) || null,
    [selectedThemeId, themeCatalogue]
  );

  const selectedColour = useMemo(() => {
    if (!selectedColourId) return null;
    return {
      id: selectedColourId,
      grades: (library?.colours && library.colours[selectedColourId]) || {}
    };
  }, [library, selectedColourId]);

  const themePreviewItems = useMemo(() => {
    if (!selectedTheme || !selectedTheme.coverUrl && !selectedTheme.thumbnailUrl) {
      return [];
    }
    const src = selectedTheme.coverUrl || selectedTheme.thumbnailUrl;
    return src ? [{ id: selectedTheme.id, title: selectedTheme.label || selectedTheme.id, src }] : [];
  }, [selectedTheme]);

  const colourOptions = useMemo(() => {
    const match = selectedThemeId.match(/(\d+)/);
    const versionForTheme = match ? `V${match[1]}_C` : '';
    const versions = library?.colour_versions || Object.keys(library?.colours || {});
    const chosen = versionForTheme && versions.includes(versionForTheme) ? [versionForTheme] : versions;
    return chosen.map((version) => ({
      id: version,
      grades: library?.colours?.[version] || {}
    }));
  }, [library, selectedThemeId]);

  useEffect(() => {
    if (!themeCatalogue.length) {
      return;
    }
    const exists = themeCatalogue.some((theme) => theme.id === selectedThemeId);
    if (!exists) {
      setSelectedThemeId(themeCatalogue[0].id);
    }
  }, [selectedThemeId, themeCatalogue]);

  useEffect(() => {
    if (!selectedTheme) {
      setSelectedColourId('');
      return;
    }

    // keep selection if still present
    const colourExists = colourOptions.some((colour) => colour.id === selectedColourId);
    if (!colourExists) {
      setSelectedColourId('');
    }
  }, [selectedColourId, selectedTheme, colourOptions]);

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
    setPreviewItems([]);
    setPreviewError('');
    setShouldShowPreview(false);
  }, [selectedThemeId]);

  const handleSelectTheme = useCallback((event) => { 
    setSelectedThemeId(event.target.value);
    setValidationError('');
  }, []);

  const handleAssignGradePng = useCallback((gradeId, colourId, pngSrc) => {
    const key = `${colourId}:${pngSrc}`;
    setPngAssignments((prev) => {
      const next = { ...prev };
      if (!gradeId) {
        delete next[key];
        return next;
      }
      // ensure a grade is only assigned to one PNG
      Object.entries(next).forEach(([entryKey, entry]) => {
        if (entry?.gradeId === gradeId) {
          delete next[entryKey];
        }
      });
      next[key] = { gradeId, colourId, src: pngSrc };
      return next;
    });
    setValidationError('');
  }, []);

  const handlePreview = useCallback(() => {
    if (!selectedTheme) {
      setValidationError('Please choose a theme before previewing.');
      return;
    }

    const assignedEntries = Object.values(pngAssignments);
    if (!assignedEntries.length) {
      setValidationError('Assign at least one PNG to a grade before previewing.');
      setShouldShowPreview(false);
      return;
    }

    setValidationError('');
    setShouldShowPreview(true);
    const items = assignedEntries.map(({ gradeId, src }) => ({
      id: `${gradeId}-${src}`,
      title: GRADE_OPTIONS.find((g) => g.id === gradeId)?.label || gradeId,
      src
    }));
    setPreviewItems(items);
    if (!items.length) {
      setPreviewError('No cover artwork has been uploaded for the selected grades yet.');
    } else {
      setPreviewError('');
    }
  }, [pngAssignments, selectedTheme]);

  const hasValidationError = Boolean(validationError);
  const displayColourOptions = useMemo(() => colourOptions.slice(0, 4), [colourOptions]);
  const gradeLabel = (code) => GRADE_OPTIONS.find((g) => g.id === code)?.label || code;

  const handleThemeKeyPress = (event, themeId) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleSelectTheme({ target: { value: themeId } });
    }
  };

  const buildThemeSources = (item) => {
    let cover = item?.coverUrl || '';
    if (!cover) return null;
    return {
      cover,
      original: cover,
    };
  };

  return (
    <section className="flex flex-col gap-8">
      <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Design your cover</h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">
              Browse the base theme artwork, pick a colour family, and preview how the complete cover set will look.
              {libraryError && <span className="block text-xs text-amber-600 mt-1">{libraryError}</span>}
            </p>
          </div>
          <div className="flex flex-col w-full md:w-auto">
            <label htmlFor="cover-theme" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Theme
            </label>
            <select
              id="cover-theme"
              value={selectedThemeId}
              onChange={handleSelectTheme}
              className="mt-2 w-full md:w-56 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            >
              {themeCatalogue.map((theme) => (
                <option key={theme.id} value={theme.id}>
                  {theme.label || theme.id}
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>

      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Themes</h3>
          <p className="mt-1 text-sm text-slate-600">
            Tap a theme to select. Previews now show the full PNG inside a clean container.
          </p>
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl-grid-cols-4 gap-4 sm:gap-6 max-w-[520px] sm:max-w-6xl mx-auto">
          {themeCatalogue.map((item) => {
            const isActive = item.id === selectedThemeId;
            const sources = buildThemeSources(item);
            const imgSrc = sources?.cover || sources?.original || '';
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelectTheme({ target: { value: item.id } })}
                onKeyDown={(event) => handleThemeKeyPress(event, item.id)}
                className={cn(
                  'group relative block w-full max-w-[900px] mx-auto overflow-hidden border bg-white shadow-sm transition hover:-translate-y-1 hover:border-indigo-200 hover:shadow-md focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-300 aspect-[5009/3473] cursor-pointer',
                  isActive ? 'border-indigo-500 ring-2 ring-indigo-300' : 'border-slate-200'
                )}
                aria-pressed={isActive}
              >
                <div className="h-full w-full overflow-hidden">
                  {imgSrc ? (
                    <img
                      src={imgSrc}
                      width={1000}
                      height={1000}
                      alt={`${item.label || item.id}`}
                      loading="lazy"
                      decoding="async"
                      className="block h-full w-full object-contain transition duration-300 group-hover:scale-[1.02]"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[10px] text-slate-400">No image</div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {lightboxImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="relative w-full max-w-4xl rounded-2xl bg-white shadow-2xl overflow-hidden">
            <button
              type="button"
              className="absolute right-3 top-3 rounded-full bg-black/70 px-3 py-1 text-xs font-semibold uppercase text-white shadow hover:bg-black"
              onClick={() => setLightboxImage(null)}
              aria-label="Close preview"
            >
              Close
            </button>
            <div className="bg-slate-50 p-3">
            <img
              src={lightboxImage.src}
              srcSet={lightboxImage.srcSet || undefined}
              sizes="100vw"
              alt={lightboxImage.title}
              className="max-h-[75vh] w-full object-contain"
            />
            </div>
            {lightboxImage.title && (
              <div className="px-4 py-3 text-sm font-semibold uppercase tracking-wide text-slate-600">
                {lightboxImage.title}
              </div>
            )}
          </div>
        </div>
      )}

      <div
        className={cn(
          'rounded-2xl border bg-white p-6 shadow-sm transition',
          hasValidationError ? 'border-red-400 ring-2 ring-red-200' : 'border-slate-200 hover:border-indigo-200'
        )}
      >
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Pick a colour family</h3>
        <p className="mt-1 text-sm text-slate-600">
          Assign PNGs to grades. Each colour card below is an option; use the dropdown on a thumbnail to assign that PNG to a grade (dropdown is for assignment, not preview).
        </p>
        {displayColourOptions.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">
            No colour PNGs have been uploaded yet. Upload PNG files to the cover library to see thumbnails here.
          </div>
        ) : (
          <div className="mt-4">
            <div className="grid grid-cols-2 sm:grid-cols-2 gap-4 sm:gap-6">
              {displayColourOptions.map((colour) => {
                const thumbnails = Array.from(
                  new Map(
                    Object.entries(colour.grades || {})
                      .filter(([, src]) => !!src)
                      .map(([gradeCode, src]) => [src, { gradeCode, src }])
                  ).values()
                );
                return (
                  <div
                    key={colour.id}
                    className={cn(
                      'flex w-full flex-col gap-3 rounded-xl border bg-white p-3 text-left shadow-sm transition duration-200 hover:-translate-y-1 hover:border-indigo-200 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2',
                      'border-slate-200'
                    )}
                  >
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold text-slate-800">{colour.id}</span>
                      <span className="text-[11px] font-semibold uppercase text-slate-500">Assign PNGs</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {thumbnails.length === 0 ? (
                        <div className="col-span-2 flex h-44 items-center justify-center rounded-md border border-dashed border-slate-200 bg-slate-50 text-xs text-slate-400">
                          No PNGs uploaded for this colour.
                        </div>
                      ) : (
                        thumbnails.map((thumb) => {
                          const pngKey = `${colour.id}:${thumb.src}`;
                          const assignedGrade = pngAssignments[pngKey]?.gradeId;
                          return (
                            <div
                              key={`${colour.id}-${thumb.gradeCode}-${thumb.src}`}
                              className="flex flex-col gap-2 rounded-md border border-slate-200 bg-slate-50 p-2"
                            >
                              <div className="aspect-square overflow-hidden rounded bg-white border border-slate-200">
                                <img
                                  src={thumb.src}
                                  width={1000}
                                  height={1000}
                                  alt={`${colour.id} thumbnail`}
                                  className="h-full w-full object-contain"
                                />
                              </div>
                              <select
                                className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-200"
                                value={assignedGrade || ''}
                                onChange={(event) => handleAssignGradePng(event.target.value, colour.id, thumb.src)}
                              >
                                <option value="">Select grade</option>
                                {GRADE_OPTIONS.map((grade) => (
                                  <option key={grade.id} value={grade.id}>
                                    {grade.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {validationError && <p className="mt-3 text-sm font-semibold text-red-600">{validationError}</p>}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-slate-100 p-6 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Preview covers</h3>
                <p className="mt-1 text-sm text-slate-600">
                  The preview shows the PNGs you assigned per grade.
                </p>
              </div>
              <Button
                type="button"
                onClick={handlePreview}
                disabled={!selectedTheme || isLoadingPreview}
                className="w-full sm:w-auto self-stretch sm:self-start rounded-full bg-indigo-600 px-8 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {isLoadingPreview ? 'Preparing preview...' : 'Preview cover'}
              </Button>
            </div>

        <div className="mt-6 min-h-[220px] rounded-xl border border-dashed border-slate-300 bg-white p-6">
          {!shouldShowPreview ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-slate-500">
              <span className="font-medium">Assign PNGs to grades, then click "Preview cover".</span>
              <span className="text-xs text-slate-400">The preview will display the PNG you assigned per grade.</span>
            </div>
          ) : isLoadingPreview ? (
            <div className="flex h-full items-center justify-center text-sm font-medium text-indigo-600">Loading preview...</div>
          ) : previewError ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-red-500">
              <span className="font-semibold">{previewError}</span>
              <span className="text-xs text-red-400">Upload SVGs to the colour folder to generate a preview.</span>
            </div>
          ) : previewItems.length > 0 ? (
            <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {previewItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setLightboxImage({ src: item.src, title: item.title })}
                  className="group overflow-hidden rounded-xl border border-slate-200 bg-white p-3 text-left shadow transition hover:-translate-y-1 hover:border-indigo-200 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2"
                >
                  <div className="aspect-[3/2] overflow-hidden rounded-lg bg-slate-50">
                    <img src={item.src} alt={`${selectedTheme?.label || 'Theme'} ${item.title}`} className="h-full w-full object-contain transition duration-300 group-hover:scale-[1.03]" />
                  </div>
                  <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{item.title}</p>
                  <span className="mt-1 inline-flex text-[11px] font-semibold uppercase text-indigo-600">Tap to view full size</span>
                </button>
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
