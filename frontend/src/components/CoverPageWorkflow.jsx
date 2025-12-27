import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { CheckCircle2, ImageOff } from 'lucide-react';

import { API_BASE_URL, cn, normalizeAssetUrl } from '../lib/utils';
import { COVER_COLOUR_OPTIONS, COVER_THEME_CATALOGUE, COVER_THEME_SLOT_COUNT } from '../theme';
import { loadCoverWorkflowState, saveCoverWorkflowState } from '../lib/storage';
import { useAuth } from '../hooks/useAuth';

const GRADE_LABELS = {
  nursery: 'Nursery',
  lkg: 'LKG',
  ukg: 'UKG',
  playgroup: 'Playgroup'
};

const GRADE_ORDER = ['playgroup', 'nursery', 'lkg', 'ukg'];
const GRADE_CODE_MAP = {
  playgroup: 'P',
  nursery: 'N',
  lkg: 'L',
  ukg: 'U',
};

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
        thumbnailUrl: '',
        previewUrl: '',
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

const resolveGradeLabel = (grade, customGradeName) => {
  if (customGradeName && customGradeName.trim()) {
    return customGradeName.trim();
  }

  if (GRADE_LABELS[grade]) {
    return GRADE_LABELS[grade];
  }

  if (typeof grade === 'string' && grade.trim()) {
    return grade.trim().toUpperCase();
  }

  return 'Grade';
};

const buildFallbackThemes = () =>
  COVER_THEME_CATALOGUE.map((theme) => ({
    id: theme.id,
    label: theme.label,
    thumbnailUrl: '',
    coverUrl: '',
    colours: theme.colours.map((colour, index) => ({
      id: colour.id,
      label: colour.label,
      imageUrl: '',
      grades: {},
      fallbackHex: COVER_COLOUR_OPTIONS[index]?.hex,
    })),
  }));

const mapLibraryToThemes = (library) => {
  const normalized = normalizeLibraryPayload(library);
  const themeList = Array.isArray(normalized?.themes) ? normalized.themes : [];
  const baseColours = Array.isArray(normalized?.colour_versions)
    ? normalized.colour_versions
    : Object.keys(normalized?.colours || {});
  const colourMap = normalized?.colours || {};

  const colourEntries = (baseColours.length ? baseColours : COVER_COLOUR_OPTIONS.map((c) => c.id)).map(
    (version, index) => ({
      id: version,
      label: version,
      imageUrl: '',
      grades: colourMap[version] || {},
      fallbackHex: COVER_COLOUR_OPTIONS[index]?.hex,
    })
  );

  if (!themeList.length) {
    return buildFallbackThemes().map((theme) => ({
      ...theme,
      colours: colourEntries,
    }));
  }

  return themeList.slice(0, COVER_THEME_SLOT_COUNT).map((theme, idx) => ({
    id: theme?.id || `theme${idx + 1}`,
    label: theme?.label || theme?.id || `Theme ${idx + 1}`,
    thumbnailUrl: theme?.thumbnailUrl || '',
    coverUrl: theme?.coverUrl || '',
    colours: colourEntries,
  }));
};

const buildThemeSources = (theme) => {
  let cover = theme?.coverUrl || '';
  // If only preview is present, derive the original cover path
  if (!cover && theme?.previewUrl) {
    cover = theme.previewUrl
      .replace('/previews-webp/', '/themes/')
      .replace('cover_preview.webp', 'cover.png');
  }
  if (!cover) return null;

  return {
    cover,
    original: cover,
  };
};

