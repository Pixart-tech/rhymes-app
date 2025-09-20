import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import axios from 'axios';
import './App.css';

import AdminDashboard from './AdminDashboard';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from './components/ui/carousel';
import { Toaster } from './components/ui/sonner';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
const API = BACKEND_URL ? `${BACKEND_URL}/api` : '/api';

const parsePagesValue = (value) => {
  if (value === null || value === undefined) {
    return 1;
  }

  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return numeric;
  }

  const stringValue = String(value).trim();
  if (stringValue === '0.5') {
    return 0.5;
  }

  return 1;
};

const sortSelections = (entries = []) => {
  return [...entries].sort((a, b) => {
    const pageDiff = Number(a.page_index) - Number(b.page_index);
    if (pageDiff !== 0) {
      return pageDiff;
    }

    const positionOrder = (selection) => {
      const pages = parsePagesValue(selection.pages);
      if (pages > 0.5) {
        return 0;
      }
      return selection.position === 'bottom' ? 2 : 1;
    };

    return positionOrder(a) - positionOrder(b);
  });
};

const buildPageLayout = (entries = []) => {
  const map = new Map();
  let maxIndex = 0;

  entries.forEach((selection) => {
    const pageIndex = Number(selection.page_index);
    if (!Number.isFinite(pageIndex) || pageIndex < 0) {
      return;
    }

    maxIndex = Math.max(maxIndex, pageIndex);
    const existing = map.get(pageIndex) ?? {
      pageIndex,
      top: null,
      bottom: null,
      fullPage: false,
    };

    const pages = parsePagesValue(selection.pages);
    if (pages > 0.5) {
      existing.top = selection;
      existing.bottom = null;
      existing.fullPage = true;
    } else {
      const slot = selection.position === 'bottom' ? 'bottom' : 'top';
      existing[slot] = selection;
      existing.fullPage = false;
    }

    map.set(pageIndex, existing);
  });

  if (map.size === 0) {
    map.set(0, { pageIndex: 0, top: null, bottom: null, fullPage: false });
  } else {
    for (let index = 0; index <= maxIndex; index += 1) {
      if (!map.has(index)) {
        map.set(index, { pageIndex: index, top: null, bottom: null, fullPage: false });
      }
    }
  }

  const sorted = Array.from(map.values()).sort((a, b) => a.pageIndex - b.pageIndex);
  const last = sorted[sorted.length - 1];
  if (last && (last.fullPage || last.top || last.bottom)) {
    sorted.push({ pageIndex: last.pageIndex + 1, top: null, bottom: null, fullPage: false });
  }

  if (sorted.length === 0) {
    return [{ pageIndex: 0, top: null, bottom: null, fullPage: false }];
  }

  return sorted;
};

