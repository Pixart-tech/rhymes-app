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
import { Plus, ChevronDown, ChevronRight, Replace, School, Users, BookOpen, Music } from 'lucide-react';

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
    return status ? `${status.selected_count}/${status.total_positions}` : '0/2';
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
const TreeMenu = ({ rhymesData, onRhymeSelect, selectedRhymes, filterByPages }) => {
  const [expandedGroups, setExpandedGroups] = useState({});

  const toggleGroup = (pageKey) => {
    setExpandedGroups(prev => ({
      ...prev,
      [pageKey]: !prev[pageKey]
    }));
  };

  const getFilteredRhymes = (pageKey, rhymes) => {
    if (!filterByPages || filterByPages.includes(parseFloat(pageKey))) {
      return rhymes;
    }
    return [];
  };

  if (!rhymesData || Object.keys(rhymesData).length === 0) {
    return (
      <div className="p-4 text-center text-gray-500">
        <Music className="w-12 h-12 mx-auto mb-2 opacity-50" />
        <p>No rhymes available</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-white/50 backdrop-blur-sm rounded-lg border border-gray-200">
      <div className="p-4 border-b bg-white/80">
        <h3 className="font-semibold text-gray-800 flex items-center gap-2">
          <BookOpen className="w-5 h-5" />
          Available Rhymes
        </h3>
      </div>
      
      <div className="p-2">
        {Object.entries(rhymesData).map(([pageKey, rhymes]) => {
          const filteredRhymes = getFilteredRhymes(pageKey, rhymes);
          if (filteredRhymes.length === 0) return null;

          return (
            <Collapsible key={pageKey} open={expandedGroups[pageKey]} onOpenChange={() => toggleGroup(pageKey)}>
              <CollapsibleTrigger className="flex items-center justify-between w-full p-3 text-left hover:bg-white/50 rounded-lg transition-colors duration-200">
                <span className="font-medium text-gray-700 flex items-center gap-2">
                  <div className="w-6 h-6 bg-gradient-to-r from-orange-400 to-red-400 rounded-full flex items-center justify-center text-white text-xs font-bold">
                    {pageKey}
                  </div>
                  {pageKey} Page{parseFloat(pageKey) !== 1 ? 's' : ''} ({filteredRhymes.length})
                </span>
                {expandedGroups[pageKey] ? 
                  <ChevronDown className="w-4 h-4 text-gray-500" /> : 
                  <ChevronRight className="w-4 h-4 text-gray-500" />
                }
              </CollapsibleTrigger>
              <CollapsibleContent className="pl-4">
                <div className="space-y-1 mt-2">
                  {filteredRhymes.map((rhyme) => (
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

// Main Rhyme Selection Interface
const RhymeSelectionPage = ({ school, grade, onBack }) => {
  const [availableRhymes, setAvailableRhymes] = useState({});
  const [selectedRhymes, setSelectedRhymes] = useState({ top: null, bottom: null });
  const [showTreeMenu, setShowTreeMenu] = useState(false);
  const [currentPosition, setCurrentPosition] = useState(null);
  const [svgContent, setSvgContent] = useState({ top: null, bottom: null });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAvailableRhymes();
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

  const fetchSelectedRhymes = async () => {
    try {
      const response = await axios.get(`${API}/rhymes/selected/${school.school_id}`);
      const gradeSelections = response.data[grade] || { top: null, bottom: null };
      setSelectedRhymes(gradeSelections);
      
      // Load SVG content for selected rhymes
      if (gradeSelections.top) {
        loadSvgContent(gradeSelections.top.code, 'top');
      }
      if (gradeSelections.bottom) {
        loadSvgContent(gradeSelections.bottom.code, 'bottom');
      }
    } catch (error) {
      console.error('Error fetching selected rhymes:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadSvgContent = async (rhymeCode, position) => {
    try {
      const response = await axios.get(`${API}/rhymes/svg/${rhymeCode}`);
      setSvgContent(prev => ({
        ...prev,
        [position]: response.data
      }));
    } catch (error) {
      console.error('Error loading SVG:', error);
    }
  };

  const handleAddRhyme = (position) => {
    setCurrentPosition(position);
    setShowTreeMenu(true);
  };

  const handleRhymeSelect = async (rhyme) => {
    try {
      await axios.post(`${API}/rhymes/select`, {
        school_id: school.school_id,
        grade: grade,
        position: currentPosition,
        rhyme_code: rhyme.code
      });

      // Update local state
      setSelectedRhymes(prev => ({
        ...prev,
        [currentPosition]: {
          code: rhyme.code,
          name: rhyme.name,
          pages: rhyme.pages
        }
      }));

      // Load SVG content
      await loadSvgContent(rhyme.code, currentPosition);

      // Refresh available rhymes
      await fetchAvailableRhymes();

      setShowTreeMenu(false);
      setCurrentPosition(null);
      toast.success(`Rhyme "${rhyme.name}" selected successfully!`);
    } catch (error) {
      console.error('Error selecting rhyme:', error);
      toast.error('Failed to select rhyme');
    }
  };

  const handleReplaceRhyme = (position) => {
    setCurrentPosition(position);
    setShowTreeMenu(true);
  };

  const handleRemoveRhyme = async (position) => {
    try {
      await axios.delete(`${API}/rhymes/remove/${school.school_id}/${grade}/${position}`);
      
      setSelectedRhymes(prev => ({
        ...prev,
        [position]: null
      }));
      
      setSvgContent(prev => ({
        ...prev,
        [position]: null
      }));

      await fetchAvailableRhymes();
      toast.success('Rhyme removed successfully!');
    } catch (error) {
      console.error('Error removing rhyme:', error);
      toast.error('Failed to remove rhyme');
    }
  };

  const getFilterForPosition = (position) => {
    return position === 'top' ? [1.0] : [0.5];
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
            
            {/* Tree Menu - Left Side */}
            <div className={`lg:col-span-1 transition-all duration-300 ${showTreeMenu ? 'block' : 'hidden lg:block'}`}>
              {showTreeMenu && (
                <div className="mb-4 lg:hidden">
                  <Button 
                    onClick={() => {setShowTreeMenu(false); setCurrentPosition(null);}}
                    variant="outline"
                    className="w-full"
                  >
                    Close Menu
                  </Button>
                </div>
              )}
              <TreeMenu 
                rhymesData={availableRhymes}
                onRhymeSelect={handleRhymeSelect}
                selectedRhymes={selectedRhymes}
                filterByPages={currentPosition ? getFilterForPosition(currentPosition) : null}
              />
            </div>

            {/* Right Side - Two Divisions */}
            <div className={`lg:col-span-3 ${showTreeMenu ? 'hidden lg:block' : 'block'}`}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-full">
                
                {/* Top Division (1.0 pages) */}
                <Card className="relative bg-white/80 backdrop-blur-sm border-0 shadow-xl">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg text-center text-gray-700">
                      Top Position (1.0 Page Rhymes)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="h-[400px] flex flex-col">
                    {selectedRhymes.top ? (
                      <div className="flex-1 relative">
                        <div className="h-full flex items-center justify-center bg-gray-50 rounded-lg overflow-hidden">
                          {svgContent.top ? (
                            <div 
                              dangerouslySetInnerHTML={{ __html: svgContent.top }}
                              className="w-full h-full flex items-center justify-center"
                            />
                          ) : (
                            <div className="text-center">
                              <Music className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                              <p className="text-sm text-gray-500">Loading rhyme content...</p>
                            </div>
                          )}
                        </div>
                        <div className="mt-4 text-center">
                          <p className="font-semibold text-gray-800">{selectedRhymes.top.name}</p>
                          <p className="text-sm text-gray-500">Code: {selectedRhymes.top.code}</p>
                        </div>
                        <div className="flex gap-2 mt-4">
                          <Button
                            onClick={() => handleReplaceRhyme('top')}
                            variant="outline"
                            className="flex-1 bg-white/50 hover:bg-white"
                          >
                            <Replace className="w-4 h-4 mr-2" />
                            Replace
                          </Button>
                          <Button
                            onClick={() => handleRemoveRhyme('top')}
                            variant="outline"
                            className="flex-1 bg-white/50 hover:bg-white text-red-600 hover:text-red-700"
                          >
                            Remove
                          </Button>
                        </div>
                      </div>
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

                {/* Bottom Division (0.5 pages) */}
                <Card className="relative bg-white/80 backdrop-blur-sm border-0 shadow-xl">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg text-center text-gray-700">
                      Bottom Position (0.5 Page Rhymes)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="h-[400px] flex flex-col">
                    {selectedRhymes.bottom ? (
                      <div className="flex-1 relative">
                        <div className="h-full flex items-center justify-center bg-gray-50 rounded-lg overflow-hidden">
                          {svgContent.bottom ? (
                            <div 
                              dangerouslySetInnerHTML={{ __html: svgContent.bottom }}
                              className="w-full h-full flex items-center justify-center"
                            />
                          ) : (
                            <div className="text-center">
                              <Music className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                              <p className="text-sm text-gray-500">Loading rhyme content...</p>
                            </div>
                          )}
                        </div>
                        <div className="mt-4 text-center">
                          <p className="font-semibold text-gray-800">{selectedRhymes.bottom.name}</p>
                          <p className="text-sm text-gray-500">Code: {selectedRhymes.bottom.code}</p>
                        </div>
                        <div className="flex gap-2 mt-4">
                          <Button
                            onClick={() => handleReplaceRhyme('bottom')}
                            variant="outline"
                            className="flex-1 bg-white/50 hover:bg-white"
                          >
                            <Replace className="w-4 h-4 mr-2" />
                            Replace
                          </Button>
                          <Button
                            onClick={() => handleRemoveRhyme('bottom')}
                            variant="outline"
                            className="flex-1 bg-white/50 hover:bg-white text-red-600 hover:text-red-700"
                          >
                            Remove
                          </Button>
                        </div>
                      </div>
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