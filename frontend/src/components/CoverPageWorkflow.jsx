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

const extractFileName = (entry) => {
  if (!entry) {
    return '';
  }




  if (typeof entry === 'string') {
    const clean = entry.trim();
    if (!clean) {
      return '';
    }
    const segments = clean.split(/[\\/]/);
    return segments[segments.length - 1] || '';
  }

  if (typeof entry === 'object') {
    const fields = ['fileName', 'filename', 'name', 'path', 'key'];
    for (const field of fields) {
      const value = entry[field];
      if (typeof value === 'string' && value.trim().length > 0) {
        const segments = value.trim().split(/[\\/]/);
        return segments[segments.length - 1] || '';
      }
    }
  }

  return '';
};

const parseSelectionKeyFromFileName = (fileName) => {
  if (!fileName || typeof fileName !== 'string') {
    return '';
  }

  const withoutExt = fileName.replace(/\.svg$/i, '');
  const parts = withoutExt.split('.');

  if (parts.length < 2) {
    return '';
  }

  const themeToken = extractSelectionToken(parts[0]);
  const colourToken = extractSelectionToken(parts[1]);

  if (!themeToken || !colourToken) {
    return '';
  }

  return `${themeToken}.${colourToken}`;
};

const extractManifestEntries = (payload) => {
  if (!payload) {
    return [];
  }

  if (Array.isArray(payload)) {
    return payload;
  }

  if (typeof payload === 'object') {
    const candidateKeys = ['assets', 'files', 'items', 'data', 'results'];
    for (const key of candidateKeys) {
      const value = payload[key];
      if (Array.isArray(value)) {
        return value;
      }
    }
  }

  return [];
};