const AuthPage = ({ onAuth }) => {
  const [schoolId, setSchoolId] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleAuth = async (event) => {
    event.preventDefault();

    if (!schoolId.trim() || !schoolName.trim()) {
      toast.error('Please provide a School ID and School Name');
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(`${API}/auth/login`, {
        school_id: schoolId.trim(),
        school_name: schoolName.trim(),
      });
      onAuth(response.data);
      toast.success('Logged in successfully');
    } catch (error) {
      console.error('Authentication error:', error);
      toast.error('Unable to log in');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-red-50 flex items-center justify-center p-6">
      <Card className="w-full max-w-md border-0 bg-white/80 backdrop-blur-sm shadow-xl">
        <CardHeader className="space-y-3 text-center">
          <CardTitle className="text-2xl font-semibold text-gray-800">Rhyme Picker</CardTitle>
          <p className="text-sm text-gray-600">Sign in to choose rhymes for your grades</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAuth} className="space-y-5">
            <div className="space-y-2 text-left">
              <label className="text-sm font-medium text-gray-700">School ID</label>
              <Input
                value={schoolId}
                onChange={(event) => setSchoolId(event.target.value)}
                placeholder="Enter your school ID"
                className="h-12 bg-white/70 border-gray-200 focus:border-orange-400 focus:ring-orange-400"
              />
            </div>
            <div className="space-y-2 text-left">
              <label className="text-sm font-medium text-gray-700">School Name</label>
              <Input
                value={schoolName}
                onChange={(event) => setSchoolName(event.target.value)}
                placeholder="Enter your school name"
                className="h-12 bg-white/70 border-gray-200 focus:border-orange-400 focus:ring-orange-400"
              />
            </div>
            <Button
              type="submit"
              disabled={loading}
              className="w-full h-12 rounded-xl bg-gradient-to-r from-orange-400 to-red-400 font-semibold text-white transition-transform duration-300 hover:scale-[1.01] hover:from-orange-500 hover:to-red-500"
            >
              {loading ? 'Authenticating…' : 'Continue'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate('/admin')}
              className="w-full h-12 border-orange-200 bg-white/70 text-orange-600 hover:bg-white"
            >
              Open Admin Dashboard
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

const GradeSelectionPage = ({ onGradeSelect, onLogout }) => {
  const navigate = useNavigate();

  const grades = [
    { id: 'nursery', name: 'Nursery', color: 'from-orange-400 to-amber-400' },
    { id: 'lkg', name: 'LKG', color: 'from-pink-400 to-rose-400' },
    { id: 'ukg', name: 'UKG', color: 'from-blue-400 to-cyan-400' },
    { id: 'playgroup', name: 'Playgroup', color: 'from-emerald-400 to-teal-400' },
  ];

  const handleLogout = () => {
    if (typeof onLogout === 'function') {
      onLogout();
    }
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-red-50 flex items-center justify-center p-6">
      <div className="w-full max-w-4xl space-y-10">
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <h1 className="text-3xl font-semibold text-gray-800">Choose a Grade</h1>
          <Button variant="outline" onClick={handleLogout} className="border-gray-200 bg-white/80 hover:bg-white">
            Logout
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {grades.map((grade) => (
            <button
              key={grade.id}
              type="button"
              onClick={() => onGradeSelect(grade.id)}
              className="group flex flex-col items-center justify-center gap-3 rounded-2xl bg-white/80 p-10 text-center shadow-lg transition-transform duration-300 hover:scale-105"
            >
              <span className={`inline-flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-r ${grade.color} text-2xl font-semibold text-white shadow`}>+</span>
              <span className="text-lg font-medium text-gray-800">{grade.name}</span>
              <span className="text-xs uppercase tracking-wide text-gray-400">Select</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

const Slot = ({ rhyme, pageIndex, position, onOpen }) => {
  const hasRhyme = Boolean(rhyme);
  const handleClick = () => onOpen(position, pageIndex);

  return (
    <div className="relative h-[290px] w-[210px] overflow-hidden bg-white">
      {hasRhyme ? (
        <>
          <div className="h-full w-full [&>svg]:h-full [&>svg]:w-full [&>svg]:object-cover" dangerouslySetInnerHTML={{ __html: rhyme?.svgContent || '' }} />
          <button
            type="button"
            onClick={handleClick}
            className="absolute inset-0 cursor-pointer bg-transparent"
            aria-label="Change rhyme"
          />
        </>
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-white">
          <button
            type="button"
            onClick={handleClick}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-orange-400 bg-white text-lg font-semibold text-orange-500 transition hover:bg-orange-50"
            aria-label="Add rhyme"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
};

const RhymeMenu = ({ open, rhymes, onClose, onSelect }) => {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800">Select a rhyme</h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 text-gray-500 hover:bg-gray-100"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
          {rhymes.length === 0 ? (
            <p className="text-sm text-gray-500">No rhymes available for this slot.</p>
          ) : (
            rhymes.map((rhyme) => (
              <div
                key={rhyme.code}
                className="flex items-center justify-between rounded-xl border border-gray-100 bg-white px-3 py-2 shadow-sm"
              >
                <span className="text-sm font-medium text-gray-700">{rhyme.name}</span>
                <button
                  type="button"
                  onClick={() => onSelect(rhyme)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-orange-500 text-white transition hover:bg-orange-600"
                  aria-label={`Add ${rhyme.name}`}
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

const RhymeSelectionPage = ({ school, grade, onBack, onLogout }) => {
  const [availableRhymes, setAvailableRhymes] = useState({});
  const [selectedRhymes, setSelectedRhymes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [menuSlot, setMenuSlot] = useState(null);
  const [carouselApi, setCarouselApi] = useState(null);

  const fetchSvgForRhyme = useCallback(async (code) => {
    try {
      const response = await axios.get(`${API}/rhymes/svg/${code}`);
      return response.data;
    } catch (error) {
      console.warn('Unable to load SVG preview:', error);
      return null;
    }
  }, []);

  const loadAvailableRhymes = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/rhymes/available/${school.school_id}/${grade}`);
      setAvailableRhymes(response.data || {});
    } catch (error) {
      console.error('Error loading available rhymes:', error);
      toast.error('Unable to load available rhymes');
    }
  }, [school.school_id, grade]);

  const loadSelectedRhymes = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/rhymes/selected/${school.school_id}`);
      const gradeSelections = response.data?.[grade] ?? [];

      const enriched = await Promise.all(
        gradeSelections.map(async (selection) => {
          const svgContent = await fetchSvgForRhyme(selection.code);
          return {
            ...selection,
            page_index: Number(selection.page_index) || 0,
            position: selection.position === 'bottom' ? 'bottom' : 'top',
            pages: parsePagesValue(selection.pages),
            svgContent,
          };
        })
      );

      setSelectedRhymes(sortSelections(enriched));
    } catch (error) {
      console.error('Error loading selected rhymes:', error);
      toast.error('Unable to load selected rhymes');
      setSelectedRhymes([]);
    }
  }, [grade, school.school_id, fetchSvgForRhyme]);

  useEffect(() => {
    const initialize = async () => {
      setLoading(true);
      await Promise.all([loadAvailableRhymes(), loadSelectedRhymes()]);
      setLoading(false);
    };

    initialize();
  }, [loadAvailableRhymes, loadSelectedRhymes]);

  const pages = useMemo(() => buildPageLayout(selectedRhymes), [selectedRhymes]);

  const menuRhymes = useMemo(() => {
    if (!menuSlot) {
      return [];
    }

    const entries = [];
    Object.entries(availableRhymes || {}).forEach(([pageKey, rhymes]) => {
      const pagesValue = parsePagesValue(pageKey);
      if (menuSlot.position === 'bottom' && pagesValue > 0.5) {
        return;
      }

      (Array.isArray(rhymes) ? rhymes : []).forEach((item) => {
        entries.push({
          ...item,
          pages: parsePagesValue(item.pages ?? pageKey),
        });
      });
    });

    return entries.sort((a, b) => {
      const pageDiff = parsePagesValue(a.pages) - parsePagesValue(b.pages);
      if (pageDiff !== 0) {
        return pageDiff;
      }
      return a.name.localeCompare(b.name);
    });
  }, [availableRhymes, menuSlot]);

  const handleOpenMenu = (position, pageIndex) => {
    setMenuSlot({ position, pageIndex });
  };

  const handleCloseMenu = () => {
    setMenuSlot(null);
  };

  const handleSelectRhyme = async (rhyme) => {
    if (!menuSlot) {
      return;
    }

    const pageIndex = menuSlot.pageIndex;
    const pagesValue = parsePagesValue(rhyme.pages);
    const position = pagesValue === 0.5 ? menuSlot.position : 'top';

    try {
      await axios.post(`${API}/rhymes/select`, {
        school_id: school.school_id,
        grade,
        page_index: pageIndex,
        rhyme_code: rhyme.code,
        position,
      });
    } catch (error) {
      console.error('Error selecting rhyme:', error);
      toast.error('Unable to add the rhyme');
      return;
    }

    let nextSelections = selectedRhymes.filter((selection) => {
      const samePage = Number(selection.page_index) === Number(pageIndex);
      if (!samePage) {
        return true;
      }

      const selectionPages = parsePagesValue(selection.pages);
      if (pagesValue > 0.5 || selectionPages > 0.5) {
        return false;
      }

      const normalizedPosition = selection.position === 'bottom' ? 'bottom' : 'top';
      return normalizedPosition !== position;
    });

    const svgContent = await fetchSvgForRhyme(rhyme.code);

    nextSelections = sortSelections([
      ...nextSelections,
      {
        ...rhyme,
        pages: pagesValue,
        page_index: pageIndex,
        position,
        svgContent,
      },
    ]);

    const nextPages = buildPageLayout(nextSelections);
    setSelectedRhymes(nextSelections);
    await loadAvailableRhymes();
    setMenuSlot(null);

    if (carouselApi) {
      const targetIndex = nextPages.findIndex((page) => page.pageIndex === pageIndex);
      if (targetIndex >= 0) {
        requestAnimationFrame(() => {
          carouselApi.scrollTo(targetIndex);
        });
      }
    }

    toast.success('Rhyme added');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-red-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-gray-600">
          <div className="h-16 w-16 animate-spin rounded-full border-4 border-orange-300 border-t-transparent" />
          <span>Loading rhymes…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-red-50 flex flex-col items-center justify-center px-4 py-10">
      <div className="flex w-full max-w-5xl flex-col items-center gap-8">
        <div className="flex w-full items-center justify-between gap-3">
          <Button variant="outline" onClick={onBack} className="border-gray-200 bg-white/80 hover:bg-white">
            Back
          </Button>
          <Button variant="outline" onClick={onLogout} className="border-gray-200 bg-white/80 hover:bg-white">
            Logout
          </Button>
        </div>

        <div className="w-full">
          <Carousel className="w-full" opts={{ align: 'center', loop: false }} setApi={setCarouselApi}>
            <CarouselContent className="-ml-6">
              {pages.map((page) => (
                <CarouselItem key={page.pageIndex} className="pl-6">
                  <div className="flex flex-col items-center gap-6">
                    <Slot rhyme={page.top} pageIndex={page.pageIndex} position="top" onOpen={handleOpenMenu} />
                    {!page.fullPage && (
                      <Slot rhyme={page.bottom} pageIndex={page.pageIndex} position="bottom" onOpen={handleOpenMenu} />
                    )}
                  </div>
                </CarouselItem>
              ))}
            </CarouselContent>
            <CarouselPrevious className="hidden sm:flex" />
            <CarouselNext className="hidden sm:flex" />
          </Carousel>
        </div>
      </div>

      <RhymeMenu open={Boolean(menuSlot)} rhymes={menuRhymes} onClose={handleCloseMenu} onSelect={handleSelectRhyme} />
    </div>
  );
};

const AppRoutes = () => {
  const [school, setSchool] = useState(null);
  const [selectedGrade, setSelectedGrade] = useState(null);

  const handleLogout = useCallback(() => {
    setSelectedGrade(null);
    setSchool(null);
  }, []);

  const handleBackToGrades = useCallback(() => {
    setSelectedGrade(null);
  }, []);

  return (
    <Routes>
      <Route path="/admin" element={<AdminDashboard />} />
      <Route
        path="*"
        element={
          !school ? (
            <AuthPage onAuth={setSchool} />
          ) : !selectedGrade ? (
            <GradeSelectionPage onGradeSelect={setSelectedGrade} onLogout={handleLogout} />
          ) : (
            <RhymeSelectionPage
              school={school}
              grade={selectedGrade}
              onBack={handleBackToGrades}
              onLogout={handleLogout}
            />
          )
        }
      />
    </Routes>
  );
};

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Toaster position="top-right" richColors />
        <AppRoutes />
      </BrowserRouter>
    </div>
  );
}

export default App;