const CoverPageWorkflow = ({
  school,
  grade,
  onBackToMode,
  onLogout,
  coverDefaults,
  isReadOnly = false,
}) => {
  const { getIdToken } = useAuth();
  const resolvedGradeNames = useMemo(() => {
    const gradeNameSource = coverDefaults?.gradeNames || {};
    const identifiers = new Set([...Object.keys(GRADE_LABELS), ...Object.keys(gradeNameSource || {})]);

    if (grade) {
      identifiers.add(grade);
    }

    const result = {};
    identifiers.forEach((identifier) => {
      result[identifier] = resolveGradeLabel(identifier, gradeNameSource?.[identifier]);
    });

    return result;
  }, [coverDefaults?.gradeNames, grade]);

  const [themes, setThemes] = useState(buildFallbackThemes());
  const [libraryColours, setLibraryColours] = useState({});
  const [isLoadingThemes, setIsLoadingThemes] = useState(false);
  const [themeError, setThemeError] = useState('');
  const [selectedThemeId, setSelectedThemeId] = useState('');
  const [selectedColourId, setSelectedColourId] = useState('');
  const [selectedColoursByGrade, setSelectedColoursByGrade] = useState({});
  const [pngAssignments, setPngAssignments] = useState({});
  const [isFinished, setIsFinished] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [hasHydratedFromServer, setHasHydratedFromServer] = useState(false);

  const selectedTheme = useMemo(
    () => themes.find((theme) => theme.id === selectedThemeId) || null,
    [selectedThemeId, themes]
  );

  const colourOptions = useMemo(() => {
    const match = selectedThemeId.match(/(\d+)/);
    const versionForTheme = match ? `V${match[1]}_C` : '';
    const availableVersions = Object.keys(libraryColours);
    const chosenVersions =
      versionForTheme && availableVersions.includes(versionForTheme)
        ? [versionForTheme]
        : availableVersions.length
          ? [availableVersions[0]]
          : [];

    return chosenVersions.map((version, index) => ({
      id: version,
      label: version,
      grades: libraryColours[version] || {},
    }));
  }, [libraryColours, selectedThemeId]);
  const activeColourId = useMemo(() => selectedColoursByGrade[grade] || selectedColourId, [grade, selectedColourId, selectedColoursByGrade]);
  const selectedColour = useMemo(() => colourOptions.find((colour) => colour.id === activeColourId) || null, [colourOptions, activeColourId]);
  useEffect(() => {
    const schoolId = school?.school_id;
    if (!schoolId || !grade) {
      return;
    }

    const loadedColours = {};
    let activeThemeId = '';
    let activeColour = '';
    let activeFinished = false;
    let activeUpdatedAt = null;

    GRADE_ORDER.forEach((gradeKey) => {
      const stored = loadCoverWorkflowState(schoolId, gradeKey);
      if (stored?.selectedColourId) {
        loadedColours[gradeKey] = stored.selectedColourId;
      }
      if (gradeKey === grade && stored) {
        activeThemeId = stored.selectedThemeId || '';
        activeColour = stored.selectedColourId || '';
        activeFinished = stored.status === 'finished';
        activeUpdatedAt = stored.updatedAt || null;
      }
    });

    setSelectedColoursByGrade(loadedColours);
    setPngAssignments({});
    setSelectedThemeId(activeThemeId || '');
    setSelectedColourId(activeColour || '');
    setIsFinished(activeFinished);
    setLastSavedAt(activeUpdatedAt);
  }, [grade, school?.school_id]);

  useEffect(() => {
    const schoolId = school?.school_id;
    if (!schoolId || !grade || hasHydratedFromServer) {
      return;
    }

    const fetchSavedSelections = async () => {
      try {
        const token = await getIdToken?.();
        if (!token) {
          return; // authenticated-only endpoint
        }
        const headers = { Authorization: `Bearer ${token}` };
        const response = await axios.get(`${API_BASE_URL}/cover-selections/${schoolId}`, {
          headers,
          validateStatus: () => true,
        });
        if (response.status >= 400) {
          return;
        }
        const grades = response.data?.grades || {};
        const library = response.data?.library;

        const loadedColours = {};
        let loadedThemeId = selectedThemeId;
        let loadedColourId = selectedColourId;
        let loadedFinished = isFinished;
        let loadedUpdatedAt = lastSavedAt;

        if (library) {
          const normalizedLibrary = normalizeLibraryPayload(library);
          const mapped = mapLibraryToThemes(normalizedLibrary);
          setThemes(mapped);
          setLibraryColours(normalizedLibrary.colours || {});
          if (!loadedThemeId && mapped.length) {
            loadedThemeId = mapped[0].id;
          }
        }

        Object.entries(grades).forEach(([gradeKey, entry]) => {
          const normalizedGrade = gradeKey.toString().toLowerCase();
          if (entry?.theme) {
            loadedThemeId = entry.theme;
          }
          if (entry?.theme_colour) {
            loadedColours[normalizedGrade] = entry.theme_colour;
            if (normalizedGrade === grade) {
              loadedColourId = entry.theme_colour;
            }
          }
          if (normalizedGrade === grade && entry?.status) {
            loadedFinished = entry.status === 'finished';
          }
          if (entry?.updated_at) {
            loadedUpdatedAt = entry.updated_at;
          }
        });

        setSelectedColoursByGrade((prev) => ({ ...loadedColours, ...prev }));
        setPngAssignments({});
        setSelectedThemeId((prev) => loadedThemeId || prev);
        setSelectedColourId((prev) => loadedColourId || prev);
        setIsFinished(loadedFinished);
        setLastSavedAt(loadedUpdatedAt);
        setHasHydratedFromServer(true);
      } catch (error) {
        console.warn('Unable to load saved cover selections', error);
      }
    };

    void fetchSavedSelections();
  }, [
    API_BASE_URL,
    grade,
    hasHydratedFromServer,
    isFinished,
    lastSavedAt,
    school?.school_id,
    selectedColourId,
    selectedThemeId,
    getIdToken,
  ]);

  useEffect(() => {
    const fetchThemeImages = async () => {
      setIsLoadingThemes(true);
      setThemeError('');
      try {
        const response = await axios.get(`${API_BASE_URL}/cover-library`, { validateStatus: () => true });
        if (response.status >= 400) {
          throw new Error(`Server responded with status ${response.status}`);
        }
        const library = response.data?.library || response.data;
        if (library) {
          const normalizedLibrary = normalizeLibraryPayload(library);
          setThemes(mapLibraryToThemes(normalizedLibrary));
          setLibraryColours(normalizedLibrary.colours || {});
        } else {
          setThemes(buildFallbackThemes());
        }
      } catch (error) {
        console.error('Unable to load cover theme thumbnails', error);
        setThemeError('Unable to load theme thumbnails. Uploaded PNGs will appear when the server is reachable.');
        setThemes(buildFallbackThemes());
      } finally {
        setIsLoadingThemes(false);
      }
    };

    void fetchThemeImages();
  }, []);

  useEffect(() => {
    const schoolId = school?.school_id;
    if (!schoolId) {
      return;
    }

    const timestamp = Date.now();
    const colourForActiveGrade = selectedColoursByGrade[grade] || selectedColourId || '';
    const activeColourLabel = colourOptions.find((colour) => colour.id === colourForActiveGrade)?.label;

    if (grade) {
      saveCoverWorkflowState(schoolId, grade, {
        selectedThemeId,
        selectedColourId: colourForActiveGrade,
        status: isFinished ? 'finished' : 'in-progress',
        updatedAt: timestamp,
        selectedThemeLabel: selectedTheme?.label,
        selectedColourLabel: activeColourLabel,
      });
    }

    Object.entries(selectedColoursByGrade).forEach(([gradeKey, colourId]) => {
      if (!colourId || gradeKey === grade) {
        return;
      }
      const colourLabel = colourOptions.find((colour) => colour.id === colourId)?.label;
      saveCoverWorkflowState(schoolId, gradeKey, {
        selectedThemeId,
        selectedColourId: colourId,
        status: 'in-progress',
        updatedAt: timestamp,
        selectedThemeLabel: selectedTheme?.label,
        selectedColourLabel: colourLabel,
      });
    });

    setLastSavedAt(timestamp);
  }, [
    colourOptions,
    grade,
    isFinished,
    school?.school_id,
    selectedColourId,
    selectedColoursByGrade,
    selectedTheme?.label,
    selectedThemeId,
  ]);

  const handleFinishSave = async () => {
    if (isReadOnly) return;
    const schoolId = school?.school_id;
    const activeColour = selectedColoursByGrade[grade] || selectedColourId;
    if (!schoolId || !selectedThemeId || !activeColour) {
      toast.error('Pick a theme and colour before saving.');
      return;
    }

    try {
      const token = await getIdToken?.();
      const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
      const themeLabel = selectedTheme?.label;
      const colourLabel = colourOptions.find((c) => c.id === activeColour)?.label || null;

      // Save the current grade plus any other grade rows already picked.
      const tasks = Object.entries({ ...selectedColoursByGrade, [grade]: activeColour }).map(
        ([gradeKey, colourId]) => {
          if (!colourId) return Promise.resolve();
          return axios.post(
            `${API_BASE_URL}/cover-selections`,
            {
              school_id: schoolId,
              grade: gradeKey,
              theme_id: selectedThemeId,
              theme_label: themeLabel,
              colour_id: colourId,
              colour_label: gradeKey === grade ? colourLabel : colourOptions.find((c) => c.id === colourId)?.label || null,
              status: gradeKey === grade ? 'finished' : 'in-progress',
            },
            { headers }
          );
        }
      );

      await Promise.all(tasks);
      setIsFinished(true);
      const timestamp = Date.now();
      setLastSavedAt(timestamp);
      toast.success('Cover selection saved');
    } catch (error) {
      console.warn('Unable to persist cover selections', error);
      toast.error('Could not save cover selection');
    }
  };

  const handleThemeSelect = (themeId) => {
    if (isReadOnly) {
      return;
    }
    setSelectedThemeId(themeId);
    setSelectedColourId('');
    setSelectedColoursByGrade({});
    setPngAssignments({});
    setIsFinished(false);
  };

  const handleAssignPng = (gradeKey, colourId, pngSrc) => {
    if (isReadOnly || !gradeKey || !colourId || !pngSrc) return;
    const key = `${colourId}:${pngSrc}`;
    setPngAssignments((prev) => {
      const next = { ...prev };
      // ensure one PNG per grade
      Object.entries(next).forEach(([entryKey, entry]) => {
        if (entry?.gradeKey === gradeKey) {
          delete next[entryKey];
        }
      });
      next[key] = { gradeKey, colourId, src: pngSrc };
      return next;
    });
    setSelectedColoursByGrade((current) => ({ ...current, [gradeKey]: colourId }));
    if (gradeKey === grade) {
      setSelectedColourId(colourId);
    }
    setIsFinished(false);
  };

  const handleFinish = () => {
    void handleFinishSave();
  };

  const completionDisabled =
    !selectedThemeId || isReadOnly || Object.keys(pngAssignments).length === 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-red-50 py-10 px-6">
      <div className="mx-auto max-w-7xl space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-2">
            <p className="text-sm font-medium text-orange-500">Cover pages workflow</p>
            <h1 className="text-3xl font-semibold text-slate-900">{school.school_name}</h1>
            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
              <span>School ID: {school.school_id}</span>
              {isFinished && (
                <span className="inline-flex items-center gap-1 text-green-700">
                  <CheckCircle2 className="h-4 w-4" /> Finished
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-3">
            <Button variant="outline" onClick={onBackToMode} className="bg-white/80 hover:bg-white">
              Back to menu
            </Button>
            <Button variant="outline" onClick={onLogout} className="bg-white/80 hover:bg-white">
              Logout
            </Button>
          </div>
        </div>

        <Card className="border-none bg-white/70 shadow-md shadow-orange-100/40">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-orange-500">Theme selection</p>
              <p className="text-base font-semibold text-slate-800">
                {selectedTheme ? selectedTheme.label : 'Select one of the 16 themes to continue'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
              <div className="flex items-center gap-2">
                <span className="font-medium text-slate-700">Colour:</span>
                <span>{selectedColour ? selectedColour.label : 'Not selected'}</span>
              </div>
              <Separator orientation="vertical" className="hidden h-4 sm:block" />
              <div className="flex items-center gap-2 text-xs text-slate-500">
                {lastSavedAt ? `Last saved ${new Date(lastSavedAt).toLocaleString()}` : 'Selections are saved automatically'}
              </div>
            </div>
          </CardContent>
        </Card>

      <Card className="border-none shadow-xl shadow-orange-100/60">
        <CardHeader className="space-y-2">
          <CardTitle className="text-2xl font-semibold text-slate-900">Choose a theme</CardTitle>
          <p className="text-base text-slate-600">Sixteen PNG containers are available. Pick one to reveal the colour grid.</p>
        </CardHeader>
          <CardContent className="space-y-4">
            {isLoadingThemes && (
              <div className="rounded-2xl border border-dashed border-orange-200 bg-white/70 p-6 text-center text-sm font-medium text-orange-500">
                Loading theme thumbnails...
              </div>
            )}

            {themeError && !isLoadingThemes && (
              <div className="rounded-2xl border border-dashed border-orange-200 bg-orange-50 p-4 text-sm text-orange-700">
                {themeError}
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-y-6 gap-x-4 sm:gap-y-10 sm:gap-x-12 lg:gap-x-14 xl:gap-x-16 max-w-[520px] sm:max-w-6xl mx-auto">
              {themes.map((theme) => {
                const isSelected = selectedThemeId === theme.id;
                const sources = buildThemeSources(theme);
                const cardSrc = sources?.cover || sources?.original || '';
                return (
                  <button
                    key={theme.id}
                    type="button"
                    onClick={() => handleThemeSelect(theme.id)}
                    className={cn(
                      'group relative block w-full max-w-[900px] mx-auto overflow-hidden border border-slate-200 bg-white/80 text-left shadow-sm transition hover:-translate-y-1 hover:shadow-md active:scale-[0.99] focus:outline-none focus-visible:ring-4 focus-visible:ring-orange-300 aspect-[5009/3473]',
                      isSelected ? 'border-orange-500 ring-2 ring-orange-400' : '',
                      isReadOnly ? 'cursor-not-allowed opacity-60' : ''
                    )}
                    aria-pressed={isSelected}
                    disabled={isReadOnly}
                  >
                    <div className="h-full w-full overflow-hidden">
                      {cardSrc ? (
                        <img
                          src={cardSrc}
                          width={1000}
                          height={1000}
                          alt={`${theme.label} thumbnail`}
                          loading="lazy"
                          decoding="async"
                          className="block h-full w-full object-contain"
                          style={{ imageRendering: 'optimizeQuality' }}
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-slate-400">
                          <ImageOff className="h-8 w-8" />
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {selectedTheme && (
          <Card className="border-none shadow-xl shadow-orange-100/60">
            <CardHeader className="space-y-2">
              <CardTitle className="text-2xl font-semibold text-slate-900">Select a colour family</CardTitle>
              <p className="text-base text-slate-600">
                Choose a colour for this grade. Four thumbnails are shown in a spacious grid for easy reading.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-6">
                {colourOptions.map((colour, index) => {
                  const thumbnails = Object.entries(colour.grades || {})
                    .filter(([, src]) => !!src)
                    .map(([gradeCode, src]) => ({ gradeCode, src }));
                  const fullyAssigned =
                    thumbnails.length > 0 &&
                    thumbnails.every((thumb) => pngAssignments[`${colour.id}:${thumb.src}`]?.gradeKey);
                  return (
                    <div
                      key={colour.id}
                      className={cn(
                        'flex h-full flex-col gap-4 rounded-2xl border bg-white p-4 text-left shadow-sm transition duration-200',
                        fullyAssigned ? 'border-orange-500 ring-2 ring-orange-400 ring-offset-2' : 'border-slate-200',
                        isReadOnly ? 'cursor-not-allowed opacity-60' : '',
                        'w-full sm:min-w-[360px]'
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-base font-semibold text-slate-800">{colour.label || `Colour ${index + 1}`}</span>
                        {fullyAssigned && (
                          <span className="rounded-full bg-orange-50 px-2 py-1 text-[11px] font-semibold uppercase text-orange-700">
                            Selected
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
                        {thumbnails.length === 0 ? (
                          <div className="col-span-2 flex h-56 items-center justify-center rounded-md border border-dashed border-slate-200 bg-slate-50 text-xs text-slate-400">
                            No PNGs uploaded for this colour.
                          </div>
                        ) : (
                          thumbnails.map((thumb) => (
                            <div
                              key={`${colour.id}-${thumb.gradeCode}`}
                              className="relative w-full overflow-hidden rounded-xl border border-slate-200 bg-white"
                            >
                              <div className="flex items-center justify-between px-2 py-2">
                                <select
                                  value={pngAssignments[`${colour.id}:${thumb.src}`]?.gradeKey || ''}
                                  onChange={(event) => {
                                    event.stopPropagation();
                                    handleAssignPng(event.target.value, colour.id, thumb.src);
                                  }}
                                  className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-200"
                                  disabled={isReadOnly}
                                >
                                  <option value="">Assign to grade</option>
                                  {Object.entries(GRADE_CODE_MAP).map(([gradeKey]) => (
                                    <option key={gradeKey} value={gradeKey}>
                                      {resolveGradeLabel(gradeKey, resolvedGradeNames[gradeKey])}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <img
                                src={thumb.src}
                                alt={`${colour.label || colour.id} grade ${thumb.gradeCode}`}
                                width={1000}
                                height={1000}
                                className="h-64 w-full object-contain object-center"
                                style={{ imageRendering: 'crisp-edges' }}
                              />
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-700">
                <div className="space-y-1">
                  <p className="font-semibold text-slate-800">
                    {isFinished
                      ? 'Finished selections saved. You can edit until an admin freezes them.'
                      : 'Select a theme and colour, then click Finish to save this grade.'}
                  </p>
                  {isReadOnly && <p className="text-xs text-slate-500">Viewing mode is enabled because selections are frozen.</p>}
                </div>
                <div className="flex gap-2">
                  {!isFinished && (
                    <Button type="button" onClick={handleFinish} disabled={completionDisabled}>
                      Finish
                    </Button>
                  )}
                  {isFinished && (
                    <Badge variant="secondary" className="self-center bg-green-50 text-green-700 border border-green-200">
                      Saved
                    </Badge>
                  )}
                  {isReadOnly && (
                    <Badge variant="secondary" className="self-center bg-slate-100 text-slate-600">
                      View only
                    </Badge>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default CoverPageWorkflow;
