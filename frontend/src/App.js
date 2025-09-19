import React, { useState, useEffect } from 'react';
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

// Icons
import { Plus, ChevronDown, ChevronRight, Replace, School, Users, BookOpen, Music, ChevronLeft, ChevronUp, Eye } from 'lucide-react';

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
                    <button
                      key={rhyme.code}
                      onClick={() => onRhymeSelect(rhyme)}
                      className="w-full text-left p-3 rounded-lg bg-white/50 hover:bg-white/80 transition-all duration-200 border border-transparent hover:border-orange-200 group"
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <p className="font-medium text-gray-800 group-hover:text-orange-600 transition-colors duration-200">
                            {rhyme.name}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            Code: {rhyme.code} • {rhyme.personalized === "Yes" ? "Personalized" : "Standard"}
                            {rhyme.used_in_grades && (
                              <span className="ml-2 text-blue-600">
                                (Used in: {rhyme.used_in_grades.join(', ')})
                              </span>
                            )}
                          </p>
                        </div>
                      </div>
                    </button>
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

  const MAX_RHYMES_PER_GRADE = 25;

  useEffect(() => {
    fetchAvailableRhymes();
    fetchReusableRhymes();
    fetchSelectedRhymes();
  }, []);

  const getNextAvailablePageIndex = (rhymesList = selectedRhymes) => {
    if (!Array.isArray(rhymesList) || rhymesList.length === 0) {
      return 0;
    }

    const numericIndices = rhymesList
      .map(rhyme => {
        const index = Number(rhyme?.page_index);
        return Number.isFinite(index) ? index : null;
      })
      .filter(index => index !== null);

    if (numericIndices.length === 0) {
      return 0;
    }

    const maxIndex = Math.max(...numericIndices);
    return Math.min(maxIndex + 1, MAX_RHYMES_PER_GRADE - 1);
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
      setSelectedRhymes(sortedSelections);
      setCurrentPageIndex(getNextAvailablePageIndex(sortedSelections));
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


=======

      const baseRhyme = {
        page_index: pageIndex,
        code: rhyme.code,
        name: rhyme.name,
        pages: rhyme.pages,
        svgContent: null,
        position: normalizedPosition
      };



      try {
        const svgResponse = await axios.get(`${API}/rhymes/svg/${rhyme.code}`);
        const svgContent = svgResponse.data;

        setSelectedRhymes(prev => {
          const prevArrayInner = Array.isArray(prev) ? prev : [];

          return prevArrayInner.map(existing => {
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
        })
      } catch (svgError) {
        console.error('Error fetching rhyme SVG:', svgError);
      }
=======

      


        return [...filtered, baseRhyme];
      


      try {
        const svgResponse = await axios.get(`${API}/rhymes/svg/${rhyme.code}`);
        const svgContent = svgResponse.data;

        setSelectedRhymes(prev => {
          const prevArray = Array.isArray(prev) ? prev : [];

          return prevArray.map(existing => {
            if (!existing) return existing;
            if (Number(existing.page_index) !== Number(pageIndex)) {
              return existing;
            }

            const candidatePosition = resolveRhymePosition(existing, {
              rhymesForContext: prevArray
            });

            if (existing.code === rhyme.code && candidatePosition === normalizedPosition) {
              return {
                ...existing,
                svgContent
              };
            }

            return existing;
          });
        });
      } catch (svgError) {
        console.error('Error fetching rhyme SVG:', svgError);
      }

      // Auto create new page after selection
      setTimeout(() => {
        const nextPage = getNextAvailablePageIndex(nextArray);
        setCurrentPageIndex(nextPage);
      }, 500);

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

      setSelectedRhymes(prev => prev.filter(r => {
        if (Number(r.page_index) !== Number(currentPageIndex)) return true;
        if (r.code !== rhyme.code) return true;
        const candidatePosition = resolveRhymePosition(r, {
          rhymesForContext: prev
        });
        return candidatePosition !== position;
      }));
      await fetchAvailableRhymes();
      await fetchReusableRhymes();
    } catch (err) {
      console.error("Delete failed:", err.response?.data || err.message);
    }
  };

  const handlePageChange = (newPageIndex) => {
    const clampedIndex = Math.max(0, Math.min(newPageIndex, MAX_RHYMES_PER_GRADE - 1));
    setCurrentPageIndex(clampedIndex);
  };

  const handleToggleReusable = () => {
    setShowReusable(!showReusable);
  };

  // Calculate total pages
  const calculateTotalPages = () => {
    const numericIndices = Array.isArray(selectedRhymes)
      ? selectedRhymes
          .map(rhyme => {
            const index = Number(rhyme?.page_index);
            return Number.isFinite(index) ? index : null;
          })
          .filter(index => index !== null)
      : [];

    const highestFilledIndex = numericIndices.length > 0 ? Math.max(...numericIndices) : -1;
    const nextAvailableIndex = Number(getNextAvailablePageIndex()) || 0;
    const currentIndex = Number(currentPageIndex) || 0;
    const maxIndex = Math.max(highestFilledIndex, currentIndex, nextAvailableIndex);

    return Math.min(maxIndex + 1, MAX_RHYMES_PER_GRADE);
  };

  // Get rhymes for current page
  const getCurrentPageRhymes = () => {
    const pageRhymes = { top: null, bottom: null };

    if (!Array.isArray(selectedRhymes) || selectedRhymes.length === 0) return pageRhymes;

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
  const isTopFullPage = hasTopRhyme && parsePagesValue(currentPageRhymes.top.pages) === 1;
  const showBottomContainer = !isTopFullPage;

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-red-50">
      <div className="p-6">
        {/* Header */}
        <div className="max-w-7xl mx-auto mb-6">
          <div className="flex items-center justify-between mb-4">
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
        </div>

        {/* Main Content */}
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-[calc(100vh-200px)]">
            
            {/* Tree Menu */}
            <div className={`lg:col-span-1 transition-all duration-300 ${showTreeMenu ? 'block' : 'hidden'}`}>
              <div className="mb-4">
                <Button 
                  onClick={() => {setShowTreeMenu(false); setCurrentPosition(null);}}
                  variant="outline"
                  className="w-full mb-2"
                >
                  <ChevronLeft className="w-4 h-4 mr-2" />
                  Close Menu
                </Button>
              </div>
              <TreeMenu 
                rhymesData={availableRhymes}
                reusableRhymes={reusableRhymes}
                showReusable={showReusable}
                onRhymeSelect={handleRhymeSelect}
                onToggleReusable={handleToggleReusable}
                hideFullPageRhymes={currentPosition === 'bottom'}
              />
            </div>

            {/* Dual Container Interface */}
            <div className={`${showTreeMenu ? 'lg:col-span-3' : 'lg:col-span-4'} flex flex-col items-center justify-center`}>
              <div className="w-full max-w-2xl">

                {/* Navigation Controls */}
                <div className="flex items-center justify-between mb-6">
                  <Button
                    onClick={() => handlePageChange(Math.max(0, currentPageIndex - 1))}
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
                    onClick={() => handlePageChange(Math.min(totalPages - 1, currentPageIndex + 1))}
                    disabled={currentPageIndex >= totalPages - 1}
                    variant="outline"
                    size="sm"
                  >
                    Next
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>

                {/* Dual Container Layout */}
                <div className="grid grid-cols-1 gap-6">
                  
                  {/* Top Container */}
                  <Card className={`relative bg-white/80 backdrop-blur-sm border-0 shadow-xl transition-all duration-300 ${
                    isTopFullPage ? 'min-h-[600px]' : 'min-h-[300px]'
                  }`}>
                    <CardContent className="p-6 min-h-[300px] flex flex-col">
                      {hasTopRhyme ? (
                        <>
                          <div className="flex-1 flex items-center justify-center bg-gray-50 rounded-lg overflow-hidden mb-4">
                            <div 
                              dangerouslySetInnerHTML={{ __html: currentPageRhymes.top.svgContent || '' }}
                              className="w-full h-full flex items-center justify-center"
                            />
                          </div>
                          <div className="text-center mb-4">
                            <p className="font-semibold text-gray-800">{currentPageRhymes.top.name}</p>
                            <p className="text-sm text-gray-500">Code: {currentPageRhymes.top.code} • Pages: {currentPageRhymes.top.pages}</p>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              onClick={() => handleAddRhyme('top')}
                              variant="outline"
                              className="flex-1 bg-white/50 hover:bg-white"
                            >
                              <Replace className="w-4 h-4 mr-2" />
                              Replace
                            </Button>
                            <Button
                              onClick={() => {
                                if (currentPageRhymes.top) {
                                  handleRemoveRhyme(currentPageRhymes.top, 'top');
                                } else {
                                  console.warn('No top rhyme to remove');
                                }
                              }}
                              variant="outline"
                              className="flex-1 bg-white/50 hover:bg-white text-red-600 hover:text-red-700"
                            >
                              Remove
                            </Button>
                          </div>
                        </>
                      ) : (
                        <div className="flex-1 flex items-center justify-center">
                          <Button
                            onClick={() => handleAddRhyme('top')}
                            className="w-24 h-24 rounded-full bg-gradient-to-r from-orange-400 to-red-400 hover:from-orange-500 hover:to-red-500 text-white shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105"
                          >
                            <Plus className="w-8 h-8" />
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Bottom Container */}
                  {showBottomContainer && (
                    <Card className="relative bg-white/80 backdrop-blur-sm border-0 shadow-xl">
                      <CardContent className="p-6 min-h-[300px] flex flex-col">
                        {hasBottomRhyme ? (
                          <>
                            <div className="flex-1 flex items-center justify-center bg-gray-50 rounded-lg overflow-hidden mb-4">
                              <div 
                                dangerouslySetInnerHTML={{ __html: currentPageRhymes.bottom.svgContent || '' }}
                                className="w-full h-full flex items-center justify-center"
                              />
                            </div>
                            <div className="text-center mb-4">
                              <p className="font-semibold text-gray-800">{currentPageRhymes.bottom.name}</p>
                              <p className="text-sm text-gray-500">Code: {currentPageRhymes.bottom.code} • Pages: {currentPageRhymes.bottom.pages}</p>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                onClick={() => handleAddRhyme('bottom')}
                                variant="outline"
                                className="flex-1 bg-white/50 hover:bg-white"
                              >
                                <Replace className="w-4 h-4 mr-2" />
                                Replace
                              </Button>
                              <Button
                                onClick={() => handleRemoveRhyme(currentPageRhymes.bottom, 'bottom')}
                                variant="outline"
                                className="flex-1 bg-white/50 hover:bg-white text-red-600 hover:text-red-700"
                              >
                                Remove
                              </Button>
                            </div>
                          </>
                        ) : (
                          <div className="flex-1 flex items-center justify-center">
                            <Button
                              onClick={() => handleAddRhyme('bottom')}
                              className="w-24 h-24 rounded-full bg-gradient-to-r from-orange-400 to-red-400 hover:from-orange-500 hover:to-red-500 text-white shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105"
                            >
                              <Plus className="w-8 h-8" />
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}
                </div>

                {/* Page Indicators */}
                {totalPages > 1 && (
                  <div className="flex justify-center space-x-2 mt-6">
                    {Array.from({ length: totalPages }, (_, index) => (
                      <button
                        key={index}
                        onClick={() => handlePageChange(index)}
                        className={`w-3 h-3 rounded-full transition-colors duration-200 ${
                          index === currentPageIndex 
                            ? 'bg-orange-400' 
                            : 'bg-gray-300'
                        }`}
                      />
                    ))}
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