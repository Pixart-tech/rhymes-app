import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { Label } from './ui/label';
import { Input } from './ui/input';

import { ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react';
import { API_BASE_URL, cn } from '../lib/utils';
import InlineSvg from './InlineSvg';
import NetworkSvgImage from './NetworkSvgImage';
import { loadCoverWorkflowState, saveCoverWorkflowState } from '../lib/storage';
import { COVER_COLOUR_OPTIONS, COVER_THEME_OPTIONS } from '../theme';

const GRADE_LABELS = {
  nursery: 'Nursery',
  lkg: 'LKG',
  ukg: 'UKG',
  playgroup: 'Playgroup'
};

const createBlankPersonalisation = (defaults = {}, defaultGradeLabel = '') => ({
  schoolLogo: defaults.schoolLogo || '',
  gradeName: defaultGradeLabel || '',
  email: defaults.email || '',
  addressLine1: defaults.addressLine1 || '',
  addressLine2: defaults.addressLine2 || '',
  addressLine3: defaults.addressLine3 || '',
  contactNumber: defaults.contactNumber || '',
  website: defaults.website || '',
  tagLine1: defaults.tagLine1 || '',
  tagLine2: defaults.tagLine2 || '',
  tagLine3: defaults.tagLine3 || ''
});

const sanitiseGradeDetails = (details) => {
  if (!details || typeof details !== 'object') {
    return null;
  }

  const safe = {
    gradeName: '',
    email: '',
    addressLine1: '',
    addressLine2: '',
    addressLine3: '',
    tagLine1: '',
    tagLine2: '',
    tagLine3: ''
  };

  Object.keys(safe).forEach((key) => {
    const value = details[key];

    if (typeof value === 'string') {
      safe[key] = value;
      return;
    }

    if (value == null) {
      safe[key] = '';
      return;
    }

    safe[key] = value.toString();
  });

  return safe;
};

const normalizeToken = (value) =>
  (value ?? '')
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

const extractSelectionToken = (value) => {
  if (value == null) {
    return '';
  }

  const stringValue = value.toString();
  const numericMatches = stringValue.match(/\d+/g);

  if (numericMatches && numericMatches.length > 0) {
    return numericMatches.join('');
  }

  return normalizeToken(stringValue);
};

const buildSelectionKey = (themeId, colourId) => {
  const themeToken = extractSelectionToken(themeId);
  const colourToken = extractSelectionToken(colourId);

  if (!themeToken || !colourToken) {
    return '';
  }

  return `${themeToken}.${colourToken}`;

};
const joinUrl = (baseUrl, path) => {
  if (!baseUrl) {
    return path;
  }

  const trimmedBase = baseUrl.replace(/\/+$/, '');
  const trimmedPath = (path ?? '').replace(/^\/+/, '');
  return `${trimmedBase}/${trimmedPath}`;
};

const encodeRelativeCoverPath = (relativePath) => {
  if (!relativePath || typeof relativePath !== 'string') {
    return '';
  }

  return relativePath
    .replace(/^[\\/]+/, '')
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
};

const buildCoverAssetSvgUrl = (baseUrl, relativePath) => {
  const encodedPath = encodeRelativeCoverPath(relativePath);
  if (!encodedPath) {
    return '';
  }

  return joinUrl(baseUrl, encodedPath);
};

const resolveCoverAssetsNetworkBaseUrl = () => {
  // Prefer Vite env vars (import.meta.env). Fallback to API_BASE_URL network path.
  let explicitBase = '';
  try {
    explicitBase = import.meta?.env?.VITE_COVER_ASSETS_NETWORK_BASE_URL || import.meta?.env?.VITE_COVER_ASSETS_BASE_URL || '';
  } catch (err) {
    explicitBase = '';
  }

  if (explicitBase && explicitBase.trim()) {
    return explicitBase.trim();
  }

  return joinUrl(API_BASE_URL, 'cover-assets/network');
};

const resolveErrorMessage = (error) => {
  if (!error) {
    return 'An unexpected error occurred.';
  }

  if (typeof error === 'string') {
    return error;
  }

  if (error.response?.data?.detail) {
    return error.response.data.detail;
  }

  if (error.message) {
    return error.message;
  }

  return 'An unexpected error occurred.';
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

const CoverPageWorkflow = ({
  school,
  grade,
  customGradeName,
  onBackToGrades,
  onBackToMode,
  onLogout,
  coverDefaults,
  gradeDetails
}) => {
  const gradeLabel = resolveGradeLabel(grade, customGradeName);
  const resolvedGradeNames = useMemo(() => {
    const gradeNameSource = coverDefaults?.gradeNames || {};
    const identifiers = new Set([
      ...Object.keys(GRADE_LABELS),
      ...Object.keys(gradeNameSource || {})
    ]);

    if (grade) {
      identifiers.add(grade);
    }

    const result = {};
    identifiers.forEach((identifier) => {
      result[identifier] = resolveGradeLabel(identifier, gradeNameSource?.[identifier]);
    });

    return result;
  }, [coverDefaults?.gradeNames, grade]);
  const gradeDetailsSanitised = useMemo(() => {
    const sanitized = sanitiseGradeDetails(gradeDetails);
    if (!sanitized) {
      return null;
    }

    return {
      ...sanitized,
      gradeName: sanitized.gradeName.trim() || gradeLabel
    };
  }, [gradeDetails, gradeLabel]);
  const [selectedThemeId, setSelectedThemeId] = useState(null);
  const [selectedColourId, setSelectedColourId] = useState(null);

  const [isFetchingAssets, setIsFetchingAssets] = useState(false);
  const [previewAssets, setPreviewAssets] = useState([]);
  const [assetError, setAssetError] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [personalisation, setPersonalisation] = useState(() => ({
    ...createBlankPersonalisation(coverDefaults, gradeLabel),
    ...(gradeDetailsSanitised || {})
  }));

  const [currentStep, setCurrentStep] = useState(1);
  const [hasSubmittedDetails, setHasSubmittedDetails] = useState(false);
  const [isLoadingThemeThumbnails, setIsLoadingThemeThumbnails] = useState(false);
  const [themeThumbnails, setThemeThumbnails] = useState([]);
  const [themeThumbnailError, setThemeThumbnailError] = useState('');
  const [isLoadingColourThumbnails, setIsLoadingColourThumbnails] = useState(false);
  const [colourThumbnails, setColourThumbnails] = useState({});
  const [colourPreviewError, setColourPreviewError] = useState('');
  const [colourValidationError, setColourValidationError] = useState(false);
  const [subjectToCustomize, setSubjectToCustomize] = useState('');
  const autoPreviewRef = useRef(false);

  const assetCacheRef = useRef(new Map());
  const svgPreviewRef = useRef(null);
  const svgCarouselRef = useRef(null);
  const coverAssetsNetworkBaseUrl = useMemo(resolveCoverAssetsNetworkBaseUrl, []);
  const coverAssetsSvgBaseUrl = useMemo(() => joinUrl(API_BASE_URL, 'cover-assets/svg'), []);
  const previousGradeLabelRef = useRef(gradeLabel);
  const coverStateKeyRef = useRef('');
  const previousGradeDetailsRef = useRef('');


  useEffect(() => {
    setPersonalisation((current) => ({
      ...current,
      schoolLogo: coverDefaults?.schoolLogo || '',
      contactNumber: coverDefaults?.contactNumber || '',
      website: coverDefaults?.website || '',
      email: coverDefaults?.email || current.email,
      addressLine1: coverDefaults?.addressLine1 || current.addressLine1,
      addressLine2: coverDefaults?.addressLine2 || current.addressLine2,
      addressLine3: coverDefaults?.addressLine3 || current.addressLine3,
      tagLine1: coverDefaults?.tagLine1 || current.tagLine1,
      tagLine2: coverDefaults?.tagLine2 || current.tagLine2,
      tagLine3: coverDefaults?.tagLine3 || current.tagLine3,
      gradeName: (current.gradeName || '').trim() ? current.gradeName : gradeLabel
    }));
  }, [coverDefaults, gradeLabel]);


  useEffect(() => {
    const previousLabel = previousGradeLabelRef.current;
    previousGradeLabelRef.current = gradeLabel;

    if (!gradeLabel) {
      return;
    }

    setPersonalisation((current) => {
      const trimmed = (current.gradeName || '').trim();
      if (!trimmed) {
        return { ...current, gradeName: gradeLabel };
      }

      if (previousLabel && trimmed === previousLabel && trimmed !== gradeLabel) {
        return { ...current, gradeName: gradeLabel };
      }

      return current;
    });
  }, [gradeLabel]);

  useEffect(() => {
    const schoolId = school?.school_id;

    if (!schoolId || !grade) {
      coverStateKeyRef.current = '';
      previousGradeDetailsRef.current = '';
      assetCacheRef.current.clear();
      setSelectedThemeId(null);
      setSelectedColourId(null);
      setPersonalisation({
        ...createBlankPersonalisation(coverDefaults, gradeLabel),
        ...(gradeDetailsSanitised || {})
      });
      setSubjectToCustomize('');
      setCurrentStep(1);
      setHasSubmittedDetails(false);
      setPreviewAssets([]);
      setActiveIndex(0);
      setAssetError('');
      setIsFetchingAssets(false);
      return;
    }

    const key = `${schoolId}::${grade}`;
    const serializedDetails = gradeDetailsSanitised ? JSON.stringify(gradeDetailsSanitised) : '';
    const detailsChanged = previousGradeDetailsRef.current !== serializedDetails;

    if (coverStateKeyRef.current === key && !detailsChanged) {
      return;
    }

    coverStateKeyRef.current = key;
    previousGradeDetailsRef.current = serializedDetails;
    assetCacheRef.current.clear();

    const storedState = loadCoverWorkflowState(schoolId, grade);
    const basePersonalisation = createBlankPersonalisation(coverDefaults, gradeLabel);

    if (!storedState) {
      setSelectedThemeId(null);
      setSelectedColourId(null);
      setPersonalisation({
        ...basePersonalisation,
        ...(gradeDetailsSanitised || {})
      });
      setSubjectToCustomize('');
      setCurrentStep(1);
      setHasSubmittedDetails(false);
      setPreviewAssets([]);
      setActiveIndex(0);
      setAssetError('');
      setIsFetchingAssets(false);
      return;
    }

    setSelectedThemeId(storedState.selectedThemeId ?? null);
    setSelectedColourId(storedState.selectedColourId ?? null);
    setSubjectToCustomize(storedState.subjectToCustomize ?? '');
    const storedStep = Number.parseInt(storedState.currentStep ?? 1, 10);
    const normalizedStep = Number.isFinite(storedStep) ? Math.min(Math.max(storedStep, 1), 2) : 1;
    setCurrentStep(detailsChanged ? 1 : normalizedStep);
    setHasSubmittedDetails(detailsChanged ? false : Boolean(storedState.hasSubmittedDetails));
    setPreviewAssets([]);
    setActiveIndex(0);
    setAssetError('');
    setIsFetchingAssets(false);

    if (storedState.personalisation && typeof storedState.personalisation === 'object') {
      setPersonalisation({
        ...basePersonalisation,
        ...storedState.personalisation,
        ...(gradeDetailsSanitised || {})
      });
    } else {
      setPersonalisation({
        ...basePersonalisation,
        ...(gradeDetailsSanitised || {})
      });
    }
  }, [school?.school_id, grade, coverDefaults, gradeLabel, gradeDetailsSanitised]);

  const selectedTheme = useMemo(
    () => COVER_THEME_OPTIONS.find((theme) => theme.id === selectedThemeId) || null,
    [selectedThemeId]
  );

  const selectedColour = useMemo(
    () => COVER_COLOUR_OPTIONS.find((colour) => colour.id === selectedColourId) || null,
    [selectedColourId]
  );

  const resetPreviewState = useCallback((options = {}) => {
    const { preserveSubmission = false } = options;
    setPreviewAssets([]);
    setAssetError('');
    setActiveIndex(0);
    if (!preserveSubmission) {
      setHasSubmittedDetails(false);
    }
  }, []);

  const handleThemeSelect = useCallback(
    (themeId) => {
      setSelectedThemeId(themeId);
      setSelectedColourId(null);
      resetPreviewState();
      setThemeThumbnailError('');
      setColourPreviewError('');
      setColourValidationError(false);
      setCurrentStep(1);
    },
    [resetPreviewState]
  );

  const handleColourSelect = useCallback(
    (colourId) => {
      setSelectedColourId(colourId);
      resetPreviewState({ preserveSubmission: true });
      setColourValidationError(false);
      setColourPreviewError('');
      setAssetError('');
      if (currentStep === 2 && hasSubmittedDetails) {
        autoPreviewRef.current = true;
      }
      setCurrentStep((step) => (step === 2 ? 2 : 1));
    },
    [currentStep, hasSubmittedDetails, resetPreviewState]
  );

  const trimmedPersonalisation = useMemo(
    () => ({
      schoolLogo: personalisation.schoolLogo.trim(),
      gradeName: personalisation.gradeName.trim() || gradeLabel,
      email: personalisation.email.trim(),
      addressLine1: personalisation.addressLine1.trim(),
      addressLine2: personalisation.addressLine2.trim(),
      addressLine3: personalisation.addressLine3.trim(),
      contactNumber: personalisation.contactNumber.trim(),
      website: personalisation.website.trim(),
      tagLine1: personalisation.tagLine1.trim(),
      tagLine2: personalisation.tagLine2.trim(),
      tagLine3: personalisation.tagLine3.trim()
    }),
    [personalisation, gradeLabel]
  );

  useEffect(() => {
    const schoolId = school?.school_id;
    if (!schoolId || !grade) {
      return;
    }

    saveCoverWorkflowState(schoolId, grade, {
      selectedThemeId,
      selectedColourId,
      personalisation,
      currentStep,
      hasSubmittedDetails,
      subjectToCustomize
    });
  }, [
    school?.school_id,
    grade,
    selectedThemeId,
    selectedColourId,
    personalisation,
    currentStep,
    hasSubmittedDetails,
    subjectToCustomize
  ]);

  const fetchCoverAssets = useCallback(
    async (selectionKey) => {
      if (!selectionKey) {
        throw new Error('Invalid cover asset requested.');
      }

      if (assetCacheRef.current.has(selectionKey)) {
        return assetCacheRef.current.get(selectionKey);
      }

      const requestUrl = joinUrl(
        coverAssetsNetworkBaseUrl,
        encodeURIComponent(selectionKey)
      );
      console.log('Fetching cover assets from:', requestUrl);
      const response = await axios.get(requestUrl);
      console.log(response)
      
      const rawAssets = response?.data?.assets;

      const sanitizedAssets = [];
      if (Array.isArray(rawAssets)) {
        const seenKeys = new Set();

        rawAssets.forEach((asset, index) => {
          const rawMarkup = typeof asset?.svgMarkup === 'string' ? asset.svgMarkup : '';
          const svgMarkup = rawMarkup.trim();
          if (!svgMarkup) {
            return;
          }

          const relativePath =
            typeof asset?.relativePath === 'string' && asset.relativePath.trim()
              ? asset.relativePath.trim()
              : '';

          const dedupeKey = relativePath || svgMarkup;
          if (dedupeKey && seenKeys.has(dedupeKey)) {
            return;
          }

          const fileName =
            typeof asset?.fileName === 'string' && asset.fileName.trim()
              ? asset.fileName.trim()
              : `Cover-${selectionKey}-${index + 1}.svg`;

          const svgUrl = buildCoverAssetSvgUrl(coverAssetsSvgBaseUrl, relativePath);

          sanitizedAssets.push({
            fileName,
            relativePath,
            svgMarkup,
            personalisedMarkup:
              typeof asset?.personalisedMarkup === 'string' ? asset.personalisedMarkup.trim() : '',
            svgUrl
          });

          if (dedupeKey) {
            seenKeys.add(dedupeKey);
          }
        });
      }

      assetCacheRef.current.set(selectionKey, sanitizedAssets);
      return sanitizedAssets;
    },
    [coverAssetsNetworkBaseUrl, coverAssetsSvgBaseUrl]
  );

  const handlePreviewRequest = useCallback(async () => {
    if (!selectedTheme || !selectedColour) {
      setColourValidationError(true);
      return;
    }

    const selectionKey = buildSelectionKey(selectedTheme.id, selectedColour.id);
    if (!selectionKey) {
      setAssetError('Please choose a theme and colour before previewing.');
      return;
    }

    autoPreviewRef.current = false;

    const detailsComplete = Object.values(trimmedPersonalisation).every(
      (value) => value.length > 0
    );
    if (!detailsComplete) {
      return;
    }

    setPreviewAssets([]);
    setActiveIndex(0);
    setHasSubmittedDetails(false);
    setCurrentStep(2);
    setIsFetchingAssets(true);
    setAssetError('');
    setColourValidationError(false);

    try {
      const assets = await fetchCoverAssets(selectionKey);

      if (!assets.length) {
        setPreviewAssets([]);
        setAssetError('No cover files found for this theme and colour combination yet.');
      } else {
        setPreviewAssets(assets);
        setActiveIndex(0);
        setHasSubmittedDetails(true);
      }
    } catch (error) {
      const message =
        error?.response?.status === 404
          ? 'No cover files found for this theme and colour combination yet.'
          : resolveErrorMessage(error);
      setPreviewAssets([]);
      setAssetError(message);
    } finally {
      setIsFetchingAssets(false);
    }
  }, [fetchCoverAssets, selectedColour, selectedTheme, trimmedPersonalisation]);

  useEffect(() => {
    if (!selectedThemeId) {
      setThemeThumbnails([]);
      setThemeThumbnailError('');
      setIsLoadingThemeThumbnails(false);
      return;
    }

    let isMounted = true;
    if (!extractSelectionToken(selectedThemeId)) {
      setThemeThumbnails([]);
      setThemeThumbnailError('');
      return;
    }

    const defaultColourId = COVER_COLOUR_OPTIONS[0]?.id;
    if (!defaultColourId) {
      setThemeThumbnails([]);
      setThemeThumbnailError('');
      return;
    }

    const selectionKey = buildSelectionKey(selectedThemeId, defaultColourId);
    if (!selectionKey) {
      setThemeThumbnails([]);
      setThemeThumbnailError('');
      return;
    }

    setIsLoadingThemeThumbnails(true);
    setThemeThumbnailError('');

    fetchCoverAssets(selectionKey)
      .then((assets) => {
        if (!isMounted) {
          return;
        }

        if (!assets.length) {
          setThemeThumbnails([]);
          setThemeThumbnailError('No theme artwork has been uploaded yet for this theme.');
          return;
        }

        setThemeThumbnails(assets);
      })
      .catch((error) => {
        if (!isMounted) {
          return;
        }
        setThemeThumbnails([]);
        setThemeThumbnailError(resolveErrorMessage(error));
      })
      .finally(() => {
        if (isMounted) {
          setIsLoadingThemeThumbnails(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [fetchCoverAssets, selectedThemeId]);

  useEffect(() => {
    if (!selectedThemeId) {
      setColourThumbnails({});
      setColourPreviewError('');
      setIsLoadingColourThumbnails(false);
      return;
    }

    let isMounted = true;
    const loadColourPreviews = async () => {
      setIsLoadingColourThumbnails(true);
      setColourPreviewError('');

      const results = await Promise.all(
        COVER_COLOUR_OPTIONS.map(async (colour) => {
          const selectionKey = buildSelectionKey(selectedThemeId, colour.id);
          if (!selectionKey) {
            return [colour.id, null];
          }

          try {
            const assets = await fetchCoverAssets(selectionKey);
            return [colour.id, assets[0] || null];
          } catch (error) {
            return [colour.id, null];
          }
        })
      );

      if (!isMounted) {
        return;
      }

      const mapped = results.reduce((accumulator, [colourId, asset]) => {
        accumulator[colourId] = asset;
        return accumulator;
      }, {});

      setColourThumbnails(mapped);

      const hasAnyPreview = results.some(([, asset]) => asset);
      if (!hasAnyPreview) {
        setColourPreviewError('No colour previews are available yet for this theme.');
      }

      setIsLoadingColourThumbnails(false);
    };

    loadColourPreviews().catch((error) => {
      if (!isMounted) {
        return;
      }
      setColourThumbnails({});
      setColourPreviewError(resolveErrorMessage(error));
      setIsLoadingColourThumbnails(false);
    });

    return () => {
      isMounted = false;
    };
  }, [fetchCoverAssets, selectedThemeId]);

  const isPersonalisationComplete = useMemo(() => {
    return Object.values(trimmedPersonalisation).every((value) => value.length > 0);
  }, [trimmedPersonalisation]);

  const canPreviewCovers = Boolean(selectedTheme && selectedColour && isPersonalisationComplete);

  useEffect(() => {
    if (!autoPreviewRef.current) {
      return;
    }

    if (!canPreviewCovers) {
      return;
    }

    autoPreviewRef.current = false;
    handlePreviewRequest();
  }, [canPreviewCovers, handlePreviewRequest, selectedColourId, selectedThemeId]);

  const previewCount = previewAssets.length;

  const handlePrev = useCallback(() => {
    setActiveIndex((current) => {
      if (previewCount === 0) {
        return 0;
      }

      return (current - 1 + previewCount) % previewCount;
    });
  }, [previewCount]);

  const handleNext = useCallback(() => {
    setActiveIndex((current) => {
      if (previewCount === 0) {
        return 0;
      }

      return (current + 1) % previewCount;
    });
  }, [previewCount]);

  useEffect(() => {
    if (activeIndex >= previewCount && previewCount > 0) {
      setActiveIndex(0);
      return;
    }

    if (previewCount === 0 && activeIndex !== 0) {
      setActiveIndex(0);
    }
  }, [activeIndex, previewCount]);

  const activeAsset = previewAssets[activeIndex] || null;

  const stepLabels = [
    'Select theme & colour',
    'Preview covers'
  ];
  const currentStepLabel = stepLabels[currentStep - 1] || stepLabels[0];

  const applySvgPersonalisation = useCallback(
    (container) => {
      if (!container) {
        return;
      }

      const svgElement = container.querySelector('svg');
      if (!svgElement) {
        return;
      }

      const updateGroupText = (groupId, value, textIndex = 0) => {
        const candidateIds = Array.isArray(groupId) ? groupId : [groupId];

        for (const candidate of candidateIds) {
          if (!candidate) {
            continue;
          }

          const group = svgElement.querySelector(`g#${candidate}`);
          if (!group) {
            continue;
          }

          const textNodes = group.querySelectorAll('text');
          if (!textNodes.length) {
            continue;
          }

          const safeIndex = Math.min(textIndex, textNodes.length - 1);
          textNodes[safeIndex].textContent = value || '';
          return true;
        }

        return false;
      };

      updateGroupText(['Grade', 'grade'], trimmedPersonalisation.gradeName);

      Object.entries(resolvedGradeNames).forEach(([gradeId, gradeValue]) => {
        if (!gradeValue) {
          return;
        }

        const baseId = gradeId.toString();
        const normalizedId = baseId.toLowerCase();
        const capitalizedId =
          normalizedId.charAt(0).toUpperCase() + normalizedId.slice(1);

        const candidateIds = Array.from(
          new Set([
            `${baseId}-grade`,
            `${baseId}_grade`,
            `${baseId}Grade`,
            `${normalizedId}-grade`,
            `${normalizedId}_grade`,
            `${normalizedId}Grade`,
            `${capitalizedId}-grade`,
            `${capitalizedId}_grade`,
            `${capitalizedId}Grade`
          ])
        );

        updateGroupText(candidateIds, gradeValue);
      });
      updateGroupText('Add_1', trimmedPersonalisation.addressLine1);
      updateGroupText('Add_2', trimmedPersonalisation.addressLine2);
      updateGroupText('Add_3', trimmedPersonalisation.addressLine3);
      updateGroupText('website', trimmedPersonalisation.website);
      updateGroupText('Tag_1', trimmedPersonalisation.tagLine1);
      updateGroupText('Tag_2', trimmedPersonalisation.tagLine2);
      updateGroupText('Tag_3', trimmedPersonalisation.tagLine3);
      updateGroupText('Contact__x2C__Email', trimmedPersonalisation.contactNumber, 0);

      const emailHandled =
        updateGroupText('Email', trimmedPersonalisation.email) ||
        (() => {
          const contactGroup = svgElement.querySelector('g#Contact__x2C__Email');
          if (!contactGroup) {
            return false;
          }

          const contactTextNodes = contactGroup.querySelectorAll('text');
          if (!contactTextNodes.length) {
            return false;
          }

          if (contactTextNodes.length > 1) {
            contactTextNodes[1].textContent = trimmedPersonalisation.email || '';
            return true;
          }

          const combined = [
            trimmedPersonalisation.contactNumber,
            trimmedPersonalisation.email
          ]
            .filter((token) => token)
            .join(' | ');

          contactTextNodes[0].textContent = combined;
          return true;
        })();

      if (!emailHandled) {
        updateGroupText('ContactEmail', trimmedPersonalisation.email);
      }

      const updateImageById = (identifier, value) => {
        if (!identifier) {
          return false;
        }

        let imageElement = svgElement.querySelector(`g#${identifier} image`);
        if (!imageElement) {
          imageElement = svgElement.querySelector(`image#${identifier}`);
        }
        if (!imageElement) {
          const fallback = svgElement.querySelector(`#${identifier}`);
          if (fallback?.tagName?.toLowerCase() === 'image') {
            imageElement = fallback;
          }
        }

        if (!imageElement) {
          return false;
        }

        if (value) {
          imageElement.setAttribute('href', value);
          imageElement.setAttribute('xlink:href', value);
        } else {
          imageElement.removeAttribute('href');
          imageElement.removeAttribute('xlink:href');
        }

        return true;
      };

      updateImageById('_Logo_1', trimmedPersonalisation.schoolLogo);
    },
    [resolvedGradeNames, trimmedPersonalisation]
  );

  useEffect(() => {
    const containers = [svgPreviewRef.current, svgCarouselRef.current].filter(Boolean);

    if (!containers.length) {
      return undefined;
    }

    if (typeof requestAnimationFrame !== 'function') {
      containers.forEach(applySvgPersonalisation);
      return undefined;
    }

    const frame = requestAnimationFrame(() => {
      containers.forEach(applySvgPersonalisation);
    });

    return () => {
      cancelAnimationFrame(frame);
    };
  }, [
    applySvgPersonalisation,
    activeAsset?.personalisedMarkup,
    activeAsset?.svgMarkup,
    activeIndex,
    currentStep,
    hasSubmittedDetails
  ]);


  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-red-50 py-10 px-6">
      <div className="mx-auto max-w-6xl space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-2">
            <p className="text-sm font-medium text-orange-500">Cover pages workflow</p>
            <h1 className="text-3xl font-semibold text-slate-900">{school.school_name}</h1>
            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
              <Badge variant="secondary">Grade: {gradeLabel}</Badge>
              <span>School ID: {school.school_id}</span>
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-3">
            <Button variant="outline" onClick={onBackToGrades} className="bg-white/80 hover:bg-white">
              Back to grades
            </Button>
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
              <p className="text-xs font-medium uppercase tracking-wide text-orange-500">
                Step {currentStep} of 2
              </p>
              <p className="text-base font-semibold text-slate-800">{currentStepLabel}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
              <div className="flex items-center gap-2">
                <span className="font-medium text-slate-700">Theme:</span>
                <span>{selectedTheme ? selectedTheme.label : 'Not selected'}</span>
              </div>
              <Separator orientation="vertical" className="hidden h-4 sm:block" />
              <div className="flex items-center gap-2">
                <span className="font-medium text-slate-700">Colour:</span>
                <span>{selectedColour ? selectedColour.label : 'Not selected'}</span>
              </div>
            </div>
          </CardContent>
        </Card>


        {currentStep === 1 && (
  <div className="space-y-6">
    <Card className="border-none shadow-xl shadow-orange-100/60">
      <CardHeader className="space-y-2">
        <CardTitle className="text-xl font-semibold text-slate-900">Select a theme</CardTitle>
        <p className="text-sm text-slate-600">
          Pick one of the available cover themes. Additional themes can be added later without
          changing this workflow.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="cover-theme-grid">
          {COVER_THEME_OPTIONS.map((theme) => {
            const isSelected = selectedThemeId === theme.id;
            return (
              <button
                key={theme.id}
                type="button"
                onClick={() => handleThemeSelect(theme.id)}
                className={`cover-theme-button${isSelected ? ' is-active' : ''}`}
              >
                <div>
                  <p className="text-base font-semibold text-slate-800">{theme.label}</p>
                  <p className="text-sm text-slate-500 leading-relaxed">{theme.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>

    <Card className="border-none shadow-xl shadow-orange-100/60">
      <CardHeader className="space-y-2">
        <CardTitle className="text-xl font-semibold text-slate-900">Theme artwork</CardTitle>
        <p className="text-sm text-slate-600">
          Browse the artwork that belongs to the selected theme. These are static previews to help visualise the style.
        </p>
      </CardHeader>
      <CardContent>
        {!selectedTheme && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 p-6 text-center">
            <p className="text-sm font-medium text-slate-600">Select a theme above to view its artwork.</p>
          </div>
        )}

        {selectedTheme && (
          <div className="space-y-4">
            {isLoadingThemeThumbnails && (
              <div className="flex items-center justify-center rounded-2xl border border-dashed border-orange-200 bg-white/70 p-6 text-sm font-medium text-orange-500">
                Loading theme artwork…
              </div>
            )}

            {!isLoadingThemeThumbnails && themeThumbnailError && (
              <div className="rounded-2xl border border-dashed border-orange-200 bg-orange-50 p-4 text-sm text-orange-600">
                {themeThumbnailError}
              </div>
            )}

            {!isLoadingThemeThumbnails && !themeThumbnailError && themeThumbnails.length > 0 && (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {themeThumbnails.map((asset, index) => (
                  <div
                    key={`${asset.fileName}-${index}`}
                    className="group rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm transition hover:-translate-y-1 hover:shadow-md"
                  >
                    <NetworkSvgImage
                      src={asset.svgUrl}
                      fallbackMarkup={asset.personalisedMarkup || asset.svgMarkup}
                      className="aspect-[3/4] w-full overflow-hidden rounded-xl bg-slate-50 shadow-inner"
                      svgClassName="h-full w-full"
                      ariaLabel={`${selectedTheme.label} theme artwork ${index + 1}`}
                      sanitize={false}
                    />
                    <p className="mt-3 text-sm font-medium text-slate-600">{asset.fileName}</p>
                  </div>
                ))}
              </div>
            )}

            {!isLoadingThemeThumbnails && !themeThumbnailError && themeThumbnails.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white/80 p-6 text-center text-sm text-slate-500">
                Theme artwork previews are not available for this theme yet.
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>

    <Card className="border-none shadow-xl shadow-orange-100/60">
      <CardHeader className="space-y-2">
        <CardTitle className="text-xl font-semibold text-slate-900">Choose a colour</CardTitle>
        <p className="text-sm text-slate-600">
          Every theme provides the same four colour families. Select a colour to load matching cover artwork.
        </p>
      </CardHeader>
      <CardContent>
        <div
          className={cn(
            'rounded-3xl border bg-white/80 p-4 shadow-sm transition',
            colourValidationError ? 'border-orange-400 ring-2 ring-orange-200' : 'border-slate-200'
          )}
        >
          {isLoadingColourThumbnails && (
            <div className="flex items-center justify-center rounded-2xl border border-dashed border-orange-200 bg-white/80 p-6 text-sm font-medium text-orange-500">
              Loading colour previews…
            </div>
          )}

          {!isLoadingColourThumbnails && colourPreviewError && (
            <div className="mb-4 rounded-2xl border border-dashed border-orange-200 bg-orange-50 p-4 text-sm text-orange-600">
              {colourPreviewError}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {COVER_COLOUR_OPTIONS.map((colour) => {
              const isSelected = selectedColourId === colour.id;
              const previewAsset = colourThumbnails[colour.id] || null;
              return (
                <button
                  key={colour.id}
                  type="button"
                  onClick={() => handleColourSelect(colour.id)}
                  className={cn(
                    'group flex h-full flex-col rounded-2xl border-2 border-transparent bg-white/90 p-3 text-left shadow transition hover:-translate-y-1 hover:shadow-lg focus:outline-none focus-visible:ring-4 focus-visible:ring-orange-300',
                    isSelected ? 'border-orange-500 shadow-lg ring-2 ring-orange-400' : ''
                  )}
                  aria-pressed={isSelected}
                  aria-label={`${colour.label} ${colour.hex}`}
                >
                  <div className="relative overflow-hidden rounded-xl bg-slate-50">
                    {previewAsset ? (
                      <NetworkSvgImage
                        src={previewAsset.svgUrl}
                        fallbackMarkup={previewAsset.personalisedMarkup || previewAsset.svgMarkup}
                        className="aspect-[3/4] w-full overflow-hidden"
                        svgClassName="h-full w-full"
                        ariaLabel={`${colour.label} preview`}
                        sanitize={false}
                      />
                    ) : (
                      <div
                        className="flex aspect-[3/4] w-full items-center justify-center rounded-xl bg-gradient-to-br from-white via-slate-50 to-slate-100 text-sm font-medium text-slate-400"
                        style={{ backgroundColor: colour.hex }}
                      >
                        {colour.label}
                      </div>
                    )}
                  </div>
                  <div className="mt-3 flex items-center justify-between text-sm font-medium text-slate-600">
                    <span>{colour.label}</span>
                    <span className="text-xs uppercase text-slate-400">{colour.hex}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {colourValidationError && (
            <p className="mt-3 text-sm font-medium text-orange-600">Please select a colour before previewing.</p>
          )}
        </div>
      </CardContent>
    </Card>

    <Card className="border-none shadow-xl shadow-orange-100/60">
      <CardHeader className="space-y-2">
        <CardTitle className="text-xl font-semibold text-slate-900">Subject to customise</CardTitle>
        <p className="text-sm text-slate-600">
          Let us know which subject you are preparing covers for. This helps tailor the creative direction for your
          selection.
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <Label htmlFor="cover-subject" className="text-sm font-medium text-slate-700">
            Subject name
          </Label>
          <Input
            id="cover-subject"
            type="text"
            placeholder="e.g. English, Mathematics"
            value={subjectToCustomize}
            onChange={(event) => setSubjectToCustomize(event.target.value)}
            className="bg-white/80"
          />
          <p className="text-xs text-slate-500">This field is optional and can be updated later.</p>
        </div>
      </CardContent>
    </Card>

    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-slate-600">
        Select a theme and colour, then preview the personalised covers for this grade.
      </p>
      <Button
        type="button"
        onClick={handlePreviewRequest}
        disabled={!canPreviewCovers || isFetchingAssets}
      >
        {isFetchingAssets ? 'Preparing preview…' : 'Preview covers'}
      </Button>
    </div>
  </div>
        )}

        {currentStep === 2 && (
  <div className="space-y-6">
    <Card className="border-none shadow-xl shadow-orange-100/60">
      <CardHeader className="space-y-2">
        <CardTitle className="text-xl font-semibold text-slate-900">Cover previews</CardTitle>
        <p className="text-sm text-slate-600">
          Browse the personalised artwork using the carousel controls below.
        </p>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
        {isFetchingAssets && (
          <div className="cover-carousel-stage">
            <div className="flex h-full w-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-orange-200 bg-white/75 p-6">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-orange-400 border-t-transparent"></div>
              <p className="text-sm font-medium text-orange-500">Loading cover preview...</p>
            </div>
          </div>
        )}

        {!isFetchingAssets && assetError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Unable to load covers</AlertTitle>
            <AlertDescription>{assetError}</AlertDescription>
          </Alert>
        )}

        {!isFetchingAssets && !assetError && previewCount === 0 && (
          <div className="cover-carousel-empty">
            <p className="text-sm text-slate-500">
              No cover artwork has been uploaded yet for this combination.
            </p>
          </div>
        )}

        {!isFetchingAssets && !assetError && previewCount > 0 && activeAsset && (
          <div className="space-y-4">
            <div className="cover-carousel-stage">
              <div className="cover-carousel-svg">
                <InlineSvg
                  markup={activeAsset.personalisedMarkup || activeAsset.svgMarkup}
                  className="cover-carousel-image"
                  ariaLabel={`Cover design ${activeIndex + 1}`}
                  sanitize={false}
                  ref={svgCarouselRef}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
              <span className="font-medium text-slate-700">{activeAsset.fileName}</span>
              {previewCount > 1 && (
                <div className="cover-carousel-controls">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={handlePrev}
                    className="bg-white"
                    aria-label="Previous cover"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </Button>
                  <span className="text-sm font-medium text-slate-700">
                    {activeIndex + 1} of {previewCount}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={handleNext}
                    className="bg-white"
                    aria-label="Next cover"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </Button>
                </div>
              )}
            </div>

            {previewCount > 1 && (
              <div className="cover-carousel-indicators">
                {previewAssets.map((asset, index) => (
                  <button
                    key={asset.relativePath || asset.fileName || index}
                    type="button"
                    onClick={() => setActiveIndex(index)}
                    className={`cover-carousel-indicator${index === activeIndex ? ' is-active' : ''}`}
                    aria-label={`Go to cover ${index + 1}`}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  </div>
        )}



      </div>
    </div>
  );
};

export default CoverPageWorkflow;