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

const PERSONALISATION_TARGETS = {
  schoolLogo: ['#school-logo', '[data-cover-binding="school-logo"]'],
  gradeName: ['#grade-name', '[data-cover-binding="grade-name"]'],
  kidName: ['#kid-name', '[data-cover-binding="kid-name"]'],
  addressLine1: ['#address-line-1', '[data-cover-binding="address-line-1"]'],
  addressLine2: ['#address-line-2', '[data-cover-binding="address-line-2"]'],
  addressLine3: ['#address-line-3', '[data-cover-binding="address-line-3"]'],
  contactNumber: ['#contact-number', '[data-cover-binding="contact-number"]'],
  website: [
    '#website',
    '#website text',
    '[data-cover-binding="website"]',
    '[id="Website"] text'
  ],
  tagLine1: [
    '#tag-line-1',
    '#tag-line-1 text',
    '[data-cover-binding="tag-line-1"]',
    '[id="Tag_1"] text'
  ],
  tagLine2: [
    '#tag-line-2',
    '#tag-line-2 text',
    '[data-cover-binding="tag-line-2"]',
    '[id="Tag_2"] text'
  ],
  tagLine3: [
    '#tag-line-3',
    '#tag-line-3 text',
    '[data-cover-binding="tag-line-3"]',
    '[id="Tag_3"] text'
  ]
};

const collectNodes = (doc, selectors = []) => {
  if (!doc || !Array.isArray(selectors)) {
    return [];
  }

  const results = [];
  selectors.forEach((selector) => {
    if (!selector) {
      return;
    }

    const found = doc.querySelectorAll(selector);
    found.forEach((node) => {
      if (!results.includes(node)) {
        results.push(node);
      }
    });
  });

  return results;
};

const updateNodeText = (nodes, value) => {
  const textValue = value ?? '';
  nodes.forEach((node) => {
    if (!node) {
      return;
    }

    node.textContent = textValue;
  });
};

const updateNodeImage = (nodes, value) => {
  const imageValue = value ?? '';

  nodes.forEach((node) => {
    if (!node) {
      return;
    }

    if (imageValue) {
      node.setAttribute('href', imageValue);
      node.setAttribute('xlink:href', imageValue);
      if (typeof node.setAttributeNS === 'function') {
        try {
          node.setAttributeNS('http://www.w3.org/1999/xlink', 'href', imageValue);
        } catch (error) {
          // Ignore namespace errors in older browsers.
        }
      }

      if (node.tagName?.toLowerCase() === 'image') {
        node.setAttribute('preserveAspectRatio', 'xMidYMin slice');
      }

      const imgChild = node.tagName?.toLowerCase() === 'image' ? null : node.querySelector('img');
      if (imgChild) {
        imgChild.setAttribute('src', imageValue);
        if (imgChild.style) {
          imgChild.style.objectFit = imgChild.style.objectFit || 'cover';
          imgChild.style.objectPosition = imgChild.style.objectPosition || '50% 0%';
          imgChild.style.width = imgChild.style.width || '100%';
          imgChild.style.height = imgChild.style.height || '100%';
          imgChild.style.backgroundColor = imgChild.style.backgroundColor || 'transparent';
        }
      }
    } else {
      node.removeAttribute('href');
      node.removeAttribute('xlink:href');
      if (typeof node.removeAttributeNS === 'function') {
        try {
          node.removeAttributeNS('http://www.w3.org/1999/xlink', 'href');
        } catch (error) {
          // Ignore namespace errors in older browsers.
        }
      }

      const imgChild = node.tagName?.toLowerCase() === 'image' ? null : node.querySelector('img');
      if (imgChild) {
        imgChild.removeAttribute('src');
        if (imgChild.style) {
          imgChild.style.removeProperty('object-position');
          imgChild.style.removeProperty('background-color');
        }
      }
    }
  });
};

