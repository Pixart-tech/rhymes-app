import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import axios from 'axios';
import './App.css';


// Components
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { Badge } from './components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './components/ui/collapsible';
import { Separator } from './components/ui/separator';
import { toast } from 'sonner';
import { Toaster } from './components/ui/sonner';
import CoverPageWorkflow from './components/CoverPageWorkflow';
import { API_BASE_URL } from './lib/utils';


// Icons
import {
  Plus,
  ChevronDown,
  ChevronRight,
  Replace,
  School,
  BookOpen,
  Music,
  ChevronLeft,
  Eye,
  Download,
  LayoutTemplate,
  BookMarked,
  Clock
} from 'lucide-react';

const API = API_BASE_URL || '/api';

const GRADE_OPTIONS = [
  { id: 'nursery', name: 'Nursery', color: 'from-pink-400 to-rose-400', icon: '🌸' },
  { id: 'lkg', name: 'LKG', color: 'from-blue-400 to-cyan-400', icon: '🎈' },
  { id: 'ukg', name: 'UKG', color: 'from-green-400 to-emerald-400', icon: '🌟' },
  { id: 'playgroup', name: 'Playgroup', color: 'from-purple-400 to-indigo-400', icon: '🎨' }
];

const sanitizeRhymeSvgContent = (svgContent, rhymeCode) => {
  if (!svgContent || typeof svgContent !== 'string') {
    return svgContent;
  }

  if (typeof window === 'undefined' || typeof window.DOMParser === 'undefined') {
    return svgContent;
  }

  try {
    const parser = new window.DOMParser();
    const doc = parser.parseFromString(svgContent, 'image/svg+xml');
    const svgElement = doc.querySelector('svg');

    if (!svgElement) {
      return svgContent;
    }

    const widthAttr = svgElement.getAttribute('width');
    const heightAttr = svgElement.getAttribute('height');
    const widthValue = Number.parseFloat(widthAttr ?? '');
    const heightValue = Number.parseFloat(heightAttr ?? '');

    svgElement.removeAttribute('width');
    svgElement.removeAttribute('height');

    const inlineStyleAttr = svgElement.getAttribute('style');
    if (typeof inlineStyleAttr === 'string' && inlineStyleAttr.trim().length > 0) {
      const filteredStyleRules = inlineStyleAttr
        .split(';')
        .map((rule) => rule.trim())
        .filter((rule) =>
          rule.length > 0 && !/^width\s*:/i.test(rule) && !/^height\s*:/i.test(rule)
        );

      if (filteredStyleRules.length > 0) {
        svgElement.setAttribute('style', `${filteredStyleRules.join('; ')};`);
      } else {
        svgElement.removeAttribute('style');
      }
    }

    if (!svgElement.getAttribute('viewBox')) {
      if (Number.isFinite(widthValue) && Number.isFinite(heightValue) && widthValue > 0 && heightValue > 0) {
        svgElement.setAttribute('viewBox', `0 0 ${widthValue} ${heightValue}`);
      }
    }

    svgElement.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    const viewBoxAttr = svgElement.getAttribute('viewBox');
    let viewBoxWidth;
    let viewBoxHeight;

    if (typeof viewBoxAttr === 'string' && viewBoxAttr.trim().length > 0) {
      const viewBoxParts = viewBoxAttr
        .trim()
        .split(/[\s,]+/)
        .map((part) => Number.parseFloat(part))
        .filter((part) => Number.isFinite(part));

      if (viewBoxParts.length >= 4) {
        const sanitizedParts = viewBoxParts.slice(0, 4);
        svgElement.setAttribute('viewBox', sanitizedParts.map((value) => `${value}`).join(' '));
        viewBoxWidth = sanitizedParts[2];
        viewBoxHeight = sanitizedParts[3];
      }
    }

    const referenceWidth = Number.isFinite(viewBoxWidth) ? viewBoxWidth : widthValue;
    const referenceHeight = Number.isFinite(viewBoxHeight) ? viewBoxHeight : heightValue;

    const rectElements = svgElement.querySelectorAll('rect');

    rectElements.forEach((rect) => {
      const rectWidthAttr = rect.getAttribute('width');
      const rectHeightAttr = rect.getAttribute('height');
      const rectXAttr = rect.getAttribute('x');
      const rectYAttr = rect.getAttribute('y');

      const rectWidthValue = Number.parseFloat(rectWidthAttr ?? '');
      const rectHeightValue = Number.parseFloat(rectHeightAttr ?? '');
      const rectXValue = Number.parseFloat(rectXAttr ?? '');
      const rectYValue = Number.parseFloat(rectYAttr ?? '');

      const widthLooksLikeCanvas =
        Number.isFinite(referenceWidth) &&
        Number.isFinite(rectWidthValue) &&
        Math.abs(rectWidthValue - referenceWidth) < 1;

      const heightLooksLikeCanvas =
        Number.isFinite(referenceHeight) &&
        Number.isFinite(rectHeightValue) &&
        Math.abs(rectHeightValue - referenceHeight) < 1;

      const shouldStretchWidth =
        !rectWidthAttr ||
        /%/i.test(rectWidthAttr) ||
        !Number.isFinite(rectWidthValue) ||
        widthLooksLikeCanvas;

      const shouldStretchHeight =
        !rectHeightAttr ||
        /%/i.test(rectHeightAttr) ||
        !Number.isFinite(rectHeightValue) ||
        heightLooksLikeCanvas;

      if (shouldStretchWidth) {
        rect.setAttribute('width', '100%');
      }

      if (shouldStretchHeight) {
        rect.setAttribute('height', '100%');
      }

      if (shouldStretchWidth && (!rectXAttr || !Number.isFinite(rectXValue) || Math.abs(rectXValue) < 0.5)) {
        rect.setAttribute('x', '0');
      }

      if (shouldStretchHeight && (!rectYAttr || !Number.isFinite(rectYValue) || Math.abs(rectYValue) < 0.5)) {
        rect.setAttribute('y', '0');
      }
    });

    const normalizedCode = (rhymeCode ?? '').toString().trim();
    const normalizedCodeLower = normalizedCode.toLowerCase();
    const normalizedCodeCompact = normalizedCodeLower.replace(/[^a-z0-9]/g, '');
    const textNodes = svgElement.querySelectorAll('text, tspan');

    textNodes.forEach(node => {
      const rawText = (node.textContent ?? '').toString();
      const normalizedText = rawText.trim().toLowerCase();

      if (!normalizedText) {
        return;
      }

      const normalizedCompact = normalizedText.replace(/[^a-z0-9]/g, '');
      const hasCodeReference = Boolean(
        (normalizedCodeLower && normalizedText.includes(normalizedCodeLower)) ||
        (normalizedCodeCompact && normalizedCompact.includes(normalizedCodeCompact))
      );
      const hasLabel = normalizedText.includes('rhyme code') || normalizedText.includes('code:');

      if (hasCodeReference || hasLabel) {
        if (typeof node.closest === 'function') {
          const parentText = node.closest('text');
          if (parentText) {
            parentText.remove();
            return;
          }
        }
        node.remove();
      }
    });

    if (typeof window.XMLSerializer === 'undefined') {
      return svgElement.outerHTML;
    }

    const serializer = new window.XMLSerializer();
    return serializer.serializeToString(svgElement);
  } catch (error) {
    console.error('Error sanitizing rhyme SVG:', error);
    return svgContent;
  }
};