const normaliseManifest = (payload, baseUrl) => {
  const rawEntries = extractManifestEntries(payload);
  const seen = new Set();
  const normalised = [];

  rawEntries.forEach((entry) => {
    const fileName = extractFileName(entry);
    if (!fileName) {
      return;
    }

    const selectionKey = parseSelectionKeyFromFileName(fileName);
    if (!selectionKey) {
      return;
    }

    let url = '';

    if (typeof entry === 'string') {
      const clean = entry.trim();
      if (/^https?:/i.test(clean)) {
        url = clean;
      } else {
        url = baseUrl ? joinUrl(baseUrl, clean) : '';
      }
    } else if (typeof entry === 'object') {
      if (typeof entry.url === 'string' && entry.url.trim().length > 0) {
        url = entry.url.trim();
      } else if (typeof entry.href === 'string' && entry.href.trim().length > 0) {
        url = entry.href.trim();
      } else if (typeof entry.path === 'string' && entry.path.trim().length > 0 && baseUrl) {
        url = joinUrl(baseUrl, entry.path.trim());
      } else if (baseUrl) {
        url = joinUrl(baseUrl, fileName);
      }
    }

    const key = `${fileName}|${url}`;
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    normalised.push({ fileName, url, selectionKey });
  });

  normalised.sort((a, b) => a.fileName.localeCompare(b.fileName));
  return normalised;
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
  contactNumber: ['#contact-number', '[data-cover-binding="contact-number"]']
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
        node.setAttribute('preserveAspectRatio', 'xMidYMid slice');
      }

      const imgChild = node.tagName?.toLowerCase() === 'image' ? null : node.querySelector('img');
      if (imgChild) {
        imgChild.setAttribute('src', imageValue);
        if (imgChild.style) {
          imgChild.style.objectFit = imgChild.style.objectFit || 'cover';
          imgChild.style.width = imgChild.style.width || '100%';
          imgChild.style.height = imgChild.style.height || '100%';
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

    const { schoolLogo, gradeName, kidName, addressLine1, addressLine2, addressLine3, contactNumber } =
      personalisation || {};

    updateNodeImage(collectNodes(svgElement, PERSONALISATION_TARGETS.schoolLogo), schoolLogo);
    updateNodeText(collectNodes(svgElement, PERSONALISATION_TARGETS.gradeName), gradeName);
    updateNodeText(collectNodes(svgElement, PERSONALISATION_TARGETS.kidName), kidName);
    updateNodeText(collectNodes(svgElement, PERSONALISATION_TARGETS.addressLine1), addressLine1);
    updateNodeText(collectNodes(svgElement, PERSONALISATION_TARGETS.addressLine2), addressLine2);
    updateNodeText(collectNodes(svgElement, PERSONALISATION_TARGETS.addressLine3), addressLine3);
    updateNodeText(collectNodes(svgElement, PERSONALISATION_TARGETS.contactNumber), contactNumber);

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
  const manifestUrl =
    process.env.REACT_APP_COVER_ASSETS_MANIFEST_URL || '/api/cover-assets/manifest';
  const baseAssetsUrl =
    process.env.REACT_APP_COVER_ASSETS_BASE_URL || '/api/cover-assets/svg';

  const [manifestLoading, setManifestLoading] = useState(false);
  const [manifestError, setManifestError] = useState('');
  const [availableAssets, setAvailableAssets] = useState([]);

  const [selectedThemeId, setSelectedThemeId] = useState(null);
  const [selectedColourId, setSelectedColourId] = useState(null);

  const [isFetchingAssets, setIsFetchingAssets] = useState(false);
  const [carouselAssets, setCarouselAssets] = useState([]);
  const [assetError, setAssetError] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [personalisation, setPersonalisation] = useState({
    schoolLogo: '',
    gradeName: '',
    kidName: '',
    addressLine1: '',
    addressLine2: '',
    addressLine3: '',
    contactNumber: ''
  });
  const [gradeNameDirty, setGradeNameDirty] = useState(false);

  const [currentStep, setCurrentStep] = useState(1);
  const [hasSubmittedDetails, setHasSubmittedDetails] = useState(false);

  const assetCacheRef = useRef(new Map());
  const selectionSnapshotRef = useRef({
    theme: null,
    colour: null
  });

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

  useEffect(() => {
    const previous = selectionSnapshotRef.current;
    if (
      hasSubmittedDetails &&
      (selectedThemeId !== previous.theme || selectedColourId !== previous.colour)
    ) {
      setHasSubmittedDetails(false);
      setCurrentStep(1);
    }

    selectionSnapshotRef.current = {
      theme: selectedThemeId,
      colour: selectedColourId
    };
  }, [selectedThemeId, selectedColourId, hasSubmittedDetails]);

  const selectedTheme = useMemo(
    () => THEME_OPTIONS.find((theme) => theme.id === selectedThemeId) || null,
    [selectedThemeId]
  );

  const selectedColour = useMemo(
    () => COLOUR_OPTIONS.find((colour) => colour.id === selectedColourId) || null,
    [selectedColourId]
  );

  useEffect(() => {
    if (!manifestUrl) {
      setManifestError('Cover assets manifest URL is not configured.');
      setAvailableAssets([]);
      return;
    }

    let isCancelled = false;

    const loadManifest = async () => {
      setManifestLoading(true);
      setManifestError('');

      try {
        const response = await axios.get(manifestUrl);
        if (isCancelled) {
          return;
        }

        const data = normaliseManifest(response.data, baseAssetsUrl);
        setAvailableAssets(data);
      } catch (error) {
        if (isCancelled) {
          return;
        }

        setAvailableAssets([]);
        setManifestError(resolveErrorMessage(error));
      } finally {
        if (!isCancelled) {
          setManifestLoading(false);
        }
      }
    };

    loadManifest();

    return () => {
      isCancelled = true;
    };
  }, [manifestUrl, baseAssetsUrl]);

  useEffect(() => {
    if (!selectedTheme || !selectedColour) {
      setCarouselAssets([]);
      setAssetError('');
      setActiveIndex(0);

      return;
    }

    const expectedKey = buildSelectionKey(selectedTheme.id, selectedColour.id);
    if (!expectedKey) {
      setCarouselAssets([]);
      setAssetError('');
      setActiveIndex(0);
      return;
    }

    const matchingAssets = availableAssets.filter((asset) => asset.selectionKey === expectedKey);

    if (matchingAssets.length === 0) {
      setCarouselAssets([]);
      setAssetError('No cover files found for this theme and colour combination yet.');
      setActiveIndex(0);
      return;
    }


     



    let isCancelled = false;

    const loadAssets = async () => {
      setIsFetchingAssets(true);
      setAssetError('');

      try {
        const resolved = await Promise.all(
          matchingAssets.map(async (asset) => {
            if (asset.selectionKey !== expectedKey) {
              throw new Error(
                `Cover file “${asset.fileName}” does not match the selected theme and colour.`
              );
            }

            if (!asset.url) {
              throw new Error(`No download URL configured for “${asset.fileName}”.`);
            }

            if (assetCacheRef.current.has(asset.url)) {
              return assetCacheRef.current.get(asset.url);
            }

            const response = await axios.get(asset.url, { responseType: 'text' });
            const svgMarkup = typeof response.data === 'string' ? response.data : '';

            const record = {
              fileName: asset.fileName,
              url: asset.url,
              selectionKey: asset.selectionKey,
              svgMarkup
            };

            assetCacheRef.current.set(asset.url, record);
            return record;
          })
        );

        if (!isCancelled) {
          setCarouselAssets(resolved);
          setActiveIndex(0);
        }
      } catch (error) {
        if (!isCancelled) {
          setCarouselAssets([]);
          setAssetError(resolveErrorMessage(error));
          setActiveIndex(0);
        }
      } finally {
        if (!isCancelled) {
          setIsFetchingAssets(false);
        }
      }

    };

    loadAssets();

    return () => {
      isCancelled = true;

    };
  }, [selectedTheme, selectedColour, availableAssets]);

  const trimmedPersonalisation = useMemo(
    () => ({
      schoolLogo: personalisation.schoolLogo.trim(),
      gradeName: personalisation.gradeName.trim(),
      kidName: personalisation.kidName.trim(),
      addressLine1: personalisation.addressLine1.trim(),
      addressLine2: personalisation.addressLine2.trim(),
      addressLine3: personalisation.addressLine3.trim(),
      contactNumber: personalisation.contactNumber.trim()
    }),
    [personalisation]
  );

  const isPersonalisationComplete = useMemo(() => {
    return Object.values(trimmedPersonalisation).every((value) => value.length > 0);
  }, [trimmedPersonalisation]);

  const personalisedAssets = useMemo(() => {
    if (!carouselAssets.length) {
      return [];
    }

    return carouselAssets.map((asset) => ({
      ...asset,
      personalisedMarkup: applyPersonalisationToSvg(asset.svgMarkup, trimmedPersonalisation)
    }));
  }, [carouselAssets, trimmedPersonalisation]);

  const displayedAssets = isPersonalisationComplete ? personalisedAssets : [];
  const displayedAssetsLength = displayedAssets.length;

  const handlePrev = useCallback(() => {
    setActiveIndex((current) => {
      if (displayedAssetsLength === 0) {
        return 0;
      }

      return (current - 1 + displayedAssetsLength) % displayedAssetsLength;
    });
  }, [displayedAssetsLength]);

  const handleNext = useCallback(() => {
    setActiveIndex((current) => {
      if (displayedAssetsLength === 0) {
        return 0;
      }

      return (current + 1) % displayedAssetsLength;
    });
  }, [displayedAssetsLength]);

  useEffect(() => {
    if (activeIndex >= displayedAssetsLength && displayedAssetsLength > 0) {
      setActiveIndex(0);
      return;
    }

    if (displayedAssetsLength === 0 && activeIndex !== 0) {
      setActiveIndex(0);
    }
  }, [activeIndex, displayedAssetsLength]);

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

  const activeAsset = displayedAssets[activeIndex] || null;

  const canProceedToDetails = Boolean(selectedTheme && selectedColour);
  const canSubmitDetails = Boolean(isPersonalisationComplete && canProceedToDetails);

  const handleThemeContinue = useCallback(() => {
    if (!canProceedToDetails) {
      return;
    }

    setCurrentStep(2);
  }, [canProceedToDetails]);

  const handleBackToSelection = useCallback(() => {
    setCurrentStep(1);
    setHasSubmittedDetails(false);
  }, []);

  const handleEditDetails = useCallback(() => {
    setCurrentStep(2);
    setHasSubmittedDetails(false);
  }, []);

  const handlePersonalisationSubmit = useCallback(
    (event) => {
      event.preventDefault();

      if (!canSubmitDetails) {
        return;
      }

      setHasSubmittedDetails(true);
      setCurrentStep(3);
    },
    [canSubmitDetails]
  );

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
                {manifestLoading && (
                  <div className="space-y-2">
                    <Skeleton className="h-14 w-full rounded-2xl" />
                    <Skeleton className="h-14 w-full rounded-2xl" />
                  </div>
                )}

                {!manifestLoading && manifestError && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Unable to load cover assets</AlertTitle>
                    <AlertDescription>{manifestError}</AlertDescription>
                  </Alert>
                )}

                <div className="cover-theme-grid">
                  {THEME_OPTIONS.map((theme) => {
                    const isSelected = selectedThemeId === theme.id;
                    return (
                      <button
                        key={theme.id}
                        type="button"
                        onClick={() => setSelectedThemeId(theme.id)}
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
                        onClick={() => setSelectedColourId(colour.id)}
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
          <form onSubmit={handlePersonalisationSubmit} className="space-y-6">
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

                {!isFetchingAssets && !assetError && carouselAssets.length === 0 && (
                  <div className="cover-carousel-empty">
                    <p className="text-sm text-slate-500">
                      No cover artwork has been uploaded yet for this combination.
                    </p>
                  </div>
                )}

                {!isFetchingAssets && !assetError && displayedAssetsLength > 0 && activeAsset && (
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
                      {displayedAssetsLength > 1 && (
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
                            {activeIndex + 1} of {displayedAssetsLength}
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

                    {displayedAssetsLength > 1 && (
                      <div className="cover-carousel-indicators">
                        {displayedAssets.map((asset, index) => (
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