const applyPersonalisationToSvg = (svgMarkup, personalisation) => {
  if (!svgMarkup || typeof svgMarkup !== 'string') {
    return '';
  }

  if (typeof window === 'undefined' || typeof window.DOMParser === 'undefined') {
    return svgMarkup;
  }

  try {
    const parser = new window.DOMParser();
    const doc = parser.parseFromString(svgMarkup, 'image/svg+xml');
    const svgElement = doc?.documentElement;

    if (!svgElement || svgElement.nodeName.toLowerCase() !== 'svg') {
      return svgMarkup;
    }

    const {
      schoolLogo,
      gradeName,
      kidName,
      addressLine1,
      addressLine2,
      addressLine3,
      contactNumber,
      website,
      tagLine1,
      tagLine2,
      tagLine3
    } = personalisation || {};

    updateNodeImage(collectNodes(svgElement, PERSONALISATION_TARGETS.schoolLogo), schoolLogo);
    updateNodeText(collectNodes(svgElement, PERSONALISATION_TARGETS.gradeName), gradeName);
    updateNodeText(collectNodes(svgElement, PERSONALISATION_TARGETS.kidName), kidName);
    updateNodeText(collectNodes(svgElement, PERSONALISATION_TARGETS.addressLine1), addressLine1);
    updateNodeText(collectNodes(svgElement, PERSONALISATION_TARGETS.addressLine2), addressLine2);
    updateNodeText(collectNodes(svgElement, PERSONALISATION_TARGETS.addressLine3), addressLine3);
    updateNodeText(collectNodes(svgElement, PERSONALISATION_TARGETS.contactNumber), contactNumber);
    updateNodeText(collectNodes(svgElement, PERSONALISATION_TARGETS.website), website);
    updateNodeText(collectNodes(svgElement, PERSONALISATION_TARGETS.tagLine1), tagLine1);
    updateNodeText(collectNodes(svgElement, PERSONALISATION_TARGETS.tagLine2), tagLine2);
    updateNodeText(collectNodes(svgElement, PERSONALISATION_TARGETS.tagLine3), tagLine3);

    if (typeof XMLSerializer === 'undefined') {
      return svgMarkup;
    }

    const serializer = new XMLSerializer();
    return serializer.serializeToString(svgElement);
  } catch (error) {
    return svgMarkup;
  }

 }
   
