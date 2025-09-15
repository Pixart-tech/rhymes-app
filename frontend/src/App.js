import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
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
const GradeSelectionPage = ({ school, onGradeSelect }) => {
  const [gradeStatus, setGradeStatus] = useState([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-red-50 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Welcome, {school.school_name}!</h1>
          <p className="text-gray-600">School ID: {school.school_id}</p>
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
        {hideFullPageRhymes && (
          <p className="text-xs text-orange-600 mt-1">Only 0.5 page rhymes available for bottom position</p>
        )}
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
                        <div className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                          <div className="w-2 h-2 bg-orange-400 rounded-full"></div>
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

// Dual Container Carousel Component
const DualContainerCarousel = ({ selectedRhymes, currentPageIndex, onPageChange, onRemovePage, onAddRhyme }) => {
  // Calculate total pages based on selections
  const calculateTotalPages = () => {
    if (selectedRhymes.length === 0) return 1;
    
    // Get unique page indices
    const uniquePages = [...new Set(selectedRhymes.map(rhyme => rhyme?.page_index).filter(idx => idx !== undefined))];
    
    // Return the number of unique pages, minimum 1
    return Math.max(uniquePages.length, 1);
  };

  const totalPages = calculateTotalPages();
  
  // Get rhymes for current page
  const getCurrentPageRhymes = () => {
    let pageRhymes = { top: null, bottom: null };
    
    // Get all rhymes for the current page
    const currentPageRhymes = selectedRhymes.filter(rhyme => 
      rhyme && rhyme.page_index === currentPageIndex
    );
    
    if (currentPageRhymes.length === 0) {
      return pageRhymes;
    }
    
    // Handle 1.0 page rhymes (takes full page)
    const fullPageRhyme = currentPageRhymes.find(rhyme => rhyme.pages === 1.0);
    if (fullPageRhyme) {
      pageRhymes.top = fullPageRhyme;
      pageRhymes.bottom = null; // Hide bottom when top is full page
      return pageRhymes;
    }
    
    // Handle 0.5 page rhymes - assign based on position metadata or order
    const halfPageRhymes = currentPageRhymes.filter(rhyme => rhyme.pages === 0.5);
    if (halfPageRhymes.length > 0) {
      // Sort by position preference if available, otherwise by code
      halfPageRhymes.sort((a, b) => {
        if (a.position === 'top' && b.position === 'bottom') return -1;
        if (a.position === 'bottom' && b.position === 'top') return 1;
        return a.code.localeCompare(b.code);
      });
      
      pageRhymes.top = halfPageRhymes[0];
      if (halfPageRhymes.length > 1) {
        pageRhymes.bottom = halfPageRhymes[1];
      }
    }
    
    return pageRhymes;
  };

  const currentPageRhymes = getCurrentPageRhymes();
  const hasTopRhyme = currentPageRhymes.top !== null;
  const hasBottomRhyme = currentPageRhymes.bottom !== null;
  const isTopFullPage = hasTopRhyme && currentPageRhymes.top.pages === 1.0;
  
  // Show bottom container UNLESS top has a 1.0 page rhyme
  const showBottomContainer = !isTopFullPage;

  // Handle completely empty state
  if (selectedRhymes.length === 0) {
    return (
      <div className="space-y-6">
        <h2 className="text-xl font-semibold text-gray-800 text-center">Select Rhymes for this Grade</h2>
        
        <div className="grid grid-cols-1 gap-6">
          {/* Initial Top Container */}
          <Card className="relative bg-white/80 backdrop-blur-sm border-0 shadow-xl">
            <CardContent className="p-6 min-h-[300px] flex flex-col items-center justify-center">
              <Button
                onClick={() => onAddRhyme('top')}
                className="w-24 h-24 rounded-full bg-gradient-to-r from-orange-400 to-red-400 hover:from-orange-500 hover:to-red-500 text-white shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105"
              >
                <Plus className="w-8 h-8" />
              </Button>
              <p className="text-gray-600 text-sm mt-4">Top Position</p>
            </CardContent>
          </Card>

          {/* Initial Bottom Container */}
          <Card className="relative bg-white/80 backdrop-blur-sm border-0 shadow-xl">
            <CardContent className="p-6 min-h-[300px] flex flex-col items-center justify-center">
              <Button
                onClick={() => onAddRhyme('bottom')}
                className="w-24 h-24 rounded-full bg-gradient-to-r from-orange-400 to-red-400 hover:from-orange-500 hover:to-red-500 text-white shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105"
              >
                <Plus className="w-8 h-8" />
              </Button>
              <p className="text-gray-600 text-sm mt-4">Bottom Position (0.5 Pages Only)</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Navigation Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <Button
            onClick={() => onPageChange(Math.max(0, currentPageIndex - 1))}
            disabled={currentPageIndex === 0}
            variant="outline"
            size="sm"
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Previous
          </Button>
          
          <div className="text-sm text-gray-600">
            Page {currentPageIndex + 1} of {totalPages}
          </div>
          
          <Button
            onClick={() => onPageChange(Math.min(totalPages - 1, currentPageIndex + 1))}
            disabled={currentPageIndex >= totalPages - 1}
            variant="outline"
            size="sm"
          >
            Next
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      )}

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
                    onClick={() => onAddRhyme('top')}
                    variant="outline"
                    className="flex-1 bg-white/50 hover:bg-white"
                  >
                    <Replace className="w-4 h-4 mr-2" />
                    Replace
                  </Button>
                  <Button
                    onClick={() => onRemovePage(currentPageRhymes.top.page_index)}
                    variant="outline"
                    className="flex-1 bg-white/50 hover:bg-white text-red-600 hover:text-red-700"
                  >
                    Remove
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <Button
                    onClick={() => onAddRhyme('top')}
                    className="w-24 h-24 rounded-full bg-gradient-to-r from-orange-400 to-red-400 hover:from-orange-500 hover:to-red-500 text-white shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105 mb-4"
                  >
                    <Plus className="w-8 h-8" />
                  </Button>
                  <p className="text-gray-600 text-sm">Top Position</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Bottom Container (hidden if top is full page) */}
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
                      onClick={() => onAddRhyme('bottom')}
                      variant="outline"
                      className="flex-1 bg-white/50 hover:bg-white"
                    >
                      <Replace className="w-4 h-4 mr-2" />
                      Replace
                    </Button>
                    <Button
                      onClick={() => onRemovePage(currentPageRhymes.bottom.page_index)}
                      variant="outline"
                      className="flex-1 bg-white/50 hover:bg-white text-red-600 hover:text-red-700"
                    >
                      Remove
                    </Button>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center">
                    <Button
                      onClick={() => onAddRhyme('bottom')}
                      className="w-24 h-24 rounded-full bg-gradient-to-r from-orange-400 to-red-400 hover:from-orange-500 hover:to-red-500 text-white shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105 mb-4"
                    >
                      <Plus className="w-8 h-8" />
                    </Button>
                    <p className="text-gray-600 text-sm">Bottom Position (0.5 Pages Only)</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Page Indicators */}
      {totalPages > 1 && (
        <div className="flex justify-center space-x-2">
          {Array.from({ length: totalPages }, (_, index) => (
            <button
              key={index}
              onClick={() => onPageChange(index)}
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
  );
};

// Main Rhyme Selection Interface
const RhymeSelectionPage = ({ school, grade, onBack }) => {
  const [availableRhymes, setAvailableRhymes] = useState({});
  const [reusableRhymes, setReusableRhymes] = useState({});
  const [selectedRhymes, setSelectedRhymes] = useState([]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [showTreeMenu, setShowTreeMenu] = useState(false);
  const [showReusable, setShowReusable] = useState(false);
  const [currentPosition, setCurrentPosition] = useState(null); // 'top' or 'bottom'
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAvailableRhymes();
    fetchReusableRhymes();
    fetchSelectedRhymes();
  }, []);

  const fetchAvailableRhymes = async () => {
    try {
      const response = await axios.get(`${API}/rhymes/available/${school.school_id}/${grade}`);
      setAvailableRhymes(response.data);
    } catch (error) {
      console.error('Error fetching available rhymes:', error);
      toast.error('Failed to load available rhymes');
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
      
      // Load SVG content for each selected rhyme
      const rhymesWithSvg = await Promise.all(
        gradeSelections.map(async (rhyme) => {
          try {
            const svgResponse = await axios.get(`${API}/rhymes/svg/${rhyme.code}`);
            return { ...rhyme, svgContent: svgResponse.data };
          } catch (error) {
            console.error('Error loading SVG for', rhyme.code);
            return { ...rhyme, svgContent: null };
          }
        })
      );
      
      setSelectedRhymes(rhymesWithSvg);
    } catch (error) {
      console.error('Error fetching selected rhymes:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddRhyme = (position) => {
    console.log('handleAddRhyme called with position:', position);
    setCurrentPosition(position);
    setShowTreeMenu(true);
    setShowReusable(false); // Reset to show available rhymes first
  };

  const getNextAvailablePageIndex = () => {
    // Find the next available page index
    for (let i = 0; i < 25; i++) {
      if (!selectedRhymes.find(rhyme => rhyme && rhyme.page_index === i)) {
        return i;
      }
    }
    return selectedRhymes.length;
  };

  const handleRhymeSelect = async (rhyme) => {
    try {
      let pageIndex;
      let shouldCreateNewPage = false;
      
      // Determine page index and carousel logic
      if (currentPosition === 'top') {
        // TOP POSITION LOGIC
        if (rhyme.pages === 1.0) {
          // 1.0 page rhyme - fills current page, auto-create new page
          pageIndex = currentPageIndex;
          shouldCreateNewPage = true;
        } else {
          // 0.5 page rhyme - use current page
          pageIndex = currentPageIndex;
        }
      } else if (currentPosition === 'bottom') {
        // BOTTOM POSITION LOGIC - use current page, check if this completes the page
        pageIndex = currentPageIndex;
        
        // Check if top already has a 0.5 page rhyme - if so, this will complete the page
        const currentPageRhymes = selectedRhymes.filter(r => r && r.page_index === pageIndex);
        const hasTopHalfPage = currentPageRhymes.some(r => r.pages === 0.5);
        
        if (hasTopHalfPage && rhyme.pages === 0.5) {
          // This bottom selection completes a page with two 0.5 page rhymes
          shouldCreateNewPage = true;
        }
      } else {
        // Fallback
        pageIndex = getNextAvailablePageIndex();
      }
      
      // Remove existing rhyme at same position if replacing
      if (currentPosition) {
        const currentPageRhymes = selectedRhymes.filter(r => r && r.page_index === pageIndex);
        
        if (currentPosition === 'top') {
          // Remove existing top rhyme at this page
          setSelectedRhymes(prev => 
            prev.filter(r => !(r.page_index === pageIndex && 
              (prev.filter(x => x.page_index === pageIndex).indexOf(r) === 0)))
          );
        } else if (currentPosition === 'bottom') {
          // Remove existing bottom rhyme at this page
          setSelectedRhymes(prev => 
            prev.filter(r => !(r.page_index === pageIndex && 
              (prev.filter(x => x.page_index === pageIndex).indexOf(r) === 1)))
          );
        }
      }
      
      await axios.post(`${API}/rhymes/select`, {
        school_id: school.school_id,
        grade: grade,
        page_index: pageIndex,
        rhyme_code: rhyme.code
      });

      // Load SVG content
      const svgResponse = await axios.get(`${API}/rhymes/svg/${rhyme.code}`);
      
      // Create new rhyme object with position metadata
      const newRhyme = {
        page_index: pageIndex,
        code: rhyme.code,
        name: rhyme.name,
        pages: rhyme.pages,
        svgContent: svgResponse.data,
        position: currentPosition // Track which position this was selected for
      };

      // Add new rhyme to state
      setSelectedRhymes(prev => [...prev, newRhyme]);

      // Automatically create new page when page is filled
      if (shouldCreateNewPage) {
        const nextPageIndex = getNextAvailablePageIndex();
        setCurrentPageIndex(nextPageIndex); // Navigate to new empty page
        
        if (rhyme.pages === 1.0) {
          toast.success(`Rhyme "${rhyme.name}" selected! Page completed - new empty page created.`);
        } else {
          toast.success(`Page completed with two rhymes! New empty page created automatically.`);
        }
      } else {
        toast.success(`Rhyme "${rhyme.name}" selected for ${currentPosition} position!`);
      }

      // Refresh available rhymes
      await fetchAvailableRhymes();
      await fetchReusableRhymes();

      setShowTreeMenu(false);
      setCurrentPosition(null);
    } catch (error) {
      console.error('Error selecting rhyme:', error);
      toast.error('Failed to select rhyme');
    }
  };

  const handleRemovePage = async (pageIndex) => {
    try {
      await axios.delete(`${API}/rhymes/remove/${school.school_id}/${grade}/${pageIndex}`);
      
      setSelectedRhymes(prev => prev.filter(rhyme => rhyme.page_index !== pageIndex));

      await fetchAvailableRhymes();
      await fetchReusableRhymes();
      toast.success('Rhyme removed successfully!');
    } catch (error) {
      console.error('Error removing rhyme:', error);
      toast.error('Failed to remove rhyme');
    }
  };

  const handlePageChange = (newPageIndex) => {
    setCurrentPageIndex(newPageIndex);
  };

  const handleToggleReusable = () => {
    setShowReusable(!showReusable);
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
            <Button 
              onClick={onBack}
              variant="outline" 
              className="bg-white/80 hover:bg-white border-gray-200"
            >
              Back to Grades
            </Button>
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-[calc(100vh-200px)]">
            
            {/* Tree Menu - Left Side (only shown when showTreeMenu is true) */}
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

            {/* Right Side - Dual Container Carousel */}
            <div className={`${showTreeMenu ? 'lg:col-span-3' : 'lg:col-span-4'} flex flex-col items-center justify-center`}>
              <div className="w-full max-w-2xl">
                <DualContainerCarousel
                  selectedRhymes={selectedRhymes}
                  currentPageIndex={currentPageIndex}
                  onPageChange={handlePageChange}
                  onRemovePage={handleRemovePage}
                  onAddRhyme={handleAddRhyme}
                />
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

  return (
    <div className="App">
      <Toaster position="top-right" />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={
            !school ? (
              <AuthPage onAuth={handleAuth} />
            ) : !selectedGrade ? (
              <GradeSelectionPage school={school} onGradeSelect={handleGradeSelect} />
            ) : (
              <RhymeSelectionPage 
                school={school} 
                grade={selectedGrade} 
                onBack={handleBack} 
              />
            )
          } />
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;