// Authentication Page
const AuthPage = ({ onAuth }) => {
  const [schoolId, setSchoolId] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAuth = async (e) => {
    e.preventDefault();
    if (!schoolId.trim() || !schoolName.trim()) {
      toast.error('Please fill in both School ID and School Name');
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(`${API}/auth/login`, {
        school_id: schoolId.trim(),
        school_name: schoolName.trim()
      });

      onAuth(response.data);
      toast.success('Successfully logged in!');
    } catch (error) {
      console.error('Auth error:', error);
      toast.error('Failed to authenticate. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-red-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-2xl border-0 bg-white/80 backdrop-blur-sm">
        <CardHeader className="text-center pb-8">
          <div className="w-20 h-20 bg-gradient-to-r from-orange-400 to-red-400 rounded-full flex items-center justify-center mx-auto mb-4">
            <School className="w-10 h-10 text-white" />
          </div>
          <CardTitle className="text-2xl font-bold text-gray-800 mb-2">Rhyme Picker</CardTitle>
          <p className="text-gray-600 text-sm">Select rhymes for your school grades</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAuth} className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">School ID</label>
              <Input
                type="text"
                placeholder="Enter your school ID"
                value={schoolId}
                onChange={(e) => setSchoolId(e.target.value)}
                className="h-12 bg-white/70 border-gray-200 focus:border-orange-400 focus:ring-orange-400"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">School Name</label>
              <Input
                type="text"
                placeholder="Enter your school name"
                value={schoolName}
                onChange={(e) => setSchoolName(e.target.value)}
                className="h-12 bg-white/70 border-gray-200 focus:border-orange-400 focus:ring-orange-400"
              />
            </div>
            <Button
              type="submit"
              disabled={loading}
              className="w-full h-12 bg-gradient-to-r from-orange-400 to-red-400 hover:from-orange-500 hover:to-red-500 text-white font-semibold rounded-xl transition-all duration-300 transform hover:scale-105"
            >
              {loading ? 'Authenticating...' : 'Enter School'}
            </Button>

          </form>
        </CardContent>
      </Card>
    </div>
  );
};

const ModeSelectionPage = ({ school, onModeSelect, onLogout }) => {
  const options = [
    {
      id: 'cover',
      title: 'Cover Pages',
      description: 'Design and manage engaging cover pages tailored to each grade.',
      gradient: 'from-rose-400 to-pink-500',
      icon: LayoutTemplate
    },
    {
      id: 'rhymes',
      title: 'Rhymes',
      description: 'Select and organise rhymes to build your customised binders.',
      gradient: 'from-orange-400 to-red-400',
      icon: Music
    },
    {
      id: 'books',
      title: 'Books',
      description: 'Plan and curate the book list appropriate for every class.',
      gradient: 'from-blue-400 to-indigo-500',
      icon: BookMarked
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-red-50 p-6">
      <div className="mx-auto flex max-w-5xl flex-col gap-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-800">Welcome, {school.school_name}</h1>
            <p className="text-gray-600">School ID: {school.school_id}</p>
          </div>
          <Button
            onClick={onLogout}
            variant="outline"
            className="bg-white/80 hover:bg-white border-gray-200"
          >
            Logout
          </Button>
        </div>

        <Card className="border-0 bg-white/80 backdrop-blur-md shadow-xl">
          <CardHeader>
            <CardTitle className="text-2xl font-semibold text-gray-800">Choose what you would like to work on</CardTitle>
            <p className="text-gray-600">
              Select one of the workflows below to continue. You can always return to this menu to switch tasks.
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {options.map((option) => {
                const IconComponent = option.icon;
                return (
                  <Card
                    key={option.id}
                    className="group cursor-pointer border border-transparent bg-white/70 transition-all duration-300 hover:-translate-y-1 hover:border-orange-200 hover:shadow-2xl"
                    onClick={() => onModeSelect(option.id)}
                  >
                    <CardContent className="flex h-full flex-col gap-4 p-6">
                      <div className={`w-16 h-16 rounded-2xl bg-gradient-to-r ${option.gradient} text-white flex items-center justify-center text-2xl shadow-lg transition-transform duration-300 group-hover:scale-110`}>
                        <IconComponent className="h-8 w-8" />
                      </div>
                      <div className="space-y-2">
                        <h3 className="text-xl font-semibold text-gray-800">{option.title}</h3>
                        <p className="text-sm text-gray-600 leading-relaxed">{option.description}</p>
                      </div>
                      <div className="mt-auto">
                        <Button
                          type="button"
                          onClick={() => onModeSelect(option.id)}
                          className="w-full bg-gradient-to-r from-orange-400 to-red-400 text-white shadow-lg transition-all duration-300 hover:from-orange-500 hover:to-red-500"
                        >
                          Explore {option.title}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

// Grade Selection Page
const GradeSelectionPage = ({ school, mode, onGradeSelect, onLogout, onBackToMode }) => {
  const [gradeStatus, setGradeStatus] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const modeConfig = {
    rhymes: {
      title: 'Select a Grade to Manage Rhymes',
      subtitle: 'Review progress and curate the perfect rhyme list for each class.',
      buttonText: 'Select Rhymes'
    },
    cover: {
      title: 'Select a Grade for Cover Pages',
      subtitle: 'Choose a class to start configuring its cover pages.',
      buttonText: 'Select Grade'
    },
    books: {
      title: 'Select a Grade for Books',
      subtitle: 'Pick a class to organise its reading materials.',
      buttonText: 'Select Grade'
    }
  };

  useEffect(() => {
    if (mode !== 'rhymes') {
      setGradeStatus([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    fetchGradeStatus();
  }, [mode]);

  const fetchGradeStatus = async () => {
    try {
      const response = await axios.get(`${API}/rhymes/status/${school.school_id}`);
      setGradeStatus(response.data);
    } catch (error) {
      console.error('Error fetching grade status:', error);
      toast.error('Failed to load grade status');
    } finally {
      setLoading(false);
    }
  };

  const getGradeStatusInfo = (gradeId) => {
    const status = gradeStatus.find(s => s.grade === gradeId);
    return status ? `${status.selected_count} of 25` : '0 of 25';
  };

  const handleDownloadBinder = async (gradeId, event) => {
    event?.stopPropagation();
    event?.preventDefault();

    try {
      const response = await axios.get(`${API}/rhymes/binder/${school.school_id}/${gradeId}`, {
        responseType: 'blob'
      });

      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${gradeId}-rhyme-binder.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Binder download started');
    } catch (error) {
      console.error('Error downloading binder:', error);
      toast.error('Failed to download binder');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-red-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-orange-400 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading grade information...</p>
        </div>
      </div>
    );
  }

  const handleLogoutClick = () => {
    if (typeof onLogout === 'function') {
      onLogout();
    }
    navigate('/');
  };

  const handleBackToMenu = () => {
    if (typeof onBackToMode === 'function') {
      onBackToMode();
    }
    navigate('/');
  };

  const currentMode = modeConfig[mode] || modeConfig.rhymes;

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-red-50 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-8 text-center md:text-left">
          <div>
            <h1 className="text-3xl font-bold text-gray-800 mb-2">{school.school_name}</h1>
            <p className="text-gray-600">School ID: {school.school_id}</p>
          </div>
          <div className="flex items-center justify-center gap-3">
            <Button
              onClick={handleBackToMenu}
              variant="outline"
              className="bg-white/80 hover:bg-white border-gray-200"
            >
              Back to Menu
            </Button>
            <Button
              onClick={handleLogoutClick}
              variant="outline"
              className="bg-white/80 hover:bg-white border-gray-200"
            >
              Logout
            </Button>
          </div>
        </div>

        <div className="mb-8 space-y-2 text-center md:text-left">
          <h2 className="text-2xl font-semibold text-gray-800">{currentMode.title}</h2>
          <p className="text-gray-600">{currentMode.subtitle}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {GRADE_OPTIONS.map((grade) => (
            <Card
              key={grade.id}
              className="group cursor-pointer transition-all duration-300 hover:scale-105 hover:shadow-2xl border-0 bg-white/80 backdrop-blur-sm"
              onClick={() => onGradeSelect(grade.id, mode)}
            >
              <CardContent className="p-6 text-center">
                <div className={`w-16 h-16 bg-gradient-to-r ${grade.color} rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform duration-300`}>
                  <span className="text-2xl">{grade.icon}</span>
                </div>
                <h3 className="text-xl font-bold text-gray-800 mb-2">{grade.name}</h3>
                {mode === 'rhymes' && (
                  <Badge variant="secondary" className="mb-4">
                    {getGradeStatusInfo(grade.id)} Rhymes Selected
                  </Badge>
                )}
                <div className="space-y-3">
                  <Button
                    className={`w-full bg-gradient-to-r ${grade.color} hover:opacity-90 text-white font-semibold rounded-xl transition-all duration-300`}
                  >
                    {currentMode.buttonText}
                  </Button>
                  {mode === 'rhymes' && (() => {
                    const status = gradeStatus.find(s => s.grade === grade.id);
                    const isComplete = status ? status.selected_count >= 25 : false;
                    if (!isComplete) return null;

                    return (
                      <Button
                        variant="outline"
                        onClick={(event) => handleDownloadBinder(grade.id, event)}
                        className="w-full flex items-center justify-center gap-2 border-orange-300 text-orange-500 hover:text-orange-600 hover:bg-orange-50 bg-white/90"
                      >
                        <Download className="w-4 h-4" />
                        Download Binder
                      </Button>
                    );
                  })()}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};

const FeaturePlaceholderPage = ({ school, mode, grade, onBackToGrades, onBackToMode, onLogout }) => {
  const navigate = useNavigate();

  const placeholderConfig = {
    cover: {
      title: 'Cover Pages experience coming soon',
      subtitle: 'We are preparing the tools you need to craft beautiful cover pages.',
      action: 'cover pages'
    },
    books: {
      title: 'Books management coming soon',
      subtitle: 'Soon you will be able to curate books for every class from here.',
      action: 'book selections'
    }
  };

  const gradeInfo = GRADE_OPTIONS.find((item) => item.id === grade);
  const modeCopy = placeholderConfig[mode] || placeholderConfig.cover;

  const handleBackToGrades = () => {
    if (typeof onBackToGrades === 'function') {
      onBackToGrades();
    }
    navigate('/');
  };

  const handleBackToMenu = () => {
    if (typeof onBackToMode === 'function') {
      onBackToMode();
    }
    navigate('/');
  };

  const handleLogoutClick = () => {
    if (typeof onLogout === 'function') {
      onLogout();
    }
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-red-50 p-6">
      <div className="mx-auto flex max-w-3xl flex-col gap-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between text-center md:text-left">
          <div>
            <h1 className="text-3xl font-bold text-gray-800">{school.school_name}</h1>
            <p className="text-gray-600">School ID: {school.school_id}</p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button onClick={handleBackToMenu} variant="outline" className="bg-white/80 hover:bg-white border-gray-200">
              Back to Menu
            </Button>
            <Button onClick={handleBackToGrades} variant="outline" className="bg-white/80 hover:bg-white border-gray-200">
              Choose another Grade
            </Button>
            <Button onClick={handleLogoutClick} variant="outline" className="bg-white/80 hover:bg-white border-gray-200">
              Logout
            </Button>
          </div>
        </div>

        <Card className="border-0 bg-white/85 backdrop-blur shadow-xl">
          <CardHeader className="flex flex-col items-center text-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-400 to-red-400 text-white shadow-lg">
              <Clock className="h-8 w-8" />
            </div>
            <div>
              <CardTitle className="text-2xl font-semibold text-gray-800">{modeCopy.title}</CardTitle>
              <p className="mt-2 text-sm text-gray-600">{modeCopy.subtitle}</p>
            </div>
          </CardHeader>
          <CardContent className="space-y-6 text-center">
            <p className="text-gray-700">
              The tools for managing {modeCopy.action} for{' '}
              <span className="font-semibold text-gray-900">{gradeInfo ? gradeInfo.name : grade}</span>{' '}
              are on the way. We are working hard to bring them to you soon.
            </p>
            <p className="text-sm text-gray-500">
              In the meantime you can return to the main menu or pick another grade to continue working on available workflows.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Button onClick={handleBackToMenu} className="bg-gradient-to-r from-orange-400 to-red-400 text-white shadow-lg hover:from-orange-500 hover:to-red-500">
                Back to Menu
              </Button>
              <Button onClick={handleBackToGrades} variant="outline" className="border-orange-300 text-orange-500 hover:text-orange-600 hover:bg-orange-50">
                Choose another Grade
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

// Tree Menu Component
const TreeMenu = ({ rhymesData, onRhymeSelect, showReusable, reusableRhymes, onToggleReusable, hideFullPageRhymes }) => {
  const [expandedGroups, setExpandedGroups] = useState({});

  const toggleGroup = (pageKey) => {
    setExpandedGroups(prev => ({
      ...prev,
      [pageKey]: !prev[pageKey]
    }));
  };

  const currentRhymes = showReusable ? reusableRhymes : rhymesData;

  // Filter out full-page rhymes if hideFullPageRhymes is true
  const filteredRhymes = hideFullPageRhymes
    ? Object.fromEntries(
      Object.entries(currentRhymes).filter(([pageKey]) => {
        const numericKey = Number.parseFloat(pageKey);
        if (!Number.isFinite(numericKey)) {
          return true;
        }
        return numericKey <= 0.5;
      })
    )
    : currentRhymes;

  const formatPageKey = (pageKey) => {
    const numericKey = Number.parseFloat(pageKey);
    if (!Number.isFinite(numericKey)) {
      return pageKey;
    }

    if (Math.abs(numericKey - 2) < 0.001) {
      return 'Page 2.0 Rhymes';
    }

    const normalized = numericKey % 1 === 0 ? numericKey.toFixed(1) : numericKey.toString();
    return `${normalized} Page${numericKey !== 1 ? 's' : ''}`;
  };

  const sortedGroups = Object.entries(filteredRhymes).sort(([keyA], [keyB]) => {
    const numericA = Number.parseFloat(keyA);
    const numericB = Number.parseFloat(keyB);

    const aIsNumber = Number.isFinite(numericA);
    const bIsNumber = Number.isFinite(numericB);

    if (aIsNumber && bIsNumber) {
      return numericA - numericB;
    }

    if (aIsNumber) return -1;
    if (bIsNumber) return 1;

    return keyA.localeCompare(keyB);
  });

  if (!filteredRhymes || Object.keys(filteredRhymes).length === 0) {
    return (
      <div className="p-4 text-center text-gray-500">
        <Music className="w-12 h-12 mx-auto mb-2 opacity-50" />
        <p>{showReusable ? 'No reusable rhymes available' : 'No rhymes available'}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full max-h-[calc(100vh-220px)] flex-col overflow-hidden rounded-lg border border-gray-200 bg-white/50 backdrop-blur-sm">
      <div className="border-b bg-white/80 p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-semibold text-gray-800 flex items-center gap-2">
            <BookOpen className="w-5 h-5" />
            {showReusable ? 'Reusable Rhymes' : 'Available Rhymes'}
          </h3>
          <Button
            onClick={onToggleReusable}
            variant="outline"
            size="sm"
            className="text-xs"
          >
            <Eye className="w-3 h-3 mr-1" />
            {showReusable ? 'Show Available' : 'Show Reusable'}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {sortedGroups.map(([pageKey, rhymes]) => {
          if (!rhymes || rhymes.length === 0) return null;
          const numericKey = Number.parseFloat(pageKey);
          const badgeLabel = Number.isFinite(numericKey)
            ? (Math.abs(numericKey - Math.round(numericKey)) < 0.001
              ? numericKey.toFixed(1)
              : numericKey.toString())
            : pageKey;

          return (
            <Collapsible key={pageKey} open={expandedGroups[pageKey]} onOpenChange={() => toggleGroup(pageKey)}>
              <CollapsibleTrigger className="flex items-center justify-between w-full p-3 text-left hover:bg-white/50 rounded-lg transition-colors duration-200">
                <span className="font-medium text-gray-700 flex items-center gap-2">
                  <div className="w-6 h-6 bg-gradient-to-r from-orange-400 to-red-400 rounded-full flex items-center justify-center text-white text-xs font-bold">
                    {badgeLabel}
                  </div>
                  {formatPageKey(pageKey)} ({rhymes.length})
                </span>
                {expandedGroups[pageKey] ?
                  <ChevronDown className="w-4 h-4 text-gray-500" /> :
                  <ChevronRight className="w-4 h-4 text-gray-500" />
                }
              </CollapsibleTrigger>
              <CollapsibleContent className="pl-4">
                <div className="mt-2 space-y-1">
                  {rhymes.map((rhyme) => (
                    <div
                      key={rhyme.code}
                      className="group flex items-center justify-between gap-3 rounded-lg border border-transparent bg-white/50 p-3 transition-all duration-200 hover:border-orange-200 hover:bg-white/80"
                    >
                      <div className="flex-1">
                        <p className="font-medium text-gray-800 transition-colors duration-200 group-hover:text-orange-600">
                          {rhyme.name}
                        </p>
                        <p className="mt-1 text-xs text-gray-500">
                          Code: {rhyme.code} • {rhyme.personalized === "Yes" ? "Personalized" : "Standard"}
                          {rhyme.used_in_grades && (
                            <span className="ml-2 text-blue-600">
                              (Used in: {rhyme.used_in_grades.join(', ')})
                            </span>
                          )}
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        onClick={() => onRhymeSelect(rhyme)}
                        className="shrink-0 rounded-full border-orange-200 text-orange-500 transition-colors duration-200 hover:border-orange-300 hover:text-orange-600"
                        aria-label={`Add ${rhyme.name}`}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>
    </div>
  );
};

// Main Rhyme Selection Interface
const RhymeSelectionPage = ({ school, grade, onBack, onLogout }) => {
  const [availableRhymes, setAvailableRhymes] = useState({});
  const [reusableRhymes, setReusableRhymes] = useState({});
  const [selectedRhymes, setSelectedRhymes] = useState([]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [showTreeMenu, setShowTreeMenu] = useState(false);
  const [showReusable, setShowReusable] = useState(false);
  const [currentPosition, setCurrentPosition] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const svgCacheRef = useRef(new Map());
  const svgInFlightRef = useRef(new Map());
  const imageAssetCacheRef = useRef(new Set());
  const imageInFlightRef = useRef(new Map());
  const selectedRhymesRef = useRef([]);
  const pageFetchPromisesRef = useRef(new Map());

  const MAX_RHYMES_PER_GRADE = 25;

  useEffect(() => {
    selectedRhymesRef.current = Array.isArray(selectedRhymes) ? selectedRhymes : [];
  }, [selectedRhymes]);

  const extractImageUrlsFromSvg = useCallback((svgContent) => {
    if (!svgContent || typeof svgContent !== 'string') {
      return [];
    }

    if (typeof window === 'undefined' || typeof window.DOMParser === 'undefined') {
      return [];
    }

    try {
      const parser = new window.DOMParser();
      const doc = parser.parseFromString(svgContent, 'image/svg+xml');
      const imageNodes = doc.querySelectorAll('image, img');
      const urls = new Set();

      imageNodes.forEach((node) => {
        if (!node) {
          return;
        }

        const candidates = [
          node.getAttribute('href'),
          node.getAttribute('xlink:href'),
          node.getAttribute('data-href'),
          node.getAttribute('src')
        ];

        candidates.forEach((candidate) => {
          if (typeof candidate !== 'string') {
            return;
          }

          const trimmed = candidate.trim();

          if (!trimmed || /^data:/i.test(trimmed)) {
            return;
          }

          if (trimmed.startsWith('//') && typeof window !== 'undefined' && window.location?.protocol) {
            urls.add(`${window.location.protocol}${trimmed}`);
            return;
          }

          if (/^https?:/i.test(trimmed)) {
            urls.add(trimmed);
          }
        });
      });

      return Array.from(urls);
    } catch (error) {
      console.error('Error parsing SVG for image asset references:', error);
      return [];
    }
  }, []);

  const prefetchImageAssets = useCallback(
    async (svgMarkup) => {
      if (!svgMarkup || typeof svgMarkup !== 'string') {
        return;
      }

      const assetUrls = extractImageUrlsFromSvg(svgMarkup);
      if (!assetUrls.length) {
        return;
      }

      const tasks = assetUrls
        .map((url) => {
          if (imageAssetCacheRef.current.has(url)) {
            return null;
          }

          if (imageInFlightRef.current.has(url)) {
            return imageInFlightRef.current.get(url);
          }

          const request = axios
            .get(url, { responseType: 'blob' })
            .then(() => {
              imageAssetCacheRef.current.add(url);
            })
            .catch((error) => {
              console.error('Error prefetching image asset:', url, error);
            })
            .finally(() => {
              imageInFlightRef.current.delete(url);
            });

          imageInFlightRef.current.set(url, request);
          return request;
        })
        .filter(Boolean);

      if (tasks.length > 0) {
        await Promise.allSettled(tasks);
      }
    },
    [extractImageUrlsFromSvg]
  );

  const fetchSvgForRhyme = useCallback(
    async (rhymeCode) => {
      const code = typeof rhymeCode === 'string' ? rhymeCode : rhymeCode?.code;

      if (!code) {
        return null;
      }

      if (svgCacheRef.current.has(code)) {
        const cached = svgCacheRef.current.get(code);
        if (cached) {
          await prefetchImageAssets(cached);
        }
        return cached;
      }

      if (svgInFlightRef.current.has(code)) {
        const pending = await svgInFlightRef.current.get(code);
        if (pending) {
          await prefetchImageAssets(pending);
        }
        return pending;
      }

      const requestPromise = axios
        .get(`${API}/rhymes/svg/${code}`)
        .then((response) => {
          const svgContent = sanitizeRhymeSvgContent(response.data, code);
          svgCacheRef.current.set(code, svgContent);
          return svgContent;
        })
        .catch((error) => {
          console.error('Error fetching rhyme SVG:', error);
          return null;
        })
        .finally(() => {
          svgInFlightRef.current.delete(code);
        });

      svgInFlightRef.current.set(code, requestPromise);

      const svgContent = await requestPromise;
      if (svgContent) {
        await prefetchImageAssets(svgContent);
      }

      return svgContent;
    },
    [prefetchImageAssets]
  );

  const ensurePageAssets = useCallback(
    async (pageIndex, baseSelections) => {
      const normalizedPageIndex = Number(pageIndex);

      if (!Number.isFinite(normalizedPageIndex) || normalizedPageIndex < 0) {
        return;
      }

      const sourceSelections = Array.isArray(baseSelections) ? baseSelections : selectedRhymesRef.current;
      if (!Array.isArray(sourceSelections) || sourceSelections.length === 0) {
        return;
      }

      const rhymesForPage = sourceSelections.filter(
        (rhyme) => Number(rhyme?.page_index) === normalizedPageIndex
      );

      const missingRhymes = rhymesForPage.filter((rhyme) => {
        const content = typeof rhyme?.svgContent === 'string' ? rhyme.svgContent.trim() : '';
        return content.length === 0;
      });

      if (missingRhymes.length === 0) {
        return;
      }

      if (pageFetchPromisesRef.current.has(normalizedPageIndex)) {
        try {
          await pageFetchPromisesRef.current.get(normalizedPageIndex);
        } catch (error) {
          // Ignore errors from previous attempts to allow retries on next navigation.
        }
        return;
      }

      const fetchPromise = (async () => {
        const results = await Promise.all(
          missingRhymes.map(async (rhyme) => {
            const svgContent = await fetchSvgForRhyme(rhyme.code);
            return { code: rhyme.code, page_index: rhyme.page_index, svgContent };
          })
        );

        const successful = results.filter((result) => typeof result.svgContent === 'string' && result.svgContent.trim());

        if (successful.length === 0) {
          return;
        }

        setSelectedRhymes((prev) => {
          const prevArray = Array.isArray(prev) ? prev : [];
          const updated = prevArray.map((existing) => {
            if (!existing) {
              return existing;
            }

            if (Number(existing.page_index) !== normalizedPageIndex) {
              return existing;
            }

            const match = successful.find(
              (result) =>
                result.code === existing.code &&
                Number(result.page_index) === Number(existing.page_index)
            );

            if (!match) {
              return existing;
            }

            return { ...existing, svgContent: match.svgContent };
          });

          selectedRhymesRef.current = updated;
          return updated;
        });
      })();

      pageFetchPromisesRef.current.set(normalizedPageIndex, fetchPromise);

      try {
        await fetchPromise;
      } finally {
        pageFetchPromisesRef.current.delete(normalizedPageIndex);
      }
    },
    [fetchSvgForRhyme]
  );

  useEffect(() => {
    fetchAvailableRhymes();
    fetchReusableRhymes();
    fetchSelectedRhymes();
  }, []);

  const computePageUsage = (rhymesList = selectedRhymes) => {
    const usageMap = new Map();
    let highestIndex = -1;
    let lowestIndex = Number.POSITIVE_INFINITY;

    if (Array.isArray(rhymesList)) {
      rhymesList.forEach((selection) => {
        if (!selection) return;
        const numericIndex = Number(selection?.page_index);
        if (!Number.isFinite(numericIndex) || numericIndex < 0) {
          return;
        }

        const pageIndex = numericIndex;
        const pagesValue = parsePagesValue(selection?.pages);
        const entry = usageMap.get(pageIndex) || { top: false, bottom: false };

        if (pagesValue === 0.5) {
          const slot = normalizeSlot(selection?.position, 'top') || 'top';
          entry[slot] = true;
        } else {
          entry.top = true;
          entry.bottom = true;
        }

        usageMap.set(pageIndex, entry);
        highestIndex = Math.max(highestIndex, pageIndex);
        lowestIndex = Math.min(lowestIndex, pageIndex);
      });
    }

    return {
      usageMap,
      highestIndex,
      lowestIndex: lowestIndex === Number.POSITIVE_INFINITY ? -1 : lowestIndex
    };
  };

  const computeNextAvailablePageInfoFromUsage = ({ usageMap, highestIndex }) => {
    for (let index = 0; index < MAX_RHYMES_PER_GRADE; index += 1) {
      const entry = usageMap.get(index);
      if (!entry) {
        return { index, hasCapacity: true, highestIndex };
      }
      if (!entry.top || !entry.bottom) {
        return { index, hasCapacity: true, highestIndex };
      }
    }

    const fallbackIndex = highestIndex < 0 ? 0 : Math.min(highestIndex, MAX_RHYMES_PER_GRADE - 1);
    return { index: fallbackIndex, hasCapacity: false, highestIndex };
  };

  const computeNextAvailablePageInfo = (rhymesList = selectedRhymes) => {
    const usage = computePageUsage(rhymesList);
    const info = computeNextAvailablePageInfoFromUsage(usage);
    return {
      ...info,
      lowestIndex: usage.lowestIndex
    };
  };

  const fetchAvailableRhymes = async () => {
    try {
      const response = await axios.get(`${API}/rhymes/available/${school.school_id}/${grade}`);
      setAvailableRhymes(response.data);
    } catch (error) {
      console.error('Error fetching available rhymes:', error);
    }
  };

  const fetchReusableRhymes = async () => {
    try {
      const response = await axios.get(`${API}/rhymes/selected/other-grades/${school.school_id}/${grade}`);
      setReusableRhymes(response.data);
    } catch (error) {
      console.error('Error fetching reusable rhymes:', error);
    }
  };

  const fetchSelectedRhymes = async () => {
    try {
      const response = await axios.get(`${API}/rhymes/selected/${school.school_id}`);
      const gradeSelections = response.data[grade] || [];

      const rhymesWithPlaceholders = gradeSelections.map((rhyme) => {
        const existingContent =
          typeof rhyme?.svgContent === 'string' && rhyme.svgContent.trim().length > 0
            ? sanitizeRhymeSvgContent(rhyme.svgContent, rhyme.code)
            : null;

        return {
          ...rhyme,
          position: rhyme.position || null,
          svgContent: existingContent
        };
      });

      const sortedSelections = sortSelections(rhymesWithPlaceholders);
      const usage = computePageUsage(sortedSelections);
      const nextInfo = computeNextAvailablePageInfoFromUsage(usage);
      const hasExistingSelections = Array.isArray(sortedSelections) && sortedSelections.length > 0;
      const initialIndex = hasExistingSelections && Number.isFinite(usage.lowestIndex) && usage.lowestIndex >= 0
        ? usage.lowestIndex
        : (Number.isFinite(nextInfo.index) ? nextInfo.index : 0);

      setSelectedRhymes(sortedSelections);
      selectedRhymesRef.current = sortedSelections;
      setCurrentPageIndex(initialIndex);

      if (hasExistingSelections) {
        try {
          await ensurePageAssets(initialIndex, sortedSelections);
        } catch (prefetchError) {
          console.error('Error preloading initial rhyme SVGs:', prefetchError);
        }
      }
    } catch (error) {
      console.error('Error fetching selected rhymes:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddRhyme = (position) => {
    setCurrentPosition(position);
    setShowTreeMenu(true);
    setShowReusable(false);
  };

  const normalizeSlot = (value, fallback = '') => {
    if (value === null || value === undefined) return fallback;
    const normalized = value.toString().trim().toLowerCase();
    return normalized === 'top' || normalized === 'bottom' ? normalized : fallback;
  };

  const parsePagesValue = (pagesValue) => {
    if (typeof pagesValue === 'number') {
      return Number.isFinite(pagesValue) ? pagesValue : null;
    }
    if (typeof pagesValue === 'string') {
      const trimmed = pagesValue.trim();
      if (trimmed === '') {
        return null;
      }
      const parsed = Number(trimmed);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  };

  const sortSelections = (selections) => {
    if (!Array.isArray(selections)) {
      return [];
    }

    const getPositionWeight = (selection) => {
      const normalized = normalizeSlot(selection?.position, 'top');
      return normalized === 'bottom' ? 1 : 0;
    };

    return [...selections].sort((a, b) => {
      const indexA = Number(a?.page_index ?? 0);
      const indexB = Number(b?.page_index ?? 0);

      if (indexA !== indexB) {
        return indexA - indexB;
      }

      return getPositionWeight(a) - getPositionWeight(b);
    });
  };

  const computeRemovalsForSelection = ({ selections, pageIndex, normalizedPosition, newPages }) => {
    if (!Array.isArray(selections) || selections.length === 0) {
      return [];
    }

    return selections.filter(existing => {
      if (!existing) return false;
      if (Number(existing.page_index) !== Number(pageIndex)) {
        return false;
      }

      const existingPages = parsePagesValue(existing.pages) ?? 1;

      if (newPages > 0.5) {
        return true;
      }

      if (existingPages > 0.5) {
        return true;
      }

      const existingPosition = normalizeSlot(existing.position, 'top');

      if (existingPosition) {
        return existingPosition === normalizedPosition;
      }

      return normalizedPosition === 'top';
    });
  };

  const handleRhymeSelect = async (rhyme) => {
    try {
      const pageIndex = currentPageIndex;
      const prevArray = Array.isArray(selectedRhymes) ? selectedRhymes : [];
      const pagesValue = parsePagesValue(rhyme?.pages) ?? 1;
      const normalizedPosition = pagesValue === 0.5
        ? normalizeSlot(currentPosition, 'top') || 'top'
        : 'top';

      const removals = computeRemovalsForSelection({
        selections: prevArray,
        pageIndex,
        normalizedPosition,
        newPages: pagesValue
      });

      const filtered = prevArray.filter(existing => !removals.includes(existing));

      const baseRhyme = {
        page_index: pageIndex,
        code: rhyme.code,
        name: rhyme.name,
        pages: rhyme.pages,
        svgContent: null,
        position: normalizedPosition
      };

      const nextArray = sortSelections([...filtered, baseRhyme]);
      const totalSelected = nextArray.length;
      const isReplacement = removals.length > 0;

      if (!isReplacement && totalSelected > MAX_RHYMES_PER_GRADE) {
        toast.error('Max of 25 rhymes per grade');
        setShowTreeMenu(false);
        setCurrentPosition(null);
        return;
      }

      await axios.post(`${API}/rhymes/select`, {
        school_id: school.school_id,
        grade: grade,
        page_index: pageIndex,
        rhyme_code: rhyme.code,
        position: normalizedPosition
      });

      setSelectedRhymes(nextArray);
      selectedRhymesRef.current = nextArray;

      try {
        const svgContent = await fetchSvgForRhyme(rhyme.code);

        if (svgContent) {
          setSelectedRhymes((prev) => {
            const prevArrayInner = Array.isArray(prev) ? prev : [];

            const updated = prevArrayInner.map((existing) => {
              if (!existing) return existing;
              if (Number(existing.page_index) !== Number(pageIndex)) {
                return existing;
              }

              const candidatePosition = resolveRhymePosition(existing, {
                rhymesForContext: prevArrayInner
              });

              if (existing.code === rhyme.code && candidatePosition === normalizedPosition) {
                return {
                  ...existing,
                  svgContent
                };
              }

              return existing;
            });

            selectedRhymesRef.current = updated;
            return updated;
          });
        }
      } catch (svgError) {
        console.error('Error fetching rhyme SVG:', svgError);
      }

      const nextInfo = computeNextAvailablePageInfo(nextArray);

      if (isReplacement) {
        setCurrentPageIndex(pageIndex);
        if (Number.isFinite(pageIndex)) {
          ensurePageAssets(pageIndex).catch((assetError) => {
            console.error('Error loading rhyme SVGs for page:', assetError);
          });
        }
      } else {
        setTimeout(() => {
          const nextIndex = Number.isFinite(nextInfo.index) ? nextInfo.index : pageIndex;
          setCurrentPageIndex(nextIndex);
          if (Number.isFinite(nextIndex)) {
            ensurePageAssets(nextIndex).catch((assetError) => {
              console.error('Error loading rhyme SVGs for page:', assetError);
            });
          }
        }, 400);
      }

      await fetchAvailableRhymes();
      await fetchReusableRhymes();
      setShowTreeMenu(false);
      setCurrentPosition(null);
    } catch (error) {
      console.error('Error selecting rhyme:', error);
    }
  };

  const resolveRhymePosition = (rhyme, {
    explicitPosition,
    rhymesForContext
  } = {}) => {
    const normalizedExplicit = normalizeSlot(explicitPosition);
    if (normalizedExplicit) {
      return normalizedExplicit;
    }

    const normalizedFromRhyme = normalizeSlot(rhyme?.position);
    if (normalizedFromRhyme) {
      return normalizedFromRhyme;
    }

    const pages = parsePagesValue(rhyme?.pages);
    if (pages === 1 || pages === 1.0) {
      return 'top';
    }

    if (pages === 0.5) {
      const pageIndex = Number(rhyme?.page_index);
      const normalizedPageIndex = Number.isFinite(pageIndex)
        ? pageIndex
        : Number(currentPageIndex);
      const contextRhymes = Array.isArray(rhymesForContext) ? rhymesForContext : selectedRhymes;
      const halfPageRhymes = (contextRhymes || []).filter((r) => {
        if (!r) return false;
        if (Number(r.page_index) !== normalizedPageIndex) return false;
        return parsePagesValue(r.pages) === 0.5;
      });

      if (halfPageRhymes.length === 1) {
        return 'top';
      }

      const matchIndex = halfPageRhymes.findIndex((r) => r?.code === rhyme?.code);
      if (matchIndex === 0) {
        return 'top';
      }
      if (matchIndex === 1) {
        return 'bottom';
      }

      if (matchIndex > 1) {
        return 'bottom';
      }
    }

    return 'top';
  };

  const handleRemoveRhyme = async (rhyme, explicitPosition) => {
    if (!rhyme || !rhyme.code) {
      console.error("handleRemoveRhyme: missing rhyme or code", rhyme);
      return;
    }

    const position = resolveRhymePosition(rhyme, { explicitPosition });

    console.log("→ Deleting rhyme (request):", {
      code: rhyme.code,
      position,
      currentPageIndex,
      grade
    });

    try {
      const res = await axios.delete(
        `/api/rhymes/remove/${school.school_id}/${grade}/${currentPageIndex}/${position}`
      );
      console.log("← Delete response:", res.data);

      setSelectedRhymes(prev => {
        const filtered = prev.filter(r => {
          if (Number(r.page_index) !== Number(currentPageIndex)) return true;
          if (r.code !== rhyme.code) return true;
          const candidatePosition = resolveRhymePosition(r, {
            rhymesForContext: prev
          });
          return candidatePosition !== position;
        });
        selectedRhymesRef.current = filtered;
        return filtered;
      });
      await fetchAvailableRhymes();
      await fetchReusableRhymes();
    } catch (err) {
      console.error("Delete failed:", err.response?.data || err.message);
    }
  };

  const handlePageChange = async (newPageIndex) => {
    const clampedIndex = Math.max(0, Math.min(newPageIndex, MAX_RHYMES_PER_GRADE - 1));

    if (Number.isFinite(clampedIndex)) {
      try {
        await ensurePageAssets(clampedIndex);
      } catch (error) {
        console.error('Error loading rhyme SVGs for page:', error);
      }
    }

    setCurrentPageIndex(clampedIndex);
  };

  const handleToggleReusable = () => {
    setShowReusable(!showReusable);
  };

  const pageUsage = useMemo(() => computePageUsage(selectedRhymes), [selectedRhymes]);
  const nextPageInfo = useMemo(() => computeNextAvailablePageInfoFromUsage(pageUsage), [pageUsage]);
  const nextAvailablePageIndex = nextPageInfo.index;
  const hasNextPageCapacity = nextPageInfo.hasCapacity;
  const highestFilledIndex = nextPageInfo.highestIndex;

  // Calculate total pages
  const calculateTotalPages = () => {
    const normalizedHighest = Number.isFinite(highestFilledIndex) ? highestFilledIndex : -1;
    const normalizedNext = Number.isFinite(nextAvailablePageIndex) ? nextAvailablePageIndex : 0;
    const normalizedCurrent = Number.isFinite(currentPageIndex) ? currentPageIndex : 0;

    const candidates = [normalizedHighest, normalizedNext, normalizedCurrent]
      .filter(index => Number.isFinite(index) && index >= 0);

    const maxIndex = candidates.length > 0 ? Math.max(...candidates) : 0;

    return Math.min(maxIndex + 1, MAX_RHYMES_PER_GRADE);
  };

  useEffect(() => {
    const normalizedHighest = Number.isFinite(highestFilledIndex) ? highestFilledIndex : -1;
    const normalizedNext = Number.isFinite(nextAvailablePageIndex) ? nextAvailablePageIndex : 0;
    const normalizedCurrent = Number.isFinite(currentPageIndex) ? currentPageIndex : 0;

    const candidates = [normalizedHighest, normalizedNext, normalizedCurrent]
      .filter(index => Number.isFinite(index) && index >= 0);

    const maxIndex = candidates.length > 0 ? Math.max(...candidates) : 0;
    const total = Math.min(maxIndex + 1, MAX_RHYMES_PER_GRADE);

    if (total <= 0) {
      if (currentPageIndex !== 0) {
        setCurrentPageIndex(0);
      }
      return;
    }

    const maxAllowed = total - 1;
    if (currentPageIndex > maxAllowed) {
      setCurrentPageIndex(Math.max(0, maxAllowed));
    }
  }, [highestFilledIndex, nextAvailablePageIndex, currentPageIndex]);

  // Get rhymes for current page
  const getCurrentPageRhymes = () => {
    const pageRhymes = { top: null, bottom: null, layout: 'standard' };

    if (!Array.isArray(selectedRhymes) || selectedRhymes.length === 0) return pageRhymes;

    // Double-page rhymes (occupy both containers and mirror the SVG)
    for (const r of selectedRhymes) {
      if (!r) continue;
      if (Number(r.page_index) !== Number(currentPageIndex)) continue;
      const pages = parsePagesValue(r.pages);
      if (pages === 2 || pages === 2.0) {
        pageRhymes.top = r;
        pageRhymes.bottom = r;
        pageRhymes.layout = 'double';
        return pageRhymes;
      }
    }

    // Prefer full-page rhyme
    for (const r of selectedRhymes) {
      if (!r) continue;
      if (Number(r.page_index) !== Number(currentPageIndex)) continue;
      const pages = parsePagesValue(r.pages);
      if (pages === 1) {
        pageRhymes.top = r;
        pageRhymes.bottom = null;
        return pageRhymes;
      }
    }

    // Place half-page rhymes by explicit position (do not infer)
    for (const r of selectedRhymes) {
      if (!r) continue;
      if (Number(r.page_index) !== Number(currentPageIndex)) continue;
      const pages = parsePagesValue(r.pages);
      if (pages === 0.5) {
        const pos = normalizeSlot(r.position, 'top') || 'top';
        if (pos === 'top') pageRhymes.top = r;
        else if (pos === 'bottom') pageRhymes.bottom = r;
      }
    }

    return pageRhymes;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-red-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-orange-400 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading rhyme data...</p>
        </div>
      </div>
    );
  }

  const totalPages = calculateTotalPages();
  const currentPageRhymes = getCurrentPageRhymes();
  const hasTopRhyme = currentPageRhymes.top !== null;
  const hasBottomRhyme = currentPageRhymes.bottom !== null;
  const isDoublePageLayout = currentPageRhymes.layout === 'double';
  const isTopFullPage = hasTopRhyme && !isDoublePageLayout && parsePagesValue(currentPageRhymes.top.pages) === 1;
  const showBottomContainer = isDoublePageLayout ? false : !isTopFullPage;
  const doublePageSvgContent = isDoublePageLayout ? currentPageRhymes.top?.svgContent || '' : '';

  const renderDoublePageSvg = () => {
    if (typeof doublePageSvgContent === 'string' && doublePageSvgContent.trim().length > 0) {
      return (
        <div
          className="rhyme-svg-content"
          dangerouslySetInnerHTML={{ __html: doublePageSvgContent }}
        />
      );
    }

    return (
      <div className="rhyme-svg-content double-page-fallback">
        <span className="text-sm text-gray-500">SVG preview unavailable</span>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-red-50">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-6 sm:px-6">
        {/* Header */}
        <div className="mb-6 flex flex-shrink-0 flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800 capitalize">{grade} Grade - Rhyme Selection</h1>
            <p className="text-gray-600">{school.school_name} ({school.school_id})</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={onBack}
              variant="outline"
              className="bg-white/80 hover:bg-white border-gray-200"
            >
              Back to Grades
            </Button>
            <Button
              onClick={() => {
                if (typeof onLogout === 'function') {
                  onLogout();
                }
                navigate('/');
              }}
              variant="outline"
              className="bg-white/80 hover:bg-white border-gray-200 text-red-600 hover:text-red-700"
            >
              Logout
            </Button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-hidden">
          <div className="relative h-full">

            {/* Dual Container Interface */}
            <div className="flex h-full flex-col items-center">
              <div className="flex h-full w-full flex-col">

                {/* Navigation Controls */}
                <div className="flex-shrink-0 space-y-6">
                  <div className="flex items-center justify-between">
                    <Button
                      onClick={() => void handlePageChange(Math.max(0, currentPageIndex - 1))}
                      disabled={currentPageIndex === 0}
                      variant="outline"
                      size="sm"
                    >
                      <ChevronLeft className="w-4 h-4 mr-1" />
                      Previous
                    </Button>

                    <div className="text-sm text-gray-600 font-medium">
                      Page {currentPageIndex + 1} of {totalPages}
                    </div>

                    <Button
                      onClick={() => void handlePageChange(Math.min(totalPages - 1, currentPageIndex + 1))}
                      disabled={currentPageIndex >= totalPages - 1}
                      variant="outline"
                      size="sm"
                    >
                      Next
                      <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  </div>
                </div>

                <div className="flex-1 min-h-0 flex flex-col">
                  <div className="flex-1 min-h-0 py-4">
                    <div className="flex h-full items-center justify-center">

                      <div className="relative flex w-full justify-center transition-all duration-300 ease-out">

                        <div className="a4-preview relative flex w-full flex-col overflow-hidden">
                          {showBottomContainer && (
                            <div className="pointer-events-none absolute inset-x-12 top-1/2 h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent" />
                          )}
                          <div className="rhyme-page-grid h-full">
                            {isDoublePageLayout ? (
                              <div className="relative flex w-full min-h-0 flex-col rhyme-slot double-page-slot">
                                <div className="relative flex flex-1 min-h-0 flex-col rhyme-slot-wrapper">
                                  <Button
                                    onClick={() => handleAddRhyme('top')}
                                    variant="outline"
                                    className="absolute top-4 right-4 z-10 bg-white/90 backdrop-blur px-3 sm:px-4 py-2 text-sm text-gray-700 shadow-md hover:bg-white"
                                  >
                                    <Replace className="w-4 h-4 mr-2" />
                                    Replace
                                  </Button>

                                  <div className="rhyme-slot-container has-svg double-page">
                                    <div className="double-page-container">
                                      <div className="double-page-pane">
                                        <div className="double-page-pane-header">
                                          <Badge variant="secondary" className="double-page-badge">Page 1.0</Badge>
                                        </div>
                                        {renderDoublePageSvg()}
                                      </div>
                                      <div className="double-page-divider" aria-hidden="true" />
                                      <div className="double-page-pane">
                                        <div className="double-page-pane-header">
                                          <Badge variant="secondary" className="double-page-badge">Page 1.0</Badge>
                                        </div>
                                        {renderDoublePageSvg()}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <>
                                <div

                                  className="relative flex w-full min-h-0 flex-col rhyme-slot"

                                >
                                  {hasTopRhyme ? (
                                    <div className="relative flex flex-1 min-h-0 flex-col rhyme-slot-wrapper">
                                      <Button
                                        onClick={() => handleAddRhyme('top')}
                                        variant="outline"
                                        className="absolute top-4 right-4 z-10 bg-white/90 backdrop-blur px-3 sm:px-4 py-2 text-sm text-gray-700 shadow-md hover:bg-white"
                                      >
                                        <Replace className="w-4 h-4 mr-2" />
                                        Replace
                                      </Button>

                                      <div className={`rhyme-slot-container${hasTopRhyme ? ' has-svg' : ''}`}>

                                        <div
                                          dangerouslySetInnerHTML={{ __html: currentPageRhymes.top?.svgContent || '' }}
                                          className="rhyme-svg-content"
                                        />
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="rhyme-slot-container">
                                      <div className="flex flex-1 items-center justify-center">
                                        <Button
                                          onClick={() => handleAddRhyme('top')}
                                          className="h-24 w-24 transform rounded-full bg-gradient-to-r from-orange-400 to-red-400 text-white shadow-lg transition-all duration-300 hover:scale-105 hover:from-orange-500 hover:to-red-500 hover:shadow-xl"
                                        >
                                          <Plus className="h-8 w-8" />
                                        </Button>
                                      </div>
                                    </div>
                                  )}
                                </div>

                                {showBottomContainer && (

                                  <div className="relative flex w-full min-h-0 flex-col rhyme-slot">


                                    {hasBottomRhyme ? (
                                      <div className="relative flex flex-1 min-h-0 flex-col rhyme-slot-wrapper">
                                        <Button
                                          onClick={() => handleAddRhyme('bottom')}
                                          variant="outline"
                                          className="absolute top-4 right-4 z-10 bg-white/90 backdrop-blur px-3 sm:px-4 py-2 text-sm text-gray-700 shadow-md hover:bg-white"
                                        >
                                          <Replace className="w-4 h-4 mr-2" />
                                          Replace
                                        </Button>

                                        <div className={`rhyme-slot-container${hasBottomRhyme ? ' has-svg' : ''}`}>

                                          <div
                                            dangerouslySetInnerHTML={{ __html: currentPageRhymes.bottom?.svgContent || '' }}
                                            className="rhyme-svg-content"
                                          />
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="rhyme-slot-container">
                                        <div className="flex flex-1 items-center justify-center">
                                          <Button
                                            onClick={() => handleAddRhyme('bottom')}
                                            className="h-24 w-24 transform rounded-full bg-gradient-to-r from-orange-400 to-red-400 text-white shadow-lg transition-all duration-300 hover:scale-105 hover:from-orange-500 hover:to-red-500 hover:shadow-xl"
                                          >
                                            <Plus className="h-8 w-8" />
                                          </Button>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div
              className={`absolute inset-0 z-40 flex transition-opacity duration-300 ease-out ${
                showTreeMenu ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
              }`}
            >
              <div
                className={`relative flex h-full w-full max-w-md min-h-0 flex-col overflow-hidden bg-white/95 backdrop-blur shadow-2xl sm:max-w-lg lg:max-w-sm lg:rounded-r-3xl lg:border lg:border-gray-200 transition-transform duration-300 ease-out ${
                  showTreeMenu ? 'translate-x-0' : '-translate-x-full'
                }`}
              >
                <div className="flex-shrink-0 p-4 sm:p-5 lg:p-6">
                  <Button
                    onClick={() => { setShowTreeMenu(false); setCurrentPosition(null); }}
                    variant="outline"
                    className="w-full"
                  >
                    <ChevronLeft className="w-4 h-4 mr-2" />
                    Close Menu
                  </Button>
                </div>
                <div className="flex-1 min-h-0 overflow-hidden px-2 pb-4 sm:px-4">
                  <TreeMenu
                    rhymesData={availableRhymes}
                    reusableRhymes={reusableRhymes}
                    showReusable={showReusable}
                    onRhymeSelect={handleRhymeSelect}
                    onToggleReusable={handleToggleReusable}
                    hideFullPageRhymes={currentPosition === 'bottom'}
                  />
                </div>
              </div>
              <button
                type="button"
                className={`flex-1 bg-black/30 backdrop-blur-sm transition-opacity duration-300 ease-out ${
                  showTreeMenu ? 'opacity-100' : 'opacity-0'
                }`}
                aria-label="Close tree menu overlay"
                onClick={() => { setShowTreeMenu(false); setCurrentPosition(null); }}
              />
            </div>
          </div>
        </div>

        {/* Page Indicators */}
        {totalPages > 1 && (
          <div className="mt-4 flex justify-center space-x-2">
            {Array.from({ length: totalPages }, (_, index) => (
              <button
                key={index}
                onClick={() => handlePageChange(index)}
                className={`h-3 w-3 rounded-full transition-colors duration-200 ${index === currentPageIndex
                    ? 'bg-orange-400'
                    : 'bg-gray-300'
                  }`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
            
  );
};

// Main App Component
function App() {
  const [school, setSchool] = useState(null);
  const [selectedMode, setSelectedMode] = useState(null);
  const [selectedGrade, setSelectedGrade] = useState(null);

  const handleAuth = (schoolData) => {
    setSchool(schoolData);
    setSelectedMode(null);
    setSelectedGrade(null);
  };

  const handleModeSelect = (mode) => {
    setSelectedMode(mode);
    setSelectedGrade(null);
  };

  const handleGradeSelect = (grade, mode) => {
    if (mode) {
      setSelectedMode(mode);
    }
    setSelectedGrade(grade);
  };

  const handleBackToGrades = () => {
    setSelectedGrade(null);
  };

  const handleBackToModeSelection = () => {
    setSelectedGrade(null);
    setSelectedMode(null);
  };

  const handleLogout = () => {
    setSelectedGrade(null);
    setSelectedMode(null);
    setSchool(null);
  };

  return (
    <div className="App">
      <Toaster position="top-right" />
      <BrowserRouter>
        <Routes>

          <Route path="/" element={
            !school ? (
              <AuthPage onAuth={handleAuth} />
            ) : !selectedMode ? (
              <ModeSelectionPage
                school={school}
                onModeSelect={handleModeSelect}
                onLogout={handleLogout}
              />
            ) : !selectedGrade ? (
              <GradeSelectionPage
                school={school}
                mode={selectedMode}
                onGradeSelect={handleGradeSelect}
                onLogout={handleLogout}
                onBackToMode={handleBackToModeSelection}
              />
            ) : selectedMode === 'rhymes' ? (
              <RhymeSelectionPage
                school={school}
                grade={selectedGrade}
                onBack={handleBackToGrades}
                onLogout={handleLogout}
              />
            ) : selectedMode === 'cover' ? (
              <CoverPageWorkflow
                school={school}
                grade={selectedGrade}
                onBackToGrades={handleBackToGrades}
                onBackToMode={handleBackToModeSelection}
                onLogout={handleLogout}
              />
            ) : (
              <FeaturePlaceholderPage
                school={school}
                mode={selectedMode}
                grade={selectedGrade}
                onBackToGrades={handleBackToGrades}
                onBackToMode={handleBackToModeSelection}
                onLogout={handleLogout}
              />
            )
          } />
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;