const CoverPageWorkflow = ({ school, grade, onBackToGrades, onBackToMode, onLogout }) => {
  const coverAssetsBaseUrl =
    process.env.REACT_APP_COVER_ASSETS_BASE_URL || '/api/cover-assets/svg';

  const [selectedThemeId, setSelectedThemeId] = useState(null);
  const [selectedColourId, setSelectedColourId] = useState(null);

  const [isFetchingAssets, setIsFetchingAssets] = useState(false);
  const [previewAssets, setPreviewAssets] = useState([]);
  const [assetError, setAssetError] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [personalisation, setPersonalisation] = useState({
    schoolLogo: '',
    gradeName: '',
    kidName: '',
    addressLine1: '',
    addressLine2: '',
    addressLine3: '',
    contactNumber: '',
    website: '',
    tagLine1: '',
    tagLine2: '',
    tagLine3: ''
  });
  const [gradeNameDirty, setGradeNameDirty] = useState(false);

  const [currentStep, setCurrentStep] = useState(1);
  const [hasSubmittedDetails, setHasSubmittedDetails] = useState(false);

  const assetCacheRef = useRef(new Map());

  const gradeLabel = useMemo(() => {
    return GRADE_LABELS[grade] || grade?.toUpperCase() || 'Grade';
  }, [grade]);


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
      kidName: personalisation.kidName.trim(),
      addressLine1: personalisation.addressLine1.trim(),
      addressLine2: personalisation.addressLine2.trim(),
      addressLine3: personalisation.addressLine3.trim(),
      contactNumber: personalisation.contactNumber.trim(),
      website: personalisation.website.trim(),
      tagLine1: personalisation.tagLine1.trim(),
      tagLine2: personalisation.tagLine2.trim(),
      tagLine3: personalisation.tagLine3.trim()
    }),
    [personalisation]
  );

  const fetchCoverAsset = useCallback(
    async (selectionKey) => {
      if (!selectionKey) {
        throw new Error('Invalid cover asset requested.');
      }

      const fileName = `${selectionKey}.svg`;
      const url = joinUrl(coverAssetsBaseUrl, fileName);
      const cacheKey = `${selectionKey}|${url}`;

      if (assetCacheRef.current.has(cacheKey)) {
        return assetCacheRef.current.get(cacheKey);
      }

      const response = await axios.get(url, { responseType: 'text' });
      const svgMarkup = typeof response.data === 'string' ? response.data.trim() : '';

      if (!svgMarkup) {
        throw new Error(`The SVG for “${fileName}” could not be loaded.`);
      }

      const record = { fileName, url, selectionKey, svgMarkup };
      assetCacheRef.current.set(cacheKey, record);
      return record;
    },
    [coverAssetsBaseUrl]
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
        const asset = await fetchCoverAsset(selectionKey);
        const personalised = {
          ...asset,
          personalisedMarkup: applyPersonalisationToSvg(asset.svgMarkup, trimmedPersonalisation)
        };

        setPreviewAssets([personalised]);
        setActiveIndex(0);
        setHasSubmittedDetails(true);
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
    [fetchCoverAsset, selectedTheme, selectedColour, trimmedPersonalisation]
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
                <p>Complete the school details below to personalise every cover automatically.</p>
                <Button type="button" variant="outline" onClick={handleBackToSelection}>
                  Change theme or colour
                </Button>
              </CardContent>
            </Card>

            <Card className="border-none shadow-xl shadow-orange-100/60">
              <CardHeader className="space-y-2">
                <CardTitle className="text-xl font-semibold text-slate-900">Cover details</CardTitle>
                <p className="text-sm text-slate-600">
                  Personalise the cover by filling in the school information below. The values you enter
                  will be merged into the SVG artwork before it appears in the carousel.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="cover-personalisation-grid two-column">
                  <div className="cover-form-field">
                    <Label htmlFor="cover-school-logo">Upload School logo </Label>
                    <Input
                      id="cover-school-logo"
                      type="file"
                      inputMode="url"
                      placeholder="https://example.com/logo.png"
                      value={personalisation.schoolLogo}
                      onChange={handlePersonalisationChange('schoolLogo')}
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
                  <div className="cover-form-field">
                    <Label htmlFor="cover-kid-name">Kid name</Label>
                    <Input
                      id="cover-kid-name"
                      placeholder="Kid name"
                      value={personalisation.kidName}
                      onChange={handlePersonalisationChange('kidName')}
                    />
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
                    <Label htmlFor="cover-contact-number">School contact number</Label>
                    <Input
                      id="cover-contact-number"
                      type="tel"
                      inputMode="tel"
                      placeholder="Contact number"
                      value={personalisation.contactNumber}
                      onChange={handlePersonalisationChange('contactNumber')}
                    />
                  </div>
                  <div className="cover-form-field">
                    <Label htmlFor="cover-website">Website</Label>
                    <Input
                      id="cover-website"
                      placeholder="e.g. www.edplore.com"
                      value={personalisation.website}
                      onChange={handlePersonalisationChange('website')}
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
                <AlertDescription>
                  Your personalised covers are ready. Use the carousel below to review each design.
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
              <CardContent className="space-y-6">
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
                      <div
                        className="cover-carousel-svg"
                        dangerouslySetInnerHTML={{
                          __html: activeAsset.personalisedMarkup || activeAsset.svgMarkup
                        }}
                      />
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
                            key={asset.url || asset.fileName || index}
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
