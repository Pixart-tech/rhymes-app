import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { CheckCircle2, ChevronLeft, ImageOff, X } from 'lucide-react';

import {
  API_BASE_URL,
  cn,
  normalizeAssetUrl,
  deriveLibraryVersionId,
  buildCoverLibraryColourUrl,
} from '../lib/utils';
import { COVER_COLOUR_OPTIONS, COVER_THEME_CATALOGUE, COVER_THEME_SLOT_COUNT } from '../theme';
import { loadCoverWorkflowState, saveCoverWorkflowState, loadPersistedAppState } from '../lib/storage';
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

const normalizeThemeId = (themeId) => {
  if (!themeId) return '';
  const trimmed = themeId.toString().trim();
  if (!trimmed) return '';
  if (/^v\d+/i.test(trimmed)) {
    return trimmed.toUpperCase();
  }
  return trimmed;
};

const resolveCoverUrl = (theme) => {
  const rawId = theme?.id || theme?.themeId;
  const versionId = deriveLibraryVersionId(rawId);
  if (!versionId) return '';
  return normalizeAssetUrl(buildCoverLibraryColourUrl(versionId));
};

const normalizeLibraryPayload = (library) => {
  const themes = Array.isArray(library?.themes)
    ? library.themes.map((theme) => {
        const rawId = typeof theme?.id === 'string' ? theme.id.trim() : theme?.id;
        const normalizedId =
          typeof rawId === 'string' && /^v\d+/i.test(rawId) ? rawId.toUpperCase() : rawId || theme?.themeId;
        const frontCover = resolveCoverUrl({ ...theme, id: normalizedId });
        const resolvedCover = frontCover || theme?.coverUrl || theme?.thumbnailUrl;
        const coverUrl = resolvedCover ? normalizeAssetUrl(resolvedCover) : '';
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
    if (!normalizedVersion) return;
    const normalizedGrades = {};
    Object.entries(grades || {}).forEach(([grade, src]) => {
      normalizedGrades[grade] = normalizeAssetUrl(src);
    });
    colours[normalizedVersion] = normalizedGrades;
  });

  return {
    themes,
    colours,
    colour_versions: (library?.colour_versions || Object.keys(colours || {})).map((entry) =>
      (entry || '').toString().trim().toUpperCase()
    ),
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
  coverDefaults,
  isReadOnly = false,
}) => {
  const { getIdToken, user, loading: authLoading } = useAuth();
  const persistedApp = loadPersistedAppState?.();
  const persistedIsAdmin = persistedApp?.workspaceUser?.role === 'super-admin';
  const isAdmin = user?.role === 'super-admin' || persistedIsAdmin;
  const rootStatusCacheKey = useMemo(() => {
    const schoolId = school?.school_id;
    return schoolId ? `cover-status-${schoolId}` : null;
  }, [school?.school_id]);

  const initialWorkflowStatus = (() => {
    const schoolId = school?.school_id;
    if (schoolId && rootStatusCacheKey) {
      try {
        const cachedStatus = sessionStorage.getItem(rootStatusCacheKey);
        if (cachedStatus) {
          return cachedStatus.toString();
        }
      } catch (err) {
        // ignore cache errors
      }
    }
    if (schoolId && grade) {
      const stored = loadCoverWorkflowState(schoolId, grade);
      const statusValue = stored?.status?.toString();
      if (statusValue) {
        return statusValue;
      }
    }
    return '1';
  })();
  const initialFinished = initialWorkflowStatus !== '1';
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
  const [isFinished, setIsFinished] = useState(initialFinished);
  const [workflowStatus, setWorkflowStatus] = useState(initialWorkflowStatus); // 1=explore,2=preparing,3=view,4=frozen
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [hasHydratedFromServer, setHasHydratedFromServer] = useState(false);
  const viewReadOnly = isAdmin ? false : isReadOnly;
  const effectiveReadOnly = viewReadOnly || (!isAdmin && workflowStatus === '4');
  const [hasStatusDoc, setHasStatusDoc] = useState(false);
  const colourSectionRef = useRef(null);
  const [openSelectKey, setOpenSelectKey] = useState(null);
  const [fetchedGrades, setFetchedGrades] = useState({ client: {} });
  const [clientGrades, setClientGrades] = useState({});
  const [baselineByGrade, setBaselineByGrade] = useState({});
  const summaryCacheKey = useMemo(() => {
    if (!isAdmin) return null;
    const schoolId = school?.school_id;
    return schoolId ? `cover-summary-${schoolId}` : null;
  }, [isAdmin, school?.school_id]);
  const [clientThemeAnchor] = useState('');
  const [approvalCovers, setApprovalCovers] = useState([]);
  const [approvalLoading, setApprovalLoading] = useState(false);
  const [approvalError, setApprovalError] = useState('');
  const fetchInFlightRef = useRef(false);
  const [serverVersion, setServerVersion] = useState(0);
  const normalizeGradeKey = useCallback((value) => {
    if (!value) return '';
    const trimmed = value.toString().trim().toLowerCase();
    if (trimmed === 'pg') return 'playgroup';
    return trimmed;
  }, []);

  const getThemeLabel = useCallback(
    (themeId, fallbackLabel) => {
      const normalized = normalizeThemeId(themeId);
      const match = themes.find((theme) => normalizeThemeId(theme.id) === normalized);
      return match?.label || fallbackLabel || normalized || '-';
    },
    [themes]
  );

  const getClientBaseline = useCallback(
    (gradeKey) => {
      const entry = (clientGrades && clientGrades[gradeKey]) || (fetchedGrades.client && fetchedGrades.client[gradeKey]) || {};
      const cached = baselineByGrade?.[gradeKey] || {};
      const baselineTheme = normalizeThemeId(
        cached.theme ||
          entry?.theme ||
          entry?.theme_id ||
          entry?.clientTheme
      );
      const baselineColour = normalizeColourId(
        cached.colour ||
          entry?.client_colour_png ||
          entry?.client_colour_id ||
          entry?.client_colour
      );
      return { baselineTheme, baselineColour, entry };
    },
    [baselineByGrade, clientGrades, fetchedGrades.client]
  );

  const adminOverrideEntries = useMemo(() => {
    // No separate admin document; summary is driven by the client document only.
    return [];
  }, []);
  const buildClientAssignmentsForTheme = useCallback(
    (themeId) => {
      if (!themeId) return {};
      const normalizedTheme = normalizeThemeId(themeId);
      const result = {};
      Object.entries(fetchedGrades.client || {}).forEach(([gradeKey, entry]) => {
        const entryTheme = normalizeThemeId(
          entry?.client_theme ||
            entry?.client_theme_id ||
            entry?.clientTheme ||
            entry?.theme ||
            entry?.theme_id
        );
        if (!entryTheme || entryTheme !== normalizedTheme) return;
        const colourId = normalizeColourId(
          entry?.client_colour_png ||
            entry?.client_colour ||
            entry?.client_colour_id ||
            entry?.theme_colour ||
            entry?.colour_id
        );
        const gradeCode = GRADE_CODE_MAP[gradeKey];
        const src = colourId && gradeCode ? libraryColours[colourId]?.[gradeCode] : null;
        if (colourId && src) {
          const key = `${colourId}:${src}`;
          result[key] = { gradeKey, gradeId: gradeCode, colourId, src };
        }
      });
      return result;
    },
    [fetchedGrades.client, libraryColours]
  );

  // No anchor-based prefill; admin can freely select themes without auto-injection
  useEffect(() => {
    if (!isAdmin) return;
    if (!hasHydratedFromServer) return;
    // intentionally no auto-prefill to keep summary-only rendering
  }, [hasHydratedFromServer, isAdmin]);

  const selectedTheme = useMemo(
    () => themes.find((theme) => theme.id === selectedThemeId) || null,
    [selectedThemeId, themes]
  );
  const selectedThemeDisplay = useMemo(
    () => selectedThemeId || selectedTheme?.id || selectedTheme?.label || 'Not selected',
    [selectedThemeId, selectedTheme]
  );
  const enabledGrades = useMemo(() => {
    const map = {};
    const grades = school?.grades || {};
    Object.entries(grades).forEach(([key, value]) => {
      const normalized = key.toString().toLowerCase();
      const isEnabled = value && typeof value === 'object' ? Boolean(value.enabled) : false;
      map[normalized] = isEnabled;
      if (normalized === 'playgroup') {
        map.pg = isEnabled;
      }
    });
    return map;
  }, [school?.grades]);

  const isGradeEnabled = useCallback(
    (gradeKey) => {
      const normalized = gradeKey?.toString().toLowerCase();
      if (!normalized) return false;
      if (Object.prototype.hasOwnProperty.call(enabledGrades, normalized)) {
        return enabledGrades[normalized] === true;
      }
      return false;
    },
    [enabledGrades]
  );

  const enabledGradeOrder = useMemo(() => {
    const filtered = GRADE_ORDER.filter((gradeKey) => isGradeEnabled(gradeKey));
    return filtered.length ? filtered : GRADE_ORDER;
  }, [isGradeEnabled]);

  const colourOptions = useMemo(() => {
    const availableVersions = Object.keys(libraryColours);
    const normalizedThemeVersion = (() => {
      if (!selectedThemeId) return '';
      const trimmed = selectedThemeId.toString().trim();
      if (!trimmed) return '';
      const direct = trimmed.toUpperCase();
      if (/^V\d+/.test(direct)) {
        return direct;
      }
      const match = trimmed.match(/(\d+)/);
      return match ? `V${match[1]}`.toUpperCase() : direct;
    })();
    const matchedVersion = availableVersions.find(
      (version) => version.toUpperCase() === normalizedThemeVersion
    );
    const chosenVersions = matchedVersion
      ? [matchedVersion]
      : availableVersions.length
        ? [availableVersions[0]]
        : [];

    return chosenVersions.map((version) => ({
      id: version,
      label: version,
      grades: libraryColours[version] || {},
    }));
  }, [libraryColours, selectedThemeId]);
  const activeColourId = useMemo(() => selectedColoursByGrade[grade] || selectedColourId, [grade, selectedColourId, selectedColoursByGrade]);
  const selectedColour = useMemo(() => colourOptions.find((colour) => colour.id === activeColourId) || null, [colourOptions, activeColourId]);

  const assignedGradeSummaries = useMemo(() => {
    const filteredGrades = GRADE_ORDER.filter((gradeKey) => isGradeEnabled(gradeKey));
    return filteredGrades
      .map((gradeKey) => {
        const { baselineTheme, baselineColour } = getClientBaseline(gradeKey);
        const gradeCode = GRADE_CODE_MAP[gradeKey];
        const gradeLabel = resolveGradeLabel(gradeKey, resolvedGradeNames[gradeKey]);
        const imageUrl = baselineColour ? libraryColours[baselineColour]?.[gradeCode] : null;
        return { gradeKey, gradeLabel, colourId: baselineColour, themeId: baselineTheme, imageUrl };
      })
      .filter((entry) => entry.colourId && entry.themeId);
  }, [getClientBaseline, isGradeEnabled, libraryColours, resolvedGradeNames]);

  const hydrateSelectionsFromServer = useCallback(async () => {
    const schoolId = school?.school_id;
    if (!schoolId) {
      setHasHydratedFromServer(true);
      return;
    }
    if (authLoading) {
      return;
    }
    if (fetchInFlightRef.current) {
      return;
    }

    // Prime from cache to keep summary visible on refresh even if request is delayed
    if (summaryCacheKey && Object.keys(fetchedGrades.client || {}).length === 0) {
      try {
        const cached = JSON.parse(sessionStorage.getItem(summaryCacheKey) || '{}');
        if (cached && cached.client) {
          setFetchedGrades((prev) => ({ ...prev, client: cached.client }));
          setClientGrades((prev) => ({ ...cached.client, ...prev }));
        }
      } catch (err) {
        // ignore cache errors
      }
    }

    const baselineUpdates = {};

    let attempted = false;

    fetchInFlightRef.current = true;
    try {
      const token = await getIdToken?.();
      if (!token) {
        // wait for auth to resolve; do not mark hydrated yet
        fetchInFlightRef.current = false;
        return;
      }
      attempted = true;
      const headers = { Authorization: `Bearer ${token}` };
      const response = await axios.get(`${API_BASE_URL}/cover-selections/${schoolId}`, {
        headers,
        validateStatus: () => true,
      });
      if (response.status >= 400) {
        return;
      }
      const clientGrades = response.data?.client_grades || response.data?.grades || {};
      const rawStatus = response.data?.status;
      const rootStatus = (rawStatus ?? '').toString().trim();
      const library = response.data?.library;
      const loadedColours = {};
      let loadedThemeId = selectedThemeId;
      let loadedColourId = selectedColourId;
      let loadedFinished = isFinished;
      let loadedUpdatedAt = lastSavedAt;
      let loadedWorkflowStatus = rootStatus || workflowStatus;

      if (library) {
        const normalizedLibrary = normalizeLibraryPayload(library);
        const mapped = mapLibraryToThemes(normalizedLibrary);
        setThemes(mapped);
        setLibraryColours(normalizedLibrary.colours || {});
        if (!loadedThemeId && mapped.length) {
          loadedThemeId = mapped[0].id;
        }
      }

      Object.entries(clientGrades).forEach(([gradeKey, entry]) => {
        const normalizedGrade = gradeKey.toString().toLowerCase();
        const baselineTheme = normalizeThemeId(
          baselineByGrade?.[normalizedGrade]?.theme ||
            entry?.theme ||
            entry?.theme_id
        );
        const baselineColour = normalizeColourId(
          baselineByGrade?.[normalizedGrade]?.colour ||
            entry?.client_colour_png ||
            entry?.client_colour ||
            entry?.client_colour_id ||
            entry?.colour_id
        );
        if (baselineTheme && !baselineByGrade?.[normalizedGrade]) {
          baselineUpdates[normalizedGrade] = { theme: baselineTheme, colour: baselineColour };
        }
        if (baselineColour) {
          loadedColours[normalizedGrade] = baselineColour;
        }
        if (normalizedGrade === grade) {
          if (baselineTheme) {
            loadedThemeId = baselineTheme;
          }
          if (baselineColour) {
            loadedColourId = baselineColour;
          }
        }
        if (normalizedGrade === grade && entry?.status && !rootStatus) {
          const statusStr = entry.status?.toString() || '1';
          loadedWorkflowStatus = statusStr;
          loadedFinished = statusStr !== '1';
        }
        if (entry?.updated_at) {
          loadedUpdatedAt = entry.updated_at;
        }
      });

      setFetchedGrades({ client: clientGrades });
      setClientGrades(clientGrades);
      setServerVersion((prev) => prev + 1);
      setHasStatusDoc(rawStatus !== undefined && rawStatus !== null && rawStatus !== '');
      if (Object.keys(baselineUpdates).length > 0) {
        setBaselineByGrade((prev) => ({ ...prev, ...baselineUpdates }));
      }
      setSelectedColoursByGrade((prev) => ({ ...loadedColours, ...prev }));
      setPngAssignments({});
      // Do not auto-select theme/colour; admin can pick freely
      const nextStatus = rootStatus || loadedWorkflowStatus || '1';
      setWorkflowStatus(nextStatus);
      setIsFinished(nextStatus !== '1' ? true : loadedFinished);
      if (rootStatusCacheKey) {
        try {
          sessionStorage.setItem(rootStatusCacheKey, nextStatus);
        } catch (err) {
          // ignore cache errors
        }
      }
      setLastSavedAt(loadedUpdatedAt);

      // Cache summary for refresh resilience
      if (summaryCacheKey) {
        try {
          sessionStorage.setItem(
            summaryCacheKey,
            JSON.stringify({ client: clientGrades })
          );
        } catch (err) {
          // ignore cache errors
        }
      }
    } catch (error) {
      console.warn('Unable to load saved cover selections', error);
    } finally {
      fetchInFlightRef.current = false;
      if (attempted) {
        setHasHydratedFromServer(true);
      }
    }
  }, [
    API_BASE_URL,
    grade,
    getIdToken,
    authLoading,
    isFinished,
    lastSavedAt,
    school?.school_id,
    selectedColourId,
    selectedThemeId,
    isAdmin,
  ]);
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
        const normalizedStoredColour = normalizeColourId(stored.selectedColourId);
        if (normalizedStoredColour) {
          loadedColours[gradeKey] = normalizedStoredColour;
        }
      }
      if (gradeKey === grade && stored) {
        activeThemeId = stored.selectedThemeId || '';
        activeColour = normalizeColourId(stored.selectedColourId) || '';
        activeFinished = stored.status && stored.status !== '1';
        activeUpdatedAt = stored.updatedAt || null;
      }
    });

    setSelectedColoursByGrade(loadedColours);
    // Do not auto-select a theme when switching grades; wait for fresh data.
    setPngAssignments({});
    setSelectedThemeId('');
    setSelectedColourId('');
    setIsFinished(activeFinished);
    setLastSavedAt(activeUpdatedAt);
  }, [grade, school?.school_id]);

  useEffect(() => {
    const schoolId = school?.school_id;
    if (!schoolId) {
      return;
    }

    if (!hasHydratedFromServer && !authLoading) {
      void hydrateSelectionsFromServer();
    }
  }, [hasHydratedFromServer, school?.school_id, hydrateSelectionsFromServer, authLoading]);

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
        status: workflowStatus,
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
        status: workflowStatus,
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
    workflowStatus,
  ]);

  const persistStatus = useCallback(
    async (nextStatus, { force = false, suppressToast = false } = {}) => {
      if (effectiveReadOnly && !force) return false;
      const previousStatus = workflowStatus;
      setWorkflowStatus(nextStatus);
      const schoolId = school?.school_id;
      if (!schoolId) {
        toast.error('Missing school id.');
        setWorkflowStatus(previousStatus);
        return false;
      }

      const hasAssignments = Object.keys(pngAssignments || {}).length > 0;
      const statusMethod = hasStatusDoc ? 'patch' : 'post';

      try {
        const token = await getIdToken?.();
        const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
        if (hasAssignments && selectedThemeId) {
          // Save assignments (upsert) for each grade via POST
          const assignedEntries = Object.values(pngAssignments || {})
            .filter((entry) => entry?.gradeKey && entry?.src)
            .map((entry) => {
              const pngName = entry.src ? entry.src.split('/').pop() || '' : '';
              const pngId = normalizeColourId(pngName.replace(/\.(png|webp|jpg|jpeg)$/i, '')) || entry.colourId;
              return { ...entry, colourId: pngId };
            });
          if (!assignedEntries.length) {
            toast.error('Pick a theme and colour before saving.');
            setWorkflowStatus(previousStatus);
            return false;
          }
          const themeLabel = selectedTheme?.label;
          const tasks = assignedEntries.map(({ gradeKey, colourId }) =>
            axios.post(
              `${API_BASE_URL}/cover-selections`,
              {
                school_id: schoolId,
                grade: normalizeGradeKey(gradeKey),
                theme_id: selectedThemeId,
                theme_label: themeLabel,
                colour_id: colourId,
                colour_label: colourOptions.find((c) => c.id === colourId)?.label || null,
                is_selected: true,
              },
              { headers }
            )
          );
          await Promise.all(tasks);
        }

        // Status lives separately; POST for first write, PATCH thereafter.
        await axios[statusMethod](`${API_BASE_URL}/cover-status/${schoolId}`, { status: nextStatus }, { headers });
        setHasStatusDoc(true);

        setWorkflowStatus(nextStatus);
        setIsFinished(nextStatus !== '1');
        const timestamp = Date.now();
        setLastSavedAt(timestamp);
        saveCoverWorkflowState(schoolId, grade, {
          selectedThemeId: selectedThemeId || '',
          selectedColourId: selectedColourId || '',
          status: nextStatus,
          updatedAt: timestamp,
          selectedThemeLabel: selectedTheme?.label || '',
          selectedColourLabel: selectedColour?.label || '',
        });
        // Do not mutate grade docs on status-only updates
        setFetchedGrades((prev) => ({ ...(prev || {}) }));
        // Clear local selections and reload fresh data to avoid auto-selecting the previous theme on grade switches.
        setSelectedThemeId('');
        setSelectedColourId('');
        setPngAssignments({});
        setHasHydratedFromServer(false);
        void hydrateSelectionsFromServer();
        if (!suppressToast) {
          toast.success(nextStatus === '4' ? 'Covers approved.' : 'Status updated');
        }
        return true;
      } catch (error) {
        console.warn('Unable to persist cover selections', error);
        toast.error('Could not save cover selection/status');
        setWorkflowStatus(previousStatus);
        return false;
      }
    },
    [
      API_BASE_URL,
      colourOptions,
      effectiveReadOnly,
      grade,
      hasStatusDoc,
      school?.school_id,
      selectedTheme?.label,
      selectedThemeId,
      selectedColourId,
      pngAssignments,
      getIdToken,
      fetchedGrades.client,
      isAdmin,
      workflowStatus,
    ]
  );

  const handleFinishSave = async () => {
    // status 2 = preparing after selections
    const ok = await persistStatus('2', { suppressToast: true });
    if (ok) {
      toast.success('Cover page selections are successfully saved to DB.');
      setSelectedThemeId('');
      setSelectedColourId('');
      setPngAssignments({});
      setHasHydratedFromServer(false);
      // Refresh data then update cache inside hydrate
      void hydrateSelectionsFromServer();
    }
  };

  const handleThemeSelect = (themeId) => {
    if (effectiveReadOnly) {
      return;
    }
    setSelectedThemeId(themeId);
    setSelectedColourId('');
    setSelectedColoursByGrade((prev) => ({ ...prev, [grade]: '' }));
    setPngAssignments({});
    setIsFinished(false);
    if (colourSectionRef.current) {
      // Smooth scroll to colour section after DOM updates
      setTimeout(() => {
        colourSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 0);
    }
  };

  const handleAssignPng = (gradeKey, colourId, pngSrc) => {
    if (effectiveReadOnly || !gradeKey || !colourId || !pngSrc) return;
    const normalizedColourId = normalizeColourId(colourId);
    const key = `${normalizedColourId}:${pngSrc}`;
    setPngAssignments((prev) => {
      const next = { ...prev };
      // ensure one PNG per grade
      Object.entries(next).forEach(([entryKey, entry]) => {
        if (entry?.gradeKey === gradeKey) {
          delete next[entryKey];
        }
      });
      next[key] = { gradeKey, colourId: normalizedColourId, src: pngSrc };
      return next;
    });
    setSelectedColoursByGrade((current) => ({ ...current, [gradeKey]: normalizedColourId }));
    if (gradeKey === grade) {
      setSelectedColourId(normalizedColourId);
    }
    setIsFinished(false);
  };

  const handleFinish = () => {
    void handleFinishSave();
  };

  const handleRemoveGradeSelection = useCallback(
    async (gradeKey) => {
      const schoolId = school?.school_id;
      const normalizedGrade = normalizeGradeKey(gradeKey);
      if (!isAdmin) {
        toast.error('Only admins can remove cover selections.');
        return;
      }
      if (!schoolId || !normalizedGrade) {
        toast.error('Missing school or grade.');
        return;
      }

      try {
        const token = await getIdToken?.();
        const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
        await axios.delete(`${API_BASE_URL}/cover-selections/${schoolId}/${normalizedGrade}`, { headers });

        setFetchedGrades((prev) => {
          const nextClient = { ...(prev?.client || {}) };
          delete nextClient[normalizedGrade];
          return { ...prev, client: nextClient };
        });
        setClientGrades((prev) => {
          const next = { ...(prev || {}) };
          delete next[normalizedGrade];
          return next;
        });
        setBaselineByGrade((prev) => {
          const next = { ...(prev || {}) };
          delete next[normalizedGrade];
          return next;
        });
        setSelectedColoursByGrade((prev) => {
          const next = { ...(prev || {}) };
          delete next[normalizedGrade];
          return next;
        });
        setPngAssignments((prev) => {
          const next = { ...(prev || {}) };
          Object.entries(next).forEach(([key, entry]) => {
            if (entry?.gradeKey === normalizedGrade) {
              delete next[key];
            }
          });
          return next;
        });

        if (grade === normalizedGrade) {
          setSelectedThemeId('');
          setSelectedColourId('');
        }

        if (summaryCacheKey) {
          try {
            const cached = JSON.parse(sessionStorage.getItem(summaryCacheKey) || '{}');
            if (cached?.client) {
              delete cached.client[normalizedGrade];
              sessionStorage.setItem(summaryCacheKey, JSON.stringify(cached));
            }
          } catch (err) {
            // ignore cache parse errors
          }
        }

        toast.success(`Removed ${resolveGradeLabel(normalizedGrade, resolvedGradeNames[normalizedGrade])} selection.`);
      } catch (error) {
        console.warn('Unable to delete cover selection', error);
        toast.error('Unable to remove this grade selection.');
      }
    },
    [
      API_BASE_URL,
      grade,
      isAdmin,
      getIdToken,
      normalizeGradeKey,
      resolveGradeLabel,
      resolvedGradeNames,
      school?.school_id,
      summaryCacheKey,
    ]
  );

  const renderApprovalGallery = (readonly = false) => {
    if (approvalLoading) {
      return (
        <div className="rounded-lg border border-dashed border-slate-200 bg-white/70 p-4 text-sm text-slate-600">
          Loading uploaded covers...
        </div>
      );
    }
    if (approvalError) {
      return (
        <div className="rounded-lg border border-dashed border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
          {approvalError}
        </div>
      );
    }
    if (!approvalCovers.length) {
      return (
        <div className="rounded-lg border border-dashed border-slate-200 bg-white/70 p-4 text-sm text-slate-600">
          No uploaded covers found for this school yet.
        </div>
      );
    }
    // Group covers by grade for clarity
    const grouped = approvalCovers.reduce((acc, item) => {
      const gradeKey = (item.gradeLabel || 'Unknown').toString().trim() || 'Unknown';
      if (!acc[gradeKey]) acc[gradeKey] = [];
      acc[gradeKey].push(item);
      return acc;
    }, {});

    return (
      <div className="space-y-4">
        {Object.entries(grouped).map(([gradeLabel, items]) => (
          <div key={gradeLabel} className="space-y-2">
            <div className="text-sm font-semibold text-slate-800 flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-xs uppercase tracking-wide">{gradeLabel}</span>
              <span className="text-xs text-slate-500">({items.length} cover{items.length !== 1 ? 's' : ''})</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {items.map((item) => {
                const component = (item.component || '').toString().trim().toLowerCase();
                const subject = (item.subject || '').toString().trim().toLowerCase();
                const coreTitle = item.core_cover_title && item.core_cover_title.toString().trim();
                const workTitle = item.work_cover_title && item.work_cover_title.toString().trim();
                const addonTitle = item.addon_cover_title && item.addon_cover_title.toString().trim();
                const displayTitle = (() => {
                  if (component === 'work' && workTitle) return workTitle;
                  if ((component === 'core' || subject === 'assessment') && coreTitle) return coreTitle;
                  if (workTitle) return workTitle;
                  if (coreTitle) return coreTitle;
                  if (addonTitle) return addonTitle;
                  if (item.title && item.title.toString().trim()) return item.title.toString().trim();
                  return item.name ? item.name.replace(/\.[^.]+$/, '') : 'Cover';
                })();
                const imageUrl = item.uploadedUrl || item.url;
                return (
                <div key={`${gradeLabel}-${item.name}`} className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
                  <div
                    className="bg-slate-50 flex items-center justify-center"
                    style={{ aspectRatio: '8 / 11', minHeight: '240px', maxHeight: '420px' }}
                  >
                    <img
                      src={imageUrl}
                      alt={displayTitle}
                      className="h-full w-full object-contain"
                      width={1000}
                      height={1400}
                      style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                      onError={(e) => {
                        e.currentTarget.style.opacity = '0.3';
                      }}
                    />
                  </div>
                  <div className="flex items-center justify-between px-3 py-2 text-xs text-slate-600">
                    <div className="flex flex-col min-w-0">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-indigo-700 truncate">
                        {gradeLabel}
                      </span>
                      <span className="font-semibold text-slate-800 truncate">{displayTitle}</span>
                    </div>
                    {imageUrl ? (
                      <button
                        type="button"
                        className="text-indigo-600 border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded text-[11px] font-semibold"
                        onClick={() => window.open(imageUrl, '_blank', 'noopener')}
                      >
                        Zoom
                      </button>
                    ) : null}
                  </div>
                </div>
              )})}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const extractCoverNamesFromSelections = useCallback((classes) => {
    const names = new Set();
    (classes || []).forEach((cls) => {
      const items = Array.isArray(cls?.items) ? cls.items : [];
      items.forEach((item) => {
        ['core_cover', 'work_cover', 'addon_cover'].forEach((key) => {
          const value = (item && item[key]) || '';
          if (typeof value === 'string' && value.trim()) {
            names.add(value.trim());
          }
        });
      });
    });
    return Array.from(names);
  }, []);

  const fetchApprovalAssets = useCallback(async () => {
    if (!school?.school_id) {
      return;
    }
    setApprovalLoading(true);
    setApprovalError('');
    try {
      const token = await getIdToken?.();
      const headers = token ? { Authorization: `Bearer ${token}` } : undefined;

      // Fetch cover uploads (includes class labels from server-side mapping).
      const uploadsRes = await axios.get(`${API_BASE_URL}/cover-uploads/${school.school_id}`, {
        headers,
        validateStatus: () => true
      });
      if (uploadsRes.status >= 400) {
        setApprovalCovers([]);
        setApprovalError('Unable to load uploaded covers. Please try again.');
        return;
      }

      const files = Array.isArray(uploadsRes.data?.files) ? uploadsRes.data.files : [];
      const missing = Array.isArray(uploadsRes.data?.missing) ? uploadsRes.data.missing : [];
      const gallery = [
        ...files.map((f) => ({
          name: f.name,
          url: normalizeAssetUrl(f.url || `${API_BASE_URL}/cover-uploads/${school.school_id}/${encodeURIComponent(f.name)}`),
          exists: true,
          uploadedUrl: normalizeAssetUrl(f.url || `${API_BASE_URL}/cover-uploads/${school.school_id}/${encodeURIComponent(f.name)}`),
          gradeLabel: f.class_label || '',
          component: f.component,
          core_cover_title: f.core_cover_title,
          work_cover_title: f.work_cover_title,
          addon_cover_title: f.addon_cover_title,
          subject: f.subject,
          code: (f.code || f.name || '').toString().replace(/\.[^.]+$/, '').trim(),
        })),
        ...missing.map((entry) => {
          const code = typeof entry === 'string' ? entry : entry?.code;
          const classLabel = typeof entry === 'string' ? '' : entry?.class_label;
          return {
            name: `${code}.png`,
            url: normalizeAssetUrl(`/media/Assets/covers/${school.school_id}/${encodeURIComponent(code)}.png`),
            exists: false,
            uploadedUrl: null,
            gradeLabel: classLabel || '',
            component: entry?.component,
            core_cover_title: entry?.core_cover_title,
            work_cover_title: entry?.work_cover_title,
            addon_cover_title: entry?.addon_cover_title,
            subject: entry?.subject,
            code: (typeof code === 'string' ? code : '').toString().trim(),
          };
        }),
      ];

      setApprovalCovers(gallery);
      if (!gallery.length) {
        setApprovalError('No uploaded covers found for the current book selections.');
      }
    } catch (error) {
      console.warn('Unable to load cover approval assets', error);
      setApprovalCovers([]);
      setApprovalError('Unable to load uploaded covers. Please try again.');
    } finally {
      setApprovalLoading(false);
    }
  }, [API_BASE_URL, getIdToken, school?.school_id]);

  const refreshRootStatus = useCallback(async () => {
    const schoolId = school?.school_id;
    if (!schoolId) return;
    try {
      const token = await getIdToken?.();
      const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
      const response = await axios.get(`${API_BASE_URL}/cover-status/${schoolId}`, { headers, validateStatus: () => true });
      if (response.status >= 400) return;
      const nextStatus = (response.data?.status ?? '').toString().trim() || '1';
      setWorkflowStatus(nextStatus);
      setHasStatusDoc(true);
      if (rootStatusCacheKey) {
        try {
          sessionStorage.setItem(rootStatusCacheKey, nextStatus);
        } catch (err) {
          // ignore cache errors
        }
      }
    } catch (error) {
      // ignore; lightweight status refresh
    }
  }, [API_BASE_URL, getIdToken, rootStatusCacheKey, school?.school_id]);

  useEffect(() => {
    if (workflowStatus === '3' || workflowStatus === '4') {
      void fetchApprovalAssets();
      if (!isAdmin) {
        void refreshRootStatus();
      }
    }
  }, [fetchApprovalAssets, isAdmin, refreshRootStatus, workflowStatus]);

  const [clientApproved, setClientApproved] = useState(false);

  const handleClientApprove = useCallback(async () => {
    const schoolId = school?.school_id;
    if (!schoolId) {
      toast.error('Missing school id.');
      return;
    }
    try {
      const token = await getIdToken?.();
      const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
      const statusMethod = hasStatusDoc ? 'patch' : 'post';
      const response = await axios[statusMethod](`${API_BASE_URL}/cover-status/${schoolId}`, { status: '4' }, { headers });
      if (response.status >= 400) {
        throw new Error(`HTTP ${response.status}`);
      }
      setHasStatusDoc(true);
      setWorkflowStatus('4');
      setIsFinished(false); // approved view, not frozen
      setClientApproved(true);
      const timestamp = Date.now();
      setLastSavedAt(timestamp);
      saveCoverWorkflowState(schoolId, grade, {
        selectedThemeId: selectedThemeId || '',
        selectedColourId: selectedColourId || '',
        status: '4',
        updatedAt: timestamp,
        selectedThemeLabel: selectedTheme?.label || '',
        selectedColourLabel: selectedColour?.label || '',
      });
      toast.success('Order of cover selections is approved.');
    } catch (error) {
      console.warn('Unable to approve covers', error);
      toast.error('Could not approve covers.');
    }
  }, [API_BASE_URL, grade, getIdToken, hasStatusDoc, saveCoverWorkflowState, school?.school_id, selectedColourId, selectedTheme?.label, selectedThemeId]);

  const handleAdminStatusChange = (nextStatus) => {
    void persistStatus(nextStatus);
  };

  const completionDisabled =
    !selectedThemeId || effectiveReadOnly || Object.keys(pngAssignments).length === 0;

  const statusLabel = {
    '1': 'Explore cover pages',
    '2': 'Cover pages are being prepared',
    '3': 'View uploaded cover pages',
    '4': 'Selections are frozen',
    finished: 'Selections are frozen',
    'in-progress': 'Cover pages are being prepared'
  }[workflowStatus] || 'Explore cover pages';
  const approvedMessage =
    'Order of cover selections is approved and frozen. Please contact the admin for further changes.';

  const clientGradeEntries = useMemo(() => {
    const entries = [];
    Object.entries(fetchedGrades.client || {}).forEach(([gradeKey, entry]) => {
      const label = resolveGradeLabel(gradeKey, resolvedGradeNames[gradeKey]);
      const baselineTheme =
        baselineByGrade?.[gradeKey]?.theme ||
        entry?.theme ||
        entry?.theme_id ||
        '';
      const baselineColour =
        baselineByGrade?.[gradeKey]?.colour ||
        entry?.client_colour_png ||
        entry?.client_colour ||
        entry?.client_colour_id ||
        entry?.theme_colour ||
        entry?.colour_id ||
        '';
      const themeLabel = baselineTheme ? getThemeLabel(baselineTheme, entry?.theme_label) : '';
      const colourLabel = normalizeColourId(baselineColour) || '';
      if (baselineTheme && colourLabel) {
        entries.push({ gradeKey, label, themeLabel, colourLabel });
      }
    });
    return entries;
  }, [baselineByGrade, fetchedGrades.client, getThemeLabel, resolvedGradeNames]);

  useEffect(() => {
    if (!isAdmin) return;
    const { baselineTheme } = getClientBaseline(grade);
    const normalizedBaseline = normalizeThemeId(baselineTheme);
    if (!selectedThemeId || normalizeThemeId(selectedThemeId) !== normalizedBaseline) {
      return;
    }
    if (Object.keys(pngAssignments || {}).length === 0) {
      setPngAssignments(buildClientAssignmentsForTheme(selectedThemeId));
    }
  }, [buildClientAssignmentsForTheme, getClientBaseline, grade, isAdmin, pngAssignments, selectedThemeId]);

  // For non-admin users, show status-specific views when status > 1.
  if (!isAdmin && workflowStatus !== '1') {
    if (workflowStatus === '2') {
      return (
        <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-red-50 py-10 px-6">
          <div className="mx-auto max-w-4xl space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="text-sm font-medium text-orange-500">Cover pages workflow</p>
              <h1 className="text-2xl font-semibold text-slate-900">{school.school_name}</h1>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={onBackToMode} className="bg-white/80 hover:bg-white">
                <ChevronLeft className="mr-2 h-4 w-4" />
                Back to menu
              </Button>
            </div>
          </div>

            <Card className="border-none bg-white/80 shadow-lg">
              <CardContent className="p-6 space-y-3">
                <p className="text-lg font-semibold text-slate-900">Cover pages are being prepared</p>
                <p className="text-sm text-slate-600">
                  Cover pages are being prepared. Please wait while the team processes them.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-red-50 py-10 px-6">
        <div className="mx-auto max-w-4xl space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="text-sm font-medium text-orange-500">Cover pages workflow</p>
              <h1 className="text-2xl font-semibold text-slate-900">{school.school_name}</h1>
              {workflowStatus === '4' && (
                <p className="text-sm font-semibold text-indigo-700">{approvedMessage}</p>
              )}
              {workflowStatus === '2' && (
                <p className="text-sm font-semibold text-amber-700">Cover pages are being prepared. Please wait.</p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={onBackToMode} className="bg-white/80 hover:bg-white">
                <ChevronLeft className="mr-2 h-4 w-4" />
                Back to menu
              </Button>
            </div>
          </div>

          <Card className="border-none bg-white/80 shadow-md shadow-orange-100/50">
            <CardHeader className="pb-4">
              <CardTitle className="text-xl font-semibold text-slate-900">
                {workflowStatus === '4' ? 'View approved covers' : 'Uploaded cover pages'}
              </CardTitle>
              <p className="text-sm text-slate-600">
                {workflowStatus === '4'
                  ? 'Review the approved covers for this school.'
                  : 'Review the uploaded covers for this school.'}
              </p>
              {workflowStatus === '4' && (
                <p className="text-xs font-semibold text-indigo-700">{approvedMessage}</p>
              )}
            </CardHeader>
            <CardContent>{renderApprovalGallery(true)}</CardContent>
          </Card>

          {workflowStatus === '3' && (
            <div className="flex justify-end">
              <Button
                type="button"
                onClick={handleClientApprove}
                disabled={approvalLoading || clientApproved}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                {clientApproved ? 'Approved' : 'Approve covers'}
              </Button>
            </div>
          )}

          <Card className="border-none bg-white/80 shadow-lg">
            <CardContent className="px-4 py-3 space-y-3">
              <p className="text-lg font-semibold text-slate-900">{statusLabel}</p>
              <p className="text-sm text-slate-600">
                {workflowStatus === '2'
                  ? 'Cover pages are being prepared. Please wait while the team processes them.'
                  : workflowStatus === '3'
                  ? 'Cover pages are ready for viewing and approval.'
                  : 'Selections are frozen. Contact admin for changes.'}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-red-50 py-10 px-6">
      <div className="mx-auto max-w-7xl space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-2">
            <p className="text-sm font-medium text-orange-500">Cover pages workflow</p>
            <h1 className="text-3xl font-semibold text-slate-900">{school.school_name}</h1>
            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
              {isFinished && (
                <span className="inline-flex items-center gap-1 text-green-700">
                  <CheckCircle2 className="h-4 w-4" /> Finished
                </span>
              )}
              <span className="inline-flex items-center gap-1 text-indigo-700 font-semibold">
                Present status: {statusLabel}
              </span>
            </div>
            {workflowStatus === '2' && (
              <p className="text-sm font-semibold text-amber-700">Cover pages are being prepared. Please wait.</p>
            )}
          </div>
          <div className="flex flex-wrap justify-end gap-3">
            <Button variant="outline" onClick={onBackToMode} className="bg-white/80 hover:bg-white">
              <ChevronLeft className="mr-2 h-4 w-4" />
              Back to menu
            </Button>
            {isAdmin && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => handleAdminStatusChange('1')} className="text-slate-700 border-slate-200 hover:bg-slate-50">
                  Set status: Allow client re-edit (1)
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleAdminStatusChange('2')} className="text-amber-700 border-amber-200 hover:bg-amber-50">
                  Set status: Preparing (2)
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleAdminStatusChange('3')} className="text-indigo-700 border-indigo-200 hover:bg-indigo-50">
                  Set status: View pages (3)
                </Button>
              </div>
            )}
          </div>
        </div>

        <Card className="border-none bg-white/70 shadow-md shadow-orange-100/40">
          <CardContent className="flex flex-col gap-4 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-orange-500">Theme selection</p>
                <p className="text-base font-semibold text-slate-800">
                  {selectedTheme ? selectedTheme.label : 'Select one of the 16 themes to continue'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  {lastSavedAt ? `Last saved ${new Date(lastSavedAt).toLocaleString()}` : 'Selections are saved automatically'}
                </div>
              </div>
            </div>
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {clientGradeEntries.map((entry) => (
                  <div
                    key={entry.gradeKey}
                    className="group inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 shadow-sm hover:border-orange-300 hover:shadow transition"
                  >
                    <div className="flex flex-col leading-tight">
                      <span className="text-sm font-semibold text-slate-800">{entry.label}</span>
                      <span className="text-[11px] text-slate-500">
                        Theme: {entry.themeLabel || '-'} | Colour: {entry.colourLabel || '-'}
                      </span>
                    </div>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => handleRemoveGradeSelection(entry.gradeKey)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
                        aria-label={`Remove ${entry.label} selection`}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
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
                Loading themes
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
                      effectiveReadOnly ? 'cursor-not-allowed opacity-60' : ''
                    )}
                    aria-pressed={isSelected}
                    disabled={effectiveReadOnly}
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
              <div className="space-y-6" ref={colourSectionRef}>
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
                        effectiveReadOnly ? 'cursor-not-allowed opacity-60' : '',
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
                          thumbnails.map((thumb) => {
                            const selectKey = `${colour.id}:${thumb.src}`;
                            const assigned = !!pngAssignments[selectKey]?.gradeKey;
                            return (
                              <div
                                key={`${colour.id}-${thumb.gradeCode}`}
                                className="relative w-full overflow-hidden rounded-xl border bg-white border-slate-200"
                              >
                                <div className="flex items-center justify-between px-2 py-2 gap-2 relative">
                                  <select
                                    value={pngAssignments[selectKey]?.gradeKey || ''}
                                    onChange={(event) => {
                                      event.stopPropagation();
                                      handleAssignPng(event.target.value, colour.id, thumb.src);
                                    }}
                                    onFocus={() => setOpenSelectKey(selectKey)}
                                    onBlur={() => setOpenSelectKey((prev) => (prev === selectKey ? null : prev))}
                                    className={cn(
                                      "rounded border bg-white px-2 py-1 text-[11px] font-semibold focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-200 border-slate-300",
                                      !assigned && openSelectKey !== selectKey ? "text-red-700 animate-pulse" : "text-slate-700"
                                    )}
                                    disabled={effectiveReadOnly}
                                  >
                                    <option value="">Assign to grade</option>
                                    {Object.entries(GRADE_CODE_MAP)
                                      .filter(([gradeKey]) => isGradeEnabled(gradeKey))
                                      .map(([gradeKey]) => (
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
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-700">
                <div className="space-y-1">
                  <p className="font-semibold text-slate-800">
                    {workflowStatus === '1'
                      ? 'Select a theme and colour, then click Finish to save this grade.'
                      : workflowStatus === '2'
                      ? 'Cover pages are being prepared. You can adjust selections until an admin locks them.'
                      : workflowStatus === '3'
                      ? 'View the uploaded cover pages and approve when ready.'
                      : 'Selections are frozen. Contact admin for changes.'}
                  </p>
                  {effectiveReadOnly && <p className="text-xs text-slate-500">Viewing mode is enabled because selections are frozen.</p>}
                </div>
                {!isFinished && !effectiveReadOnly && (
                  <div className="flex gap-2">
                    <Button type="button" onClick={handleFinish} disabled={completionDisabled}>
                      Finish
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default CoverPageWorkflow;
