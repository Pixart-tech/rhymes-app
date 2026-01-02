
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import '../App.css';
import { useAuth } from '../hooks/useAuth';
import AuthPage, { type WorkspaceUserProfile } from '../components/AuthPage';


// Components
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../components/ui/collapsible';
import { toast } from 'sonner';
import { Toaster } from '../components/ui/sonner';
import CoverPageWorkflow from '../components/CoverPageWorkflow';
import HomePage from '../pages/HomePage';

import InlineSvg from '../components/InlineSvg';
import {
  SchoolForm,
  type SchoolFormSubmitPayload,
  buildSchoolFormValuesFromProfile,
  buildSchoolFormData
} from '../components/SchoolProfileForm';
import { API_BASE_URL } from '../lib/utils';
import { decodeSvgPayload, prepareRhymeSvgPages, sanitizeRhymeSvgContent } from '../lib/svgUtils';
import { readFileAsDataUrl } from '../lib/fileUtils';
import {
  clearPersistedAppState,
  loadPersistedAppState,
  savePersistedAppState,
  clearCoverWorkflowState,
  loadCoverWorkflowState,
  clearBookWorkflowState,
  loadBookWorkflowState
} from '../lib/storage';


// Icons
import {
  Plus,
  ChevronDown,
  ChevronRight,
  Replace,
  BookOpen,
  Music,
  ChevronLeft,
  Eye,
  Download,
  LayoutTemplate,
  BookMarked,
  Clock,
  Loader2,
  UserRoundPen
} from 'lucide-react';
import type { SchoolProfile } from '../types/types';


const API = API_BASE_URL || '/api';

const buildBinderDownloadUrl = (apiBase, schoolId, gradeId) => {
  if (!apiBase || !schoolId || !gradeId) {
    return '';
  }

  const basePath = `${apiBase}/rhymes/binder/${schoolId}/${gradeId}`;
  const timestamp = Date.now().toString();

  if (typeof window !== 'undefined' && window.location) {
    try {
      const resolved = new URL(basePath, window.location.origin);
      resolved.searchParams.set('_t', timestamp);
      return resolved.toString();
    } catch (error) {
      console.error('Error constructing binder download URL:', error);
    }
  }

  const separator = basePath.includes('?') ? '&' : '?';
  return `${basePath}${separator}_t=${timestamp}`;
};

const GRADE_OPTIONS = [
  { id: 'nursery', name: 'Nursery', color: 'from-pink-400 to-rose-400', icon: '🌸' },
  { id: 'lkg', name: 'LKG', color: 'from-blue-400 to-cyan-400', icon: '🎈' },
  { id: 'ukg', name: 'UKG', color: 'from-green-400 to-emerald-400', icon: '🌟' },
  { id: 'playgroup', name: 'Playgroup', color: 'from-purple-400 to-indigo-400', icon: '🎨' }
];

const MAX_RHYME_PAGES = 44;

const createDefaultGradeNames = () =>
  GRADE_OPTIONS.reduce((acc, grade) => {
    acc[grade.id] = grade.name;
    if (grade.id === 'playgroup') {
      acc.pg = grade.name;
    }
    return acc;
  }, {});

const DEFAULT_COVER_DEFAULTS = {
  schoolLogo: '',
  schoolLogoFileName: '',
  contactNumber: '',
  website: '',
  email: '',
  addressLine1: '',
  addressLine2: '',
  addressLine3: '',
  tagLine1: '',
  tagLine2: '',
  tagLine3: '',
  gradeNames: createDefaultGradeNames()
};

const mergeCoverDefaults = (overrides = {}) => ({
  ...DEFAULT_COVER_DEFAULTS,
  ...overrides,
  gradeNames: {
    ...DEFAULT_COVER_DEFAULTS.gradeNames,
    ...(overrides.gradeNames || {})
  }
});

const resolveDefaultGradeLabel = (gradeId) => {
  const option = GRADE_OPTIONS.find((item) => item.id === gradeId);
  return option ? option.name : 'Grade';
};

const buildCoverGradeNames = (source) =>
  GRADE_OPTIONS.reduce((acc, grade) => {
    const rawValue = source?.gradeNames?.[grade.id];
    if (typeof rawValue === 'string' && rawValue.trim().length > 0) {
      acc[grade.id] = rawValue.trim();
    } else {
      acc[grade.id] = resolveDefaultGradeLabel(grade.id);
    }
    return acc;
  }, (source?.gradeNames?.pg ? { pg: source.gradeNames.pg } : {}));

const buildGradeNamesFromSchool = (school?: SchoolProfile | null) => {
  const base = createDefaultGradeNames();
  const mapKey: Record<string, string> = {
    toddler: 'playgroup',
    playgroup: 'playgroup',
    nursery: 'nursery',
    lkg: 'lkg',
    ukg: 'ukg'
  };
  const grades = school?.grades;
  if (!grades) {
    return base;
  }
  Object.entries(grades).forEach(([rawKey, value]) => {
    const mapped = mapKey[rawKey.toLowerCase()] || rawKey.toLowerCase();
    const label = typeof value?.label === 'string' ? value.label.trim() : '';
    if (mapped && label) {
      base[mapped] = label;
      if (mapped === 'playgroup') {
        base.pg = label;
      }
    }
  });
  if (!base.pg && base.playgroup) {
    base.pg = base.playgroup;
  }
  return base;
};

const areGradeNamesEqual = (a: Record<string, string> = {}, b: Record<string, string> = {}) => {
  const allKeys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of allKeys) {
    if ((a[key] || '') !== (b[key] || '')) {
      return false;
    }
  }
  return true;
};

