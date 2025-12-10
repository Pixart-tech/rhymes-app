import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { CheckCircle2, ImageOff } from 'lucide-react';

import { API_BASE_URL, cn } from '../lib/utils';
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
    colours: theme.colours.map((colour, index) => ({
      id: colour.id,
      label: colour.label,
      imageUrl: '',
      fallbackHex: COVER_COLOUR_OPTIONS[index]?.hex,
    })),
  }));

const mergeThemePayload = (payload) => {
  const fallback = buildFallbackThemes();
  if (!Array.isArray(payload) || payload.length === 0) {
    return fallback;
  }

  const normalised = payload.map((theme) => ({
    id: theme?.id || '',
    label: theme?.label || 'Theme',
    thumbnailUrl: typeof theme?.thumbnailUrl === 'string' ? theme.thumbnailUrl : '',
    colours: Array.isArray(theme?.colours)
      ? theme.colours.map((colour, index) => ({
          id: colour?.id || `colour${index + 1}`,
          label: colour?.label || `Colour ${index + 1}`,
          imageUrl: typeof colour?.imageUrl === 'string' ? colour.imageUrl : '',
          fallbackHex: COVER_COLOUR_OPTIONS[index]?.hex,
        }))
      : [],
  }));

  const combined = fallback.map((fallbackTheme) => {
    const matchingTheme = normalised.find((theme) => theme.id === fallbackTheme.id);
    if (!matchingTheme) {
      return fallbackTheme;
    }

    const mergedColours = fallbackTheme.colours.map((fallbackColour, index) => {
      const override = matchingTheme.colours[index] || matchingTheme.colours.find((colour) => colour.id === fallbackColour.id);
      if (!override) {
        return fallbackColour;
      }
      return {
        ...fallbackColour,
        ...override,
        fallbackHex: fallbackColour.fallbackHex || override.fallbackHex,
      };
    });

    return {
      ...fallbackTheme,
      ...matchingTheme,
      colours: mergedColours,
    };
  });

  return combined.slice(0, COVER_THEME_SLOT_COUNT);
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
  const [isLoadingThemes, setIsLoadingThemes] = useState(false);
  const [themeError, setThemeError] = useState('');
  const [selectedThemeId, setSelectedThemeId] = useState('');
  const [selectedColourId, setSelectedColourId] = useState('');
  const [selectedColoursByGrade, setSelectedColoursByGrade] = useState({});
  const [isFinished, setIsFinished] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [hasHydratedFromServer, setHasHydratedFromServer] = useState(false);

  const selectedTheme = useMemo(
    () => themes.find((theme) => theme.id === selectedThemeId) || null,
    [selectedThemeId, themes]
  );

  const colourOptions = useMemo(() => selectedTheme?.colours || [], [selectedTheme]);
  const activeColourId = useMemo(
    () => selectedColoursByGrade[grade] || selectedColourId,
    [grade, selectedColourId, selectedColoursByGrade]
  );
  const selectedColour = useMemo(
    () => colourOptions.find((colour) => colour.id === activeColourId) || null,
    [colourOptions, activeColourId]
  );

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
        const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
        const response = await axios.get(`${API_BASE_URL}/cover-selections/${schoolId}`, {
          headers,
          validateStatus: () => true,
        });
        if (response.status >= 400) {
          return;
        }
        const grades = response.data?.grades || {};

        const loadedColours = {};
        let loadedThemeId = selectedThemeId;
        let loadedColourId = selectedColourId;
        let loadedFinished = isFinished;
        let loadedUpdatedAt = lastSavedAt;

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
        const response = await axios.get(`${API_BASE_URL}/cover-assets/themes`);
        const payload = response?.data?.themes;
        setThemes(mergeThemePayload(payload));
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
    setIsFinished(false);
  };

  const handleColourSelect = (targetGrade, colourId) => {
    if (isReadOnly || !targetGrade) {
      return;
    }

    setSelectedColoursByGrade((current) => ({
      ...current,
      [targetGrade]: colourId,
    }));

    if (targetGrade === grade) {
      setSelectedColourId(colourId);
    }

    setIsFinished(false);
  };

  const handleFinish = () => {
    void handleFinishSave();
  };

  const completionDisabled =
    !selectedThemeId || !activeColourId || isReadOnly;

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-red-50 py-10 px-6">
      <div className="mx-auto max-w-6xl space-y-8">
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

        <Alert className="border-orange-200 bg-orange-50/70 text-orange-800">
          <AlertTitle>Cover previews use uploaded PNG thumbnails</AlertTitle>
          <AlertDescription>
            Pick a theme and colour to mark this grade as finished. Thumbnails come from admin uploads; no live SVG previews are used.
          </AlertDescription>
        </Alert>

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
            <CardTitle className="text-xl font-semibold text-slate-900">Choose a theme</CardTitle>
            <p className="text-sm text-slate-600">Sixteen PNG thumbnails are available. Pick one to reveal the colour grid.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoadingThemes && (
              <div className="rounded-2xl border border-dashed border-orange-200 bg-white/70 p-6 text-center text-sm font-medium text-orange-500">
                Loading theme thumbnails…
              </div>
            )}

            {themeError && !isLoadingThemes && (
              <div className="rounded-2xl border border-dashed border-orange-200 bg-orange-50 p-4 text-sm text-orange-700">
                {themeError}
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {themes.map((theme) => {
                const isSelected = selectedThemeId === theme.id;
                return (
                  <button
                    key={theme.id}
                    type="button"
                    onClick={() => handleThemeSelect(theme.id)}
                    className={cn(
                      'group flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white/80 text-left shadow-sm transition hover:-translate-y-1 hover:shadow-md focus:outline-none focus-visible:ring-4 focus-visible:ring-orange-300',
                      isSelected ? 'border-orange-500 ring-2 ring-orange-400' : '',
                      isReadOnly ? 'cursor-not-allowed opacity-60' : ''
                    )}
                    aria-pressed={isSelected}
                    disabled={isReadOnly}
                  >
                    <div className="relative aspect-[4/3] w-full overflow-hidden bg-slate-50">
                      {theme.thumbnailUrl ? (
                        <img src={theme.thumbnailUrl} alt={`${theme.label} thumbnail`} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-slate-400">
                          <ImageOff className="h-8 w-8" />
                        </div>
                      )}
                    </div>
                    <div className="p-3">
                      <p className="text-sm font-semibold text-slate-800">{theme.label}</p>
                      <p className="text-xs text-slate-500">PNG thumbnails uploaded by the admin appear here.</p>
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
              <CardTitle className="text-xl font-semibold text-slate-900">Select a colour family</CardTitle>
              <p className="text-sm text-slate-600">

                Choose a colour for each grade. Each row shows the grade label followed by the four colour for this
                theme.

              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white/80">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50/80 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Grade</th>
                      {colourOptions.map((colour) => (
                        <th key={colour.id} className="px-4 py-3 text-center">
                          {colour.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                    {GRADE_ORDER.map((gradeKey) => (
                      <tr key={gradeKey} className="even:bg-orange-50/30">
                        <td className="px-4 py-3 font-semibold text-slate-800">{resolvedGradeNames[gradeKey] || GRADE_LABELS[gradeKey]}</td>
                        {colourOptions.map((colour) => {
                          const isChosen = selectedColoursByGrade[gradeKey] === colour.id;
                          return (
                            <td key={`${gradeKey}-${colour.id}`} className="px-2 py-3 text-center">
                              <button
                                type="button"
                                onClick={() => handleColourSelect(gradeKey, colour.id)}
                                className={cn(
                                  'flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-transparent bg-white/80 p-3 shadow-sm transition focus:outline-none focus-visible:ring-4 focus-visible:ring-orange-300',
                                  isChosen ? 'border-orange-500 ring-2 ring-orange-400' : 'hover:border-orange-200',
                                  isReadOnly ? 'cursor-not-allowed opacity-60' : ''
                                )}
                                disabled={isReadOnly}
                              >
                                <div className="flex h-24 w-full items-center justify-center overflow-hidden rounded-lg bg-slate-50">
                                  {colour.imageUrl ? (
                                    <img
                                      src={colour.imageUrl}
                                      alt={`${colour.label} preview`}
                                      className="h-full w-full object-contain"
                                    />
                                  ) : (
                                    <div
                                      className="flex h-full w-full items-center justify-center text-xs font-medium text-slate-500"
                                      style={{ backgroundColor: colour.fallbackHex || '#f8fafc' }}
                                    >
                                      {colour.label}
                                    </div>
                                  )}
                                </div>
                                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                  {colour.label}
                                </span>
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-700">
                <div className="space-y-1">
                  <p className="font-semibold text-slate-800">
                    {isFinished
                      ? 'Finished – selections saved. You can edit until an admin freezes them.'
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
