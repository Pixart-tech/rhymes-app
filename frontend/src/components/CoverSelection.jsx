import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from './ui/button';
import { cn, API_BASE_URL, normalizeAssetUrl } from '../lib/utils';
import { COVER_THEME_CATALOGUE } from '../theme';
import { loadPersistedAppState } from '../lib/storage';
import { useAuth } from '../hooks/useAuth';

const COVER_SELECTION_STORAGE_KEY = 'cover-selection-preferences';
const themeCatalogueFallback = COVER_THEME_CATALOGUE;
const DEFAULT_GRADE_OPTIONS = [
  { id: 'P', label: 'Playgroup', gradeKey: 'playgroup' },
  { id: 'N', label: 'Nursery', gradeKey: 'nursery' },
  { id: 'L', label: 'LKG', gradeKey: 'lkg' },
  { id: 'U', label: 'UKG', gradeKey: 'ukg' }
];
const GRADE_CODE_MAP = {
  playgroup: 'P',
  pg: 'P',
  nursery: 'N',
  lkg: 'L',
  ukg: 'U'
};
const GRADE_KEY_BY_CODE = {
  P: 'playgroup',
  N: 'nursery',
  L: 'lkg',
  U: 'ukg'
};
const normalizeThemeId = (value) => {
  if (!value) return '';
  const trimmed = value.toString().trim();
  if (!trimmed) return '';
  if (/^v\d+/i.test(trimmed)) {
    return trimmed.toUpperCase();
  }
  const numeric = trimmed.match(/(\d+)/);
  if (numeric) {
    return `V${numeric[1]}`.toUpperCase();
  }
  return trimmed;
};
const normalizeColourId = (colourId) => {
  if (!colourId) return '';
  const trimmed = colourId.toString().trim();
  if (!trimmed) return '';
  if (/^V\d+_C$/i.test(trimmed)) {
    return trimmed.replace(/_C$/i, '').toUpperCase();
  }
  if (/^V\d+/i.test(trimmed)) {
    return trimmed.toUpperCase();
  }
  return trimmed;
};
const resolveCoverUrl = (theme) => {
  if (theme?.coverUrl) {
    return normalizeAssetUrl(theme.coverUrl);
  }
  const rawId = theme?.id || theme?.themeId;
  if (!rawId || (typeof rawId === 'string' && !rawId.trim())) return '';
  const cleanedId = typeof rawId === 'string' ? rawId.trim() : rawId;
  const versionId = typeof cleanedId === 'string' ? cleanedId.toUpperCase() : cleanedId;
  if (typeof versionId === 'string' && /^v\d+/i.test(versionId)) {
    return normalizeAssetUrl(`/public/cover-library/colours/${versionId}/C1.png`);
  }
  const id = typeof cleanedId === 'string' ? cleanedId.replace(/\s+/g, '_') : cleanedId;
  return normalizeAssetUrl(`/public/cover-library/colours/${id}/C1.png`);
};

const normalizeLibraryPayload = (library) => {
  const themes = Array.isArray(library?.themes)
    ? library.themes.map((theme) => {
        const rawId = typeof theme?.id === 'string' ? theme.id.trim() : theme?.id;
        const normalizedId =
          typeof rawId === 'string' && /^v\d+/i.test(rawId) ? rawId.toUpperCase() : rawId || theme?.themeId;
        const cover = theme?.coverUrl || theme?.thumbnailUrl || resolveCoverUrl({ ...theme, id: normalizedId });
        const coverUrl = cover ? normalizeAssetUrl(cover) : '';
        const thumbnailUrl = theme?.thumbnailUrl ? normalizeAssetUrl(theme.thumbnailUrl) : coverUrl;
        const previewUrl = theme?.previewUrl ? normalizeAssetUrl(theme.previewUrl) : '';
        return {
          ...theme,
          id: normalizedId,
          coverUrl,
          thumbnailUrl,
          previewUrl,
        };
      })
    : [];

  const colours = {};
  const colourSource = library?.colours || library?.covers || {};
  Object.entries(colourSource).forEach(([version, grades]) => {
    const versionKey = (version || '').toString().trim();
    const normalizedVersion = versionKey ? versionKey.toUpperCase() : versionKey;
    const normalizedGrades = {};
    Object.entries(grades || {}).forEach(([grade, src]) => {
      normalizedGrades[grade] = normalizeAssetUrl(src);
    });
    if (normalizedVersion) {
      colours[normalizedVersion] = normalizedGrades;
    }
  });

  const colourVersions = Array.isArray(library?.colour_versions) ? library.colour_versions : [];

  return {
    themes,
    colours,
    colour_versions: (colourVersions.length ? colourVersions : Object.keys(colours)).map((version) =>
      (version || '').toString().trim().toUpperCase()
    ),
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
      colourId: normalizeColourId(typeof parsed.colourId === 'string' ? parsed.colourId : undefined)
    };
  } catch (error) {
    console.warn('Unable to restore cover selection state from session storage.', error);
    return null;
  }
};

