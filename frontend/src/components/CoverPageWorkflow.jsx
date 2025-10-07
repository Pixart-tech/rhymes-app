import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';

import { ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react';
import { API_BASE_URL } from '../lib/utils';
import InlineSvg from './InlineSvg';
import { loadCoverWorkflowState, saveCoverWorkflowState } from '../lib/storage';

const GRADE_LABELS = {
  nursery: 'Nursery',
  lkg: 'LKG',
  ukg: 'UKG',
  playgroup: 'Playgroup'
};

const THEME_OPTIONS = [
  {
    id: 'theme1',
    label: 'Theme 1',
    description: 'Soft introductory theme designed for playful, imaginative cover layouts.'
  },
  {
    id: 'theme2',
    label: 'Theme 2',
    description: 'Bold shapes and accents ideal for energetic class storytelling covers.'
  }
];

const COLOUR_OPTIONS = [
  { id: 'colour1', label: 'Colour 1', hex: '#eea0c6' },
  { id: 'colour2', label: 'Colour 2', hex: '#8faedb' },
  { id: 'colour3', label: 'Colour 3', hex: '#f9b475' },
  { id: 'colour4', label: 'Colour 4', hex: '#c8e9f1' }
];

const GRADE_DETAIL_FIELDS = [
  'email',
  'addressLine1',
  'addressLine2',
  'addressLine3',
  'tagLine1',
  'tagLine2',
  'tagLine3'
];

const createBlankPersonalisation = (defaults = {}, defaultGradeLabel = '') => ({
  schoolLogo: defaults.schoolLogo || '',
  gradeName: defaultGradeLabel || '',
  email: '',
  addressLine1: '',
  addressLine2: '',
  addressLine3: '',
  contactNumber: defaults.contactNumber || '',
  website: defaults.website || '',
  tagLine1: '',
  tagLine2: '',
  tagLine3: ''
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

const resolveCoverAssetsNetworkBaseUrl = () => {
  const explicitBase =
    process.env.REACT_APP_COVER_ASSETS_NETWORK_BASE_URL ||
    process.env.REACT_APP_COVER_ASSETS_BASE_URL;

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
  const schoolLogoFileName = coverDefaults?.schoolLogoFileName || '';

  const [currentStep, setCurrentStep] = useState(1);
  const [hasSubmittedDetails, setHasSubmittedDetails] = useState(false);

  const assetCacheRef = useRef(new Map());
  const svgPreviewRef = useRef(null);
  const svgCarouselRef = useRef(null);
  const coverAssetsNetworkBaseUrl = useMemo(resolveCoverAssetsNetworkBaseUrl, []);
  const previousGradeLabelRef = useRef(gradeLabel);
  const coverStateKeyRef = useRef('');
  const previousGradeDetailsRef = useRef('');


  useEffect(() => {
    setPersonalisation((current) => ({
      ...current,
      schoolLogo: coverDefaults?.schoolLogo || '',
      contactNumber: coverDefaults?.contactNumber || '',
      website: coverDefaults?.website || '',
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
    () => THEME_OPTIONS.find((theme) => theme.id === selectedThemeId) || null,
    [selectedThemeId]
  );

  const selectedColour = useMemo(
    () => COLOUR_OPTIONS.find((colour) => colour.id === selectedColourId) || null,
    [selectedColourId]
  );

  const resetPreviewState = useCallback(() => {
    setPreviewAssets([]);
    setAssetError('');
    setHasSubmittedDetails(false);
    setActiveIndex(0);
  }, []);

  const handleThemeSelect = useCallback(
    (themeId) => {
      setSelectedThemeId(themeId);
      resetPreviewState();
      setCurrentStep(1);
    },
    [resetPreviewState]
  );

  const handleColourSelect = useCallback(
    (colourId) => {
      setSelectedColourId(colourId);
      resetPreviewState();
      setCurrentStep(1);
    },
    [resetPreviewState]
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
      hasSubmittedDetails
    });
  }, [school?.school_id, grade, selectedThemeId, selectedColourId, personalisation, currentStep, hasSubmittedDetails]);

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

          sanitizedAssets.push({
            fileName,
            relativePath,
            svgMarkup,
            personalisedMarkup:
              typeof asset?.personalisedMarkup === 'string' ? asset.personalisedMarkup.trim() : ''
          });

          if (dedupeKey) {
            seenKeys.add(dedupeKey);
          }
        });
      }

      assetCacheRef.current.set(selectionKey, sanitizedAssets);
      return sanitizedAssets;
    },
    [coverAssetsNetworkBaseUrl]
  );

  const handlePreviewRequest = useCallback(async () => {
    if (!selectedTheme || !selectedColour) {
      return;
    }

    const selectionKey = buildSelectionKey(selectedTheme.id, selectedColour.id);
    if (!selectionKey) {
      setAssetError('Please choose a theme and colour before previewing.');
      return;
    }

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

  const isPersonalisationComplete = useMemo(() => {
    return Object.values(trimmedPersonalisation).every((value) => value.length > 0);
  }, [trimmedPersonalisation]);

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
  const canPreviewCovers = Boolean(selectedTheme && selectedColour && isPersonalisationComplete);

  const handleBackToSelection = useCallback(() => {
    resetPreviewState();
    setCurrentStep(1);
  }, [resetPreviewState]);

  const handleUpdateGradeDetails = useCallback(() => {
    resetPreviewState();
    setCurrentStep(1);
    if (typeof onBackToGrades === 'function') {
      onBackToGrades();
    }
  }, [onBackToGrades, resetPreviewState]);

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
    [trimmedPersonalisation]
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

  const commonDetailsSummaryCard = (
    <Card className="border-none bg-white/85 shadow-sm shadow-orange-100/60">
      <CardHeader className="space-y-2">
        <CardTitle className="text-xl font-semibold text-slate-900">Common cover details</CardTitle>
        <p className="text-sm text-slate-600">
          These details are shared across every grade. Update them from the grade selection screen whenever
          the school information changes.
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">School contact number</p>
            <p className="text-sm font-semibold text-slate-800">
              {trimmedPersonalisation.contactNumber || 'Not provided'}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Website</p>
            <p className="text-sm font-semibold text-slate-800">
              {trimmedPersonalisation.website || 'Not provided'}
            </p>
          </div>
          <div className="space-y-2 md:col-span-2 lg:col-span-1">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">School logo</p>
            {personalisation.schoolLogo ? (
              <div className="flex items-center gap-3 rounded-md border border-orange-100 bg-orange-50/60 p-3">
                <img
                  src={personalisation.schoolLogo}
                  alt="School logo"
                  className="h-16 w-16 rounded-md border border-white object-contain bg-white"
                />
                <div>
                  <p className="text-sm font-medium text-slate-800">
                    {schoolLogoFileName || 'Logo image'}
                  </p>
                  <p className="text-xs text-slate-500">
                    To update the logo, return to the grade selection screen.
                  </p>
                </div>
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-orange-200 bg-orange-50/40 p-4 text-sm text-slate-500">
                No logo uploaded yet. Return to the grade selection screen to add one.
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const gradeDetailsSummaryCard = (
    <Card className="border-none shadow-xl shadow-orange-100/60">
      <CardHeader className="space-y-2">
        <CardTitle className="text-xl font-semibold text-slate-900">Grade specific details</CardTitle>
        <p className="text-sm text-slate-600">
          These details were collected before selecting the grade. Visit the grade selection screen to make
          any updates.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="cover-personalisation-grid two-column">
          <div className="cover-form-field">
            <p className="text-sm font-medium text-slate-700">Grade name</p>
            <div className="rounded-md border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm font-semibold text-slate-800">
              {trimmedPersonalisation.gradeName || gradeLabel}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Grade labels come from the pre-grade form and default to the standard grade name.
            </p>
          </div>
          <div className="cover-form-field">
            <p className="text-sm font-medium text-slate-700">Email</p>
            <div className="rounded-md border border-slate-200 bg-white/80 px-3 py-2 text-sm font-medium text-slate-800">
              {trimmedPersonalisation.email || 'Not provided'}
            </div>
          </div>
          <div className="cover-form-field">
            <p className="text-sm font-medium text-slate-700">Address line 1</p>
            <div className="rounded-md border border-slate-200 bg-white/80 px-3 py-2 text-sm font-medium text-slate-800">
              {trimmedPersonalisation.addressLine1 || 'Not provided'}
            </div>
          </div>
          <div className="cover-form-field">
            <p className="text-sm font-medium text-slate-700">Address line 2</p>
            <div className="rounded-md border border-slate-200 bg-white/80 px-3 py-2 text-sm font-medium text-slate-800">
              {trimmedPersonalisation.addressLine2 || 'Not provided'}
            </div>
          </div>
          <div className="cover-form-field">
            <p className="text-sm font-medium text-slate-700">Address line 3</p>
            <div className="rounded-md border border-slate-200 bg-white/80 px-3 py-2 text-sm font-medium text-slate-800">
              {trimmedPersonalisation.addressLine3 || 'Not provided'}
            </div>
          </div>
          <div className="cover-form-field">
            <p className="text-sm font-medium text-slate-700">Tag line 1</p>
            <div className="rounded-md border border-slate-200 bg-white/80 px-3 py-2 text-sm font-medium text-slate-800">
              {trimmedPersonalisation.tagLine1 || 'Not provided'}
            </div>
          </div>
          <div className="cover-form-field">
            <p className="text-sm font-medium text-slate-700">Tag line 2</p>
            <div className="rounded-md border border-slate-200 bg-white/80 px-3 py-2 text-sm font-medium text-slate-800">
              {trimmedPersonalisation.tagLine2 || 'Not provided'}
            </div>
          </div>
          <div className="cover-form-field">
            <p className="text-sm font-medium text-slate-700">Tag line 3</p>
            <div className="rounded-md border border-slate-200 bg-white/80 px-3 py-2 text-sm font-medium text-slate-800">
              {trimmedPersonalisation.tagLine3 || 'Not provided'}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );


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
          {THEME_OPTIONS.map((theme) => {
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
        <CardTitle className="text-xl font-semibold text-slate-900">Choose a colour</CardTitle>
        <p className="text-sm text-slate-600">
          Every theme provides the same four colour families. Select a colour to load matching cover artwork.
        </p>
      </CardHeader>
      <CardContent>
        <div className="cover-colour-grid">
          {COLOUR_OPTIONS.map((colour) => {
            const isSelected = selectedColourId === colour.id;
            return (
              <button
                key={colour.id}
                type="button"
                onClick={() => handleColourSelect(colour.id)}
                className={`cover-colour-chip${isSelected ? ' is-active' : ''}`}
                style={{ backgroundColor: colour.hex }}
                aria-pressed={isSelected}
                aria-label={`${colour.label} ${colour.hex}`}
              >
                <span className="cover-colour-chip-label">{colour.label}</span>
                <span className="cover-colour-chip-hex">{colour.hex}</span>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>

    {commonDetailsSummaryCard}
    {gradeDetailsSummaryCard}

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
    {hasSubmittedDetails && (
      <Alert className="border-emerald-200 bg-emerald-50 text-emerald-800">
        <AlertTitle>Displaying preview</AlertTitle>
        <AlertDescription className="space-y-4">
          <p>Your personalised covers are ready. Use the carousel below to review each design.</p>
        </AlertDescription>
      </Alert>
    )}

    <Card className="border-none bg-white/80 shadow-sm shadow-orange-100/40">
      <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4 text-sm text-slate-600">
        <div className="flex flex-wrap items-center gap-3">
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
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={handleUpdateGradeDetails}>
            Update grade details
          </Button>
          <Button type="button" variant="outline" onClick={handleBackToSelection}>
            Change theme
          </Button>
        </div>
      </CardContent>
    </Card>

    {commonDetailsSummaryCard}
    {gradeDetailsSummaryCard}

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
