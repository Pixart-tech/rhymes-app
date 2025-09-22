import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import axios from 'axios';
import './App.css';

import AdminDashboard from './AdminDashboard';

// Components
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { Badge } from './components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './components/ui/collapsible';
import { Separator } from './components/ui/separator';
import { toast } from 'sonner';
import { Toaster } from './components/ui/sonner';
import { Carousel, CarouselContent, CarouselItem } from './components/ui/carousel';

import DocumentPage from './components/DocumentPage.jsx';


// Icons
import { Plus, ChevronDown, ChevronRight, School, Users, BookOpen, Music, ChevronLeft, ChevronUp, Eye } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

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

// Grade Selection Page
const GradeSelectionPage = ({ school, onGradeSelect, onLogout }) => {
  const [gradeStatus, setGradeStatus] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const grades = [
    { id: 'nursery', name: 'Nursery', color: 'from-pink-400 to-rose-400', icon: '🌸' },
    { id: 'lkg', name: 'LKG', color: 'from-blue-400 to-cyan-400', icon: '🎈' },
    { id: 'ukg', name: 'UKG', color: 'from-green-400 to-emerald-400', icon: '🌟' },
    { id: 'playgroup', name: 'Playgroup', color: 'from-purple-400 to-indigo-400', icon: '🎨' }
  ];

  useEffect(() => {
    fetchGradeStatus();
  }, []);

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-red-50 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-8 text-center md:text-left">
          <div>
            <h1 className="text-3xl font-bold text-gray-800 mb-2">{school.school_name}</h1>
            <p className="text-gray-600">School ID: {school.school_id}</p>
          </div>
          <Button
            onClick={handleLogoutClick}
            variant="outline"
            className="bg-white/80 hover:bg-white border-gray-200"
          >
            Logout
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {grades.map((grade) => (
            <Card
              key={grade.id}
              className="group cursor-pointer transition-all duration-300 hover:scale-105 hover:shadow-2xl border-0 bg-white/80 backdrop-blur-sm"
              onClick={() => onGradeSelect(grade.id)}
            >
              <CardContent className="p-6 text-center">
                <div className={`w-16 h-16 bg-gradient-to-r ${grade.color} rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform duration-300`}>
                  <span className="text-2xl">{grade.icon}</span>
                </div>
                <h3 className="text-xl font-bold text-gray-800 mb-2">{grade.name}</h3>
                <Badge variant="secondary" className="mb-4">
                  {getGradeStatusInfo(grade.id)} Rhymes Selected
                </Badge>
                <Button
                  className={`w-full bg-gradient-to-r ${grade.color} hover:opacity-90 text-white font-semibold rounded-xl transition-all duration-300`}
                >
                  Select Rhymes
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
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

  // Filter out 1.0 page rhymes if hideFullPageRhymes is true
  const filteredRhymes = hideFullPageRhymes
    ? Object.fromEntries(
      Object.entries(currentRhymes).filter(([pageKey]) => parseFloat(pageKey) !== 1.0)
    )
    : currentRhymes;

  if (!filteredRhymes || Object.keys(filteredRhymes).length === 0) {
    return (
      <div className="p-4 text-center text-gray-500">
        <Music className="w-12 h-12 mx-auto mb-2 opacity-50" />
        <p>{showReusable ? 'No reusable rhymes available' : 'No rhymes available'}</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-white/50 backdrop-blur-sm rounded-lg border border-gray-200">
      <div className="p-4 border-b bg-white/80">
        <div className="flex items-center justify-between mb-2">
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

      <div className="p-2">
        {Object.entries(filteredRhymes).map(([pageKey, rhymes]) => {
          if (!rhymes || rhymes.length === 0) return null;

          return (
            <Collapsible key={pageKey} open={expandedGroups[pageKey]} onOpenChange={() => toggleGroup(pageKey)}>
              <CollapsibleTrigger className="flex items-center justify-between w-full p-3 text-left hover:bg-white/50 rounded-lg transition-colors duration-200">
                <span className="font-medium text-gray-700 flex items-center gap-2">
                  <div className="w-6 h-6 bg-gradient-to-r from-orange-400 to-red-400 rounded-full flex items-center justify-center text-white text-xs font-bold">
                    {pageKey}
                  </div>
                  {pageKey} Page{parseFloat(pageKey) !== 1 ? 's' : ''} ({rhymes.length})
                </span>
                {expandedGroups[pageKey] ?
                  <ChevronDown className="w-4 h-4 text-gray-500" /> :
                  <ChevronRight className="w-4 h-4 text-gray-500" />
                }
              </CollapsibleTrigger>
              <CollapsibleContent className="pl-4">
                <div className="space-y-1 mt-2">
                  {rhymes.map((rhyme) => (
                    <div
                      key={rhyme.code}
                      className="group flex items-center gap-3 rounded-lg border border-transparent bg-white/50 p-3 transition-all duration-200 hover:border-orange-200 hover:bg-white/80"
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
                      <button
                        type="button"
                        onClick={() => onRhymeSelect(rhyme)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-orange-200 bg-white text-sm font-semibold text-orange-600 transition-colors duration-200 hover:bg-orange-50 hover:text-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-300 focus:ring-offset-1"
                        aria-label={`Add ${rhyme.name}`}
                      >
                        +
                      </button>
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
  const [carouselApi, setCarouselApi] = useState(null);
  const [showTreeMenu, setShowTreeMenu] = useState(false);
  const treeMenuVisibilityClass = showTreeMenu
    ? 'translate-x-0 opacity-100 pointer-events-auto'
    : '-translate-x-full opacity-0 pointer-events-none';
  const layoutGridClass = 'lg:grid-cols-[minmax(0,1fr)]';
  const mainColumnClasses = 'flex w-full flex-col items-center';
  const [showReusable, setShowReusable] = useState(false);
  const [currentPosition, setCurrentPosition] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshingRhymes, setIsRefreshingRhymes] = useState(false);
  const navigate = useNavigate();

  const emptySlotButtonClasses =
    'group relative flex h-full w-full items-center justify-center bg-white p-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400';
  const filledSlotButtonClasses =
    'relative flex h-full w-full items-center justify-center overflow-hidden bg-white p-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400';
  const emptySlotIconClasses = 'h-10 w-10';

  const MAX_RHYMES_PER_GRADE = 25;

  const getSessionStorageKey = useCallback((gradeId) => `rhymeSelections:${gradeId}`, []);

  const loadSelectionsFromSession = useCallback((gradeId) => {
    if (typeof window === 'undefined' || !window.sessionStorage) {
      return null;
    }

    try {
      const storedValue = window.sessionStorage.getItem(getSessionStorageKey(gradeId));
      if (!storedValue) {
        return null;
      }

      const parsed = JSON.parse(storedValue);
      return Array.isArray(parsed) ? parsed : null;
    } catch (error) {
      console.error('Failed to load rhyme selections from session storage:', error);
      return null;
    }
  }, [getSessionStorageKey]);

  const saveSelectionsToSession = useCallback((gradeId, selections) => {
    if (typeof window === 'undefined' || !window.sessionStorage) {
      return;
    }

    try {
      const key = getSessionStorageKey(gradeId);

      if (!Array.isArray(selections) || selections.length === 0) {
        window.sessionStorage.removeItem(key);
        return;
      }

      window.sessionStorage.setItem(key, JSON.stringify(selections));
    } catch (error) {
      console.error('Failed to save rhyme selections to session storage:', error);
    }
  }, [getSessionStorageKey]);

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
    const storedSelections = loadSelectionsFromSession(grade);
    if (storedSelections && storedSelections.length > 0) {
      setSelectedRhymes(storedSelections);
    }

    try {
      const response = await axios.get(`${API}/rhymes/selected/${school.school_id}`);
      const gradeSelections = response.data[grade] || [];

      const rhymesWithSvg = await Promise.all(
        gradeSelections.map(async (rhyme) => {
          try {
            const svgResponse = await axios.get(`${API}/rhymes/svg/${rhyme.code}`);
            return { ...rhyme, position: rhyme.position || null, svgContent: svgResponse.data };
          } catch (error) {
            return { ...rhyme, position: rhyme.position || null, svgContent: null };
          }
        })
      );

      const sortedSelections = sortSelections(rhymesWithSvg);
      const usage = computePageUsage(sortedSelections);
      const nextInfo = computeNextAvailablePageInfoFromUsage(usage);
      const hasExistingSelections = Array.isArray(sortedSelections) && sortedSelections.length > 0;
      const initialIndex = hasExistingSelections && Number.isFinite(usage.lowestIndex) && usage.lowestIndex >= 0
        ? usage.lowestIndex
        : (Number.isFinite(nextInfo.index) ? nextInfo.index : 0);

      setSelectedRhymes(sortedSelections);
      saveSelectionsToSession(grade, sortedSelections);
      setCurrentPageIndex(initialIndex);
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
    const previousSelections = Array.isArray(selectedRhymes) ? [...selectedRhymes] : [];

    try {
      const pageIndex = currentPageIndex;
      const pagesValue = parsePagesValue(rhyme?.pages) ?? 1;
      const normalizedPosition = pagesValue === 0.5
        ? normalizeSlot(currentPosition, 'top') || 'top'
        : 'top';

      const removals = computeRemovalsForSelection({
        selections: previousSelections,
        pageIndex,
        normalizedPosition,
        newPages: pagesValue
      });

      const filtered = previousSelections.filter(existing => !removals.includes(existing));

      const baseRhyme = {
        page_index: pageIndex,
        code: rhyme.code,
        name: rhyme.name,
        pages: rhyme.pages,
        svgContent: null,
        position: normalizedPosition
      };

      const previewSelections = sortSelections([...filtered, baseRhyme]);
      const totalSelected = previewSelections.length;
      const isReplacement = removals.length > 0;

      if (!isReplacement && totalSelected > MAX_RHYMES_PER_GRADE) {
        toast.error('Max of 25 rhymes per grade');
        setShowTreeMenu(false);
        setCurrentPosition(null);
        return;
      }

      const selectionPromise = axios.post(`${API}/rhymes/select`, {
        school_id: school.school_id,
        grade: grade,
        page_index: pageIndex,
        rhyme_code: rhyme.code,
        position: normalizedPosition
      });

      const svgPromise = axios.get(`${API}/rhymes/svg/${rhyme.code}`);

      const [, svgResponse] = await Promise.all([selectionPromise, svgPromise]);
      const svgContent = svgResponse.data;

      const nextArray = sortSelections([
        ...filtered,
        {
          ...baseRhyme,
          svgContent
        }
      ]);

      setSelectedRhymes(nextArray);
      saveSelectionsToSession(grade, nextArray);

      const nextInfo = computeNextAvailablePageInfo(nextArray);

      if (isReplacement) {
        setCurrentPageIndex(pageIndex);
      } else {
        setTimeout(() => {
          setCurrentPageIndex(nextInfo.index);
        }, 400);
      }

      setShowTreeMenu(false);
      setCurrentPosition(null);

      setIsRefreshingRhymes(true);
      try {
        await Promise.all([
          fetchAvailableRhymes(),
          fetchReusableRhymes()
        ]);
      } finally {
        setIsRefreshingRhymes(false);
      }
    } catch (error) {
      console.error('Error selecting rhyme:', error);
      setSelectedRhymes(previousSelections);
      saveSelectionsToSession(grade, previousSelections);
      setShowTreeMenu(false);
      setCurrentPosition(null);
      setIsRefreshingRhymes(false);
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

  const handleRemoveRhyme = async (rhyme, explicitPosition, pageIndexOverride) => {
    if (!rhyme || !rhyme.code) {
      console.error("handleRemoveRhyme: missing rhyme or code", rhyme);
      return;
    }

    const normalizedOverride = Number(pageIndexOverride);
    const targetPageIndex = Number.isFinite(normalizedOverride)
      ? normalizedOverride
      : currentPageIndex;
    const position = resolveRhymePosition(rhyme, { explicitPosition });

    console.log("→ Deleting rhyme (request):", {
      code: rhyme.code,
      position,
      pageIndex: targetPageIndex,
      grade
    });

    try {
      const res = await axios.delete(
        `/api/rhymes/remove/${school.school_id}/${grade}/${targetPageIndex}/${position}`
      );
      console.log("← Delete response:", res.data);

      setSelectedRhymes(prev => {
        const prevArray = Array.isArray(prev) ? prev : [];
        const filteredSelections = prevArray.filter(r => {
          if (Number(r.page_index) !== Number(targetPageIndex)) return true;
          if (r.code !== rhyme.code) return true;
          const candidatePosition = resolveRhymePosition(r, {
            rhymesForContext: prevArray
          });
          return candidatePosition !== position;
        });

        saveSelectionsToSession(grade, filteredSelections);
        return filteredSelections;
      });
      setCurrentPageIndex(targetPageIndex);
      setIsRefreshingRhymes(true);
      try {
        await Promise.all([
          fetchAvailableRhymes(),
          fetchReusableRhymes()
        ]);
      } finally {
        setIsRefreshingRhymes(false);
      }
    } catch (err) {
      console.error("Delete failed:", err.response?.data || err.message);
      setIsRefreshingRhymes(false);
    }
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

  const getPageRhymes = useCallback((pageIndex) => {
    const pageRhymes = { top: null, bottom: null };

    if (!Array.isArray(selectedRhymes) || selectedRhymes.length === 0) return pageRhymes;

    for (const r of selectedRhymes) {
      if (!r) continue;
      if (Number(r.page_index) !== Number(pageIndex)) continue;
      const pages = parsePagesValue(r.pages);
      if (pages === 1) {
        pageRhymes.top = r;
        pageRhymes.bottom = null;
        return pageRhymes;
      }
    }

    for (const r of selectedRhymes) {
      if (!r) continue;
      if (Number(r.page_index) !== Number(pageIndex)) continue;
      const pages = parsePagesValue(r.pages);
      if (pages === 0.5) {
        const pos = normalizeSlot(r.position, 'top') || 'top';
        if (pos === 'top') pageRhymes.top = r;
        else if (pos === 'bottom') pageRhymes.bottom = r;
      }
    }

    return pageRhymes;
  }, [selectedRhymes]);

  const totalPages = calculateTotalPages();
  const displayTotalPages = Math.max(totalPages, 1);

  const handlePageChange = useCallback((newPageIndex) => {
    const maxIndex = Math.max(0, totalPages - 1);
    const clampedIndex = Math.max(0, Math.min(newPageIndex, maxIndex));

    if (carouselApi) {
      carouselApi.scrollTo(clampedIndex);
    } else {
      setCurrentPageIndex(clampedIndex);
    }
  }, [carouselApi, totalPages]);

  useEffect(() => {
    if (!carouselApi) return;

    const handleSelect = () => {
      const newIndex = carouselApi.selectedScrollSnap();
      setCurrentPageIndex(prevIndex => (prevIndex !== newIndex ? newIndex : prevIndex));
    };

    carouselApi.on('select', handleSelect);
    carouselApi.on('reInit', handleSelect);

    return () => {
      carouselApi.off('select', handleSelect);
      carouselApi.off('reInit', handleSelect);
    };
  }, [carouselApi]);

  useEffect(() => {
    if (!carouselApi) return;

    const maxIndex = Math.max(0, totalPages - 1);
    const clampedIndex = Math.max(0, Math.min(currentPageIndex, maxIndex));
    const selectedSnap = carouselApi.selectedScrollSnap();

    if (selectedSnap !== clampedIndex) {
      carouselApi.scrollTo(clampedIndex);
    }
  }, [carouselApi, currentPageIndex, totalPages]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-orange-400 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading rhyme data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col items-stretch justify-start px-4 pt-2 pb-4 sm:px-6">
        {/* Header */}
        <div className="mb-6 flex flex-shrink-0 flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 capitalize">{grade} Grade - Rhyme Selection</h1>
            <p className="text-gray-600">{school.school_name} ({school.school_id})</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={onBack}
              variant="outline"
              className="bg-white/80 hover:bg-white border-gray-200 text-gray-900"
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
          <div className={`relative grid h-full grid-cols-1 gap-6 ${layoutGridClass}`}>

            {/* Tree Menu */}
            <div
              className={`absolute inset-y-0 left-0 z-30 flex h-full min-h-0 w-72 max-w-full transform flex-col overflow-hidden bg-white shadow-xl transition-transform transition-opacity duration-300 ease-in-out ${treeMenuVisibilityClass} lg:w-80`}
            >
              <div className="mb-4 flex-shrink-0 lg:hidden">
                <Button
                  onClick={() => { setShowTreeMenu(false); setCurrentPosition(null); }}
                  variant="outline"
                  className="w-full mb-2"
                >
                  <ChevronLeft className="w-4 h-4 mr-2" />
                  Close Menu
                </Button>
              </div>
              <div className="flex-1 min-h-0 overflow-hidden">
                <div className="h-full max-h-[calc(100vh-9rem)] overflow-y-auto pr-1">
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
            </div>

            {/* Dual Container Interface */}
            <div
              className="min-h-0 flex w-full flex-col items-center"
            >
                <div className={mainColumnClasses}>

                {/* Navigation Controls */}
                <div className="w-[210mm] flex-shrink-0 space-y-3 pb-1">
                  <div className="flex items-center justify-between">
                    <Button
                      onClick={() => handlePageChange(Math.max(0, currentPageIndex - 1))}
                      disabled={currentPageIndex === 0}
                      variant="outline"
                      size="sm"
                    >
                      <ChevronLeft className="w-4 h-4 mr-1" />
                      Previous
                    </Button>

                    <div className="text-sm text-gray-300 font-medium">
                      Page {currentPageIndex + 1} of {displayTotalPages}
                    </div>

                    <Button
                      onClick={() => handlePageChange(Math.min(displayTotalPages - 1, currentPageIndex + 1))}
                      disabled={currentPageIndex >= displayTotalPages - 1}
                      variant="outline"
                      size="sm"
                    >
                      Next
                      <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  </div>
                  {isRefreshingRhymes && (
                    <div
                      className="flex items-center justify-center gap-2 text-xs font-medium text-orange-500"
                      role="status"
                      aria-live="polite"
                    >
                      <span
                        className="h-3 w-3 rounded-full border-2 border-orange-400 border-t-transparent animate-spin"
                        aria-hidden="true"
                      />
                      <span>Refreshing rhyme lists…</span>
                    </div>
                  )}
                </div>

                <div className="flex-1 min-h-0 flex flex-col">
                  <div className="flex-1 min-h-0 pb-6">
                    <div className="flex h-full w-full justify-center">
                      <Carousel
                        className="mx-auto w-[210mm]"
                        opts={{
                          align: 'center',
                          containScroll: 'trimSnaps',
                          draggable: false,
                          dragFree: false,
                        }}
                        setApi={setCarouselApi}
                      >
                        <CarouselContent hasSpacing={false} className="flex h-full w-full">
                          {Array.from({ length: displayTotalPages }, (_, pageIndex) => {
                            const pageRhymes = getPageRhymes(pageIndex);
                            const topRhyme = pageRhymes.top;
                            const bottomRhyme = pageRhymes.bottom;
                            const hasTopRhyme = topRhyme !== null;
                            const hasBottomRhyme = bottomRhyme !== null;
                            const isTopFullPage = hasTopRhyme && parsePagesValue(topRhyme.pages) === 1;
                            const showBottomContainer = !isTopFullPage;

                            const openSlot = (position) => {
                              if (pageIndex !== currentPageIndex) {
                                handlePageChange(pageIndex);
                              }
                              handleAddRhyme(position);
                            };

                            const renderSvgSlot = (rhyme, position) => {
                              return (
                                <button
                                  type="button"
                                  onClick={() => openSlot(position)}
                                  className={filledSlotButtonClasses}
                                  aria-label={`Change ${position} rhyme`}
                                >
                                  <div
                                    dangerouslySetInnerHTML={{ __html: rhyme?.svgContent || '' }}
                                    className="pointer-events-none flex h-full w-full items-center justify-center [&>svg]:block [&>svg]:h-full [&>svg]:w-full [&>svg]:max-h-full [&>svg]:max-w-full [&>svg]:object-contain"
                                  />
                                </button>
                              );
                            };

                            return (
                              <CarouselItem
                                key={pageIndex}
                                hasSpacing={false}
                                className="flex justify-center"
                              >
                                <DocumentPage
                                  className="flex-none"
                                  showBottom={showBottomContainer}
                                  topSlot={
                                    hasTopRhyme ? (
                                      renderSvgSlot(topRhyme, 'top')
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => openSlot('top')}
                                        className={emptySlotButtonClasses}
                                        aria-label="Add rhyme to top slot"
                                      >
                                        <span className="flex h-full w-full items-center justify-center border border-dashed border-orange-300 text-orange-500 transition-colors duration-300 group-hover:border-orange-400 group-hover:text-orange-600">
                                          <Plus className={emptySlotIconClasses} aria-hidden="true" />
                                        </span>
                                      </button>
                                    )
                                  }
                                  bottomSlot={
                                    showBottomContainer
                                      ? hasBottomRhyme
                                        ? renderSvgSlot(bottomRhyme, 'bottom')
                                        : (
                                          <button
                                            type="button"
                                            onClick={() => openSlot('bottom')}
                                            className={emptySlotButtonClasses}
                                            aria-label="Add rhyme to bottom slot"
                                          >
                                            <span className="flex h-full w-full items-center justify-center border border-dashed border-orange-300 text-orange-500 transition-colors duration-300 group-hover:border-orange-400 group-hover:text-orange-600">
                                              <Plus className={emptySlotIconClasses} aria-hidden="true" />
                                            </span>
                                          </button>
                                        )
                                      : null
                                  }
                                />
                              </CarouselItem>
                            );
                          })}
                        </CarouselContent>
                      </Carousel>
                    </div>
                  </div>
                </div>
                {/* Page Indicators */}
                {displayTotalPages > 1 && (
                  <div
                    className="mt-6 flex justify-center space-x-2"
                    role="status"
                    aria-live="polite"
                    aria-label={`Page ${currentPageIndex + 1} of ${displayTotalPages}`}
                  >
                    {Array.from({ length: displayTotalPages }, (_, index) => (
                      <span
                        key={index}
                        aria-hidden="true"
                        className={`h-3 w-3 rounded-full transition-colors duration-200 ${index === currentPageIndex
                            ? 'bg-orange-400'
                            : 'bg-gray-300'
                          }`}
                      />
                    ))}
                    <span className="sr-only">
                      Page {currentPageIndex + 1} of {displayTotalPages}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
    
  );
};

// Main App Component
function App() {
  const [school, setSchool] = useState(null);
  const [selectedGrade, setSelectedGrade] = useState(null);

  const handleAuth = (schoolData) => {
    setSchool(schoolData);
  };

  const handleGradeSelect = (grade) => {
    setSelectedGrade(grade);
  };

  const handleBack = () => {
    setSelectedGrade(null);
  };

  const handleLogout = () => {
    setSelectedGrade(null);
    setSchool(null);
  };

  return (
    <div className="App">
      <Toaster position="top-right" />
      <BrowserRouter>
        <Routes>
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/" element={
            !school ? (
              <AuthPage onAuth={handleAuth} />
            ) : !selectedGrade ? (
              <GradeSelectionPage
                school={school}
                onGradeSelect={handleGradeSelect}
                onLogout={handleLogout}
              />
            ) : (
              <RhymeSelectionPage
                school={school}
                grade={selectedGrade}
                onBack={handleBack}
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
