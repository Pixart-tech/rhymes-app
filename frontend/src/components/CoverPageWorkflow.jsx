import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { Skeleton } from './ui/skeleton';

import { Input } from './ui/input';
import { Label } from './ui/label';

import { ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react';
import { API_BASE_URL } from '../lib/utils';
import InlineSvg from './InlineSvg';

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

const CoverPageWorkflow = ({
  school,
  grade,
  onBackToGrades,
  onBackToMode,
  onLogout,
  coverDefaults
}) => {
  const [selectedThemeId, setSelectedThemeId] = useState(null);
  const [selectedColourId, setSelectedColourId] = useState(null);

  const [isFetchingAssets, setIsFetchingAssets] = useState(false);
  const [previewAssets, setPreviewAssets] = useState([]);
  const [assetError, setAssetError] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [personalisation, setPersonalisation] = useState({
    schoolLogo: coverDefaults?.schoolLogo || '',
    gradeName: '',
    kidName: coverDefaults?.kidName || '',
    email: '',
    addressLine1: '',
    addressLine2: '',
    addressLine3: '',
    contactNumber: coverDefaults?.contactNumber || '',
    website: coverDefaults?.website || '',
    tagLine1: '',
    tagLine2: '',
    tagLine3: '',
    kidPhoto: ''
  });
  const [gradeNameDirty, setGradeNameDirty] = useState(false);
  const [kidPhotoFileName, setKidPhotoFileName] = useState('');
  const schoolLogoFileName = coverDefaults?.schoolLogoFileName || '';

  const [currentStep, setCurrentStep] = useState(1);
  const [hasSubmittedDetails, setHasSubmittedDetails] = useState(false);

  const assetCacheRef = useRef(new Map());
  const svgPreviewRef = useRef(null);
  const svgCarouselRef = useRef(null);
  const kidPhotoInputRef = useRef(null);
  const coverAssetsNetworkBaseUrl = useMemo(resolveCoverAssetsNetworkBaseUrl, []);

  const gradeLabel = useMemo(() => {
    return GRADE_LABELS[grade] || grade?.toUpperCase() || 'Grade';
  }, [grade]);


  useEffect(() => {
    setPersonalisation((current) => ({
      ...current,
      schoolLogo: coverDefaults?.schoolLogo || '',
      kidName: coverDefaults?.kidName || '',
      contactNumber: coverDefaults?.contactNumber || '',
      website: coverDefaults?.website || ''
    }));
  }, [coverDefaults]);


  useEffect(() => {
    if (!gradeLabel) {
      return;
    }

    setPersonalisation((current) => {
      if (gradeNameDirty) {
        return current;
      }

      if (current.gradeName === gradeLabel) {
        return current;
      }

      return { ...current, gradeName: gradeLabel };
    });
  }, [gradeLabel, gradeNameDirty]);

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
      gradeName: personalisation.gradeName.trim(),
      
      email: personalisation.email.trim(),
      addressLine1: personalisation.addressLine1.trim(),
      addressLine2: personalisation.addressLine2.trim(),
      addressLine3: personalisation.addressLine3.trim(),
      contactNumber: personalisation.contactNumber.trim(),
      website: personalisation.website.trim(),
      tagLine1: personalisation.tagLine1.trim(),
      tagLine2: personalisation.tagLine2.trim(),
      tagLine3: personalisation.tagLine3.trim(),
      kidPhoto: personalisation.kidPhoto
    }),
    [personalisation]
  );

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

  const handlePreviewRequest = useCallback(
    async (event) => {
      event.preventDefault();

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
      setCurrentStep(3);
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
    },
    [fetchCoverAssets, selectedTheme, selectedColour, trimmedPersonalisation]
  );

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

  const handlePersonalisationChange = useCallback(
    (field) => (event) => {
      const value = event?.target?.value ?? '';
      setPersonalisation((current) => ({
        ...current,
        [field]: value
      }));

      if (field === 'gradeName') {
        setGradeNameDirty(true);
      }

      if (hasSubmittedDetails) {
        setHasSubmittedDetails(false);
      }
    },
    [hasSubmittedDetails]
  );

  const handleKidPhotoChange = useCallback(
    (event) => {
      const file = event?.target?.files?.[0];

      if (!file) {
        setKidPhotoFileName('');
        setPersonalisation((current) => ({
          ...current,
          kidPhoto: ''
        }));

        if (hasSubmittedDetails) {
          setHasSubmittedDetails(false);
        }

        return;
      }

      const reader = new FileReader();

      reader.onload = () => {
        const result = reader.result;
        const imageValue = typeof result === 'string' ? result : '';

        setPersonalisation((current) => ({
          ...current,
          kidPhoto: imageValue
        }));

        if (!imageValue) {
          setKidPhotoFileName('');
        }

        if (hasSubmittedDetails) {
          setHasSubmittedDetails(false);
        }

        if (kidPhotoInputRef.current) {
          kidPhotoInputRef.current.value = '';
        }
      };

      reader.onerror = () => {
        console.error('Unable to read kid photo file.');
        setKidPhotoFileName('');
        setPersonalisation((current) => ({
          ...current,
          kidPhoto: ''
        }));

        if (hasSubmittedDetails) {
          setHasSubmittedDetails(false);
        }

        if (kidPhotoInputRef.current) {
          kidPhotoInputRef.current.value = '';
        }
      };

      reader.readAsDataURL(file);
      setKidPhotoFileName(file.name);
    },
    [hasSubmittedDetails]
  );

  const handleKidPhotoClear = useCallback(() => {
    setKidPhotoFileName('');
    setPersonalisation((current) => ({
      ...current,
      kidPhoto: ''
    }));

    if (kidPhotoInputRef.current) {
      kidPhotoInputRef.current.value = '';
    }

    if (hasSubmittedDetails) {
      setHasSubmittedDetails(false);
    }
  }, [hasSubmittedDetails]);

  const activeAsset = previewAssets[activeIndex] || null;

  const canProceedToDetails = Boolean(selectedTheme && selectedColour);
  const canSubmitDetails = Boolean(isPersonalisationComplete && canProceedToDetails);

  const handleThemeContinue = useCallback(() => {
    if (!canProceedToDetails) {
      return;
    }

    setCurrentStep(2);
  }, [canProceedToDetails]);

  const handleBackToSelection = useCallback(() => {
    resetPreviewState();
    setCurrentStep(1);
  }, [resetPreviewState]);

  const handleEditDetails = useCallback(() => {
    setCurrentStep(2);
    setHasSubmittedDetails(false);
  }, []);

  const stepLabels = [
    'Select theme & colour',
    'Enter cover details',
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
        const group = svgElement.querySelector(`g#${groupId}`);
        if (!group) {
          return false;
        }

        const textNodes = group.querySelectorAll('text');
        if (!textNodes.length) {
          return false;
        }

        const safeIndex = Math.min(textIndex, textNodes.length - 1);
        textNodes[safeIndex].textContent = value || '';
        return true;
      };

      updateGroupText('Grade', trimmedPersonalisation.gradeName);
      
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
      updateImageById('kid_photo', trimmedPersonalisation.kidPhoto);
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
                Step {currentStep} of 3
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
                  Every theme provides the same four colour families. Select a colour to load matching
                  cover artwork.
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

            <div className="flex justify-end">
              <Button type="button" onClick={handleThemeContinue} disabled={!canProceedToDetails}>
                Continue to details
              </Button>
            </div>
          </div>
        )}

        {currentStep === 2 && (
          <form onSubmit={handlePreviewRequest} className="space-y-6">
            <Card className="border-none bg-white/80 shadow-sm shadow-orange-100/40">
              <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4 text-sm text-slate-600">
                <p>
                  Review the common school details below. These are reused for every grade and can be
                  updated from the grade selection screen.
                </p>
                <Button type="button" variant="outline" onClick={handleBackToSelection}>
                  Change theme or colour
                </Button>
              </CardContent>
            </Card>

            <Card className="border-none bg-white/85 shadow-sm shadow-orange-100/60">
              <CardHeader className="space-y-2">
                <CardTitle className="text-xl font-semibold text-slate-900">
                  Common cover details
                </CardTitle>
                <p className="text-sm text-slate-600">
                  These details were captured before choosing the grade. Go back to the grade list if you
                  need to make any changes.
                </p>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2">
                  
                  <div className="space-y-1">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      School contact number
                    </p>
                    <p className="text-sm font-semibold text-slate-800">
                      {personalisation.contactNumber || 'Not provided'}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Website</p>
                    <p className="text-sm font-semibold text-slate-800">
                      {personalisation.website || 'Not provided'}
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

            <Card className="border-none shadow-xl shadow-orange-100/60">
              <CardHeader className="space-y-2">
                <CardTitle className="text-xl font-semibold text-slate-900">
                  Grade specific details
                </CardTitle>
                <p className="text-sm text-slate-600">
                  Provide the remaining information that is unique to this grade. It will be merged into the
                  SVG artwork before it appears in the carousel.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="cover-personalisation-grid two-column">
                  <div className="cover-form-field">
                    <Label htmlFor="cover-email">Email</Label>
                    <Input
                      id="cover-email"
                      type="email"
                      placeholder="e.g. hello@school.com"
                      value={personalisation.email}
                      onChange={handlePersonalisationChange('email')}
                    />
                  </div>
                  <div className="cover-form-field">
                    <Label htmlFor="cover-grade-name">Grade name</Label>
                    <Input
                      id="cover-grade-name"
                      placeholder="e.g. UKG"
                      value={personalisation.gradeName}
                      onChange={handlePersonalisationChange('gradeName')}
                    />
                  </div>
                  <div className="cover-form-field md:col-span-2">
                    <Label htmlFor="cover-kid-photo">Kid photo</Label>
                    <div className="space-y-3">
                      <Input
                        id="cover-kid-photo"
                        type="file"
                        accept="image/*"
                        ref={kidPhotoInputRef}
                        onChange={handleKidPhotoChange}
                      />
                      <p className="text-xs text-slate-500">
                        Upload a clear image (PNG or JPG) for the kid portrait placeholder.
                      </p>
                      {personalisation.kidPhoto && (
                        <div className="flex flex-wrap items-center gap-4 rounded-md border border-orange-100 bg-orange-50/60 p-3">
                          <img
                            src={personalisation.kidPhoto}
                            alt="Kid preview"
                            className="h-20 w-20 rounded-md border border-white object-cover"
                          />
                          <div className="space-y-2">
                            {kidPhotoFileName && (
                              <p className="text-sm font-medium text-slate-800">{kidPhotoFileName}</p>
                            )}
                            <Button type="button" variant="outline" size="sm" onClick={handleKidPhotoClear}>
                              Remove photo
                            </Button>
                          </div>
                        </div>
                      )}
                      {!personalisation.kidPhoto && kidPhotoFileName && (
                        <p className="text-xs font-medium text-slate-700">{kidPhotoFileName}</p>
                      )}
                    </div>
                  </div>
                  <div className="cover-form-field">
                    <Label htmlFor="cover-address-line-1">Address line 1</Label>
                    <Input
                      id="cover-address-line-1"
                      placeholder="Address line 1"
                      value={personalisation.addressLine1}
                      onChange={handlePersonalisationChange('addressLine1')}
                    />
                  </div>
                  <div className="cover-form-field">
                    <Label htmlFor="cover-address-line-2">Address line 2</Label>
                    <Input
                      id="cover-address-line-2"
                      placeholder="Address line 2"
                      value={personalisation.addressLine2}
                      onChange={handlePersonalisationChange('addressLine2')}
                    />
                  </div>
                  <div className="cover-form-field">
                    <Label htmlFor="cover-address-line-3">Address line 3</Label>
                    <Input
                      id="cover-address-line-3"
                      placeholder="Address line 3"
                      value={personalisation.addressLine3}
                      onChange={handlePersonalisationChange('addressLine3')}
                    />
                  </div>
                  <div className="cover-form-field">
                    <Label htmlFor="cover-tag-line-1">Tag line 1</Label>
                    <Input
                      id="cover-tag-line-1"
                      placeholder="Enter tag line 1"
                      value={personalisation.tagLine1}
                      onChange={handlePersonalisationChange('tagLine1')}
                    />
                  </div>
                  <div className="cover-form-field">
                    <Label htmlFor="cover-tag-line-2">Tag line 2</Label>
                    <Input
                      id="cover-tag-line-2"
                      placeholder="Enter tag line 2"
                      value={personalisation.tagLine2}
                      onChange={handlePersonalisationChange('tagLine2')}
                    />
                  </div>
                  <div className="cover-form-field">
                    <Label htmlFor="cover-tag-line-3">Tag line 3</Label>
                    <Input
                      id="cover-tag-line-3"
                      placeholder="e.g. Playgroup | Nursery | LKG | UKG | Daycare"
                      value={personalisation.tagLine3}
                      onChange={handlePersonalisationChange('tagLine3')}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex flex-wrap justify-between gap-3">
              <Button type="button" variant="outline" onClick={handleBackToSelection}>
                Back
              </Button>
              <Button type="submit" disabled={!canSubmitDetails}>
                Submit &amp; preview
              </Button>
            </div>
          </form>
        )}

        {currentStep === 3 && (
          <div className="space-y-6">
            {hasSubmittedDetails && (
              <Alert className="border-emerald-200 bg-emerald-50 text-emerald-800">
                <AlertTitle>Displaying preview</AlertTitle>
                <AlertDescription className="space-y-4">
                  <p>Your personalised covers are ready. Use the carousel below to review each design.</p>
                  {activeAsset && (
                    <div className="overflow-hidden rounded-md border border-emerald-100 bg-white/70">
                      <div className="flex items-center justify-between gap-3 border-b border-emerald-100 bg-emerald-50/60 px-3 py-2 text-xs font-medium uppercase tracking-wide text-emerald-700">
                        <span>Preview loaded</span>
                        <span className="truncate">{activeAsset.fileName}</span>
                      </div>
                      <div className="max-h-80 overflow-auto bg-white px-3 py-4">
                        <InlineSvg
                          markup={activeAsset.personalisedMarkup || activeAsset.svgMarkup}
                          className="mx-auto max-h-72 min-h-[180px] w-full overflow-hidden rounded border border-emerald-100 bg-white shadow-sm"
                          sanitize={false}
                          ref={svgPreviewRef}
                        />
                      </div>
                    </div>
                  )}
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
                  <Button type="button" variant="outline" onClick={handleEditDetails}>
                    Edit details
                  </Button>
                  <Button type="button" variant="outline" onClick={handleBackToSelection}>
                    Change theme
                  </Button>
                </div>
              </CardContent>
            </Card>

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
                    <Skeleton className="h-full w-full" />
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