const ModeSelectionPage = ({
  school,
  onModeSelect,
  isSuperAdmin = false,
  isFrozen = false,
  onBackToAdmin,
  onBackToDashboard,
  onEditProfile
}) => {
  const hasBookSelections = useMemo(() => {
    const schoolId = school?.school_id;
    if (!schoolId) return false;
    return GRADE_OPTIONS.some((grade) => {
      const stored = loadBookWorkflowState(schoolId, grade.id);
      const count = Array.isArray(stored?.selectedBooks) ? stored.selectedBooks.length : 0;
      return count > 0;
    });
  }, [school?.school_id]);

  const coverStatus = useMemo(() => {
    const rank: Record<string, number> = { '1': 1, '2': 2, '3': 3, '4': 4 };
    let status = (school?.cover_status || '1').toString();
    const schoolId = school?.school_id;
    if (schoolId) {
      let best = status;
      GRADE_OPTIONS.forEach((grade) => {
        const state = loadCoverWorkflowState(schoolId, grade.id);
        const s = (state?.status || '').toString();
        if (rank[s] && (!rank[best] || rank[s] > rank[best])) {
          best = s;
        }
      });
      status = best || status || '1';
    }
    return status;
  }, [school?.cover_status, school?.school_id]);
  const coverStatusDescription =
    {
      '1': 'Explore the cover pages to begin selection.',
      '2': 'Cover pages are being prepared. Please wait.',
      '3': 'View uploaded cover pages and approve.',
      '4': 'Selections are frozen. Contact admin for changes.'
    }[coverStatus] || 'Explore the cover pages to begin selection.';
  const options = [
    {
      id: 'cover',
      title: 'Cover Pages',
      description: coverStatusDescription,
      gradient: 'from-rose-400 to-pink-500',
      icon: LayoutTemplate
    },
    {
      id: 'books',
      title: 'Books',
      description: 'Plan and curate the book list appropriate for every class.',
      gradient: 'from-blue-400 to-indigo-500',
      icon: BookMarked
    },
    {
      id: 'rhymes',
      title: 'Rhymes',
      description: 'Select and organise rhymes to build your customised binders.',
      gradient: 'from-orange-400 to-red-400',
      icon: Music
    }
  ];

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto flex max-w-5xl flex-col gap-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-800">Welcome, {school.school_name}</h1>
            <p className="text-gray-600">School ID: {school.school_id}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            {onEditProfile && (
              <Button
                variant="outline"
                className="bg-white/80 hover:bg-white border-gray-200 whitespace-normal text-xs sm:text-sm px-3 sm:px-4 py-2 sm:py-2.5"
                onClick={onEditProfile}
              >
                <UserRoundPen className="mr-2 h-4 w-4 shrink-0" />
                <span className="min-w-0 text-left">Edit profile</span>
              </Button>
            )}
            {isSuperAdmin && (
              <>
                <Button
                  variant="outline"
                  className="bg-white/80 hover:bg-white border-gray-200 whitespace-normal text-xs sm:text-sm px-3 sm:px-4 py-2 sm:py-2.5"
                  onClick={onBackToAdmin}
                >
                  <ChevronLeft className="mr-2 h-4 w-4 shrink-0" />
                  <span className="min-w-0 text-left">Back to admin dashboard</span>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  className="bg-white/80 hover:bg-white border-gray-200 whitespace-normal text-xs sm:text-sm px-3 sm:px-4 py-2 sm:py-2.5"
                >
                  <a href="#/admin/upload" className="min-w-0 text-left">Admin tools</a>
                </Button>
              </>
            )}
            {onBackToDashboard && (
              <Button
                variant="outline"
                className="bg-white/80 hover:bg-white border-gray-200 whitespace-normal text-xs sm:text-sm px-3 sm:px-4 py-2 sm:py-2.5"
                onClick={onBackToDashboard}
              >
                <ChevronLeft className="mr-2 h-4 w-4 shrink-0" />
                <span className="min-w-0 text-left">Back to dashboard</span>
              </Button>
            )}
          </div>
        </div>

        {isFrozen && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 shadow-sm">
            Selections are approved and frozen. You can only view existing books, covers, and rhymes.
          </div>
        )}

        <Card className="border-0 bg-white/80 backdrop-blur-md shadow-xl">
          <CardHeader>
            <CardTitle className="text-xl sm:text-2xl font-semibold text-gray-800">
              Choose what you would like to work on
            </CardTitle>
            <p className="text-sm sm:text-base text-gray-600">
              Select one of the workflows below to continue. You can always return to this menu to switch tasks.
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
              {options.map((option) => {
                const IconComponent = option.icon;
                const showCoverButton = !(option.id === 'cover' && coverStatus !== '1');
                const isBooksOption = option.id === 'books';
                const buttonLabel = isBooksOption && hasBookSelections ? 'View selections' : `Explore ${option.title}`;
                return (
                  <Card
                    key={option.id}
                    className="group aspect-square flex flex-col cursor-pointer transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg border border-slate-200 bg-white"
                    onClick={() => onModeSelect(option.id)}
                  >
                    <CardContent className="flex-1 flex flex-col justify-between p-3 sm:p-4 text-center gap-1.5">
                    <div className="space-y-1.5">
                        <div className={`w-12 h-12 sm:w-14 sm:h-14 mx-auto rounded-xl bg-gradient-to-r ${option.gradient} text-white flex items-center justify-center text-lg sm:text-xl shadow`}>
                          <IconComponent className="h-6 w-6 sm:h-7 sm:w-7" />
                        </div>
                        <h3 className="text-sm sm:text-lg font-semibold text-gray-800 truncate">{option.title}</h3>
                        <p className="text-xs sm:text-sm text-gray-600 leading-relaxed line-clamp-2 overflow-hidden text-ellipsis">
                          {option.description}
                        </p>
                    </div>
                      {showCoverButton && (
                        <Button
                          type="button"
                          onClick={() => onModeSelect(option.id)}
                          className="w-full text-sm sm:text-base bg-gradient-to-r from-orange-400 to-red-400 text-white shadow hover:from-orange-500 hover:to-red-500"
                        >
                          {buttonLabel}
                        </Button>
                      )}
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
// const Header: React.FC = ({onBackToMode}) => {
//   const { user, signIn, signOut } = useAuth();
//   const navigate = useNavigate();

//   const activeLinkClass = "text-white bg-primary-700";
//   const inactiveLinkClass = "text-gray-300 hover:bg-primary-600 hover:text-white";
//   const linkBaseClass = "px-3 py-2 rounded-md text-sm font-medium transition-colors";

//   const handleBackToMenu = () => {
//     if (typeof onBackToMode === 'function') {
//       onBackToMode();
//     }
//     navigate('/');
//   };

//   return (
//     <header className="bg-primary-800 shadow-md">
//       <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
//         <div className="flex items-center justify-between h-16">
//           <div className="flex items-center">
//             <div className="flex-shrink-0">
//                <NavLink to="/" className="text-white text-xl font-bold">Book Selector</NavLink>
//             </div>
//             <div className="hidden md:block">
//               <div className="ml-10 flex items-baseline space-x-4">
                
//                 {user && (
//                   <>
//                     <NavLink to="/questionnaire" className={({isActive}) => `${linkBaseClass} ${isActive ? activeLinkClass : inactiveLinkClass}`}>Questionnaire</NavLink>
//                     <NavLink to="/grid" className={({isActive}) => `${linkBaseClass} ${isActive ? activeLinkClass : inactiveLinkClass}`}>View Grid</NavLink>
//                     <NavLink to="/admin/upload" className={({isActive}) => `${linkBaseClass} ${isActive ? activeLinkClass : inactiveLinkClass}`}>Upload PDF</NavLink>
                   







                    
//                   </>
//                 )}
//                  <Button
//                 onClick={handleBackToMenu}
//                 variant="outline"
//                 className="bg-white/80 hover:bg-white border-gray-200"
//               >
//                 Back to Menu
//               </Button>
//               </div>
//             </div>
//           </div>
//           <div className="flex items-center">
//             {user ? (
//               <>
//                 <span className="text-gray-300 text-sm mr-4 hidden sm:inline">School ID: {user.schoolId}</span>
//                 <button
//                   onClick={signOut}
//                   className="bg-red-600 text-white px-3 py-2 rounded-md text-sm font-medium hover:bg-red-700 transition-colors"
//                 >
//                   Sign Out
//                 </button>
//               </>
//             ) : (
//               <button
//                 onClick={signIn}
//                 className="bg-primary-600 text-white px-3 py-2 rounded-md text-sm font-medium hover:bg-primary-700 transition-colors"
//               >
//                 Sign in with Google
//               </button>
//             )}
//           </div>
//         </div>
//       </nav>
//     </header>
//   );
// };
// Cover Details Page
const CoverDetailsPage = ({ school, coverDetails, onSave, onBackToMenu, onLogout }) => {
  const navigate = useNavigate();
  const [formState, setFormState] = useState(() => ({
    schoolLogo: coverDetails?.schoolLogo || '',
    schoolLogoFileName: coverDetails?.schoolLogoFileName || '',
    contactNumber: coverDetails?.contactNumber || '',
    website: coverDetails?.website || '',
    email: coverDetails?.email || '',
    addressLine1: coverDetails?.addressLine1 || '',
    addressLine2: coverDetails?.addressLine2 || '',
    addressLine3: coverDetails?.addressLine3 || '',
    tagLine1: coverDetails?.tagLine1 || '',
    tagLine2: coverDetails?.tagLine2 || '',
    tagLine3: coverDetails?.tagLine3 || '',
    gradeNames: buildCoverGradeNames(coverDetails)
  }));
  const [formError, setFormError] = useState('');
  const [logoError, setLogoError] = useState('');

  useEffect(() => {
    setFormState({
      schoolLogo: coverDetails?.schoolLogo || '',
      schoolLogoFileName: coverDetails?.schoolLogoFileName || '',
      contactNumber: coverDetails?.contactNumber || '',
      website: coverDetails?.website || '',
      email: coverDetails?.email || '',
      addressLine1: coverDetails?.addressLine1 || '',
      addressLine2: coverDetails?.addressLine2 || '',
      addressLine3: coverDetails?.addressLine3 || '',
      tagLine1: coverDetails?.tagLine1 || '',
      tagLine2: coverDetails?.tagLine2 || '',
      tagLine3: coverDetails?.tagLine3 || '',
      gradeNames: buildCoverGradeNames(coverDetails)
    });
  }, [coverDetails]);

  const handleChange = useCallback(
    (field) => (event) => {
      const value = event?.target?.value ?? '';
      setFormState((current) => ({
        ...current,
        [field]: value
      }));
      setFormError('');
    },
    []
  );

  const handleGradeNameChange = useCallback((gradeId) => (event) => {
    const value = event?.target?.value ?? '';
    setFormState((current) => ({
      ...current,
      gradeNames: {
        ...(current.gradeNames || {}),
        [gradeId]: value
      }
    }));
    setFormError('');
  }, []);

  const handleLogoUpload = useCallback(async (event) => {
    const input = event?.target;
    const file = input?.files?.[0] || null;

    if (!file) {
      setFormState((current) => ({ ...current, schoolLogo: '', schoolLogoFileName: '' }));
      setLogoError('');
    } else if (file.type && !file.type.startsWith('image/')) {
      setFormState((current) => ({ ...current, schoolLogo: '', schoolLogoFileName: '' }));
      setLogoError('Please upload an image file for the school logo.');
    } else {
      try {
        const dataUrl = await readFileAsDataUrl(file);
        setFormState((current) => ({
          ...current,
          schoolLogo: dataUrl.trim(),
          schoolLogoFileName: file.name
        }));
        setLogoError('');
      } catch (error) {
        setFormState((current) => ({ ...current, schoolLogo: '', schoolLogoFileName: '' }));
        setLogoError('We could not read that image. Please try a different file.');
      }
    }

    if (input) {
      input.value = '';
    }
  }, []);

  const handleBackToMenuClick = useCallback(() => {
    if (typeof onBackToMenu === 'function') {
      onBackToMenu();
    }
    navigate('/');
  }, [navigate, onBackToMenu]);

  const handleLogoutClick = useCallback(() => {
    if (typeof onLogout === 'function') {
      onLogout();
    }
    navigate('/');
  }, [navigate, onLogout]);

  const handleSubmit = useCallback(
    (event) => {
      event.preventDefault();

      const requiredFields = [
        'schoolLogo',
        'contactNumber',
        'website',
        'email',
        'addressLine1',
        'addressLine2',
        'addressLine3',
        'tagLine1',
        'tagLine2',
        'tagLine3'
      ];

      const missingField = requiredFields.find((field) => {
        const value = formState[field];
        return typeof value !== 'string' || value.trim().length === 0;
      });

      if (missingField) {
        setFormError('Please complete every field before continuing.');
        return;
      }

      const trimmedGradeNames = GRADE_OPTIONS.reduce((acc, grade) => {
        const value = formState.gradeNames?.[grade.id] ?? '';
        acc[grade.id] = value.trim();
        return acc;
      }, {});

      const missingGradeName = GRADE_OPTIONS.find((grade) => trimmedGradeNames[grade.id].length === 0);

      if (missingGradeName) {
        setFormError('Please provide a grade name for every grade.');
        return;
      }

      if (typeof onSave === 'function') {
        onSave({
          ...formState,
          contactNumber: formState.contactNumber.trim(),
          website: formState.website.trim(),
          email: formState.email.trim(),
          addressLine1: formState.addressLine1.trim(),
          addressLine2: formState.addressLine2.trim(),
          addressLine3: formState.addressLine3.trim(),
          tagLine1: formState.tagLine1.trim(),
          tagLine2: formState.tagLine2.trim(),
          tagLine3: formState.tagLine3.trim(),
          gradeNames: trimmedGradeNames
        });
      }

      toast.success('Cover details saved');
      setFormError('');
      navigate('/');
    },
    [formState, navigate, onSave]
  );

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between text-center md:text-left">
          <div>
            <h1 className="text-3xl font-bold text-gray-800">{school.school_name}</h1>
            <p className="text-gray-600">School ID: {school.school_id}</p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button onClick={handleBackToMenuClick} variant="outline" className="bg-white/80 hover:bg-white border-gray-200">
              Back to Menu
            </Button>
            <Button onClick={handleLogoutClick} variant="outline" className="bg-white/80 hover:bg-white border-gray-200">
              Logout
            </Button>
          </div>
        </div>

        <Card className="border-0 bg-white/85 backdrop-blur">
          <CardHeader>
            <CardTitle className="text-xl font-semibold text-gray-800">Enter cover personalisation details</CardTitle>
            <p className="text-sm text-gray-600">
              Provide the school information that will be applied to every grade before selecting a class.
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="cover-details-contact">School contact number</Label>
                  <Input
                    id="cover-details-contact"
                    type="tel"
                    inputMode="tel"
                    placeholder="Contact number"
                    value={formState.contactNumber}
                    onChange={handleChange('contactNumber')}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cover-details-website">Website</Label>
                  <Input
                    id="cover-details-website"
                    placeholder="e.g. www.edplore.com"
                    value={formState.website}
                    onChange={handleChange('website')}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="cover-details-email">Email</Label>
                  <Input
                    id="cover-details-email"
                    type="email"
                    placeholder="e.g. hello@school.com"
                    value={formState.email}
                    onChange={handleChange('email')}
                  />
                </div>
                <div className="space-y-3 md:col-span-2">
                  <p className="text-sm font-semibold text-gray-700">Grade names</p>
                  <div className="grid gap-4 md:grid-cols-2">
                    {GRADE_OPTIONS.map((grade) => (
                      <div key={`grade-name-field-${grade.id}`} className="space-y-2">
                        <Label htmlFor={`cover-details-grade-${grade.id}`}>
                          {grade.name} grade name
                        </Label>
                        <Input
                          id={`cover-details-grade-${grade.id}`}
                          placeholder={`Enter ${grade.name.toLowerCase()} grade name`}
                          value={formState.gradeNames?.[grade.id] || ''}
                          onChange={handleGradeNameChange(grade.id)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="cover-details-logo">Upload school logo</Label>
                  <Input
                    id="cover-details-logo"
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                  />
                  {formState.schoolLogoFileName && !logoError && (
                    <p className="text-xs text-gray-500">Selected file: {formState.schoolLogoFileName}</p>
                  )}
                  {logoError && <p className="text-xs text-red-600">{logoError}</p>}
                  {formState.schoolLogo && (
                    <img
                      src={formState.schoolLogo}
                      alt="Selected school logo"
                      className="mt-3 h-16 w-16 rounded-md border border-gray-200 bg-white object-contain"
                    />
                  )}
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="cover-details-address-line-1">Address line 1</Label>
                  <Input
                    id="cover-details-address-line-1"
                    placeholder="Address line 1"
                    value={formState.addressLine1}
                    onChange={handleChange('addressLine1')}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="cover-details-address-line-2">Address line 2</Label>
                  <Input
                    id="cover-details-address-line-2"
                    placeholder="Address line 2"
                    value={formState.addressLine2}
                    onChange={handleChange('addressLine2')}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="cover-details-address-line-3">Address line 3</Label>
                  <Input
                    id="cover-details-address-line-3"
                    placeholder="Address line 3"
                    value={formState.addressLine3}
                    onChange={handleChange('addressLine3')}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="cover-details-tag-line-1">Tag line 1</Label>
                  <Input
                    id="cover-details-tag-line-1"
                    placeholder="Enter tag line 1"
                    value={formState.tagLine1}
                    onChange={handleChange('tagLine1')}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="cover-details-tag-line-2">Tag line 2</Label>
                  <Input
                    id="cover-details-tag-line-2"
                    placeholder="Enter tag line 2"
                    value={formState.tagLine2}
                    onChange={handleChange('tagLine2')}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="cover-details-tag-line-3">Tag line 3</Label>
                  <Input
                    id="cover-details-tag-line-3"
                    placeholder="e.g. Playgroup | Nursery | LKG | UKG | Daycare"
                    value={formState.tagLine3}
                    onChange={handleChange('tagLine3')}
                  />
                </div>
              </div>
              {formError && <p className="text-sm text-red-600">{formError}</p>}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Button type="submit" className="bg-gradient-to-r from-orange-400 to-red-400 text-white">
                  Save & Continue
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setFormState({
                      schoolLogo: '',
                      schoolLogoFileName: '',
                      contactNumber: '',
                      website: '',
                      email: '',
                      addressLine1: '',
                      addressLine2: '',
                      addressLine3: '',
                      tagLine1: '',
                      tagLine2: '',
                      tagLine3: ''
                    });
                    setFormError('');
                    setLogoError('');
                  }}
                  className="border-orange-300 text-orange-500 hover:bg-orange-50"
                >
                  Clear
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

// Grade Selection Page
const GradeSelectionPage = ({
  school,
  mode,
  onGradeSelect,
  onLogout,
  onBackToMode,
  coverDefaults,
  onEditCoverDetails,
  onCoverIntentChange
}) => {
  const [gradeStatus, setGradeStatus] = useState([]);
  const [loading, setLoading] = useState(true);
  const [downloadingGradeId, setDownloadingGradeId] = useState(null);
  const [bookSelectionCounts, setBookSelectionCounts] = useState<Record<string, number>>({});
  const [coverSelections, setCoverSelections] = useState<Record<string, any>>({});
  const [enabledGradeMap, setEnabledGradeMap] = useState<Record<string, boolean>>({});
  const navigate = useNavigate();
  const isCoverMode = mode === 'cover';
  const isRhymeMode = mode === 'rhymes';
  const isBookMode = mode === 'books';
  const downloadResetTimerRef = useRef<NodeJS.Timeout | null>(null);

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
    if (!isRhymeMode) {
      setGradeStatus([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    fetchGradeStatus();
  }, [isRhymeMode]);

  useEffect(() => {
    if (!isBookMode || !school?.school_id) {
      setBookSelectionCounts({});
      return;
    }

    const counts = {};
    GRADE_OPTIONS.forEach((gradeOption) => {
      const storedState = loadBookWorkflowState(school.school_id, gradeOption.id);
      const selected = Array.isArray(storedState?.selectedBooks) ? storedState.selectedBooks.length : 0;
      counts[gradeOption.id] = selected;
    });
    setBookSelectionCounts(counts);
  }, [isBookMode, school?.school_id]);

  useEffect(() => {
    const grades = school?.grades;
    if (!grades) {
      setEnabledGradeMap({});
      return;
    }
    const enabled: Record<string, boolean> = {};
    Object.entries(grades).forEach(([key, value]) => {
      const isEnabled = value && typeof value === 'object' ? Boolean(value.enabled) : false;
      enabled[key.toLowerCase()] = isEnabled;
      if (key.toLowerCase() === 'playgroup') {
        enabled.pg = isEnabled;
      }
    });
    setEnabledGradeMap(enabled);
  }, [school?.grades]);

  useEffect(() => {
    if (!isCoverMode || !school?.school_id) {
      setCoverSelections({});
      return;
    }

    const nextSelections: Record<string, any> = {};
    GRADE_OPTIONS.forEach((gradeOption) => {
      const storedState = loadCoverWorkflowState(school.school_id, gradeOption.id);
      if (storedState) {
        nextSelections[gradeOption.id] = storedState;
      }
    });
    setCoverSelections(nextSelections);
  }, [isCoverMode, school?.school_id]);

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
    const status = gradeStatus.find((s) => s.grade === gradeId);
    const rawSelectedPages =
      status?.selected_pages ??
      status?.selected_page_count ??
      status?.selected_count ??
      0;
    const rawMaxPages = status?.max_pages ?? MAX_RHYME_PAGES;
    const selectedPages = Number.isFinite(Number(rawSelectedPages))
      ? Number(rawSelectedPages)
      : 0;
    const maxPages = Number.isFinite(Number(rawMaxPages))
      ? Number(rawMaxPages)
      : MAX_RHYME_PAGES;

    return {
      selectedPages: Math.max(0, Math.min(selectedPages, maxPages)),
      maxPages: Math.max(1, maxPages)
    };
  };

  useEffect(
    () => () => {
      if (downloadResetTimerRef.current) {
        clearTimeout(downloadResetTimerRef.current);
        downloadResetTimerRef.current = null;
      }
    },
    []
  );

  const handleDownloadBinder = useCallback(
    async (gradeId, event) => {
      event?.stopPropagation();
      event?.preventDefault();

      if (!school?.school_id) {
        toast.error('Missing school information for download');
        return;
      }

      const downloadUrl = buildBinderDownloadUrl(API, school.school_id, gradeId);
      if (!downloadUrl) {
        toast.error('Unable to prepare binder download');
        return;
      }

      try {
        setDownloadingGradeId(gradeId);

        const response = await axios.get(downloadUrl, {
          responseType: 'blob',
          validateStatus: () => true
        });

        if (response.status >= 400) {
          let message = 'Please select at least one rhyme page before downloading the binder.';
          try {
            if (response.data instanceof Blob) {
              message = (await response.data.text()) || message;
            } else if (typeof response.data === 'string') {
              message = response.data || message;
            }
          } catch (error) {
            // swallow parse error and keep default message
          }
          toast.error(message);
          return;
        }

        const blob = response.data;
        const href = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = href;
        anchor.setAttribute('download', `${gradeId}-rhyme-binder.pdf`);
        anchor.style.display = 'none';
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(href);

        toast.success('Binder download started');
      } catch (error) {
        console.error('Error initiating binder download:', error);
        toast.error('Failed to download binder');
      } finally {
        if (downloadResetTimerRef.current) {
          clearTimeout(downloadResetTimerRef.current);
        }

        downloadResetTimerRef.current = setTimeout(() => {
          setDownloadingGradeId((current) => (current === gradeId ? null : current));
          downloadResetTimerRef.current = null;
        }, 800);
      }
    },
    [school?.school_id]
  );

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

  const handleGradeCardSelect = useCallback(
    (gradeId) => {
      if (isCoverMode && typeof onCoverIntentChange === 'function') {
        onCoverIntentChange('edit');
      }
      onGradeSelect(gradeId, mode);
    },
    [isCoverMode, mode, onCoverIntentChange, onGradeSelect]
  );

  const handleEditDetailsClick = useCallback(() => {
    if (typeof onEditCoverDetails === 'function') {
      onEditCoverDetails();
    }
  }, [onEditCoverDetails]);

  const addressLines = [
    coverDefaults?.addressLine1,
    coverDefaults?.addressLine2,
    coverDefaults?.addressLine3
  ].filter((line) => typeof line === 'string' && line.trim().length > 0);

  const tagLines = [
    coverDefaults?.tagLine1,
    coverDefaults?.tagLine2,
    coverDefaults?.tagLine3
  ].filter((line) => typeof line === 'string' && line.trim().length > 0);

  const gradeNameOverrides = buildCoverGradeNames(coverDefaults);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-orange-400 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading grade information...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="min-h-screen bg-slate-50 p-6">
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
            <h2 className="text-xl sm:text-2xl font-semibold text-gray-800">{currentMode.title}</h2>
            <p className="text-sm sm:text-base text-gray-600">{currentMode.subtitle}</p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {GRADE_OPTIONS.filter((grade) => enabledGradeMap[grade.id] !== false).map((grade) => {
              const resolvedGradeName = gradeNameOverrides[grade.id] || grade.name;
              const { selectedPages, maxPages } = getGradeStatusInfo(grade.id);
              const formattedSelectedPages = Number.isInteger(selectedPages)
                ? selectedPages
                : selectedPages.toFixed(1);
              const formattedMaxPages = Number.isInteger(maxPages)
                ? maxPages
                : maxPages.toFixed(1);
              const coverState = coverSelections[grade.id];
              const coverStatusCode = (coverState?.status || '1').toString();
              const coverStatusText =
                {
                  '1': 'Explore cover pages',
                  '2': 'Cover pages are being prepared',
                  '3': 'View cover pages',
                  '4': 'Selections are frozen',
                  finished: 'Selections are frozen',
                }[coverStatusCode] || 'Explore cover pages';
              const isCoverFinished = coverStatusCode === '4' || coverStatusCode === 'finished';
              const coverThemeLabel = coverState?.selectedThemeLabel || coverState?.selectedThemeId;
              const coverColourLabel = coverState?.selectedColourLabel || coverState?.selectedColourId;

              return (
                <Card
                  key={grade.id}
                  className="group aspect-square flex flex-col cursor-pointer transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg border border-slate-200 bg-white"
                  onClick={() => handleGradeCardSelect(grade.id)}
                >
                  <CardContent className="flex-1 flex flex-col justify-between p-4 text-center">
                    <div className="space-y-1">
                      <h3 className="text-base sm:text-lg font-bold text-gray-800">{resolvedGradeName}</h3>
                      {isCoverMode ? (
                        <div className="space-y-1">
                          <span
                            className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${
                              isCoverFinished
                                ? 'bg-green-50 text-green-700 border border-green-200'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {coverStatusText}
                          </span>
                          <p className="text-sm text-gray-600">
                            {coverStatusCode === '1' ? 'Explore cover pages' : coverStatusCode === '2' ? 'Cover pages are being prepared' : coverStatusCode === '3' ? 'View uploaded pages' : 'Selections are frozen'}
                          </p>
                        </div>
                      ) : (
                        <>
                          {!isBookMode ? (
                            <span className="inline-block rounded-full bg-slate-100 text-slate-700 text-xs font-semibold px-3 py-1">
                              {formattedSelectedPages} / {formattedMaxPages} pages
                            </span>
                          ) : (
                            <span className="inline-block rounded-full bg-slate-100 text-slate-700 text-xs font-semibold px-3 py-1">
                              {(bookSelectionCounts[grade.id] ?? 0)} book{(bookSelectionCounts[grade.id] ?? 0) === 1 ? '' : 's'}
                            </span>
                          )}
                          <p className="text-sm text-gray-600">
                            {isBookMode
                              ? `Curate books for ${resolvedGradeName}.`
                              : `Manage rhymes for ${resolvedGradeName}.`}
                          </p>
                        </>
                      )}
                    </div>
                    {!isCoverMode && (
                      <Button
                        variant="outline"
                        type="button"
                        onClick={(event) => handleDownloadBinder(grade.id, event)}
                        onMouseDown={(event) => event.stopPropagation()}
                        onTouchStart={(event) => event.stopPropagation()}
                        disabled={downloadingGradeId === grade.id}
                        className="w-full flex items-center justify-center border-orange-300 text-orange-500 hover:text-orange-600 hover:bg-orange-50 bg-white text-sm mx-auto h-10"
                        aria-label="Download binder"
                      >
                        {downloadingGradeId === grade.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Download className="w-4 h-4" />
                        )}
                      </Button>
                    )}
                    {isBookMode && (
                      <div className="flex flex-col gap-2">
                        {bookSelectionCounts[grade.id] > 0 ? (
                          <>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={(event) => {
                                event.stopPropagation();
                                onGradeSelect(grade.id, mode);
                              }}
                            >
                              View selection
                            </Button>
                            <Button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                onGradeSelect(grade.id, mode);
                              }}
                            >
                              Edit selection
                            </Button>
                          </>
                        ) : (
                          <Button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              onGradeSelect(grade.id, mode);
                            }}
                          >
                            Start selection
                          </Button>
                        )}
                      </div>
                    )}
                    {isCoverMode && (
                      <div className="flex flex-col gap-2">
                        <Button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleGradeCardSelect(grade.id);
                          }}
                        >
                          {isCoverFinished ? 'Edit selection' : 'Start selection'}
                        </Button>
                        {isCoverFinished && (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={(event) => {
                              event.stopPropagation();
                              if (typeof onCoverIntentChange === 'function') {
                                onCoverIntentChange('view');
                              }
                              onGradeSelect(grade.id, mode);
                            }}
                          >
                            View selection
                          </Button>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
};
const FeaturePlaceholderPage = ({ school, mode, grade, onBackToGrades, onBackToMode, onLogout }: { school: SchoolProfile; mode: string; grade: string; onBackToGrades: () => void; onBackToMode: () => void; onLogout: () => void }) => {
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
    <div className="min-h-screen bg-slate-50 p-6">
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
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-lg">
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
type TreeMenuRhyme = {
  code: string;
  name: string;
  pages: number;
  personalized?: string | boolean;
  used_in_grades?: string[];
};

type TreeMenuGroups = Record<string, TreeMenuRhyme[]>;

type TreeMenuProps = {
  rhymesData: TreeMenuGroups;
  reusableRhymes: TreeMenuGroups;
  showReusable: boolean;
  onToggleReusable: () => void;
  onRhymeSelect: (rhyme: TreeMenuRhyme) => void;
  hideFullPageRhymes?: boolean;
  selectedRhymeCodes?: Set<string> | string[];
};

// Display available or reusable rhymes grouped by number of pages
const TreeMenu: React.FC<TreeMenuProps> = ({
    rhymesData,
    onRhymeSelect,
    showReusable,
    reusableRhymes,
    onToggleReusable,
    hideFullPageRhymes,
    selectedRhymeCodes
  }) => {
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  
    const toggleGroup = (pageKey: string) => {
      setExpandedGroups((prev) => ({
        ...prev,
        [pageKey]: !prev[pageKey]
      }));
    };

    const normalizedSelectedCodes = useMemo(() => {
      if (!selectedRhymeCodes) {
        return null;
      }

      const mapCode = (code: unknown) => {
        if (typeof code !== 'string') {
          return '';
        }
        return code.trim().toLowerCase();
      };

      if (selectedRhymeCodes instanceof Set) {
        const entries = Array.from(selectedRhymeCodes)
          .map(mapCode)
          .filter((code) => code.length > 0);
        return new Set(entries);
      }

      if (Array.isArray(selectedRhymeCodes)) {
        const entries = selectedRhymeCodes
          .map(mapCode)
          .filter((code) => code.length > 0);
        return new Set(entries);
      }

      return null;
    }, [selectedRhymeCodes]);

    const currentRhymes = useMemo(() => {
      const sourceGroups = showReusable ? reusableRhymes : rhymesData;
      if (!sourceGroups) {
        return {};
      }

      if (!normalizedSelectedCodes || normalizedSelectedCodes.size === 0) {
        return sourceGroups;
      }

      return Object.entries(sourceGroups).reduce((acc, [pageKey, rhymes]) => {
        const filteredList = rhymes.filter((rhyme) => {
          const code = typeof rhyme?.code === 'string' ? rhyme.code.trim().toLowerCase() : '';
          if (!code) {
            return true;
          }
          return !normalizedSelectedCodes.has(code);
        });

        if (filteredList.length > 0) {
          acc[pageKey] = filteredList;
        }

        return acc;
      }, {} as TreeMenuGroups);
    }, [showReusable, reusableRhymes, rhymesData, normalizedSelectedCodes]);
  
    const filteredRhymes = hideFullPageRhymes
      ? Object.fromEntries(
          Object.entries(currentRhymes || {}).filter(([pageKey]) => parseFloat(pageKey) !== 1.0)
        )
    : currentRhymes || {};

  if (!filteredRhymes || Object.keys(filteredRhymes).length === 0) {
    return (
      <div className="p-4 text-center text-gray-500">
        <Music className="w-12 h-12 mx-auto mb-2 opacity-50" />
        <p>{showReusable ? 'No reusable rhymes available' : 'No rhymes available'}</p>
      </div>
    );
  }

  const entries = Object.entries(filteredRhymes) as [string, TreeMenuRhyme[]][];

  return (
    <div className="flex h-full max-h-[calc(100vh-220px)] flex-col overflow-hidden rounded-lg border border-gray-200 bg-white/50 backdrop-blur-sm">
      <div className="border-b bg-white/80 p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-semibold text-gray-800">
            <BookOpen className="h-5 w-5" />
            {showReusable ? 'Reusable Rhymes' : 'Available Rhymes'}
          </h3>
          <Button onClick={onToggleReusable} variant="outline" size="sm" className="text-xs">
            <Eye className="mr-1 h-3 w-3" />
            {showReusable ? 'Show Available' : 'Show Reusable'}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {entries.map(([pageKey, rhymes]) => {
          if (!rhymes || rhymes.length === 0) return null;

          return (
            <Collapsible key={pageKey} open={Boolean(expandedGroups[pageKey])} onOpenChange={() => toggleGroup(pageKey)}>
              <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg p-3 text-left transition-colors duration-200 hover:bg-white/50">
                <span className="flex items-center gap-2 font-medium text-gray-700">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-r from-orange-400 to-red-400 text-xs font-bold text-white">
                    {pageKey}
                  </div>
                  {pageKey} Page{parseFloat(pageKey) !== 1 ? 's' : ''} ({rhymes.length})
                </span>
                {expandedGroups[pageKey] ? (
                  <ChevronDown className="h-4 w-4 text-gray-500" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-gray-500" />
                )}
              </CollapsibleTrigger>
              <CollapsibleContent className="pl-4">
                <div className="mt-2 space-y-1">
                  {rhymes.map((rhyme) => (
                    <div
                      key={rhyme.code}
                      className="group flex items-center justify-between gap-3 rounded-lg border border-transparent bg-white/50 p-3 transition-all duration-200 hover:border-orange-200 hover:bg-white/80"
                    >
                      <div className="flex-1">
                        <p className="font-medium text-gray-800 transition-colors duration-200 group-hover:text-orange-600">{rhyme.name}</p>
                        <p className="mt-1 text-xs text-gray-500">
                          Code: {rhyme.code} • {rhyme.personalized === 'Yes' || rhyme.personalized === true ? 'Personalized' : 'Standard'}
                          {rhyme.used_in_grades && rhyme.used_in_grades.length > 0 && (
                            <span className="ml-2 text-blue-600">(Used in: {rhyme.used_in_grades.join(', ')})</span>
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
const RhymeSelectionPage = ({ school, grade, customGradeName, onBack, onLogout, isReadOnly = false }) => {
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

  const MAX_PAGES_PER_GRADE = MAX_RHYME_PAGES;

  useEffect(() => {
    selectedRhymesRef.current = Array.isArray(selectedRhymes) ? selectedRhymes : [];
  }, [selectedRhymes]);

  const ensureEditable = useCallback(() => {
    if (isReadOnly) {
      toast.info('Selections are approved and frozen. Viewing only.');
      return false;
    }
    return true;
  }, [isReadOnly]);

  const normalizeSvgPages = useCallback((svgContent) => {
    if (Array.isArray(svgContent)) {
      return svgContent.filter((page) => typeof page === 'string' && page.trim().length > 0);
    }

    if (typeof svgContent === 'string' && svgContent.trim().length > 0) {
      return [svgContent];
    }

    return [];
  }, []);

  const extractImageUrlsFromSvg = useCallback((svgContent) => {
    const pages = normalizeSvgPages(svgContent);
    if (pages.length === 0) {
      return [];
    }

    if (typeof window === 'undefined' || typeof window.DOMParser === 'undefined') {
      return [];
    }

    try {
      const parser = new window.DOMParser();
      const urls = new Set();

      pages.forEach((page) => {
        const doc = parser.parseFromString(page, 'image/svg+xml');
        const imageNodes = doc.querySelectorAll('image, img');

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
      });

      return Array.from(urls);
    } catch (error) {
      console.error('Error parsing SVG for image asset references:', error);
      return [];
    }
  }, [normalizeSvgPages]);

  const prefetchImageAssets = useCallback(
    async (svgMarkup) => {
      const pages = normalizeSvgPages(svgMarkup);
      if (pages.length === 0) {
        return;
      }

      const assetUrls = extractImageUrlsFromSvg(pages);
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
        .get(`${API}/rhymes/svg/${code}`, { responseType: 'arraybuffer' })
        .then((response) => {
          const decoded = decodeSvgPayload(response.data, response.headers);
          const pages = Array.isArray(decoded?.pages) ? decoded.pages : decoded;
          return prepareRhymeSvgPages(pages, code, API);
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
      const normalizedPages = normalizeSvgPages(svgContent);

      if (normalizedPages.length > 0) {
        svgCacheRef.current.set(code, normalizedPages);
        await prefetchImageAssets(normalizedPages);
      }

      return normalizedPages;
    },
    [prefetchImageAssets, normalizeSvgPages]
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
        const pages = normalizeSvgPages(rhyme?.svgContent);
        return pages.length === 0;
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

        const successful = results.filter((result) => {
          const pages = normalizeSvgPages(result.svgContent);
          return pages.length > 0;
        });
        const failed = results.filter((result) => {
          const pages = normalizeSvgPages(result.svgContent);
          return pages.length === 0;
        });

        if (successful.length === 0 && failed.length === 0) {
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

            if (match) {
              return { ...existing, svgContent: match.svgContent, svgFetchFailed: false };
            }

            const failure = failed.find(
              (result) =>
                result.code === existing.code &&
                Number(result.page_index) === Number(existing.page_index)
            );

            if (failure) {
              return { ...existing, svgContent: '', svgFetchFailed: true };
            }

            return existing;
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

        const startIndex = numericIndex;
        const pagesValue = parsePagesValue(selection?.pages);

        // Handle half-page rhymes
        if (pagesValue === 0.5) {
          const entry = usageMap.get(startIndex) || { top: false, bottom: false };
          const slot = normalizeSlot(selection?.position, 'top') || 'top';
          entry[slot] = true;
          usageMap.set(startIndex, entry);
          highestIndex = Math.max(highestIndex, startIndex);
          lowestIndex = Math.min(lowestIndex, startIndex);
          return;
        }

        // Handle full or multi-page rhymes (occupy consecutive pages)
        const totalPages = pagesValue && pagesValue > 1 ? Math.max(1, Math.round(pagesValue)) : 1;

        for (let offset = 0; offset < totalPages && startIndex + offset < MAX_PAGES_PER_GRADE; offset += 1) {
          const targetIndex = startIndex + offset;
          const entry = usageMap.get(targetIndex) || { top: false, bottom: false };

          entry.top = true;
          entry.bottom = true;

          usageMap.set(targetIndex, entry);
          highestIndex = Math.max(highestIndex, targetIndex);
          lowestIndex = Math.min(lowestIndex, targetIndex);
        }
      });
    }

    return {
      usageMap,
      highestIndex,
      lowestIndex: lowestIndex === Number.POSITIVE_INFINITY ? -1 : lowestIndex
    };
  };

  const computeNextAvailablePageInfoFromUsage = ({ usageMap, highestIndex }) => {
    for (let index = 0; index < MAX_PAGES_PER_GRADE; index += 1) {
      const entry = usageMap.get(index);
      if (!entry) {
        return { index, hasCapacity: true, highestIndex };
      }
      if (!entry.top || !entry.bottom) {
        return { index, hasCapacity: true, highestIndex };
      }
    }

    const fallbackIndex = highestIndex < 0 ? 0 : Math.min(highestIndex, MAX_PAGES_PER_GRADE - 1);
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
        const normalizedPages = normalizeSvgPages(rhyme?.svgContent);
        const sanitizedPages = normalizedPages.map((page, index) =>
          sanitizeRhymeSvgContent(page, index ? `${rhyme.code}-${index}` : rhyme.code)
        );
        const existingContent = sanitizedPages.length > 0 ? sanitizedPages : null;

        return {
          ...rhyme,
          position: rhyme.position || null,
          svgContent: existingContent,
          svgFetchFailed: false
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

        const nextPageIndex = initialIndex + 1;
        if (nextPageIndex < MAX_PAGES_PER_GRADE) {
          ensurePageAssets(nextPageIndex, sortedSelections).catch((prefetchError) => {
            console.error('Error preloading upcoming rhyme SVGs:', prefetchError);
          });
        }
      }
    } catch (error) {
      console.error('Error fetching selected rhymes:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!school?.school_id || !grade) {
      setLoading(false);
      return;
    }

    setLoading(true);

    const loadRhymeData = async () => {
      try {
        await Promise.all([
          fetchAvailableRhymes(),
          fetchReusableRhymes(),
          fetchSelectedRhymes()
        ]);
      } catch (error) {
        console.error('Error loading rhyme data:', error);
        setLoading(false);
      }
    };

    void loadRhymeData();
  }, [school?.school_id, grade]);

  const handleAddRhyme = (position) => {
    if (!ensureEditable()) {
      return;
    }
    setCurrentPosition(position);
    setShowTreeMenu(true);
    setShowReusable(false);
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
    if (!ensureEditable()) {
      setShowTreeMenu(false);
      return;
    }
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
        svgFetchFailed: false,
        position: normalizedPosition
      };

      const nextArray = sortSelections([...filtered, baseRhyme]);
      const isReplacement = removals.length > 0;
      const nextInfo = computeNextAvailablePageInfo(nextArray);

      if (!isReplacement && !nextInfo.hasCapacity) {
        toast.error('Maximum of 44 pages reached. Remove a rhyme to add another.');
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
              if (svgContent) {
                return {
                  ...existing,
                  svgContent,
                  svgFetchFailed: false
                };
              }

              return {
                ...existing,
                svgContent: '',
                svgFetchFailed: true
              };
            }

            return existing;
          });

          selectedRhymesRef.current = updated;
          return updated;
        });
      } catch (svgError) {
        console.error('Error fetching rhyme SVG:', svgError);
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
                svgContent: '',
                svgFetchFailed: true
              };
            }

            return existing;
          });
          selectedRhymesRef.current = updated;
          return updated;
        });
      }

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
    if (!ensureEditable()) {
      return;
    }
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

  const handlePageChange = (newPageIndex) => {
    const clampedIndex = Math.max(0, Math.min(newPageIndex, MAX_PAGES_PER_GRADE - 1));

    setCurrentPageIndex(clampedIndex);

    if (Number.isFinite(clampedIndex)) {
      ensurePageAssets(clampedIndex).catch((error) => {
        console.error('Error loading rhyme SVGs for page:', error);
      });

      const nextIndex = clampedIndex + 1;
      if (nextIndex < MAX_PAGES_PER_GRADE) {
        ensurePageAssets(nextIndex).catch((error) => {
          console.error('Error prefetching next rhyme page:', error);
        });
      }
    }
  };

  const handleToggleReusable = () => {
    setShowReusable(!showReusable);
  };

  const swapCurrentPageOrder = async () => {
    if (!ensureEditable()) {
      return;
    }
    const pageIndex = Number(currentPageIndex);
    const halfRhymes =
      (Array.isArray(selectedRhymes) ? selectedRhymes : []).filter(
        (r) => Number(r?.page_index) === pageIndex && parsePagesValue(r?.pages) === 0.5
      ) || [];

    if (halfRhymes.length !== 2) {
      toast.info('Add two half-page rhymes on this page to change their order.');
      return;
    }

    const [first, second] = halfRhymes;
    const firstPos = resolveRhymePosition(first, { rhymesForContext: selectedRhymes });
    const secondPos = resolveRhymePosition(second, { rhymesForContext: selectedRhymes });

    if (!firstPos || !secondPos || firstPos === secondPos) {
      toast.info('Nothing to swap on this page yet.');
      return;
    }

    const updated = (Array.isArray(selectedRhymes) ? selectedRhymes : []).map((r) => {
      const matchesFirst =
        r &&
        r.code === first.code &&
        Number(r.page_index) === pageIndex &&
        parsePagesValue(r.pages) === 0.5;
      const matchesSecond =
        r &&
        r.code === second.code &&
        Number(r.page_index) === pageIndex &&
        parsePagesValue(r.pages) === 0.5;

      if (matchesFirst) {
        return { ...r, position: secondPos };
      }
      if (matchesSecond) {
        return { ...r, position: firstPos };
      }
      return r;
    });

    const sorted = sortSelections(updated);
    setSelectedRhymes(sorted);
    selectedRhymesRef.current = sorted;

    try {
      await Promise.all([
        axios.post(`${API}/rhymes/select`, {
          school_id: school.school_id,
          grade,
          page_index: pageIndex,
          rhyme_code: first.code,
          position: secondPos,
        }),
        axios.post(`${API}/rhymes/select`, {
          school_id: school.school_id,
          grade,
          page_index: pageIndex,
          rhyme_code: second.code,
          position: firstPos,
        }),
      ]);
    } catch (error) {
      console.error('Error swapping rhyme order:', error);
      toast.error('Unable to update rhyme order.');
    }
  };

  const pageUsage = useMemo(() => computePageUsage(selectedRhymes), [selectedRhymes]);
  const selectedRhymeCodes = useMemo(() => {
    const codes = new Set<string>();
    if (Array.isArray(selectedRhymes)) {
      selectedRhymes.forEach((selection) => {
        if (selection?.code && typeof selection.code === 'string') {
          const normalized = selection.code.trim().toLowerCase();
          if (normalized) {
            codes.add(normalized);
          }
        }
      });
    }
    return codes;
  }, [selectedRhymes]);
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

    return Math.min(maxIndex + 1, MAX_PAGES_PER_GRADE);
  };

  useEffect(() => {
    const normalizedHighest = Number.isFinite(highestFilledIndex) ? highestFilledIndex : -1;
    const normalizedNext = Number.isFinite(nextAvailablePageIndex) ? nextAvailablePageIndex : 0;
    const normalizedCurrent = Number.isFinite(currentPageIndex) ? currentPageIndex : 0;

    const candidates = [normalizedHighest, normalizedNext, normalizedCurrent]
      .filter(index => Number.isFinite(index) && index >= 0);

    const maxIndex = candidates.length > 0 ? Math.max(...candidates) : 0;
    const total = Math.min(maxIndex + 1, MAX_PAGES_PER_GRADE);

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
    const pageRhymes = { top: null, bottom: null, layout: 'standard', multiPageOffset: 0, multiPageTotal: 1 };

    if (!Array.isArray(selectedRhymes) || selectedRhymes.length === 0) return pageRhymes;

    for (const r of selectedRhymes) {
      if (!r) continue;
      const startIndex = Number(r.page_index);
      const pages = parsePagesValue(r.pages);

      if (!Number.isFinite(startIndex) || !Number.isFinite(pages)) {
        continue;
      }

      const totalPages = pages && pages > 1 ? Math.max(1, Math.round(pages)) : 1;

      if (totalPages > 1 && Number(currentPageIndex) >= startIndex && Number(currentPageIndex) < startIndex + totalPages) {
        pageRhymes.top = r;
        pageRhymes.bottom = null;
        pageRhymes.multiPageOffset = Number(currentPageIndex) - startIndex;
        pageRhymes.multiPageTotal = totalPages;
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
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
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
  const isTopFullPage = hasTopRhyme && parsePagesValue(currentPageRhymes.top.pages) >= 1;
  const isMultiPageRhyme = (currentPageRhymes.multiPageTotal || 1) > 1;
  const showBottomContainer = !isMultiPageRhyme && !isTopFullPage;
  const topSelection = currentPageRhymes.top;
  const bottomSelection = currentPageRhymes.bottom;
  const topPages = normalizeSvgPages(topSelection?.svgContent);
  const topSvgContent = topPages[currentPageRhymes.multiPageOffset] || topPages[0] || '';
  const bottomPages = normalizeSvgPages(bottomSelection?.svgContent);
  const bottomSvgContent = bottomPages[0] || '';
  const topFailed = Boolean(topSelection?.svgFetchFailed);
  const bottomFailed = Boolean(bottomSelection?.svgFetchFailed);
  const topReady = !topSelection || topFailed || topSvgContent.length > 0;
  const bottomReady = !showBottomContainer || !bottomSelection || bottomFailed || bottomSvgContent.length > 0;
  const isTopLoading = !!topSelection && !topReady;
  const isBottomLoading = showBottomContainer && !!bottomSelection && !bottomReady;
  const canShowNextButton = topReady && bottomReady;
  const canReplaceTop = hasTopRhyme && (!isMultiPageRhyme || currentPageRhymes.multiPageOffset === 0);
  const showMultiPageNote = isMultiPageRhyme && currentPageRhymes.multiPageOffset > 0;
  const canSwapHalfPage =
    (Array.isArray(selectedRhymes) ? selectedRhymes : []).filter(
      (r) => Number(r?.page_index) === Number(currentPageIndex) && parsePagesValue(r?.pages) === 0.5
    ).length === 2;

  const renderLoadingIndicator = (label) => (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-white/80 p-6">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-orange-400 border-t-transparent"></div>
      <p className="text-sm font-medium text-orange-500">Loading {label}...</p>
    </div>
  );

  const gradeDisplayName = (customGradeName && customGradeName.trim()) || grade;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-6 sm:px-6">
        {/* Header */}
        <div className="mb-6 flex flex-shrink-0 flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800 capitalize">{gradeDisplayName} Grade - Rhyme Selection</h1>
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
                <div className="flex-shrink-0 space-y-4">
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

                    <div className="text-sm text-gray-600 font-medium">
                      Page {currentPageIndex + 1} of {totalPages}
                    </div>

                    {canShowNextButton ? (
                      <Button
                        onClick={() => handlePageChange(Math.min(totalPages - 1, currentPageIndex + 1))}
                        disabled={currentPageIndex >= totalPages - 1}
                        variant="outline"
                        size="sm"
                      >
                        Next
                        <ChevronRight className="w-4 h-4 ml-1" />
                      </Button>
                    ) : (
                      <div className="flex h-10 min-w-[120px] items-center justify-center rounded-full border border-dashed border-orange-200 bg-white/80 px-4 text-xs font-medium text-orange-500">
                        Loading page...
                      </div>
                    )}
                  </div>
                  <div className="flex justify-end">
                    <Button
                      onClick={swapCurrentPageOrder}
                      disabled={!canSwapHalfPage || isReadOnly}
                      variant="outline"
                      size="sm"
                      className="bg-white/80"
                    >
                      Change order
                    </Button>
                  </div>
                </div>

                <div className="flex-1 min-h-0 flex flex-col">
                  <div className="flex-1 min-h-0 py-2">
                    <div className="flex h-full items-start justify-center">

                      <div className="relative flex w-full justify-center transition-all duration-300 ease-out">

                        <div className="a4-preview relative flex w-full flex-col overflow-hidden">
                          {showBottomContainer && (
                            <div className="pointer-events-none absolute inset-x-12 top-1/2 h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent" />
                          )}
                          <div className="rhyme-page-grid h-full">
                                <div

                                  className="relative flex w-full min-h-0 flex-col rhyme-slot"

                                >
                                  {hasTopRhyme ? (
                                    <div className="relative flex flex-1 min-h-0 flex-col rhyme-slot-wrapper">
                                      {canReplaceTop && (
                                        <Button
                                          onClick={() => handleAddRhyme('top')}
                                          variant="outline"
                                          disabled={isReadOnly}
                                          className={`absolute top-4 right-4 z-10 bg-white/90 backdrop-blur px-3 sm:px-4 py-2 text-sm text-gray-700 shadow-md hover:bg-white${isReadOnly ? ' cursor-not-allowed opacity-60' : ''}`}
                                        >
                                          <Replace className="w-4 h-4 mr-2" />
                                          Replace
                                        </Button>
                                      )}

                                      <div className={`rhyme-slot-container${hasTopRhyme ? ' has-svg' : ''}`}>
                                        {isTopLoading ? (
                                          renderLoadingIndicator(currentPageRhymes.top?.name || 'rhyme')
                                        ) : topSvgContent.length > 0 ? (
                                          <InlineSvg
                                            markup={topSvgContent}
                                            className="rhyme-svg-content"
                                            sanitize={false}
                                            ariaLabel={`${currentPageRhymes.top?.name || 'Rhyme'} illustration`}
                                          />
                                        ) : (
                                          <div className="flex h-full w-full items-center justify-center bg-white/80 text-sm text-gray-500">
                                            SVG preview unavailable
                                          </div>
                                        )}
                                      </div>
                                      {showMultiPageNote && (
                                        <p className="mt-2 text-xs text-gray-600">
                                          To replace this rhyme, return to the first page of this rhyme selection.
                                        </p>
                                      )}
                                    </div>
                                  ) : (
                                    <div className="rhyme-slot-container">
                                      <div className="flex flex-1 items-center justify-center">
                                        <Button
                                          onClick={() => handleAddRhyme('top')}
                                          disabled={isReadOnly}
                                          className={`h-24 w-24 transform rounded-full bg-gradient-to-r from-orange-400 to-red-400 text-white shadow-lg transition-all duration-300 hover:scale-105 hover:from-orange-500 hover:to-red-500 hover:shadow-xl${isReadOnly ? ' cursor-not-allowed opacity-60' : ''}`}
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
                                          disabled={isReadOnly}
                                          className={`absolute top-4 right-4 z-10 bg-white/90 backdrop-blur px-3 sm:px-4 py-2 text-sm text-gray-700 shadow-md hover:bg-white${isReadOnly ? ' cursor-not-allowed opacity-60' : ''}`}
                                        >
                                          <Replace className="w-4 h-4 mr-2" />
                                          Replace
                                        </Button>

                                        <div className={`rhyme-slot-container${hasBottomRhyme ? ' has-svg' : ''}`}>
                                          {isBottomLoading ? (
                                            renderLoadingIndicator(currentPageRhymes.bottom?.name || 'rhyme')
                                          ) : bottomSvgContent.length > 0 ? (
                                            <InlineSvg
                                              markup={bottomSvgContent}
                                              className="rhyme-svg-content"
                                              sanitize={false}
                                              ariaLabel={`${currentPageRhymes.bottom?.name || 'Rhyme'} illustration`}
                                            />
                                          ) : (
                                            <div className="flex h-full w-full items-center justify-center bg-white/80 text-sm text-gray-500">
                                              SVG preview unavailable
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="rhyme-slot-container">
                                        <div className="flex flex-1 items-center justify-center">
                                          <Button
                                            onClick={() => handleAddRhyme('bottom')}
                                            disabled={isReadOnly}
                                            className={`h-24 w-24 transform rounded-full bg-gradient-to-r from-orange-400 to-red-400 text-white shadow-lg transition-all duration-300 hover:scale-105 hover:from-orange-500 hover:to-red-500 hover:shadow-xl${isReadOnly ? ' cursor-not-allowed opacity-60' : ''}`}
                                          >
                                            <Plus className="h-8 w-8" />
                                          </Button>
                                        </div>
                                      </div>
                                    )}
                                  </div>
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
                      selectedRhymeCodes={selectedRhymeCodes}
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
export function RhymesWorkflowApp() {
  const persistedStateRef = useRef(null);
  if (persistedStateRef.current === null) {
    persistedStateRef.current = loadPersistedAppState();
  }

  const persistedState = persistedStateRef.current || {};

  const navigate = useNavigate();
  const [workspaceUser, setWorkspaceUser] = useState<WorkspaceUserProfile | null>(
    () => persistedState.workspaceUser ?? null
  );
  const [school, setSchool] = useState<SchoolProfile | null>(() => persistedState.school ?? null);
  const [selectedMode, setSelectedMode] = useState(() => persistedState.selectedMode ?? null);
  const [selectedGrade, setSelectedGrade] = useState(() => persistedState.selectedGrade ?? null);
  const [coverWorkflowIntent, setCoverWorkflowIntent] = useState<'edit' | 'view'>('edit');
  const [, setIsCoverDetailsStepComplete] = useState(false);
  const [coverDefaults, setCoverDefaults] = useState(() =>
    mergeCoverDefaults({
      ...(persistedState.coverDefaults || {}),
      gradeNames: buildGradeNamesFromSchool(persistedState.school)
    })
  );
  const { user, loading: authLoading, signOut: authSignOut, getIdToken } = useAuth();
  const [isEditingSchoolProfile, setIsEditingSchoolProfile] = useState(false);
  const [schoolFormSubmitting, setSchoolFormSubmitting] = useState(false);
  const isSuperAdminUser = workspaceUser?.role === 'super-admin';
  const selectionsFrozen = useMemo(() => {
    const status = (school?.selection_status || '').toString().toLowerCase();
    return school?.selections_approved === true || status === 'approved';
  }, [school]);
  const freezeNoticeShown = useRef(false);
  const lastNavigationStateRef = useRef<string | null>(null);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (!user) {
      clearPersistedAppState();
      setWorkspaceUser(null);
      setSchool(null);
      setSelectedMode(null);
      setSelectedGrade(null);
      setCoverDefaults(mergeCoverDefaults());
    }
  }, [authLoading, user]);

  useEffect(() => {
    if (!school) {
      return;
    }

    const updatedGradeNames = buildGradeNamesFromSchool(school);
    setCoverDefaults((prev) => {
      if (areGradeNamesEqual(prev?.gradeNames || {}, updatedGradeNames)) {
        return prev;
      }
      return mergeCoverDefaults({
        ...prev,
        gradeNames: updatedGradeNames
      });
    });

    if (typeof window !== 'undefined') {
      if (school.school_id) {
        window.localStorage.setItem('bookSelectionSchoolId', school.school_id);
      }
      if (school.school_name) {
        window.localStorage.setItem('bookSelectionSchoolName', school.school_name);
      }
    }
  }, [school]);

  useEffect(() => {
    if (selectionsFrozen) {
      setCoverWorkflowIntent('view');
    } else {
      freezeNoticeShown.current = false;
      setCoverWorkflowIntent('edit');
    }
  }, [selectionsFrozen]);

  useEffect(() => {
    if (isSuperAdminUser || !selectionsFrozen) {
      return;
    }
    if (!freezeNoticeShown.current) {
      toast.info('Selections are approved and frozen. You can only view them.');
      freezeNoticeShown.current = true;
    }
  }, [isSuperAdminUser, selectionsFrozen]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const applyNavState = (state: any) => {
      setSelectedMode(state?.mode ?? null);
      setSelectedGrade(state?.grade ?? null);
      setCoverWorkflowIntent(state?.intent === 'view' ? 'view' : 'edit');
      setIsEditingSchoolProfile(false);
    };

    const initialState = {
      __rhymeNav: true,
      mode: selectedMode,
      grade: selectedGrade,
      intent: coverWorkflowIntent
    };

    if (!window.history.state || !window.history.state.__rhymeNav) {
      window.history.replaceState(initialState, '');
      lastNavigationStateRef.current = JSON.stringify(initialState);
    }

    const handlePopState = (event: PopStateEvent) => {
      const state = event.state;
      if (state && state.__rhymeNav) {
        applyNavState(state);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [coverWorkflowIntent, selectedGrade, selectedMode]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const navState = {
      __rhymeNav: true,
      mode: selectedMode,
      grade: selectedGrade,
      intent: coverWorkflowIntent
    };
    const serialized = JSON.stringify(navState);
    if (serialized === lastNavigationStateRef.current) {
      return;
    }
    window.history.pushState(navState, '');
    lastNavigationStateRef.current = serialized;
  }, [coverWorkflowIntent, selectedGrade, selectedMode]);

  useEffect(() => {
    if (!school) {
      clearPersistedAppState();
      return;
    }

    savePersistedAppState({
      workspaceUser,
      school,
      selectedMode,
      selectedGrade,
      coverDefaults,
    });
  }, [workspaceUser, school, selectedMode, selectedGrade, coverDefaults]);

  useEffect(() => {
    if (!school) {
      setIsEditingSchoolProfile(false);
    }
  }, [school]);

  const clearCoverWorkflowForSchool = useCallback((schoolId) => {
    if (!schoolId) {
      return;
    }

    GRADE_OPTIONS.forEach((option) => {
      clearCoverWorkflowState(schoolId, option.id);
      clearBookWorkflowState(schoolId, option.id);
    });
  }, []);

  const handleSchoolProfileSubmit = useCallback(
    async ({ values }: SchoolFormSubmitPayload) => {
      if (!school) {
        return;
      }
      const hasSelectedService = Object.values(values.service_status).some((status) => status === 'yes');
      if (!hasSelectedService) {
        toast.error('Please let us know whether you are taking ID cards, report cards, or certificates.');
        return;
      }
      setSchoolFormSubmitting(true);
      try {
        const token = await getIdToken();
        if (!token) {
          throw new Error('Unable to fetch Firebase token');
        }
        const formData = buildSchoolFormData(values);
        const response = await axios.put<SchoolProfile>(`${API}/schools/${school.school_id}`, formData, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setSchool(response.data);
        toast.success('School profile updated');
        setIsEditingSchoolProfile(false);
      } catch (error) {
        console.error('Failed to update school profile', error);
        toast.error('Unable to update school. Please try again.');
      } finally {
        setSchoolFormSubmitting(false);
      }
    },
    [school, getIdToken]
  );

  const schoolFormInitialValues = useMemo(() => buildSchoolFormValuesFromProfile(school), [school]);

  const resolveStoredGradeName = useCallback(
    (gradeId) => {
      if (!gradeId) {
        return '';
      }

      const stored = coverDefaults?.gradeNames?.[gradeId] || (gradeId === 'playgroup' ? coverDefaults?.gradeNames?.pg : undefined);
      if (typeof stored === 'string' && stored.trim().length > 0) {
        return stored.trim();
      }

      return resolveDefaultGradeLabel(gradeId);
    },
    [coverDefaults]
  );

  const handleAuth = ({ school: nextSchool, user: nextWorkspaceUser }) => {
    if (school?.school_id && school?.school_id !== nextSchool?.school_id) {
      clearCoverWorkflowForSchool(school.school_id);
    }

    setWorkspaceUser(nextWorkspaceUser);
    setSchool(nextSchool);
    setSelectedMode(null);
    setSelectedGrade(null);
    setCoverDefaults(
      mergeCoverDefaults({
        gradeNames: buildGradeNamesFromSchool(nextSchool)
      })
    );
    setIsEditingSchoolProfile(false);
  };

  const handleModeSelect = (mode) => {
    setSelectedMode(mode);
    if (mode === 'cover') {
      // Jump directly into cover workflow with the first grade instead of showing grade selection.
      setSelectedGrade(GRADE_OPTIONS[0]?.id || null);
    } else {
      setSelectedGrade(null);
    }
    if (mode === 'cover') {
      setIsCoverDetailsStepComplete(false);
      setCoverWorkflowIntent(selectionsFrozen ? 'view' : 'edit');
    }
  };

  const handleGradeSelect = (grade, mode) => {
    if (mode) {
      setSelectedMode(mode);
    }
    setSelectedGrade(grade);
    if (mode === 'cover' && selectionsFrozen) {
      setCoverWorkflowIntent('view');
    }
  };

  const handleBackToGrades = () => {
    setSelectedGrade(null);
    setCoverWorkflowIntent('edit');
  };

  const handleBackToModeSelection = () => {
    setSelectedGrade(null);
    setSelectedMode(null);
    setCoverWorkflowIntent(selectionsFrozen ? 'view' : 'edit');
  };

  const handleEditCoverDetails = useCallback(() => {
    setSelectedMode('cover');
    setSelectedGrade(null);
    setCoverWorkflowIntent(selectionsFrozen ? 'view' : 'edit');
  }, [selectionsFrozen]);

  const handleLogout = () => {
    const currentSchoolId = school?.school_id;
    if (currentSchoolId) {
      clearCoverWorkflowForSchool(currentSchoolId);
    }
    clearPersistedAppState();
    setWorkspaceUser(null);
    setSelectedGrade(null);
    setSelectedMode(null);
    setCoverWorkflowIntent('edit');
    setSchool(null);
    setCoverDefaults(mergeCoverDefaults());
    setIsEditingSchoolProfile(false);
    void authSignOut().catch((error) => {
      console.error('Failed to sign out from Google', error);
    });
  };

  const handleReturnToAdminDashboard = useCallback(() => {
    if (!isSuperAdminUser) {
      return;
    }
    const currentSchoolId = school?.school_id;
    if (currentSchoolId) {
      clearCoverWorkflowForSchool(currentSchoolId);
    }
    clearPersistedAppState();
    setSelectedGrade(null);
    setSelectedMode(null);
    setCoverDefaults(mergeCoverDefaults());
    setSchool(null);
    setIsEditingSchoolProfile(false);
  }, [isSuperAdminUser, school, clearCoverWorkflowForSchool]);

  const handleReturnToBranchList = useCallback(() => {
    const currentSchoolId = school?.school_id;
    if (currentSchoolId) {
      clearCoverWorkflowForSchool(currentSchoolId);
    }
    clearPersistedAppState();
    setSelectedGrade(null);
    setSelectedMode(null);
    setCoverDefaults(mergeCoverDefaults());
    setSchool(null);
    setIsEditingSchoolProfile(false);
  }, [school, clearCoverWorkflowForSchool]);

  return (
    <div className="App">
      <Toaster position="top-right" />
      {!school ? (
        <AuthPage onAuth={handleAuth} onLogout={handleLogout} />
      ) : isEditingSchoolProfile ? (
        <SchoolForm
          mode="edit"
          initialValues={schoolFormInitialValues}
          submitting={schoolFormSubmitting}
          onSubmit={handleSchoolProfileSubmit}
          onCancel={() => setIsEditingSchoolProfile(false)}
          onBackToHome={!isSuperAdminUser ? () => navigate('/') : undefined}
          isSuperAdmin={isSuperAdminUser}
        />
      ) : !selectedMode ? (
        <ModeSelectionPage
          school={school}
          onModeSelect={handleModeSelect}
          isSuperAdmin={isSuperAdminUser}
          isFrozen={selectionsFrozen}
          onBackToAdmin={handleReturnToAdminDashboard}
          onBackToDashboard={!isSuperAdminUser ? handleReturnToBranchList : undefined}
          onEditProfile={() => setIsEditingSchoolProfile(true)}
        />
      ) : !selectedGrade && (selectedMode === 'rhymes' || selectedMode === 'cover') ? (
        <GradeSelectionPage
          school={school}
          mode={selectedMode}
          onGradeSelect={handleGradeSelect}
          onLogout={handleLogout}
          onBackToMode={handleBackToModeSelection}
          coverDefaults={coverDefaults}
          onEditCoverDetails={handleEditCoverDetails}
          onCoverIntentChange={setCoverWorkflowIntent}
        />
      ) : selectedMode === 'rhymes' ? (
        <RhymeSelectionPage
          school={school}
          grade={selectedGrade}
          customGradeName={resolveStoredGradeName(selectedGrade)}
          onBack={handleBackToGrades}
          onLogout={handleLogout}
          isReadOnly={selectionsFrozen}
        />
      ) : selectedMode === 'cover' && selectedGrade ? (
        <CoverPageWorkflow
          school={school}
          grade={selectedGrade}
          onBackToMode={handleBackToModeSelection}
          onLogout={handleLogout}
          coverDefaults={coverDefaults}
          isReadOnly={selectionsFrozen || coverWorkflowIntent === 'view'}
        />
      ) : selectedMode === 'books' ? (
        <HomePage
          school={school}
          onBackToMode={handleBackToModeSelection}
          onStartBookSelection={() => {
            if (typeof window !== 'undefined') {
              if (school?.school_id) {
                window.localStorage.setItem('bookSelectionSchoolId', school.school_id);
              }
              if (school?.school_name) {
                window.localStorage.setItem('bookSelectionSchoolName', school.school_name);
              }
            }
            navigate('/wizard');
          }}
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
      )}
    </div>
  );
}

export default RhymeSelectionPage;