const CoverSelection = () => {
  const persistedSelection = useMemo(restorePersistedSelection, []);
  const persistedApp = useMemo(() => loadPersistedAppState?.() || null, []);
  let authContext = null;
  try {
    authContext = useAuth();
  } catch (error) {
    authContext = null;
  }
  const getIdToken = authContext?.getIdToken;
  const isSuperAdmin =
    authContext?.user?.role === 'super-admin' || persistedApp?.workspaceUser?.role === 'super-admin';
  const schoolId = persistedApp?.school?.school_id?.toString().trim() || '';
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
  const [draftAssignmentsByTheme, setDraftAssignmentsByTheme] = useState({});
  const [savedSelections, setSavedSelections] = useState({});
  const [isLoadingSelections, setIsLoadingSelections] = useState(false);
  const [selectionsError, setSelectionsError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [gradeOptions, setGradeOptions] = useState(DEFAULT_GRADE_OPTIONS);
  const colourSectionRef = useRef(null);

  useEffect(() => {
    const grades = persistedApp?.school?.grades;
    if (!grades || typeof grades !== 'object') {
      setGradeOptions(DEFAULT_GRADE_OPTIONS);
      return;
    }

    const enabled: { id: string; label: string; gradeKey?: string }[] = [];
    Object.entries(grades).forEach(([key, value]) => {
      const enabledFlag = value && typeof value === 'object' ? Boolean(value.enabled) : false;
      if (!enabledFlag) return;
      const code = GRADE_CODE_MAP[key.toLowerCase()] || '';
      if (!code) return;
      const label = (value && value.label && value.label.trim()) || DEFAULT_GRADE_OPTIONS.find((g) => g.id === code)?.label || code;
      enabled.push({ id: code, label, gradeKey: key.toLowerCase() });
    });

    setGradeOptions(enabled.length ? enabled : DEFAULT_GRADE_OPTIONS);
  }, [persistedApp]);

  const gradeCodeByKey = useMemo(() => {
    const map = {};
    gradeOptions.forEach((grade) => {
      const key = (grade.gradeKey || GRADE_KEY_BY_CODE[grade.id] || '').toString().toLowerCase();
      if (key) {
        map[key] = grade.id;
      }
    });
    Object.entries(GRADE_CODE_MAP).forEach(([gradeKey, code]) => {
      if (!map[gradeKey]) {
        map[gradeKey] = code;
      }
    });
    return map;
  }, [gradeOptions]);

  const gradeKeyByCode = useMemo(() => {
    const map = { ...GRADE_KEY_BY_CODE };
    gradeOptions.forEach((grade) => {
      if (grade.id && grade.gradeKey) {
        map[grade.id] = grade.gradeKey;
      }
    });
    return map;
  }, [gradeOptions]);

  const themeCatalogue = useMemo(() => {
    if (library?.themes?.length) {
      return library.themes.map((t) => {
        // If API returns an SVG path, fall back to the standard PNG location.
        const baseCover = t?.coverUrl || t?.thumbnailUrl || resolveCoverUrl(t);
        const normalizedCover =
          baseCover && baseCover.toLowerCase().endsWith('.svg')
            ? resolveCoverUrl(t)
            : baseCover;
        const thumbnailUrl = t?.thumbnailUrl || normalizedCover;
        return {
          ...t,
          coverUrl: normalizedCover,
          previewUrl: t?.previewUrl || '',
          thumbnailUrl,
        };
      });
    }
    return themeCatalogueFallback.map((t) => {
      const coverUrl = resolveCoverUrl(t);
      return {
        ...t,
        coverUrl,
        previewUrl: '',
        thumbnailUrl: coverUrl,
      };
    });
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

  const selectedTheme = useMemo(() => {
    if (!selectedThemeId) return null;
    const direct = themeCatalogue.find((theme) => theme.id === selectedThemeId);
    if (direct) return direct;
    const normalized = selectedThemeId.toString().trim().toLowerCase();
    const numericMatch = normalized.match(/(\d+)/);
    if (numericMatch) {
      const fallbackId = `V${numericMatch[1]}`.toLowerCase();
      const inferred = themeCatalogue.find(
        (theme) => theme.id?.toString().trim().toLowerCase() === fallbackId
      );
      if (inferred) return inferred;
    }
    return null;
  }, [selectedThemeId, themeCatalogue]);

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
    // Show all available colour versions, do not filter by theme to avoid empty grids.
    const versionEntries = Object.entries(library?.colours || {});
    if (versionEntries.length) {
      return versionEntries.map(([version, grades]) => ({
        id: version,
        grades: grades || {},
      }));
    }
    const versions = (library?.colour_versions || []).map((version) => (version || '').toString());
    return versions.map((version) => ({ id: version, grades: {} }));
  }, [library]);

  const computeAssignmentsForTheme = useCallback(
    (themeId, sourceSelections = savedSelections) => {
      if (!themeId) return {};
      const normalizedTheme = normalizeThemeId(themeId);
      const result = {};

      Object.entries(sourceSelections || {}).forEach(([gradeKey, entry]) => {
        const entryTheme = normalizeThemeId(entry?.themeId || entry?.theme || entry?.theme_id);
        if (!entryTheme || entryTheme !== normalizedTheme) return;

        const gradeCode = gradeCodeByKey[gradeKey?.toString().toLowerCase()];
        const colourId = normalizeColourId(entry?.colourId || entry?.theme_colour || entry?.colour_id);
        if (!gradeCode || !colourId) return;
        const src = (library?.colours?.[colourId] || {})[gradeCode];
        if (!src) return;
        const key = `${colourId}:${src}`;
        result[key] = { gradeId: gradeCode, colourId, src };
      });

      return result;
    },
    [gradeCodeByKey, library?.colours, savedSelections]
  );

  const fetchSavedSelections = useCallback(async () => {
    if (!isSuperAdmin) {
      setSavedSelections({});
      setIsLoadingSelections(false);
      return;
    }
    if (!schoolId) {
      setSavedSelections({});
      return;
    }
    setIsLoadingSelections(true);
    setSelectionsError('');
    try {
      const base = API_BASE_URL || '/api';
      const token = await getIdToken?.();
      const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
      console.log('Fetching saved cover selections for school ID:', headers);
      const response = await fetch(`${base}/cover-selections/${schoolId}`, { headers });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const payload = await response.json();
      const grades = payload?.grades || {};
      const normalized = {};
      Object.entries(grades).forEach(([gradeKey, entry]) => {
        const themeId = entry?.theme || entry?.theme_id;
        const colourId = normalizeColourId(entry?.theme_colour || entry?.colour_id);
        if (!themeId || !colourId) return;
        normalized[gradeKey.toString().toLowerCase()] = { themeId, colourId };
      });
      setSavedSelections(normalized);
    } catch (error) {
      console.warn('Unable to load saved cover selections', error);
      setSelectionsError('Unable to load saved cover selections. Editing continues offline.');
    } finally {
      setIsLoadingSelections(false);
    }
  }, [getIdToken, isSuperAdmin, schoolId]);

  useEffect(() => {
    if (!themeCatalogue.length) {
      return;
    }
    const exists = themeCatalogue.some((theme) => normalizeThemeId(theme.id) === normalizeThemeId(selectedThemeId));
    if (!exists) {
      setSelectedThemeId(themeCatalogue[0].id);
    }
  }, [selectedThemeId, themeCatalogue]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    void fetchSavedSelections();
  }, [fetchSavedSelections, isSuperAdmin]);

  useEffect(() => {
    if (!isSuperAdmin) {
      return;
    }
    if (selectedThemeId) return;
    const savedTheme = Object.values(savedSelections || {})[0]?.themeId;
    if (savedTheme) {
      const matched = themeCatalogue.find(
        (theme) => normalizeThemeId(theme.id) === normalizeThemeId(savedTheme)
      );
      if (matched) {
        setSelectedThemeId(matched.id);
        return;
      }
    }
    if (themeCatalogue.length) {
      setSelectedThemeId(themeCatalogue[0].id);
    }
  }, [isSuperAdmin, savedSelections, selectedThemeId, themeCatalogue]);

  useEffect(() => {
    if (!isSuperAdmin || !selectedThemeId || hasUnsavedChanges) {
      return;
    }
    const derived = computeAssignmentsForTheme(selectedThemeId);
    setPngAssignments(derived);
  }, [computeAssignmentsForTheme, hasUnsavedChanges, isSuperAdmin, selectedThemeId, savedSelections]);

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

  const handleSelectTheme = useCallback(
    (event) => {
      const nextThemeId = event.target.value;
      setValidationError('');
      setSaveError('');
      if (!isSuperAdmin) {
        setSelectedThemeId(nextThemeId);
        setSelectedColourId('');
        if (colourSectionRef.current) {
          colourSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        return;
      }
      if (isSuperAdmin && selectedThemeId) {
        setDraftAssignmentsByTheme((cache) => ({
          ...cache,
          [selectedThemeId]: pngAssignments
        }));
      }
      const cachedDraft = isSuperAdmin ? draftAssignmentsByTheme[nextThemeId] : null;
      const derived = isSuperAdmin ? computeAssignmentsForTheme(nextThemeId) : {};
      const nextAssignments =
        cachedDraft && Object.keys(cachedDraft).length ? cachedDraft : derived;
      setPngAssignments(nextAssignments);
      setHasUnsavedChanges(Boolean(isSuperAdmin && cachedDraft && Object.keys(cachedDraft).length));
      setSelectedThemeId(nextThemeId);
      setSelectedColourId('');
      if (colourSectionRef.current) {
        colourSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    },
    [computeAssignmentsForTheme, draftAssignmentsByTheme, isSuperAdmin, pngAssignments, selectedThemeId]
  );

  const handleAssignGradePng = useCallback(
    (gradeId, colourId, pngSrc) => {
      const key = `${colourId}:${pngSrc}`;
      setPngAssignments((prev) => {
        const next = { ...prev };
        if (!gradeId) {
          delete next[key];
        } else {
          // ensure a grade is only assigned to one PNG
          Object.entries(next).forEach(([entryKey, entry]) => {
            if (entry?.gradeId === gradeId) {
              delete next[entryKey];
            }
          });
          next[key] = { gradeId, colourId, src: pngSrc };
        }
        if (isSuperAdmin && selectedThemeId) {
          setDraftAssignmentsByTheme((cache) => ({
            ...cache,
            [selectedThemeId]: next
          }));
        }
        return next;
      });
      setHasUnsavedChanges(isSuperAdmin || hasUnsavedChanges);
      setValidationError('');
      setSaveError('');
    },
    [hasUnsavedChanges, isSuperAdmin, selectedThemeId]
  );

  const assignedEntries = useMemo(() => Object.values(pngAssignments), [pngAssignments]);

  const handlePreview = useCallback(() => {
    if (!selectedTheme) {
      setValidationError('Please choose a theme before previewing.');
      return;
    }

    if (!assignedEntries.length) {
      setValidationError('Assign at least one PNG to a grade before previewing.');
      setShouldShowPreview(false);
      return;
    }

    setValidationError('');
    setShouldShowPreview(true);
    const items = assignedEntries.map(({ gradeId, src }) => ({
      id: `${gradeId}-${src}`,
      title: gradeOptions.find((g) => g.id === gradeId)?.label || gradeId,
      src
    }));
    setPreviewItems(items);
    if (!items.length) {
      setPreviewError('No cover artwork has been uploaded for the selected grades yet.');
    } else {
      setPreviewError('');
    }
  }, [assignedEntries, gradeOptions, selectedTheme]);

  const handleSaveAssignments = useCallback(async () => {
    if (!isSuperAdmin) {
      setSaveError('Saving is available only for super admin users.');
      return;
    }
    if (!selectedTheme) {
      setValidationError('Please choose a theme before saving.');
      return;
    }

    if (!assignedEntries.length) {
      setValidationError('Assign at least one PNG to a grade before saving.');
      return;
    }

    if (!schoolId) {
      setValidationError('Select a school before saving cover selections.');
      return;
    }

    setIsSaving(true);
    setSaveError('');
    try {
      const base = API_BASE_URL || '/api';
      const token = await getIdToken?.();
      const headers = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      };

      const tasks = assignedEntries
        .map((entry) => {
          const gradeKey = gradeKeyByCode[entry.gradeId] || '';
          if (!gradeKey) return null;
          return fetch(`${base}/cover-selections`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              school_id: schoolId,
              grade: gradeKey,
              theme_id: selectedTheme.id,
              theme_label: selectedTheme.label || selectedTheme.id,
              colour_id: entry.colourId,
              colour_label: entry.colourId
            })
          });
        })
        .filter(Boolean);

      if (!tasks.length) {
        setValidationError('Select a grade in the dropdown before saving.');
        setIsSaving(false);
        return;
      }

      const responses = await Promise.all(tasks);
      const failed = responses.find((res) => !res?.ok);
      if (failed) {
        throw new Error(`HTTP ${failed.status}`);
      }

      setHasUnsavedChanges(false);
      setDraftAssignmentsByTheme({});
      await fetchSavedSelections();
    } catch (error) {
      console.warn('Unable to save cover selections', error);
      setSaveError('Unable to save cover selections. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }, [assignedEntries, fetchSavedSelections, getIdToken, gradeKeyByCode, isSuperAdmin, schoolId, selectedTheme]);

  const hasValidationError = Boolean(validationError);
  const displayColourOptions = useMemo(() => colourOptions, [colourOptions]);
  const gradeLabel = (code) => gradeOptions.find((g) => g.id === code)?.label || code;

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

  if (!isSuperAdmin) {
    return (
      <section className="flex flex-col gap-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <header className="space-y-2">
          <h2 className="text-xl font-semibold text-slate-900">Cover pages</h2>
          <p className="text-sm text-slate-600">
            Cover pages are being prepared. Please wait for the admin to share updates.
          </p>
        </header>
      </section>
    );
  }

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
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl-grid-cols-4 gap-4 sm:gap-6 max-w-[520px] sm:max-w-6xl mx-auto">
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
        ref={colourSectionRef}
      >
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Pick a colour family</h3>
        <p className="mt-1 text-sm text-slate-600">
          Assign PNGs to grades. Each colour card below is an option; use the dropdown on a thumbnail to assign that PNG to a grade (dropdown is for assignment, not preview).
        </p>
        {isSuperAdmin && hasUnsavedChanges && (
          <p className="mt-2 text-xs font-semibold text-amber-600">
            You have unsaved assignments for this theme. Click Save to update client selections.
          </p>
        )}
        {isSuperAdmin && selectionsError && (
          <p className="mt-2 text-xs font-semibold text-red-600">{selectionsError}</p>
        )}
        {isSuperAdmin && isLoadingSelections && (
          <p className="mt-2 text-xs font-semibold text-slate-600">Loading saved selections…</p>
        )}
        {displayColourOptions.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">
            No colour PNGs have been uploaded yet. Upload PNG files to the cover library to see thumbnails here.
          </div>
        ) : (
          <div className="mt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
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
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                                className={cn(
                                  "mt-1 w-full rounded border bg-white px-2 py-1 text-xs font-medium text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-200",
                                  !assignedGrade ? "border-red-400 animate-pulse bg-red-50 text-red-700" : "border-slate-300"
                                )}
                                value={assignedGrade || ''}
                                onChange={(event) => handleAssignGradePng(event.target.value, colour.id, thumb.src)}
                              >
                                <option value="">Select grade</option>
                                {gradeOptions.map((grade) => (
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
        {saveError && <p className="mt-2 text-sm font-semibold text-red-600">{saveError}</p>}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-slate-100 p-6 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Preview covers</h3>
                <p className="mt-1 text-sm text-slate-600">
                  The preview shows the PNGs you assigned per grade.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                {isSuperAdmin && (
                  <Button
                    type="button"
                    onClick={handleSaveAssignments}
                    disabled={isSaving || isLoadingSelections || !selectedTheme || assignedEntries.length === 0}
                    className="w-full sm:w-auto self-stretch sm:self-start rounded-full bg-green-600 px-6 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-green-500 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {isSaving ? 'Saving…' : 'Save changes'}
                  </Button>
                )}
                <Button
                  type="button"
                  onClick={handlePreview}
                  disabled={!selectedTheme || isLoadingPreview}
                  className="w-full sm:w-auto self-stretch sm:self-start rounded-full bg-indigo-600 px-8 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {isLoadingPreview ? 'Preparing preview...' : 'Preview cover'}
                </Button>
              </div>
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
