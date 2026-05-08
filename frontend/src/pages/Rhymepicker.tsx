
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { doc, onSnapshot } from 'firebase/firestore';
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '../components/ui/alert-dialog';

import {
  SchoolForm,
  type SchoolFormSubmitPayload,
  buildSchoolFormValuesFromProfile,
  buildSchoolFormData
} from '../components/SchoolProfileForm';
import { API_BASE_URL, PUBLIC_URL_PREFIX, normalizeAssetUrl } from '../lib/utils';
import { db } from '../lib/firebase';
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
  Trash2,
  BookOpen,
  Music,
  ChevronLeft,
  ChevronsLeft,
  Eye,
  Download,
  LayoutTemplate,
  BookMarked,
  Clock,
  Loader2,
  UserRoundPen,
  Bold,
} from 'lucide-react';
import type { SchoolProfile } from '../types/types';
import { boolean } from 'zod';


const API = API_BASE_URL || '/api';

// const buildBinderDownloadUrl = (apiBase, schoolId, gradeId) => {
//   if (!apiBase || !schoolId || !gradeId) {
//     return '';
//   }

//   const basePath = `${apiBase}/rhymes/binder/${schoolId}/${gradeId}`;
//   const timestamp = Date.now().toString();

//   if (typeof window !== 'undefined' && window.location) {
//     try {
//       const resolved = new URL(basePath, window.location.origin);
//       resolved.searchParams.set('_t', timestamp);
//       return resolved.toString();
//     } catch (error) {
//       console.error('Error constructing binder download URL:', error);
//     }
//   }

//   const separator = basePath.includes('?') ? '&' : '?';
//   return `${basePath}${separator}_t=${timestamp}`;
// };

const GRADE_OPTIONS = [
    { id: 'playgroup', name: 'Playgroup', color: 'from-purple-400 to-indigo-400', icon: '🎨' },
  { id: 'nursery', name: 'Nursery', color: 'from-pink-400 to-rose-400', icon: '🌸' },
  { id: 'lkg', name: 'LKG', color: 'from-blue-400 to-cyan-400', icon: '🎈' },
  { id: 'ukg', name: 'UKG', color: 'from-green-400 to-emerald-400', icon: '🌟' },

];

const MAX_RHYME_PAGES = 44;


// Incoming rhyme preview images are 595x822px. Keep the slot stable and avoid stretching.
// Aspect ratio = width / height = 595 / 822 ≈ 0.723844.
const IMG_PREVIEW_ASPECT_RATIO = 595 / 822;



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

// const buildCoverGradeNames = (source) =>
//   GRADE_OPTIONS.reduce((acc, grade) => {
//     const rawValue = source?.gradeNames?.[grade.id];
//     if (typeof rawValue === 'string' && rawValue.trim().length > 0) {
//       acc[grade.id] = rawValue.trim();
//     } else {
//       acc[grade.id] = resolveDefaultGradeLabel(grade.id);
//     }
//     return acc;
//   }, (source?.gradeNames?.pg ? { pg: source.gradeNames.pg } : {}));

const buildGradeNamesFromSchool = (school?: SchoolProfile | null) => {
  const base = createDefaultGradeNames();
  const mapKey: Record<string, string> = {
    
    playgroup: 'playgroup',
    nursery: 'nursery',
    lkg: 'lkg',
    ukg: 'ukg'
  };
  const grades = school?.grades;
  console.log(grades)
  if (!grades) {
    return base;
  }
  Object.entries(grades).forEach(([rawKey, value]) => {
    const mapped = mapKey[rawKey.toLowerCase()] || rawKey.toLowerCase();
    const labelFromValue = typeof value?.label === 'string' ? value.label.trim() : '';
    const labelFromKey = typeof rawKey === 'string' ? rawKey.trim() : '';
    const label = labelFromValue || labelFromKey;
    if (mapped && label) {

      base[mapped] = label;
      
      // if (mapped === 'playgroup') {
      //   base.pg = label;
      // }
    }
  });
  // if (!base.pg && base.playgroup) {
  //   base.pg = base.playgroup;
  // }
  
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
type ModeSelectionPageProps = {
  school: SchoolProfile | null; // replace with your real School type
  onModeSelect: (mode: string) => void; // replace with your mode union
  isSuperAdmin?: boolean;
  isFrozen?: boolean;
  onBackToWorkspace?: () => void;
  onBackToDashboard?: () => void;
  coverstatus: string;
  onEditProfile?: () => void;
  modePending?: boolean;
  hasBookSelections?: boolean | null;
};
  

const ModeSelectionPage = ({
  school,
  onModeSelect,
  isSuperAdmin = false,
  isFrozen = false,
  onBackToWorkspace,
  onBackToDashboard,
  coverstatus,
  onEditProfile,
  modePending,
  hasBookSelections
  // gateRhymesOption = false
}:ModeSelectionPageProps) => {
  const coverStatus = useMemo(() => {
    const rank: Record<string, number> = { '1': 1, '2': 2, '3': 3, '4': 4 };
    let status = ( coverstatus).toString();
    const schoolId = school?.school_id;
    if (schoolId) {
      // Root cover status (from server / admin update) is the source of truth.
      // When an admin resets status back to "1", do not let older per-grade cached
      // states (which may still hold "2"/"3") override the menu.
      if (status === '1') {
        return status;
      }
      let best = status;
      GRADE_OPTIONS.forEach((grade) => {
        const state = loadCoverWorkflowState(schoolId, grade.id);
        const s = (state?.status || '').toString();
        if (rank[s] && (!rank[best] || rank[s] > rank[best])) {
          best = s;
        }
      });
      status = best || status  || '1';
    }
    return status;
  }, [coverstatus, school?.school_id]);
  
  const coverStatusDescription =
    {
      '1': 'Explore the cover pages to begin selection.',
      '2': 'Cover pages are being prepared. Please wait.',
      '3': 'View uploaded cover pages and approve.',
      '4': 'Selections are frozen. Contact admin for changes.'
    }[coverStatus];
  
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
  ].filter((option) => {
  if (!isSuperAdmin && (option.id === 'books')) return false;
  return true;
})


  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto flex max-w-5xl flex-col gap-8">
        <div className="flex justify-end">
          {(isSuperAdmin ? onBackToWorkspace : onBackToDashboard) && (
            <Button
              variant="outline"
              className="bg-white/80 hover:bg-white border-gray-200 whitespace-normal text-xs sm:text-sm px-3 sm:px-4 py-2 sm:py-2.5"
              onClick={isSuperAdmin ? onBackToWorkspace : onBackToDashboard}
            >
              <ChevronLeft className="mr-2 h-4 w-4 shrink-0" />
              <span className="min-w-0 text-left">
                {isSuperAdmin ? 'Back to workspace' : 'Back to dashboard'}
              </span>
            </Button>
          )}
        </div>

        {/* {isFrozen && coverStatus === '4' && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 shadow-sm">
            Selections are approved and frozen. You can only view existing books, covers, and rhymes.
          </div>
        )} */}

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
                const isRhymesOption = option.id === 'rhymes';
                // const isRhymesGated = isRhymesOption && gateRhymesOption;
                const isBooksChecking = isBooksOption && hasBookSelections === null;
                const isRhymesChecking = isRhymesOption && hasBookSelections === null;
                const isRhymesBlocked = isRhymesOption && hasBookSelections === false;

                const buttonLabel = isBooksOption && hasBookSelections === true
                  ? 'View book selections'
                 
                    : `Explore ${option.title}`;
                
                return (
                  
                  <Card
                    key={option.id}
                    className={`group h-full min-h-[220px] sm:min-h-[240px] flex flex-col transition-all duration-300 border border-slate-200 bg-white ${
                      isBooksChecking || isRhymesChecking
                        ? 'opacity-70 cursor-not-allowed'
                        : 'cursor-pointer hover:-translate-y-0.5 hover:shadow-lg'
                    }`}
                    
                    role="button"
                    tabIndex={0}
                    aria-disabled={Boolean(isBooksChecking || isRhymesChecking)}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return;
                      event.preventDefault();
                      if (isBooksChecking || isRhymesChecking) return;
                      if (isRhymesBlocked) {
                        toast.warning("complete book selections before moving to rhymes ");
                        return;
                      }
                      onModeSelect(option.id);
                    }}
                    onClick={() => {
                      if (isBooksChecking || isRhymesChecking) {
                        return;
                      }
                      if (isRhymesBlocked) {
                        toast.warning("complete book selections before moving to rhymes ");
                        return;
                      }
                      onModeSelect(option.id);
                    }}
                  
                  >
                    <CardContent className="flex-1 flex flex-col justify-between p-3 sm:p-4 text-center gap-2">
                      
                      <div className="space-y-2">
                        
                        
                        <div className={`w-12 h-12 sm:w-14 sm:h-14 mx-auto rounded-xl bg-gradient-to-r ${option.gradient} text-white flex items-center justify-center text-lg sm:text-xl shadow`}>
                          <IconComponent className="h-6 w-6 sm:h-7 sm:w-7" />
                        </div>
                        <h3 className="text-sm sm:text-lg font-semibold text-gray-800">{option.title}</h3>
                        <p className="text-[12px] sm:text-sm text-gray-600 leading-snug line-clamp-3">
                          {option.description}
                        </p>
                        {isRhymesChecking && (
                          <p className="text-[11px] sm:text-xs text-gray-500">Checking book selections…</p>
                        )}
                      </div>
                      {showCoverButton && (
               
                        <Button
                          type="button"
                          onClick={() => {
                            if (isBooksChecking || isRhymesChecking) {
                              return;
                            }
                            if (isRhymesBlocked) {
                              toast.warning("complete book selections before moving to rhymes ");
                            return}
                               
                            onModeSelect(option.id);
                          }}
                          disabled={Boolean(isBooksChecking || isRhymesChecking)}
                          className="w-full min-h-[44px] px-3 py-2 text-xs sm:text-sm whitespace-normal leading-snug flex items-center justify-center bg-gradient-to-r from-orange-400 to-red-400 text-white shadow hover:from-orange-500 hover:to-red-500"
                          
                        >
                          {isBooksChecking ? (
                            <span className="inline-flex items-center gap-2">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Checking status...
                            </span>
                          ) : (
                            buttonLabel
                          )}
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

const getImageAspectRatio = (img: HTMLImageElement) => {
  const { naturalWidth, naturalHeight } = img;
  if (!naturalWidth || !naturalHeight) return null;
  return naturalWidth / naturalHeight;
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
// const CoverDetailsPage = ({ school, coverDetails, onSave, onBackToMenu, onLogout }) => {
//   const navigate = useNavigate();
//   const [formState, setFormState] = useState(() => ({
//     schoolLogo: coverDetails?.schoolLogo || '',
//     schoolLogoFileName: coverDetails?.schoolLogoFileName || '',
//     contactNumber: coverDetails?.contactNumber || '',
//     website: coverDetails?.website || '',
//     email: coverDetails?.email || '',
//     addressLine1: coverDetails?.addressLine1 || '',
//     addressLine2: coverDetails?.addressLine2 || '',
//     addressLine3: coverDetails?.addressLine3 || '',
//     tagLine1: coverDetails?.tagLine1 || '',
//     tagLine2: coverDetails?.tagLine2 || '',
//     tagLine3: coverDetails?.tagLine3 || '',
//     gradeNames: buildCoverGradeNames(coverDetails)
//   }));
//   const [formError, setFormError] = useState('');
//   const [logoError, setLogoError] = useState('');

//   useEffect(() => {
//     setFormState({
//       schoolLogo: coverDetails?.schoolLogo || '',
//       schoolLogoFileName: coverDetails?.schoolLogoFileName || '',
//       contactNumber: coverDetails?.contactNumber || '',
//       website: coverDetails?.website || '',
//       email: coverDetails?.email || '',
//       addressLine1: coverDetails?.addressLine1 || '',
//       addressLine2: coverDetails?.addressLine2 || '',
//       addressLine3: coverDetails?.addressLine3 || '',
//       tagLine1: coverDetails?.tagLine1 || '',
//       tagLine2: coverDetails?.tagLine2 || '',
//       tagLine3: coverDetails?.tagLine3 || '',
//       gradeNames: buildCoverGradeNames(coverDetails)
//     });
//   }, [coverDetails]);

//   const handleChange = useCallback(
//     (field) => (event) => {
//       const value = event?.target?.value ?? '';
//       setFormState((current) => ({
//         ...current,
//         [field]: value
//       }));
//       setFormError('');
//     },
//     []
//   );

//   const handleGradeNameChange = useCallback((gradeId) => (event) => {
//     const value = event?.target?.value ?? '';
//     setFormState((current) => ({
//       ...current,
//       gradeNames: {
//         ...(current.gradeNames || {}),
//         [gradeId]: value
//       }
//     }));
//     setFormError('');
//   }, []);

//   const handleLogoUpload = useCallback(async (event) => {
//     const input = event?.target;
//     const file = input?.files?.[0] || null;

//     if (!file) {
//       setFormState((current) => ({ ...current, schoolLogo: '', schoolLogoFileName: '' }));
//       setLogoError('');
//     } else if (file.type && !file.type.startsWith('image/')) {
//       setFormState((current) => ({ ...current, schoolLogo: '', schoolLogoFileName: '' }));
//       setLogoError('Please upload an image file for the school logo.');
//     } else {
//       try {
//         const dataUrl = await readFileAsDataUrl(file);
//         setFormState((current) => ({
//           ...current,
//           schoolLogo: dataUrl.trim(),
//           schoolLogoFileName: file.name
//         }));
//         setLogoError('');
//       } catch (error) {
//         setFormState((current) => ({ ...current, schoolLogo: '', schoolLogoFileName: '' }));
//         setLogoError('We could not read that image. Please try a different file.');
//       }
//     }

//     if (input) {
//       input.value = '';
//     }
//   }, []);

//   const handleBackToMenuClick = useCallback(() => {
//     if (typeof onBackToMenu === 'function') {
//       onBackToMenu();
//     }
//     navigate('/');
//   }, [navigate, onBackToMenu]);

//   const handleLogoutClick = useCallback(() => {
//     if (typeof onLogout === 'function') {
//       onLogout();
//     }
//     navigate('/');
//   }, [navigate, onLogout]);

//   const handleSubmit = useCallback(
//     (event) => {
//       event.preventDefault();

//       const requiredFields = [
//         'schoolLogo',
//         'contactNumber',
//         'website',
//         'email',
//         'addressLine1',
//         'addressLine2',
//         'addressLine3',
//         'tagLine1',
//         'tagLine2',
//         'tagLine3'
//       ];

//       const missingField = requiredFields.find((field) => {
//         const value = formState[field];
//         return typeof value !== 'string' || value.trim().length === 0;
//       });

//       if (missingField) {
//         setFormError('Please complete every field before continuing.');
//         return;
//       }

//       const trimmedGradeNames = GRADE_OPTIONS.reduce((acc, grade) => {
//         const value = formState.gradeNames?.[grade.id] ?? '';
//         acc[grade.id] = value.trim();
//         return acc;
//       }, {});

//       const missingGradeName = GRADE_OPTIONS.find((grade) => trimmedGradeNames[grade.id].length === 0);

//       if (missingGradeName) {
//         setFormError('Please provide a grade name for every grade.');
//         return;
//       }

//       if (typeof onSave === 'function') {
//         onSave({
//           ...formState,
//           contactNumber: formState.contactNumber.trim(),
//           website: formState.website.trim(),
//           email: formState.email.trim(),
//           addressLine1: formState.addressLine1.trim(),
//           addressLine2: formState.addressLine2.trim(),
//           addressLine3: formState.addressLine3.trim(),
//           tagLine1: formState.tagLine1.trim(),
//           tagLine2: formState.tagLine2.trim(),
//           tagLine3: formState.tagLine3.trim(),
//           gradeNames: trimmedGradeNames
//         });
//       }

//       toast.success('Cover details saved');
//       setFormError('');
//       navigate('/');
//     },
//     [formState, navigate, onSave]
//   );

//   return (
//     <div className="min-h-screen bg-slate-50 p-6">
//       <div className="max-w-4xl mx-auto space-y-8">
//         <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between text-center md:text-left">
//           <div>
//             <h1 className="text-3xl font-bold text-gray-800">{school.school_name}</h1>
//             <p className="text-gray-600">School ID: {school.school_id}</p>
//           </div>
//           <div className="flex flex-wrap items-center justify-center gap-3">
//             <Button onClick={handleBackToMenuClick} variant="outline" className="bg-white/80 hover:bg-white border-gray-200">
//               Back to Menu
//             </Button>
//             <Button onClick={handleLogoutClick} variant="outline" className="bg-white/80 hover:bg-white border-gray-200">
//               Logout
//             </Button>
//           </div>
//         </div>

//         <Card className="border-0 bg-white/85 backdrop-blur">
//           <CardHeader>
//             <CardTitle className="text-xl font-semibold text-gray-800">Enter cover personalisation details</CardTitle>
//             <p className="text-sm text-gray-600">
//               Provide the school information that will be applied to every grade before selecting a class.
//             </p>
//           </CardHeader>
//           <CardContent>
//             <form onSubmit={handleSubmit} className="space-y-6">
//               <div className="grid gap-4 md:grid-cols-2">
//                 <div className="space-y-2">
//                   <Label htmlFor="cover-details-contact">School contact number</Label>
//                   <Input
//                     id="cover-details-contact"
//                     type="tel"
//                     inputMode="tel"
//                     placeholder="Contact number"
//                     value={formState.contactNumber}
//                     onChange={handleChange('contactNumber')}
//                   />
//                 </div>
//                 <div className="space-y-2">
//                   <Label htmlFor="cover-details-website">Website</Label>
//                   <Input
//                     id="cover-details-website"
//                     placeholder="e.g. www.edplore.com"
//                     value={formState.website}
//                     onChange={handleChange('website')}
//                   />
//                 </div>
//                 <div className="space-y-2 md:col-span-2">
//                   <Label htmlFor="cover-details-email">Email</Label>
//                   <Input
//                     id="cover-details-email"
//                     type="email"
//                     placeholder="e.g. hello@school.com"
//                     value={formState.email}
//                     onChange={handleChange('email')}
//                   />
//                 </div>
//                 <div className="space-y-3 md:col-span-2">
//                   <p className="text-sm font-semibold text-gray-700">Grade names</p>
//                   <div className="grid gap-4 md:grid-cols-2">
//                     {GRADE_OPTIONS.map((grade) => (
//                       <div key={`grade-name-field-${grade.id}`} className="space-y-2">
//                         <Label htmlFor={`cover-details-grade-${grade.id}`}>
//                           {grade.name} grade name
//                         </Label>
//                         <Input
//                           id={`cover-details-grade-${grade.id}`}
//                           placeholder={`Enter ${grade.name.toLowerCase()} grade name`}
//                           value={formState.gradeNames?.[grade.id] || ''}
//                           onChange={handleGradeNameChange(grade.id)}
//                         />
//                       </div>
//                     ))}
//                   </div>
//                 </div>
//                 <div className="space-y-2 md:col-span-2">
//                   <Label htmlFor="cover-details-logo">Upload school logo</Label>
//                   <Input
//                     id="cover-details-logo"
//                     type="file"
//                     accept="image/*"
//                     onChange={handleLogoUpload}
//                   />
//                   {formState.schoolLogoFileName && !logoError && (
//                     <p className="text-xs text-gray-500">Selected file: {formState.schoolLogoFileName}</p>
//                   )}
//                   {logoError && <p className="text-xs text-red-600">{logoError}</p>}
//                   {formState.schoolLogo && (
//                     <img
//                       src={formState.schoolLogo}
//                       alt="Selected school logo"
//                       className="mt-3 h-16 w-16 rounded-md border border-gray-200 bg-white object-contain"
//                     />
//                   )}
//                 </div>
//                 <div className="space-y-2 md:col-span-2">
//                   <Label htmlFor="cover-details-address-line-1">Address</Label>
//                   <Input
//                     id="cover-details-address-line-1"
//                     placeholder="Address"
//                     value={formState.addressLine1}
//                     onChange={handleChange('addressLine1')}
//                   />
//                 </div>
//                 <div className="space-y-2 md:col-span-2">
//                   <Label htmlFor="cover-details-address-line-2">Address line 2</Label>
//                   <Input
//                     id="cover-details-address-line-2"
//                     placeholder="Address line 2"
//                     value={formState.addressLine2}
//                     onChange={handleChange('addressLine2')}
//                   />
//                 </div>
//                 <div className="space-y-2 md:col-span-2">
//                   <Label htmlFor="cover-details-address-line-3">Address line 3</Label>
//                   <Input
//                     id="cover-details-address-line-3"
//                     placeholder="Address line 3"
//                     value={formState.addressLine3}
//                     onChange={handleChange('addressLine3')}
//                   />
//                 </div>
//                 <div className="space-y-2 md:col-span-2">
//                   <Label htmlFor="cover-details-tag-line-1">Tag line 1</Label>
//                   <Input
//                     id="cover-details-tag-line-1"
//                     placeholder="Enter tag line 1"
//                     value={formState.tagLine1}
//                     onChange={handleChange('tagLine1')}
//                   />
//                 </div>
//                 <div className="space-y-2 md:col-span-2">
//                   <Label htmlFor="cover-details-tag-line-2">Tag line 2</Label>
//                   <Input
//                     id="cover-details-tag-line-2"
//                     placeholder="Enter tag line 2"
//                     value={formState.tagLine2}
//                     onChange={handleChange('tagLine2')}
//                   />
//                 </div>
//                 <div className="space-y-2 md:col-span-2">
//                   <Label htmlFor="cover-details-tag-line-3">Tag line 3</Label>
//                   <Input
//                     id="cover-details-tag-line-3"
//                     placeholder="e.g. Playgroup | Nursery | LKG | UKG | Daycare"
//                     value={formState.tagLine3}
//                     onChange={handleChange('tagLine3')}
//                   />
//                 </div>
//               </div>
//               {formError && <p className="text-sm text-red-600">{formError}</p>}
//               <div className="flex flex-wrap items-center justify-between gap-3">
//                 <Button type="submit" className="bg-gradient-to-r from-orange-400 to-red-400 text-white">
//                   Save & Continue
//                 </Button>
//                 <Button
//                   type="button"
//                   variant="outline"
//                   onClick={() => {
//                     setFormState({
//                       schoolLogo: '',
//                       schoolLogoFileName: '',
//                       contactNumber: '',
//                       website: '',
//                       email: '',
//                       addressLine1: '',
//                       addressLine2: '',
//                       addressLine3: '',
//                       tagLine1: '',
//                       tagLine2: '',
//                       tagLine3: ''
//                     });
//                     setFormError('');
//                     setLogoError('');
//                   }}
//                   className="border-orange-300 text-orange-500 hover:bg-orange-50"
//                 >
//                   Clear
//                 </Button>
//               </div>
//             </form>
//           </CardContent>
//         </Card>
//       </div>
//     </div>
//   );
// };

// Grade Selection Page

type GradeSelectionPageprops={
  school:SchoolProfile,
  mode:string|null,
 
  onBackToMode?:()=>void,

  onCoverIntentChange:React.Dispatch<React.SetStateAction<"edit" | "view">>,
  bookselections: { classes: unknown[] }|null;

}


const GradeSelectionPage = ({
  school,
  mode,
  onGradeSelect,
  onBackToMode,
  
  onCoverIntentChange,
  bookselections
  
  
}:GradeSelectionPageprops) => {
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
  const grade=school?.grades
  console.log(grade)



  
 
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
  

  const normalizeClassDocId = (value: unknown) =>
    (typeof value === 'string' ? value : String(value ?? ''))
      .trim()
      .toLowerCase()
      .replace(/ /g, '_');

  const isRhymeSelection = (entry: any) => {
    const subject = typeof entry?.subject === 'string' ? entry.subject.trim().toLowerCase() : '';
    if (!subject) {
      return false;
    }
    return subject.includes('rhyme');
  };

  const extractCoreId = (entry: any) => {
    const value =
      entry?.core ??
      entry?.work ??
      entry?.addOn ??
      entry?.add_on ??
      entry?.type ??
      '';
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
    return '';
  };

  const rhymeCoreIdByGrade = useMemo(() => {
    const map: Record<string, string> = {};
    const classes = Array.isArray(bookselections?.classes) ? bookselections.classes : [];
    
    for (const classDoc of classes) {
      if (!classDoc || typeof classDoc !== 'object') {
        continue;
      }
      const classKeyRaw = classDoc.class ?? classDoc.doc_id ?? classDoc.class_label ?? '';
     
      const classKey = normalizeClassDocId(classKeyRaw);
      const gradeId = classKey === 'pg' ? 'playgroup' : classKey;
      const items = Array.isArray(classDoc.items) ? classDoc.items : [];
      const rhymeEntry = items.find(isRhymeSelection);
      const coreId = extractCoreId(rhymeEntry);
      
      if (coreId) {
        map[gradeId] = coreId;
      }
    }
    
    return map;
  }, [bookselections]);

  const rhymeCustomisableByGrade = useMemo(() => {
    const result: Record<string, boolean> = {};
    if (!isRhymeMode) {
      return result;
    }
    const seenCoreIds = new Set<string>();
    



    for (const grade of GRADE_OPTIONS) {
      const coreId = rhymeCoreIdByGrade[grade.id] || '';
      if (!coreId) {
        result[grade.id] = false;
        continue;
      }
      if (seenCoreIds.has(coreId) && !(coreId.startsWith(school.school_id)) ) {
        result[grade.id] = false;
        continue;
      }
      if (coreId.startsWith(school.school_id)){
          result[grade.id] = true;
      }

      seenCoreIds.add(coreId);
      
    }
    
    return result;
  }, [isRhymeMode, rhymeCoreIdByGrade]);

  

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
      // Default to all disabled when no grade map is provided
      const base: Record<string, boolean> = {};
      GRADE_OPTIONS.forEach((grade) => {
        base[grade.id] = false;
        if (grade.id === 'playgroup') {
          base.pg = false;
        }
      });
      setEnabledGradeMap(base);
      return;
    }
    const enabled: Record<string, boolean> = {};
    GRADE_OPTIONS.forEach((grade) => {
      const entry = grades[grade.id];
      const isEnabled = entry && typeof entry === 'object' ? Boolean(entry.enabled) : false;
      enabled[grade.id] = isEnabled;
      if (grade.id === 'playgroup') {
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

  // const handleDownloadBinder = useCallback(
  //   async (gradeId, event) => {
  //     event?.stopPropagation();
  //     event?.preventDefault();

  //     if (!school?.school_id) {
  //       toast.error('Missing school information for download');
  //       return;
  //     }

  //     const downloadUrl = buildBinderDownloadUrl(API, school.school_id, gradeId);
  //     if (!downloadUrl) {
  //       toast.error('Unable to prepare binder download');
  //       return;
  //     }

  //     try {
  //       setDownloadingGradeId(gradeId);

  //       const response = await axios.get(downloadUrl, {
  //         responseType: 'blob',
  //         validateStatus: () => true
  //       });

  //       if (response.status >= 400) {
  //         let message = 'Please select at least one rhyme page before downloading the binder.';
  //         try {
  //           if (response.data instanceof Blob) {
  //             message = (await response.data.text()) || message;
  //           } else if (typeof response.data === 'string') {
  //             message = response.data || message;
  //           }
  //         } catch (error) {
  //           // swallow parse error and keep default message
  //         }
  //         toast.error(message);
  //         return;
  //       }

  //       const blob = response.data;
  //       const href = URL.createObjectURL(blob);
  //       const anchor = document.createElement('a');
  //       anchor.href = href;
  //       anchor.setAttribute('download', `${gradeId}-rhyme-binder.pdf`);
  //       anchor.style.display = 'none';
  //       document.body.appendChild(anchor);
  //       anchor.click();
  //       document.body.removeChild(anchor);
  //       URL.revokeObjectURL(href);

  //       toast.success('Binder download started');
  //     } catch (error) {
  //       console.error('Error initiating binder download:', error);
  //       toast.error('Failed to download binder');
  //     } finally {
  //       if (downloadResetTimerRef.current) {
  //         clearTimeout(downloadResetTimerRef.current);
  //       }

  //       downloadResetTimerRef.current = setTimeout(() => {
  //         setDownloadingGradeId((current) => (current === gradeId ? null : current));
  //         downloadResetTimerRef.current = null;
  //       }, 800);
  //     }
  //   },
  //   [school?.school_id]
  // );

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

  // const handleEditDetailsClick = useCallback(() => {
  //   if (typeof onEditCoverDetails === 'function') {
  //     onEditCoverDetails();
  //   }
  // }, [onEditCoverDetails]);

  // const addressLines = [
  //   coverDefaults?.addressLine1,
  //   coverDefaults?.addressLine2,
  //   coverDefaults?.addressLine3
  // ].filter((line) => typeof line === 'string' && line.trim().length > 0);

  // const tagLines = [
  //   coverDefaults?.tagLine1,
  //   coverDefaults?.tagLine2,
  //   coverDefaults?.tagLine3
  // ].filter((line) => typeof line === 'string' && line.trim().length > 0);

  // const gradeNameOverrides = buildCoverGradeNames(coverDefaults);

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
          <div className="flex justify-end mb-8">
            <Button
              onClick={handleBackToMenu}
              variant="outline"
              className="bg-white/80 hover:bg-white border-gray-200"
            >
              Back to Menu
            </Button>
          </div>

          <div className="mb-8 space-y-2 text-center md:text-left">
            <h2 className="text-xl sm:text-2xl font-semibold text-gray-800">{currentMode.title}</h2>
            <p className="text-sm sm:text-base text-gray-600">{currentMode.subtitle}</p>
            <p className="text-sm sm:text-sm   font-semibold text-gray-800"><span style={{color:"red"}}>Disclaimer</span> : you can select rhymes for a  minimum of  24 pages and maximum of 44 pages  per  grade ,make sure your select pages as a multiple of 4 for binding purpose</p>
          </div>
          
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {GRADE_OPTIONS.filter((grade) => enabledGradeMap[grade.id] !== false).map((grade) => {
              const resolvedGradeName =  school.grades?.[grade.id].label!="" ? school.grades?.[grade.id].label :school.grades?.[grade.id]
              
              const { selectedPages, maxPages } = getGradeStatusInfo(grade.id);
            
              const formattedSelectedPages = Number.isInteger(selectedPages)
                ? selectedPages
                : selectedPages.toFixed(1);
              const formattedMaxPages = Number.isInteger(maxPages)
                ? maxPages
                : maxPages.toFixed(1);
              const coverState = coverSelections[grade.id];
              const coverStatusCode = (coverState?.status || '1').toString();
              // const coverStatusText =
              //   {
              //     '1': 'Explore cover pages',
              //     '2': 'Cover pages are being prepared',
              //     '3': 'View cover pages',
              //     '4': 'Selections are frozen',
              //     finished: 'Selections are frozen',
              //   }[coverStatusCode] || 'Explore cover pages';
              // const isCoverFinished = coverStatusCode === '4' || coverStatusCode === 'finished';
              
              return (
                <Card
                  key={grade.id}
                  className="group aspect-square flex flex-col cursor-pointer transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg border border-slate-200 bg-white"
                  
                  onClick={
                     () => 
                      rhymeCustomisableByGrade[grade.id]
                    ? handleGradeCardSelect(grade.id):toast.info("grade is not customisable")
                   
                  }

                >
                  <CardContent className="flex-1 flex flex-col justify-between p-4 text-center">
                    <div className="space-y-1">
                      <h3 className="text-base sm:text-lg font-bold text-gray-800">{resolvedGradeName}</h3>
                  
                          {isRhymeMode &&(
                            <span className="inline-block rounded-full bg-slate-100 text-slate-700 text-xs font-semibold px-3 py-1">
                              {formattedSelectedPages}pages
                            </span>
                          )
                          }
                          {isRhymeMode && (
                            
                            <span
                              className={`inline-block rounded-full text-xs font-semibold px-3 py-1 ${
                                rhymeCustomisableByGrade[grade.id]
                                  ? 'bg-green-50 text-green-700 border border-green-200'
                                  : 'bg-slate-100 text-slate-700 border border-slate-200'
                              }`}
                            >
                              
                              {rhymeCustomisableByGrade[grade.id] ? 'Customisable' : 'Not customisable'}
                            </span>
                          )}
                          <p className="text-sm text-gray-600">
                            {isBookMode
                              ? `Curate books for ${resolvedGradeName}.`
                              : `Manage rhymes for ${resolvedGradeName}.`}
                          </p>
                         

                         



                        
                          
                        
                      
                    </div>
                    
                    {/* {!isCoverMode && (
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
                    )} */}
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
  const navigate 
  = useNavigate();

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
  subject?: string;
  personalized?: string | boolean;
  used_in_grades?: string[];
};

const isPersonalizedValue = (value: unknown) => {
  if (value === true) return true;
  if (typeof value === 'string') {
    return value.trim().toLowerCase() === 'yes';
  }
  return false;
};

const normalizeGradePersonalisationValue = (value: unknown): 'yes' | 'no' | null => {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'yes' || normalized === 'no') return normalized;
  }
  if (value === true) return 'yes';
  if (value === false) return 'no';
  return null;
};

const resolvePreviewBucket = (value: unknown): 'personalized' | 'nonPersonalized' | null => {
  if (value === 'personalized' || value === 'nonPersonalized') {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'personalised' || normalized === 'personalized') return 'personalized';
    if (normalized === 'non_personalised' || normalized === 'non_personalized') return 'nonPersonalized';
  }
  return null;
};

type TreeMenuGroups = Record<string, TreeMenuRhyme[]>;

type TreeMenuDivisionKey = 'rhymes' | 'stories';

const resolveTreeMenuItemCode = (item: any): string => {
  const raw = (item?.code ?? item?.rhyme_code ?? '').toString();
 
  return raw.trim();
};

const isStoryTreeMenuItem = (item: any): boolean => {
  
  const code = resolveTreeMenuItemCode(item);
  
  if (!code) return false;
  return code.toUpperCase().startsWith('ST');
};

type RhymeLanguageConfig = {
  default?: {
    groupByLanguage?: boolean;
    allowedLanguages?: string[];
  };
  grades?: Record<
    string,
    {
      groupByLanguage?: boolean;
      allowedLanguages?: string[];
    }
  >;
  languageOrder?: string[];
  languageLabels?: Record<string, string>;
};

const DEFAULT_LANGUAGE_ORDER = ['english', 'hindi', 'tamil', 'kannada', 'other'];
const DEFAULT_LANGUAGE_LABELS: Record<string, string> = {
  english: 'English',
  hindi: 'Hindi',
  tamil: 'Tamil',
  kannada: 'Kannada',
  other: 'Other'
};

const normalizeLanguageKey = (value: unknown): string => {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!raw) return 'english';
  if (raw === 'eng' || raw === 'english') return 'english';
  if (raw === 'hin' || raw === 'hindi') return 'hindi';
  if (raw === 'tam' || raw === 'tamil') return 'tamil';
  if (raw === 'kan' || raw === 'kannada') return 'kannada';
  if (raw === 'other') return 'other';

  const normalized = raw.replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
  return normalized || 'other';
};

const normalizeGradeKey = (value: unknown): string => {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
 
  if (!raw) return '';
  if (raw === 'pg') return 'playgroup';
  return raw.replace(/[^a-z0-9]+/g, '');
};

const toTitleCaseLabel = (key: string): string => {
  const spaced = key.replace(/[_-]+/g, ' ').trim();
  if (!spaced) return 'Other';
  return spaced
    .split(/\s+/g)
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(' ');
};

const resolveLanguageUiForGrade = (
  grade: unknown,
  config?: RhymeLanguageConfig | null
) => {
  const normalizedGrade = normalizeGradeKey(grade);
  const defaultConfig = config?.default || {};

  const gradesConfig = config?.grades || {};
  const gradeConfigKey =
    normalizedGrade &&
    (gradesConfig[normalizedGrade]
      ? normalizedGrade
      : Object.keys(gradesConfig).find((key) => normalizeGradeKey(key) === normalizedGrade));
  const gradeConfig = (gradeConfigKey && gradesConfig[gradeConfigKey]) || {};

  const groupByLanguage =
    typeof gradeConfig.groupByLanguage === 'boolean'
      ? gradeConfig.groupByLanguage
      : typeof defaultConfig.groupByLanguage === 'boolean'
        ? defaultConfig.groupByLanguage
        : true;

  const allowedLanguagesRaw =
    Array.isArray(gradeConfig.allowedLanguages)
      ? gradeConfig.allowedLanguages
      : Array.isArray(defaultConfig.allowedLanguages)
        ? defaultConfig.allowedLanguages
        : null;
 

  const allowedLanguages = allowedLanguagesRaw
    ? new Set(allowedLanguagesRaw.map(normalizeLanguageKey).filter(Boolean))
    : null;
  allowedLanguages?.add('english');

  const orderRaw = Array.isArray(config?.languageOrder) ? config?.languageOrder : DEFAULT_LANGUAGE_ORDER;
  const order = orderRaw.map(normalizeLanguageKey).filter(Boolean);
  const filteredOrder = allowedLanguages ? order.filter((key) => allowedLanguages.has(key)) : order;

  const labels = config?.languageLabels || DEFAULT_LANGUAGE_LABELS;

  return { groupByLanguage, allowedLanguages, order: filteredOrder, labels };
};

type TreeMenuProps = {
  rhymesData: TreeMenuGroups;
  reusableRhymes: TreeMenuGroups;
  showReusable: boolean;
  grade?: string | null;
  languageConfig?: RhymeLanguageConfig | null;
  currentPageIndex: number;
  maxPagesPerGrade: number;
  onToggleReusable: () => void;
  onRhymeSelect: (
    rhyme: TreeMenuRhyme,
    options?: { bucket?: 'personalized' | 'nonPersonalized' }
  ) => void;
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
    selectedRhymeCodes,
    grade,
    languageConfig,
    currentPageIndex,
    maxPagesPerGrade
  }) => {
    const [expandedDivisions, setExpandedDivisions] = useState<Record<TreeMenuDivisionKey, boolean>>({
      rhymes: true,
      stories: true
    });
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
    const [expandedSubjects, setExpandedSubjects] = useState<Record<string, boolean>>({});
    const [expandedBuckets, setExpandedBuckets] = useState<Record<string, boolean>>({});
    const languageUi = useMemo(() => resolveLanguageUiForGrade(grade, languageConfig), [grade, languageConfig]);

    const buildGroupKey = useCallback(
      (division: TreeMenuDivisionKey, pageKey: string) => `${division}::${pageKey}`,
      []
    );

    const buildSubjectKey = useCallback(
      (division: TreeMenuDivisionKey, pageKey: string, subjectKey: string) =>
        `${division}::${pageKey}::${subjectKey}`,
      []
    );

    const buildBucketKey = useCallback(
      (
        division: TreeMenuDivisionKey,
        pageKey: string,
        subjectKey: string,
        bucketKey: 'personalized' | 'nonPersonalized'
      ) => `${division}::${pageKey}::${subjectKey}::${bucketKey}`,
      []
    );

    const toggleDivision = (division: TreeMenuDivisionKey) => {
      setExpandedDivisions((prev) => ({
        ...prev,
        [division]: !prev[division]
      }));
    };
    
    const toggleGroup = (division: TreeMenuDivisionKey, pageKey: string) => {
      const key = buildGroupKey(division, pageKey);
      setExpandedGroups((prev) => ({
        ...prev,
        [key]: !prev[key]
      }));
    };
    const toggleSubject = (division: TreeMenuDivisionKey, pageKey: string, subjectKey: string) => {
      const key = buildSubjectKey(division, pageKey, subjectKey);
      setExpandedSubjects((prev) => ({
        ...prev,
        [key]: !prev[key]
      }));
    };
    const toggleBucket = (
      division: TreeMenuDivisionKey,
      pageKey: string,
      subjectKey: string,
      bucketKey: 'personalized' | 'nonPersonalized'
    ) => {
      const key = buildBucketKey(division, pageKey, subjectKey, bucketKey);
      setExpandedBuckets((prev) => ({
        ...prev,
        [key]: !prev[key]
      }));
    };
    const resolveSubjectLabel = useCallback(
      (subjectKey: string) => {
        const normalized = normalizeLanguageKey(subjectKey);
        return languageUi.labels?.[normalized] || toTitleCaseLabel(normalized);
      },
      [languageUi.labels]
    );

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
          const code = resolveTreeMenuItemCode(rhyme).toLowerCase();
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
  
    const filteredRhymes = useMemo(() => {
      const baseGroups = hideFullPageRhymes
        ? Object.fromEntries(
            Object.entries(currentRhymes || {}).filter(([pageKey]) => {
              const pages = parseFloat(pageKey);
              // Bottom slot menu: only half-page rhymes are valid.
              return Number.isFinite(pages) && pages === 0.5;
            })
          )
        : currentRhymes || {};

      const normalizedMax = Number(maxPagesPerGrade);
      const normalizedIndex = Number(currentPageIndex);
      if (!Number.isFinite(normalizedMax) || !Number.isFinite(normalizedIndex)) {
        return baseGroups;
      }

      const remainingPages = Math.max(0, normalizedMax - normalizedIndex);
      if (!Number.isFinite(remainingPages) || remainingPages <= 0) {
        return {};
      }

      // Prevent selecting multi-page rhymes that would overflow the last pages.
      // Examples with MAX=44 (0-based index):
      // - index 41 (page 42 / MAX-2): allow up to 3 pages (fits 42-44)
      // - index 42 (page 43 / MAX-1): disallow 3 pages; allow <=2
      // - index 43 (page 44 / MAX): allow <=1 (incl. 0.5)
      return Object.fromEntries(
        Object.entries(baseGroups).filter(([pageKey]) => {
          const pages = parseFloat(pageKey);
          if (!Number.isFinite(pages)) return true;
          return pages <= remainingPages;
        })
      );
    }, [currentRhymes, currentPageIndex, hideFullPageRhymes, maxPagesPerGrade]);

  const { rhymesGroups, storiesGroups } = useMemo(() => {
    const rhymesOutput: TreeMenuGroups = {};
    const storiesOutput: TreeMenuGroups = {};

    Object.entries(filteredRhymes || {}).forEach(([pageKey, items]) => {
      const safeList = Array.isArray(items) ? items : [];

      // Apply allowed-languages filtering here so section counts match what is actually renderable.
      const allowedLanguages = languageUi.allowedLanguages;
      const visibleList = allowedLanguages
        ? safeList.filter((entry) => {
            const subjectKey = normalizeLanguageKey(entry?.subject) || 'english';
            return allowedLanguages.has(subjectKey);
          })
        : safeList;

      const rhymesList = visibleList.filter((entry) => !isStoryTreeMenuItem(entry));
      const storiesList = visibleList.filter((entry) => isStoryTreeMenuItem(entry));

      if (rhymesList.length > 0) {
        rhymesOutput[pageKey] = rhymesList;
      }
      if (storiesList.length > 0) {
        storiesOutput[pageKey] = storiesList;
      }
    });

    return { rhymesGroups: rhymesOutput, storiesGroups: storiesOutput };
  }, [filteredRhymes, languageUi.allowedLanguages]);

  const countGroupItems = useCallback((groups: TreeMenuGroups) => {
    return Object.values(groups).reduce((acc, list) => acc + (Array.isArray(list) ? list.length : 0), 0);
  }, []);

  const rhymesCount = countGroupItems(rhymesGroups);
  const storiesCount = countGroupItems(storiesGroups);
  const isEmpty =
    (!filteredRhymes || Object.keys(filteredRhymes).length === 0) ||
    (rhymesCount === 0 && storiesCount === 0);

  const rhymeEntries = Object.entries(rhymesGroups) as [string, TreeMenuRhyme[]][];
  const sortedRhymeEntries = [...rhymeEntries].sort((first, second) => Number(first[0]) - Number(second[0]));
  const storyEntries = Object.entries(storiesGroups) as [string, TreeMenuRhyme[]][];
  const sortedStoryEntries = [...storyEntries].sort((first, second) => Number(first[0]) - Number(second[0]));
  
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
        {isEmpty ? (
          <div className="p-4 text-center text-gray-500">
            <Music className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>{showReusable ? 'No reusable rhymes or stories available' : 'No rhymes or stories available'}</p>
          </div>
        ) : (
        <div className="space-y-2">
          {([
            {
              division: 'rhymes' as const,
              label: showReusable ? 'Reusable Rhymes' : 'Available Rhymes',
              count: rhymesCount,
              entries: sortedRhymeEntries,
              icon: Music,
              triggerClassName:
                'flex w-full items-center justify-between rounded-lg bg-orange-50 px-3 py-2 text-left transition-colors duration-200 hover:bg-orange-100',
              textClassName: 'flex items-center gap-2 text-sm font-semibold text-orange-700',
              chevronClassName: 'h-4 w-4 text-orange-700'
            },
            {
              division: 'stories' as const,
              label: showReusable ? 'Reusable Stories' : 'Available Stories',
              count: storiesCount,
              entries: sortedStoryEntries,
              icon: BookMarked,
              triggerClassName:
                'flex w-full items-center justify-between rounded-lg bg-indigo-50 px-3 py-2 text-left transition-colors duration-200 hover:bg-indigo-100',
              textClassName: 'flex items-center gap-2 text-sm font-semibold text-indigo-700',
              chevronClassName: 'h-4 w-4 text-indigo-700'
            }
          ] as const).map((section) => {
            const Icon = section.icon;
            return (
              <Collapsible
                key={section.division}
                open={expandedDivisions[section.division]}
                onOpenChange={() => toggleDivision(section.division)}
              >
                <CollapsibleTrigger className={section.triggerClassName}>
                  <span className={section.textClassName}>
                    <Icon className="h-4 w-4" />
                    {section.label} ({section.count})
                  </span>
                  {expandedDivisions[section.division] ? (
                    <ChevronDown className={section.chevronClassName} />
                  ) : (
                    <ChevronRight className={section.chevronClassName} />
                  )}
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-1 pl-1">
                  <div className="space-y-1">
                    {section.entries.map(([pageKey, rhymes]) => {
                      const division = section.division;
                      const groupStateKey = buildGroupKey(division, pageKey);
          if (!rhymes || rhymes.length === 0) return null;
          const visibleRhymes = rhymes;

          if (!visibleRhymes || visibleRhymes.length === 0) {
            return null;
          }

          if (!languageUi.groupByLanguage) {
            const subjectKey = '__all__';
            const personalizedRhymes = visibleRhymes.filter((rhyme) => isPersonalizedValue(rhyme?.personalized));
            const nonPersonalizedRhymes = visibleRhymes.filter((rhyme) => !isPersonalizedValue(rhyme?.personalized));

            const renderRhymeRow = (rhyme: TreeMenuRhyme, bucket: 'personalized' | 'nonPersonalized') => {
              const resolvedCode = resolveTreeMenuItemCode(rhyme);
              const safeRhyme: TreeMenuRhyme = resolvedCode ? { ...rhyme, code: resolvedCode } : rhyme;

              return (
                <button
                  key={resolvedCode || rhyme.code}
                  type="button"
                  onClick={() => onRhymeSelect(safeRhyme, { bucket })}
                  className="group flex w-full items-center justify-between gap-3 rounded-lg border border-transparent bg-white/50 p-3 text-left transition-all duration-200 hover:border-orange-200 hover:bg-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300"
                  aria-label={`Select ${rhyme.name}`}
                >
                  <div className="flex-1">
                    <p className="font-medium text-gray-800 transition-colors duration-200 group-hover:text-orange-600">{rhyme.name}</p>
                    <p className="mt-1 text-xs text-gray-500">
                      {rhyme.used_in_grades && rhyme.used_in_grades.length > 0 && (
                        <span className="ml-2 text-blue-600">(Used in: {rhyme.used_in_grades.join(', ')})</span>
                      )}
                    </p>
                  </div>
                  <span
                    className="shrink-0 rounded-full border border-orange-200 bg-white/70 p-2 text-orange-500 transition-colors duration-200 group-hover:border-orange-300 group-hover:text-orange-600"
                    aria-hidden="true"
                  >
                    <Plus className="h-4 w-4" />
                  </span>
                </button>
              );
            };

            return (
              <Collapsible key={groupStateKey} open={Boolean(expandedGroups[groupStateKey])} onOpenChange={() => toggleGroup(division, pageKey)}>
                <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg p-3 text-left transition-colors duration-200 hover:bg-white/50">
                  <span className="flex items-center gap-2 font-medium text-gray-700">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-r from-orange-400 to-red-400 text-xs font-bold text-white">
                      {pageKey}
                    </div>
                    {pageKey} Page{parseFloat(pageKey) !== 1 ? 's' : ''} ({visibleRhymes.length})
                  </span>
                  {expandedGroups[groupStateKey] ? (
                    <ChevronDown className="h-4 w-4 text-gray-500" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-gray-500" />
                  )}
                </CollapsibleTrigger>
                <CollapsibleContent className="pl-4">
                  <div className="mt-2 space-y-2">
                    {personalizedRhymes.length > 0 && (
                      <Collapsible
                        open={expandedBuckets[buildBucketKey(division, pageKey, subjectKey, 'personalized')] !== false}
                        onOpenChange={() => toggleBucket(division, pageKey, subjectKey, 'personalized')}
                      >
                        <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md bg-emerald-50 px-2 py-1.5 text-left transition-colors duration-200 hover:bg-emerald-100">
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                            Personalized ({personalizedRhymes.length})
                          </span>
                          {expandedBuckets[buildBucketKey(division, pageKey, subjectKey, 'personalized')] !== false ? (
                            <ChevronDown className="h-3.5 w-3.5 text-emerald-700" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5 text-emerald-700" />
                          )}
                        </CollapsibleTrigger>
                        <CollapsibleContent className="mt-1 space-y-1">
                          {personalizedRhymes.map((rhyme) => renderRhymeRow(rhyme, 'personalized'))}
                        </CollapsibleContent>
                      </Collapsible>
                    )}
                    {nonPersonalizedRhymes.length > 0 && (
                      <Collapsible
                        open={expandedBuckets[buildBucketKey(division, pageKey, subjectKey, 'nonPersonalized')] !== false}
                        onOpenChange={() => toggleBucket(division, pageKey, subjectKey, 'nonPersonalized')}
                      >
                        <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md bg-slate-100 px-2 py-1.5 text-left transition-colors duration-200 hover:bg-slate-200">
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                            Non-Personalized ({nonPersonalizedRhymes.length})
                          </span>
                          {expandedBuckets[buildBucketKey(division, pageKey, subjectKey, 'nonPersonalized')] !== false ? (
                            <ChevronDown className="h-3.5 w-3.5 text-slate-600" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5 text-slate-600" />
                          )}
                        </CollapsibleTrigger>
                        <CollapsibleContent className="mt-1 space-y-1">
                          {nonPersonalizedRhymes.map((rhyme) => renderRhymeRow(rhyme, 'nonPersonalized'))}
                        </CollapsibleContent>
                      </Collapsible>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            );
          }

          const groupedBySubject = visibleRhymes.reduce((acc, rhyme) => {
            const subjectKey = normalizeLanguageKey(rhyme?.subject) || 'english';
            if (!acc[subjectKey]) {
              acc[subjectKey] = [];
            }
            acc[subjectKey].push(rhyme);
            return acc;
          }, {} as Record<string, TreeMenuRhyme[]>);

          const subjectsPresent = Object.keys(groupedBySubject);
          const preferredSubjects = languageUi.order.filter(
            (subjectKey) => (groupedBySubject[subjectKey] || []).length > 0
          );
          const extraSubjects = subjectsPresent
            .filter((subjectKey) => !preferredSubjects.includes(subjectKey))
            .sort((a, b) => a.localeCompare(b));
          const orderedSubjects = [...preferredSubjects, ...extraSubjects];

          return (
            <Collapsible key={groupStateKey} open={Boolean(expandedGroups[groupStateKey])} onOpenChange={() => toggleGroup(division, pageKey)}>
              <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg p-3 text-left transition-colors duration-200 hover:bg-white/50">
                <span className="flex items-center gap-2 font-medium text-gray-700">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-r from-orange-400 to-red-400 text-xs font-bold text-white">
                    {pageKey}
                  </div>
                  {pageKey} Page{parseFloat(pageKey) !== 1 ? 's' : ''} ({rhymes.length})
                </span>
                {expandedGroups[groupStateKey] ? (
                  <ChevronDown className="h-4 w-4 text-gray-500" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-gray-500" />
                )}
              </CollapsibleTrigger>              
              <CollapsibleContent className="pl-4">
                <div className="mt-2 space-y-2">
                  {orderedSubjects.map((subjectKey) => {
                    const subjectRhymes = groupedBySubject[subjectKey] || [];
                    const subjectStateKey = buildSubjectKey(division, pageKey, subjectKey);
                    //filrering non-p and p rhymes
                    const personalizedRhymes = subjectRhymes.filter(
                      (rhyme) =>  isPersonalizedValue(rhyme?.personalized)
                    );
                    const nonPersonalizedRhymes = subjectRhymes.filter(
                      (rhyme) => !isPersonalizedValue(rhyme?.personalized)
                    );
                    const renderRhymeRow = (rhyme: TreeMenuRhyme, bucket: 'personalized' | 'nonPersonalized') => {
                      const resolvedCode = resolveTreeMenuItemCode(rhyme);
                      const safeRhyme: TreeMenuRhyme = resolvedCode ? { ...rhyme, code: resolvedCode } : rhyme;

                      return (
                        <button
                          key={resolvedCode || rhyme.code}
                          type="button"
                          onClick={() => onRhymeSelect(safeRhyme, { bucket })}
                          className="group flex w-full items-center justify-between gap-3 rounded-lg border border-transparent bg-white/50 p-3 text-left transition-all duration-200 hover:border-orange-200 hover:bg-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300"
                          aria-label={`Select ${rhyme.name}`}
                        >
                          <div className="flex-1">
                            <p className="font-medium text-gray-800 transition-colors duration-200 group-hover:text-orange-600">{rhyme.name}</p>
                            <p className="mt-1 text-xs text-gray-500">
                              {rhyme.used_in_grades && rhyme.used_in_grades.length > 0 && (
                                <span className="ml-2 text-blue-600">(Used in: {rhyme.used_in_grades.join(', ')})</span>
                              )}
                            </p>
                          </div>
                          <span
                            className="shrink-0 rounded-full border border-orange-200 bg-white/70 p-2 text-orange-500 transition-colors duration-200 group-hover:border-orange-300 group-hover:text-orange-600"
                            aria-hidden="true"
                          >
                            <Plus className="h-4 w-4" />
                          </span>
                        </button>
                      );
                    };
                    return (
                      <Collapsible
                        key={subjectStateKey}
                        open={expandedSubjects[subjectStateKey] !== false}
                        onOpenChange={() => toggleSubject(division, pageKey, subjectKey)}
                      >
                        <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-left transition-colors duration-200 hover:bg-slate-100">
                          <span className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                            {resolveSubjectLabel(subjectKey)} ({subjectRhymes.length})
                          </span>
                          {expandedSubjects[subjectStateKey] !== false ? (
                            <ChevronDown className="h-4 w-4 text-gray-500" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-gray-500" />
                          )}
                        </CollapsibleTrigger>
                        <CollapsibleContent className="mt-1 space-y-2">
                          {personalizedRhymes.length > 0 && (
                            <Collapsible
                              open={expandedBuckets[buildBucketKey(division, pageKey, subjectKey, 'personalized')] !== false}
                              onOpenChange={() => toggleBucket(division, pageKey, subjectKey, 'personalized')}
                            >
                              <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md bg-emerald-50 px-2 py-1.5 text-left transition-colors duration-200 hover:bg-emerald-100">
                                <span className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                                  Personalized ({personalizedRhymes.length})
                                </span>
                                {expandedBuckets[buildBucketKey(division, pageKey, subjectKey, 'personalized')] !== false ? (
                                  <ChevronDown className="h-3.5 w-3.5 text-emerald-700" />
                                ) : (
                                  <ChevronRight className="h-3.5 w-3.5 text-emerald-700" />
                                )}
                              </CollapsibleTrigger>
                              <CollapsibleContent className="mt-1 space-y-1">
                                {personalizedRhymes.map((rhyme) => renderRhymeRow(rhyme, 'personalized'))}
                              </CollapsibleContent>
                            </Collapsible>
                          )}
                          {nonPersonalizedRhymes.length > 0 && (
                            <Collapsible
                              open={expandedBuckets[buildBucketKey(division, pageKey, subjectKey, 'nonPersonalized')] !== false}
                              onOpenChange={() => toggleBucket(division, pageKey, subjectKey, 'nonPersonalized')}
                            >
                              <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md bg-slate-100 px-2 py-1.5 text-left transition-colors duration-200 hover:bg-slate-200">
                                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                                  Non-Personalized ({nonPersonalizedRhymes.length})
                                </span>
                                {expandedBuckets[buildBucketKey(division, pageKey, subjectKey, 'nonPersonalized')] !== false ? (
                                  <ChevronDown className="h-3.5 w-3.5 text-slate-600" />
                                ) : (
                                  <ChevronRight className="h-3.5 w-3.5 text-slate-600" />
                                )}
                              </CollapsibleTrigger>
                              <CollapsibleContent className="mt-1 space-y-1">
                                {nonPersonalizedRhymes.map((rhyme) => renderRhymeRow(rhyme, 'nonPersonalized'))}
                              </CollapsibleContent>
                            </Collapsible>
                          )}
                        </CollapsibleContent>
                      </Collapsible>
                    );
                  })}
                </div>
              </CollapsibleContent>
            </Collapsible>
          );
                    })}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </div>
        )}
      </div>
    </div>
  );
};

//Rhymeselection page
type RhymeSelectionPageprops={
  school:SchoolProfile | null,
  grade:string|null,
  customGradeName:string|null,
  onBack?: () => void,
  onLogout?:()=>void,
  isReadOnly:boolean,
  isFrozen:boolean,
  isSuperAdmin:boolean,
  onRhymeFreezeChange: React.Dispatch<React.SetStateAction<boolean>>;



}
// Main Rhyme Selection Interface
const RhymeSelectionPage = ({
  school,
  grade,
  customGradeName,
  onBack,
  onLogout,
  isReadOnly = false,
  isFrozen = false,
  isSuperAdmin = false,
  onRhymeFreezeChange
}:RhymeSelectionPageprops) => {
  
   
  const [availableRhymes, setAvailableRhymes] = useState({});
  const [reusableRhymes, setReusableRhymes] = useState({});
  const [rhymeSettings, setRhymeSettings] = useState<any>(null);
  const [selectedRhymes, setSelectedRhymes] = useState([]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [showTreeMenu, setShowTreeMenu] = useState(false);
  const [showReusable, setShowReusable] = useState(false);
  const [currentPosition, setCurrentPosition] = useState<null | 'top' | 'bottom'>(null);
  const [loading, setLoading] = useState(true);
  const [freezeActionPending, setFreezeActionPending] = useState<null | 'freeze' | 'unfreeze'>(null);
  const [removeRhymePending, setRemoveRhymePending] = useState<{ top: boolean; bottom: boolean }>({
    top: false,
    bottom: false
  });
  const [swapAcrossPagesActive, setSwapAcrossPagesActive] = useState(false);
  const [swapAcrossPagesSource, setSwapAcrossPagesSource] = useState<null | { pageIndex: number }>(null);
  const [swapAcrossPagesPending, setSwapAcrossPagesPending] = useState(false);
  const [submitBlankRedirectActive, setSubmitBlankRedirectActive] = useState(false);
  const [hasFreezeField, setHasFreezeField] = useState(false);
  const [gradePersonalisationValue, setGradePersonalisationValue] = useState<'yes' | 'no' | null>(null);
  const [deletePageDialogOpen, setDeletePageDialogOpen] = useState(false);
  const [deletePageRequest, setDeletePageRequest] = useState<null | { pageIndex: number; span: number }>(null);
  const [deletePagePending, setDeletePagePending] = useState(false);
  const [lastDeletedPageIndex, setLastDeletedPageIndex] = useState<null | number>(null);
  // Enables a one-time trailing blank page after hitting a submit milestone (24/28/32/…).
  // This avoids showing an extra navigation page by default (which confuses counts), while
  // still letting users continue past a milestone when they choose to.
  const [milestoneContinuePages, setMilestoneContinuePages] = useState<null | number>(null);
  const navigate = useNavigate();
  const { getIdToken, user } = useAuth();
  const [useCartoonVariantForGrade, setUseCartoonVariantForGrade] = useState(false);
  const freezeToastShown = useRef(false); 
  const submitBlankRedirectToastShown = useRef(false);
  const gradePersonalisationRef = useRef<'yes' | 'no' | null>(null);
  const selectedRhymesRef = useRef([]);
  const pendingPositionRef = useRef<null | 'top' | 'bottom'>(null);
  const rhymeSelectOpRef = useRef(0);
  const pageFetchPromisesRef = useRef(new Map());

  const MAX_PAGES_PER_GRADE = MAX_RHYME_PAGES;

  const toggleSwapAcrossPages = () => {
    if (!ensureEditable()) {
      return;
    }

    // First click: arm swap mode and capture the source page.
    if (!swapAcrossPagesActive) {
      setSwapAcrossPagesSource({ pageIndex: Number(currentPageIndex) });
      setSwapAcrossPagesActive(true);
      toast.info('Swap mode: go to the page you want to swap with and click "Swap pages" again.');
      return;
    }

    // Second click: if user is still on the same page, treat as cancel.
    if (!swapAcrossPagesSource || swapAcrossPagesSource.pageIndex === Number(currentPageIndex)) {
      setSwapAcrossPagesSource(null);
      setSwapAcrossPagesActive(false);
      return;
    }

    // Second click on a different page: perform a page↔page swap (keeps multi-page rhymes intact).
    void (async () => {
      try {
        setSwapAcrossPagesPending(true);
        const token = await getIdToken?.();
        await axios.patch(
          `${API}/rhymes/swap-pages/${school?.school_id}/${grade}`,
          {
            a_page_index: swapAcrossPagesSource.pageIndex,
            b_page_index: Number(currentPageIndex)
          },
          { headers: { Authorization: `Bearer ${token}` } }
        );

        toast.success('Swapped pages.');
        await fetchSelectedRhymes({ preferredPageIndex: Number(currentPageIndex) });
      } catch (error) {
        console.error('Error swapping pages:', error);
        toast.error('Unable to swap pages.');
      } finally {
        setSwapAcrossPagesPending(false);
        setSwapAcrossPagesSource(null);
        setSwapAcrossPagesActive(false);
      }
    })();
  };

  // Note: "swap across pages" now swaps entire pages (or multi-page blocks),
  // not half-page slots. The old half-slot swapping code has been removed.
  
  useEffect(() => {
   
    selectedRhymesRef.current = Array.isArray(selectedRhymes) ? selectedRhymes : [];
  }, [selectedRhymes]);
  
  const physicalPageMetrics = useMemo(() => {
    const usageMap = new Map<number, { top: boolean; bottom: boolean }>();
    let highestIndex = -1;

    if (Array.isArray(selectedRhymes)) {
      selectedRhymes.forEach((selection: any) => {
        if (!selection) return;
        const startIndex = Number(selection?.page_index);
        if (!Number.isFinite(startIndex) || startIndex < 0) return;

        const rawPages = selection?.pages;
        const parsedPages =
          typeof rawPages === 'number'
            ? (Number.isFinite(rawPages) ? rawPages : null)
            : typeof rawPages === 'string'
              ? (() => {
                  const trimmed = rawPages.trim();
                  if (!trimmed) return null;
                  const value = Number(trimmed);
                  return Number.isFinite(value) ? value : null;
                })()
              : null;

        const pagesValue = parsedPages && parsedPages > 0 ? parsedPages : 1;

        if (pagesValue === 0.5) {
          const entry = usageMap.get(startIndex) || { top: false, bottom: false };
          const pos = (selection?.position ?? 'top').toString().trim().toLowerCase();
          const slot = pos === 'bottom' ? 'bottom' : 'top';
          entry[slot] = true;
          usageMap.set(startIndex, entry);
          highestIndex = Math.max(highestIndex, startIndex);
          return;
        }

        const totalPages = pagesValue > 1 ? Math.max(1, Math.round(pagesValue)) : 1;
        for (let offset = 0; offset < totalPages && startIndex + offset < MAX_PAGES_PER_GRADE; offset += 1) {
          const index = startIndex + offset;
          const entry = usageMap.get(index) || { top: false, bottom: false };
          entry.top = true;
          entry.bottom = true;
          usageMap.set(index, entry);
          highestIndex = Math.max(highestIndex, index);
        }
      });
    }

    const physicalPages = highestIndex >= 0 ? Math.min(highestIndex + 1, MAX_PAGES_PER_GRADE) : 0;

    let hasBlanks = false;
    if (highestIndex >= 0) {
      for (let index = 0; index <= highestIndex; index += 1) {
        const entry = usageMap.get(index);
        if (!entry || !entry.top || !entry.bottom) {
          hasBlanks = true;
          break;
        }
      }
    }

    let filledPages = 0;
    if (highestIndex >= 0) {
      for (let index = 0; index <= highestIndex; index += 1) {
        const entry = usageMap.get(index);
        if (!entry) continue;
        if (entry.top && entry.bottom) {
          filledPages += 1;
        } else if (entry.top || entry.bottom) {
          filledPages += 0.5;
        }
      }
    }

    return { usageMap, highestIndex, physicalPages, filledPages, hasBlanks };
  }, [MAX_PAGES_PER_GRADE, selectedRhymes]);

  const selectedPages = physicalPageMetrics.physicalPages;

  const isSubmitMilestone =
    selectedPages >= 24 &&
    selectedPages % 4 === 0 &&
    selectedPages <= MAX_PAGES_PER_GRADE;

  const canSaveAndSubmit =
    selectedPages >= 24 &&
    selectedPages % 4 === 0 &&
    selectedPages <= MAX_PAGES_PER_GRADE;
  //calculating page hint for  prompting user.
    const pageCountHint = (() => {
    if (selectedPages <= 0) return null;

    const minPages = 24;
    const nearMinThreshold = 20;
    const nearMaxThreshold = 4;

    if (selectedPages < minPages) {
      if (selectedPages < nearMinThreshold) return null;
      const needed = Math.ceil(minPages - selectedPages);
      return `Add ${needed} page${needed === 1 ? '' : 's'} to reach ${minPages} and submit.`;
    }

    const remaining = Math.max(0, MAX_PAGES_PER_GRADE - selectedPages);
    if (remaining > 0 && remaining <= nearMaxThreshold) {
      return `Only ${remaining} page${remaining === 1 ? '' : 's'} left (maximum ${MAX_PAGES_PER_GRADE}).`;
    }

    return null;
  })();
  // console.log(canSaveAndSubmit)
  const normalizeAssetSubject = useCallback((value: unknown) => {
    return normalizeLanguageKey(value);
  }, []);
  // console.log(selectedPages)
  const buildRhymePreviewUrls = useCallback(
    (
      rhymeLike: any,
      options?: { bucket?: 'personalized' | 'nonPersonalized'; cartoonVariantForGrade?: boolean }
    ): string[] => {
      const code = (rhymeLike?.code || rhymeLike?.rhyme_code || '').toString().trim();
      if (!code) {
        return [];
      }

      const subject = normalizeAssetSubject(rhymeLike?.subject);
      const rawPages = rhymeLike?.pages;
      const parsedPages =
        typeof rawPages === 'number'
          ? (Number.isFinite(rawPages) ? rawPages : null)
          : typeof rawPages === 'string'
            ? (() => {
                const trimmed = rawPages.trim();
                if (!trimmed) return null;
                const value = Number(trimmed);
                return Number.isFinite(value) ? value : null;
              })()
            : null;
      const normalizedPages =
        parsedPages && Number.isFinite(parsedPages) && parsedPages > 0 ? parsedPages : 1;
      const pageCount = normalizedPages > 1 ? Math.max(1, Math.round(normalizedPages)) : 1;

      const isPersonalizedBucket = options?.bucket === 'personalized';
      const useCartoonVariant =
        typeof options?.cartoonVariantForGrade === 'boolean'
          ? options.cartoonVariantForGrade
          : useCartoonVariantForGrade;
      const bucketFolder = isPersonalizedBucket ? 'personalised' : 'non_personalised';

      const parts = [PUBLIC_URL_PREFIX,"rhymes", subject, bucketFolder];
      if (isPersonalizedBucket) {
        parts.push(useCartoonVariant ? 'cartoon' : 'non_cartoon');
      }

      const base = parts.join('/').replace(/\/+/g, '/');

      if (pageCount > 1) {
        return Array.from({ length: pageCount }, (_, idx) =>
          normalizeAssetUrl(`${base}/${code}/${idx + 1}.png`)
        );
      }

      return [normalizeAssetUrl(`${base}/${code}.png`)];
    },
    [grade, normalizeAssetSubject, useCartoonVariantForGrade]
  );
  
  const applyGradePersonalisation = useCallback((value: 'yes' | 'no' | null) => {
    gradePersonalisationRef.current = value;
    setGradePersonalisationValue(value);
    setUseCartoonVariantForGrade(value === 'no');
  }, []);

  const fetchGradePersonalisationValue = useCallback(async () => {
    if (!school?.school_id || !grade || !user) {
      applyGradePersonalisation(null);
      return null;
    }

    try {
      const token = await getIdToken?.();
      if (!token) {
        return null;
      }
      const headers = { Authorization: `Bearer ${token}` };
      const response = await axios.get(`${API}/book-selections/${school.school_id}`, {
        headers,
        validateStatus: () => true,
      });

      if (response.status >= 400) {
        return null;
      }
      const classes = Array.isArray(response.data?.classes) ? response.data.classes : [];
      const normalizedGrade = grade.toString().trim().toLowerCase();
      const match = classes.find((entry: any) => {
        const raw = (entry?.class || entry?.doc_id || '').toString().trim().toLowerCase();
        return raw === normalizedGrade;
      });
      const value = normalizeGradePersonalisationValue(
        match?.personalisation ?? match?.personalization
      );
      applyGradePersonalisation(value);
      return value;
    } catch (error) {
      console.warn('Unable to load grade personalisation value', error);
      return null;
    }
  }, [API, applyGradePersonalisation, getIdToken, grade, school?.school_id, user]);
  

  const ensureEditable = useCallback(() => {
    if (isReadOnly) {
      toast.info(isFrozen ? 'Selections are frozen. Viewing only.' : 'Viewing only.');
      return false;
    }
    return true;
  }, [isReadOnly, isFrozen]);

  // const applyCartoonHeadToSvg = useCallback((svgMarkup) => {
  //   if (typeof svgMarkup !== 'string' || svgMarkup.trim().length === 0) {
  //     return svgMarkup;
  //   }

  //   if (typeof window === 'undefined' || typeof window.DOMParser === 'undefined') {
  //     return svgMarkup;
  //   }

  //   try {
  //     const parser = new window.DOMParser();
  //     const documentNode = parser.parseFromString(svgMarkup, 'image/svg+xml');
  //     const svgElement = documentNode.documentElement;
  //     if (!svgElement) {
  //       return svgMarkup;
  //     }

  //     const cartoonDataUri =
  //       'data:image/svg+xml;utf8,' +
  //       encodeURIComponent(
  //         '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80">' +
  //         '<circle cx="40" cy="40" r="34" fill="#FFD166" stroke="#EF476F" stroke-width="4"/>' +
  //         '<circle cx="28" cy="33" r="4" fill="#073B4C"/>' +
  //         '<circle cx="52" cy="33" r="4" fill="#073B4C"/>' +
  //         '<path d="M24 50 Q40 64 56 50" stroke="#073B4C" stroke-width="5" fill="none" stroke-linecap="round"/>' +
  //         '</svg>'
  //       );

  //     let replaced = false;
  //     const selectors = [
  //       'image[id*="head" i]',
  //       'image[class*="head" i]',
  //       'image[id*="face" i]',
  //       'image[class*="face" i]',
  //       'image[href*="head" i]',
  //       'image[href*="face" i]',
  //       'image[src*="head" i]',
  //       'image[src*="face" i]',
  //       'image[xlink\\:href*="head" i]',
  //       'image[xlink\\:href*="face" i]',
  //       'img[id*="head" i]',
  //       'img[class*="head" i]',
  //       'img[id*="face" i]',
  //       'img[class*="face" i]',
  //       'img[src*="head" i]',
  //       'img[src*="face" i]'
  //     ];
  //     const imageNodes = documentNode.querySelectorAll(selectors.join(','));
  //     imageNodes.forEach((node) => {
  //       node.setAttribute('href', cartoonDataUri);
  //       node.setAttribute('xlink:href', cartoonDataUri);
  //       node.setAttribute('src', cartoonDataUri);
  //       node.setAttribute('data-href', cartoonDataUri);
  //       replaced = true;
  //     });

  //     if (!replaced) {
  //       const badge = documentNode.createElementNS('http://www.w3.org/2000/svg', 'g');
  //       badge.setAttribute('data-cartoon-head', 'true');
  //       badge.innerHTML =
  //         '<circle cx="44" cy="44" r="28" fill="#FFD166" stroke="#EF476F" stroke-width="4"/>' +
  //         '<circle cx="34" cy="38" r="3.5" fill="#073B4C"/>' +
  //         '<circle cx="54" cy="38" r="3.5" fill="#073B4C"/>' +
  //         '<path d="M31 51 Q44 61 57 51" stroke="#073B4C" stroke-width="4" fill="none" stroke-linecap="round"/>';

  //       const viewBox = svgElement.getAttribute('viewBox');
  //       let x = 12;
  //       let y = 12;
  //       if (viewBox) {
  //         const values = viewBox.split(/[\s,]+/).map((entry) => Number(entry));
  //         if (values.length >= 4 && values.every((entry) => Number.isFinite(entry))) {
  //           x = values[0] + 10;
  //           y = values[1] + 10;
  //         }
  //       }
  //       badge.setAttribute('transform', `translate(${x}, ${y}) scale(0.7)`);
  //       svgElement.appendChild(badge);
  //     }

  //     const serialized = new window.XMLSerializer().serializeToString(svgElement);
  //     return serialized || svgMarkup;
  //   } catch (error) {
  //     console.error('Failed to apply cartoon-head transformation:', error);
  //     return svgMarkup;
  //   }
  // }, []);

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
        const urls = Array.isArray(rhyme?.imageUrls) ? rhyme.imageUrls : [];
        const hasUrls = urls.length > 0;
        const isLoaded = Boolean(rhyme?.imageLoaded);
        const isFailed = Boolean(rhyme?.imageLoadFailed);
        const isPending = Boolean(rhyme?.imageFetchPending);
        return !isPending && !isLoaded && !isFailed && (hasUrls || typeof rhyme?.code === 'string');
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
        if (typeof window === 'undefined') {
          return;
        }

        setSelectedRhymes((prev) => {
          const prevArray = Array.isArray(prev) ? prev : [];
          const updated = prevArray.map((existing) => {
            if (!existing) return existing;
            if (Number(existing.page_index) !== normalizedPageIndex) {
              return existing;
            }
            const shouldMarkPending = missingRhymes.some(
              (rhyme) => rhyme?.code && rhyme.code === existing.code
            );
            if (!shouldMarkPending) {
              return existing;
            }
            return {
              ...existing,
              imageFetchPending: true,
              imageLoaded: false,
              imageLoadFailed: false
            };
          });
          selectedRhymesRef.current = updated;
          return updated;
        });

        const results = await Promise.all(
          missingRhymes.map(async (rhyme) => {
            const gradePersonalisation = gradePersonalisationRef.current ?? gradePersonalisationValue;
            const rhymeIsPersonalized = isPersonalizedValue(rhyme?.personalized);
            const bucket = rhymeIsPersonalized ? 'personalized' : 'nonPersonalized';
            const urls = Array.isArray(rhyme?.imageUrls) && rhyme.imageUrls.length > 0
              ? rhyme.imageUrls
              : buildRhymePreviewUrls(rhyme, {
                  bucket,
                  cartoonVariantForGrade: gradePersonalisation === 'no'
                });
            const firstUrl = urls[0] || '';

            if (!firstUrl) {
              return { code: rhyme?.code, page_index: rhyme?.page_index, urls, loaded: false, loadedUrl: '' };
            }

            const loaded = await new Promise<boolean>((resolve) => {
              const probe = new Image();
              probe.onload = () => resolve(true);
              probe.onerror = () => resolve(false);
              probe.src = firstUrl;
            });

            return { code: rhyme?.code, page_index: rhyme?.page_index, urls, loaded, loadedUrl: loaded ? firstUrl : '' };
          })
        );

        setSelectedRhymes((prev) => {
          const prevArray = Array.isArray(prev) ? prev : [];
          const updated = prevArray.map((existing) => {
            if (!existing) return existing;
            if (Number(existing.page_index) !== normalizedPageIndex) {
              return existing;
            }

            const match = results.find(
              (result) =>
                result.code === existing.code &&
                Number(result.page_index) === Number(existing.page_index)
            );

            if (!match) {
              return existing;
            }

            return {
              ...existing,
              imageUrls: Array.isArray(match.urls) ? match.urls : existing.imageUrls,
              imageLoaded: Boolean(match.loaded),
              imageLoadFailed: !match.loaded,
              imageFetchPending: false,
              imageLoadedUrl: match.loadedUrl || ''
            };
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
    [buildRhymePreviewUrls]
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
    
    
    for (let index = 0; index <MAX_PAGES_PER_GRADE; index += 1) {
      
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

  const computeBlankSlotsInSequenceFromUsage = ({ usageMap, highestIndex }) => {
    
    const normalizedHighest = Number.isFinite(highestIndex) ? highestIndex : -1;
    if (normalizedHighest < 0) {
      return [];
    }

    const blanks: Array<{ pageIndex: number; missing: Array<'top' | 'bottom'> }> = [];

    for (let index = 0; index <= normalizedHighest; index += 1) {
      const entry = usageMap.get(index);
      if (!entry) {
        blanks.push({ pageIndex: index, missing: ['top', 'bottom'] });
        continue;
      }

      const missing: Array<'top' | 'bottom'> = [];
      if (!entry.top) missing.push('top');
      if (!entry.bottom) missing.push('bottom');
      if (missing.length > 0) {
        blanks.push({ pageIndex: index, missing });
      }
    }

    return blanks;
  };

  // const computeNextAvailablePageInfo = (rhymesList = selectedRhymes) => {
  //   const usage = computePageUsage(rhymesList);
  //   const info = computeNextAvailablePageInfoFromUsage(usage);
  //   return {
  //     ...info,
  //     lowestIndex: usage.lowestIndex
  //   };
  // };
   const updateFreezeFlag = useCallback(
    (freeze: boolean) => {
      if (typeof onRhymeFreezeChange === 'function') {
        onRhymeFreezeChange(freeze);
      }
    },
    [onRhymeFreezeChange]
  );

  const freezeStatusRequestKeyRef = useRef<string>('');
  const freezeStatusInFlightRef = useRef<Promise<void> | null>(null);
  const fetchfreezestatus = useCallback(async () => {
    if (!user || !school?.school_id || !grade) {

      return;
    }

    const requestKey = `${school.school_id}__${grade}`;
    if (freezeStatusInFlightRef.current && freezeStatusRequestKeyRef.current === requestKey) {
      await freezeStatusInFlightRef.current;
      return;
    }

    freezeStatusRequestKeyRef.current = requestKey;

    const run = (async () => {
      try {
        const token = await getIdToken?.();
        
        if (!token) {
          throw new Error('Missing auth token');
        }

        const res = await axios.get(`${API}/rhymes/freeze/${school.school_id}/${grade}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.status >= 400) {
          throw new Error(`Freeze status request failed (${res.status})`);
        }

        const payload = (res.data as any) || {};
        const rawFreeze = payload?.freeze;
        
        
        if (payload?.has_freeze_field){
          setHasFreezeField(true)
        }
        

        const normalizedFreeze =
          rawFreeze === true ||
          rawFreeze === 'true' ||
          rawFreeze === 1 ||
          rawFreeze === '1' ||
          (typeof rawFreeze === 'string' && rawFreeze.trim().toLowerCase() === 'yes');

        updateFreezeFlag(normalizedFreeze);
      } catch (error) {
        console.error(error);
      }
    })();

    freezeStatusInFlightRef.current = run;
    try {
      await run;
    } finally {
      if (freezeStatusInFlightRef.current === run) {
        freezeStatusInFlightRef.current = null;
      }
    }
  }, [API, getIdToken, grade, school?.school_id, updateFreezeFlag, user]);
  const fetchAvailableRhymes = async () => {
    try {
      const response = await axios.get(`${API}/rhymes/available/${school?.school_id}/${grade}`);
      setAvailableRhymes(response.data);
    } catch (error) {
      console.error('Error fetching available rhymes:', error);
    }
  };

  const fetchRhymeSettings = async () => {
    try {
      const response = await axios.get(`${API}/rhymes/settings`);
      setRhymeSettings(response.data);
    } catch (error) {
      console.error('Error fetching rhyme settings:', error);
    }
  };

  const fetchReusableRhymes = async () => {
    try {
      const response = await axios.get(`${API}/rhymes/selected/other-grades/${school?.school_id}/${grade}`);
      setReusableRhymes(response.data);
    } catch (error) {
      console.error('Error fetching reusable rhymes:', error);
    }
  };

  const fetchSelectedRhymes = async (options?: { preferredPageIndex?: number | null; gradePersonalisation?: 'yes' | 'no' | null }) => {
    try {
      const response = await axios.get(`${API}/rhymes/selected/${school?.school_id}/${grade}`);
      const gradeSelections = response.data[grade] || [];
      const rhymesWithPlaceholders = gradeSelections.map((rhyme) => {
        const gradePersonalisation =
          options?.gradePersonalisation ?? gradePersonalisationRef.current ?? gradePersonalisationValue;
        const rhymeIsPersonalized = isPersonalizedValue(rhyme?.personalized);
        const bucket = rhymeIsPersonalized ? 'personalized' : 'nonPersonalized';
        const cartoonVariantForGrade = gradePersonalisation === 'no';
        const imageUrls = buildRhymePreviewUrls(rhyme, {
          bucket,
          cartoonVariantForGrade
        });

        return {
          ...rhyme,
          position: rhyme.position || null,
          bucket,
          imageUrls,
          imageLoaded: false,
          imageLoadedUrl: '',
          imageFetchPending: false,
          imageLoadFailed: false,
          svgContent: null,
          svgFetchFailed: false
        };
      });
    

      const sortedSelections = sortSelections(rhymesWithPlaceholders);
      const usage = computePageUsage(sortedSelections);
      const nextInfo = computeNextAvailablePageInfoFromUsage(usage);
      const hasExistingSelections = Array.isArray(sortedSelections) && sortedSelections.length > 0;

      const preferredIndexRaw =
        options && Number.isFinite(options.preferredPageIndex) ? Number(options.preferredPageIndex) : null;
      const highestIndex = Number.isFinite(usage.highestIndex) ? Number(usage.highestIndex) : -1;
      const initialIndexCandidate =
        preferredIndexRaw !== null
          ? preferredIndexRaw
          : (
              hasExistingSelections && Number.isFinite(usage.lowestIndex) && usage.lowestIndex >= 0
                ? usage.lowestIndex
                : (Number.isFinite(nextInfo.index) ? nextInfo.index : 0)
            );
      const maxSelectionIndex = Math.max(0, highestIndex);
      const initialIndex = preferredIndexRaw !== null
        ? Math.max(0, Math.min(MAX_PAGES_PER_GRADE - 1, Math.min(initialIndexCandidate, maxSelectionIndex)))
        : Math.max(0, Math.min(MAX_PAGES_PER_GRADE - 1, initialIndexCandidate));

      setSelectedRhymes(sortedSelections);
      selectedRhymesRef.current = sortedSelections;
      setCurrentPageIndex(initialIndex);

      if (hasExistingSelections) {
        try {
          await ensurePageAssets(initialIndex, sortedSelections);
        } catch (prefetchError) {
          console.error('Error preloading initial rhyme images:', prefetchError);
        }

        const nextPageIndex = initialIndex + 1;
        if (nextPageIndex <= MAX_PAGES_PER_GRADE) {
          ensurePageAssets(nextPageIndex, sortedSelections).catch((prefetchError) => {
            console.error('Error preloading upcoming rhyme images:', prefetchError);
          });
        }
      }
    } catch (error) {
      console.error('Error fetching selected rhymes:', error);
    }
    finally{
      setLoading(false)
    }
  };

useEffect(() => {
  if (loading) return;

  if (!isFrozen) {
    freezeToastShown.current = false;
    return;
  }

  if (freezeToastShown.current) return;

  toast.error('rhyme selections are approved and freezed contact admin for changes');
  freezeToastShown.current = true;
}, [isFrozen, loading]);

 useEffect(()=>{
 fetchfreezestatus()
  

 },[isFrozen])
  useEffect(() => {
    // `fetchfreezestatus()` depends on the auth context (user + getIdToken). On a hard refresh,
    // the first render can run before auth is hydrated; include `user` in deps so we re-run
    // once auth is available and freeze state is fetched correctly.
    if (!school?.school_id || !grade || !user) {
      setLoading(false);
      return;
    }

    setLoading(true);

    const loadRhymeData = async () => {
      try {
        const gradePersonalisation = await fetchGradePersonalisationValue();
        await Promise.all([
         fetchfreezestatus(),
          fetchRhymeSettings(),
          fetchAvailableRhymes(),
          fetchReusableRhymes(),
          fetchSelectedRhymes({ gradePersonalisation })
          
        ]);
          
        
      } catch (error) {
        console.error('Error loading rhyme data:', error);
        setLoading(false);
      
      }

      
      
      
    };

    void loadRhymeData();
  }, [fetchGradePersonalisationValue, grade, school?.school_id, user]);



  const handleSaveAndSubmit = useCallback(async () => {
    if (!school?.school_id) {
      toast.error('School information is missing.');
      return;
    }
    if (freezeActionPending) {
      return;
    }

    if (selectedPages < 24) {
      toast.error('Please select at least 24 pages before submitting.');
      return;
    }

    if (selectedPages % 4 !== 0) {
      const lower = Math.floor(selectedPages / 4) * 4;
      const higher = Math.min(MAX_PAGES_PER_GRADE, Math.ceil(selectedPages / 4) * 4);
      const targets = [lower, higher].filter((n) => n >= 24 && n <= MAX_PAGES_PER_GRADE);
      const uniqueTargets = Array.from(new Set(targets)).sort((a, b) => a - b);
      const suggestion =
        uniqueTargets.length === 0
          ? `Submit at 24/28/…/${MAX_PAGES_PER_GRADE} pages.`
          : uniqueTargets.length === 1
            ? `Submit at ${uniqueTargets[0]} pages.`
            : `Submit at ${uniqueTargets.join(' or ')} pages.`;
      toast.error(`${suggestion} Remove selections from the last page to reduce, or continue selecting to reach the next multiple of 4.`);
      return;
    }

    const usage = computePageUsage(selectedRhymesRef.current);
    const nextInfo = computeNextAvailablePageInfoFromUsage(usage);
    const blanks = computeBlankSlotsInSequenceFromUsage(usage);

    if (blanks.length > 0) {
      submitBlankRedirectToastShown.current = false;
      setSubmitBlankRedirectActive(true);
      const formatted = blanks
        .slice(0, 6)
        .map((blank) => `${blank.pageIndex + 1}`)
        .join(', ');
      const suffix = blanks.length > 6 ? '…' : '';
      toast.error(`Please select rhymes for page no: ${formatted}${suffix}`);

      const firstBlankIndex = blanks[0].pageIndex;
      if (Number.isFinite(firstBlankIndex) && firstBlankIndex >= 0) {
        setCurrentPageIndex(firstBlankIndex);
        ensurePageAssets(firstBlankIndex, selectedRhymesRef.current).catch((assetError) => {
          console.error('Error loading rhyme images for page:', assetError);
        });
      }
      return;
    }
    
    if (submitBlankRedirectActive) {
      setSubmitBlankRedirectActive(false);
    }

    try {
      setFreezeActionPending('freeze');
      const token = await getIdToken?.();
      const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
      const response = await axios.patch(
        `${API}/rhymes/freeze/${school.school_id}/${grade}`,
        {
          freeze: true,
          updated_by: user?.uid,
          updated_by_email: user?.email,
        },
        { headers, validateStatus: () => true }
      );

      if (response.status >= 400) {
        toast.error('Unable to freeze selections.');
        return;
      }
        
      updateFreezeFlag(true);
      // toast.info("selections are approved and freezed. contact admin for further changes")
    } catch (error) {
      console.error('Error freezing selections:', error);
      toast.error('Unable to freeze selections. Please try again.');
    } finally {
      setFreezeActionPending(null);
    }
  }, [API, MAX_PAGES_PER_GRADE, ensurePageAssets, freezeActionPending, getIdToken, school?.school_id, selectedPages, updateFreezeFlag, user?.email, user?.uid]);

  const handleUnfreeze = useCallback(async () => {
    if (!school?.school_id) {
      toast.error('School information is missing.');
      return;
    }
    if (freezeActionPending) {
      return;
    }

    try {
      setFreezeActionPending('unfreeze');
      const token = await getIdToken?.();
      const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
      const response = await axios.patch(
        `${API}/rhymes/freeze/${school.school_id}/${grade}`,
        {
          freeze: false,
          updated_by: user?.uid,
          updated_by_email: user?.email,
        },
        { headers, validateStatus: () => true }
      );

      if (response.status >= 400) {
        toast.error('Unable to unfreeze selections.');
        return;
      }

      updateFreezeFlag(false);
    } catch (error) {
      console.error('Error unfreezing selections:', error);
      toast.error('Unable to unfreeze selections. Please try again.');
    } finally {
      setFreezeActionPending(null);
    }
  }, [API, freezeActionPending, getIdToken, school?.school_id, updateFreezeFlag, user?.email, user?.uid]);
  
  const handleReplaceRhyme = (rhyme, position) => {
    if (!ensureEditable()) {
      return;
    }
    if (!rhyme) {
      return;
    }
    const normalized = normalizeSlot(position, '');
    pendingPositionRef.current = normalized ? (normalized as 'top' | 'bottom') : null;
    setCurrentPosition(position);
    setShowTreeMenu(true);
    setShowReusable(false);
    
  };
  const handleAddRhyme = (position) => {
    if (!ensureEditable()) {
      return;
    }
    const normalized = normalizeSlot(position, '');
    pendingPositionRef.current = normalized ? (normalized as 'top' | 'bottom') : null;
    setCurrentPosition(position);
    setShowTreeMenu(true);
    setShowReusable(false);
  };

  const computeRemovalsForSelection = ({ selections, pageIndex, normalizedPosition, newPages, endIndex }) => {
    if (!Array.isArray(selections) || selections.length === 0) {
      return [];
    }

    const startIndex = Number(pageIndex);
    const lastIndex = Number.isFinite(endIndex) ? Number(endIndex) : startIndex;

    return selections.filter(existing => {
      if (!existing) return false;
      const existingStart = Number(existing.page_index);
      if (!Number.isFinite(existingStart)) return false;

      const existingPages = parsePagesValue(existing.pages) ?? 1;

      if (newPages > 0.5) {
        return existingStart >= startIndex && existingStart <= lastIndex;
      }

      if (existingStart !== startIndex) {
        return false;
      }

      if (existingPages > 0.5) {
        return true;
      }

      const existingPosition = normalizeSlot(existing.position, 'top') || 'top';
      return existingPosition === normalizedPosition;
    });
  };

  const handleRhymeSelect = async (rhyme: TreeMenuRhyme, options?: { bucket?: 'personalized' | 'nonPersonalized' }) => {
    if (!ensureEditable()) {
      setShowTreeMenu(false);
      pendingPositionRef.current = null;
      return;
    }
    const operationId = (rhymeSelectOpRef.current += 1);
    try {
      const pageIndex = currentPageIndex;
      const prevArray = Array.isArray(selectedRhymes) ? selectedRhymes : [];
      const pagesValue = parsePagesValue(rhyme?.pages) ?? 1;
      const totalPages = pagesValue && pagesValue > 1 ? Math.max(1, Math.round(pagesValue)) : 1;
      const positionContext = pendingPositionRef.current ?? currentPosition;

      // Close the menu immediately to avoid slot intent races while async work
      // (network + image probing) completes.
      if (rhymeSelectOpRef.current === operationId) {
        setShowTreeMenu(false);
        setShowReusable(false);
        setCurrentPosition(null);
        pendingPositionRef.current = null;
      }
      const normalizedPosition = pagesValue === 0.5
        ? normalizeSlot(positionContext, 'top') || 'top'
        : 'top';

      const normalizedSlot = normalizeSlot(positionContext, 'top') || 'top';
      if (normalizedSlot === 'bottom' && pagesValue !== 0.5) {
        toast.error('Bottom slot supports only half-page rhymes.');
        return;
      }

      const numericPageIndex = Number(pageIndex);
      if (!Number.isFinite(numericPageIndex) || numericPageIndex < 0) {
        setShowTreeMenu(false);
        setCurrentPosition(null);
        pendingPositionRef.current = null;
        return;
      }
      // console.log(numericPageIndex)

      if (numericPageIndex >= MAX_PAGES_PER_GRADE) {
        toast.error(`you can select up to  maximum of ${MAX_PAGES_PER_GRADE} pages`);
        setShowTreeMenu(false);
        setShowReusable(false);
        setCurrentPosition(null);
        pendingPositionRef.current = null;
        return;
      }

      const usageBefore = computePageUsage(prevArray);
      const nextInfoBefore = computeNextAvailablePageInfoFromUsage(usageBefore);
     
      const firstBlankBefore = Number(nextInfoBefore?.index);
      const highestBefore = Number(nextInfoBefore?.highestIndex);
      const hasEarlierBlankBefore =
        Number.isFinite(firstBlankBefore) &&
        Number.isFinite(highestBefore) &&
        firstBlankBefore <= highestBefore;

      const endIndex = pagesValue > 0.5 ? numericPageIndex + totalPages - 1 : numericPageIndex;

      if (pagesValue > 0.5) {
        const hasHalfOnPage = prevArray.some((existing) => {
          if (!existing) return false;
          if (Number(existing.page_index) !== numericPageIndex) return false;
          return parsePagesValue(existing.pages) === 0.5;
        });

        if (hasHalfOnPage) {
          toast.error('Remove the half-page rhymes first before selecting a full-page rhyme.');
          setShowTreeMenu(false);
          setShowReusable(false);
          setCurrentPosition(null);
          pendingPositionRef.current = null;
          return;
        }
      }

      if (pagesValue > 0.5) {
        if (!Number.isFinite(endIndex) || endIndex >= MAX_PAGES_PER_GRADE) {
          toast.error(
            `This rhyme accommodates ${totalPages} pages. Kindly remove subsequent rhyme(s) to accommodate this rhyme.`
          );
          setShowTreeMenu(false);
          setShowReusable(false);
          setCurrentPosition(null);
          pendingPositionRef.current = null;
          return;
        }

        // Allow users to leave gaps while building selections.
        // Gaps are handled via Save/Submit validation and page-count gating.
      }

      // console.log(prevArray)
      const removals = computeRemovalsForSelection({
        selections: prevArray,
        pageIndex,
        normalizedPosition,
        newPages: pagesValue,
        endIndex
      });

      const filtered = prevArray.filter(existing => !removals.includes(existing));
      const isReplacement = removals.length > 0;

      const overlapsExistingMultiPage = filtered.some((existing) => {
        if (!existing) return false;
        const existingStart = Number(existing.page_index);
        if (!Number.isFinite(existingStart)) return false;

        const existingPagesValue = parsePagesValue(existing.pages) ?? 1;
        const existingTotalPages =
          existingPagesValue && existingPagesValue > 1
            ? Math.max(1, Math.round(existingPagesValue))
            : 1;

        if (existingTotalPages <= 1) return false;

        const existingEnd = existingStart + existingTotalPages - 1;
        return existingStart <= endIndex && existingEnd >= numericPageIndex;
      });

      if (overlapsExistingMultiPage) {
        toast.error('Selection overlaps a multi-page rhyme. Replace it from the first page.');
        setShowTreeMenu(false);
        setShowReusable(false);
        setCurrentPosition(null);
        pendingPositionRef.current = null;
        return;
      }

      if (pagesValue > 0.5) {
        const partiallyCovered = prevArray.find((existing) => {
          if (!existing) return false;
          const existingStart = Number(existing.page_index);
          if (!Number.isFinite(existingStart)) return false;
          if (existingStart <= numericPageIndex || existingStart > endIndex) return false;

          const existingPagesValue = parsePagesValue(existing.pages) ?? 1;
          const existingTotalPages =
            existingPagesValue && existingPagesValue > 1
              ? Math.max(1, Math.round(existingPagesValue))
              : 1;

          if (existingTotalPages <= 1) return false;

          const existingEnd = existingStart + existingTotalPages - 1;
          return existingEnd > endIndex;
        });

        if (partiallyCovered) {
          toast.error(
            `This rhyme accommodates ${totalPages} pages. Kindly remove subsequent rhyme(s) to accommodate this rhyme.`
          );
          setShowTreeMenu(false);
          setShowReusable(false);
          setCurrentPosition(null);
          pendingPositionRef.current = null;
          return;
        }
      }
      /*
        const numericPageIndex = Number(pageIndex);
        const endIndex = Number.isFinite(numericPageIndex)
          ? numericPageIndex + totalPages - 1
          : numericPageIndex;
        console.log(endIndex)
        const hasOverflow = Number.isFinite(endIndex) && endIndex >= MAX_PAGES_PER_GRADE;
        const firstBlockingIndex = Number.isFinite(numericPageIndex)
          ? numericPageIndex + 1
          : numericPageIndex;
        const newStart = Number(pageIndex);
const newEnd = newStart + totalPages - 1;

const hasBlockingSelection = filtered.some(existing => {
  if (!existing) return false;

  const existingStart = Number(existing.page_index);
  if (!Number.isFinite(existingStart)) return false;

  if (existingStart <= newStart || existingStart > newEnd) return false;

  const existingPagesValue = parsePagesValue(existing.pages) ?? 1;
  const existingTotalPages =
    existingPagesValue && existingPagesValue > 1
      ? Math.max(1, Math.round(existingPagesValue))
      : 1;

  const existingEnd = existingStart + existingTotalPages - 1;

  return existingEnd > newEnd; // this is the “indirect half replacement” case
});


        if (hasOverflow || hasBlockingSelection) {
          toast.error(
            `This rhyme accommodates ${totalPages} pages. Kindly remove subsequent rhyme(s) to accommodate this rhyme.`
          );
          setShowTreeMenu(false);
          setShowReusable(false);
          setCurrentPosition(null);
          return;
        }
      */

      const gradePersonalisation = gradePersonalisationRef.current ?? gradePersonalisationValue;
      const previewUrls = buildRhymePreviewUrls(rhyme, {
        ...options,
        cartoonVariantForGrade: gradePersonalisation === 'no'
      });
      const resolvedBucket =
        resolvePreviewBucket(options?.bucket) ??
        (isPersonalizedValue(rhyme?.personalized) ? 'personalized' : 'nonPersonalized');
      const baseRhyme = {
        page_index: pageIndex,
        code: rhyme.code,
        name: rhyme.name,
        pages: rhyme.pages,
        personalized: rhyme.personalized,
        bucket: resolvedBucket,
        subject: rhyme.subject || null,
        imageUrls: previewUrls,
        imageLoaded: false,
        imageLoadedUrl: '',
        imageFetchPending: true,
        imageLoadFailed: false,
        svgContent: null,
        svgFetchFailed: false,
        position: normalizedPosition
      };

      const nextArray = sortSelections([...filtered, baseRhyme]);
      const nextUsage = computePageUsage(nextArray);
      const nextInfo = computeNextAvailablePageInfoFromUsage(nextUsage);

      await axios.post(`${API}/rhymes/select`, {
        school_id: school.school_id,
        grade: grade,
        page_index: pageIndex,
        rhyme_code: rhyme.code,
        position: normalizedPosition,
        bucket: resolvedBucket === 'personalized' ? 'personalised' : 'non_personalised'
      });

      setSelectedRhymes(nextArray);
      selectedRhymesRef.current = nextArray;

      const firstPreviewUrl = Array.isArray(previewUrls) ? previewUrls[0] : '';
      let previewLoaded = false;
      if (firstPreviewUrl) {
        previewLoaded = await new Promise<boolean>((resolve) => {
          const probe = new Image();
          probe.onload = () => resolve(true);
          probe.onerror = () => resolve(false);
          probe.src = firstPreviewUrl;
        });

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
                imageLoaded: previewLoaded,
                imageLoadedUrl: previewLoaded ? firstPreviewUrl : '',
                imageFetchPending: false,
                imageLoadFailed: !previewLoaded
              };
            }
            return existing;
          });
          selectedRhymesRef.current = updated;
          return updated;
        });
      } else {
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
                imageLoaded: false,
                imageLoadedUrl: '',
                imageFetchPending: false,
                imageLoadFailed: true
              };
            }
            return existing;
          });
          selectedRhymesRef.current = updated;
          return updated;
        });
      }

      if (!firstPreviewUrl || !previewLoaded) {
        // No SVG fallback: previews are the source of truth for rendering.
      }

      if (isReplacement) {
        setCurrentPageIndex(pageIndex);
        if (Number.isFinite(pageIndex)) {
          ensurePageAssets(pageIndex).catch((assetError) => {
            console.error('Error loading rhyme images for page:', assetError);
          });
        }
      } else {
        setTimeout(() => {
          if (!nextInfo.hasCapacity && numericPageIndex === MAX_PAGES_PER_GRADE - 1) {
            toast.info(`You have reached the max limit  of ${MAX_PAGES_PER_GRADE} pages for this grade. please go to page 1 for submission.`);
            setCurrentPageIndex(numericPageIndex);
            ensurePageAssets(numericPageIndex, nextArray).catch((assetError) => {
              console.error('Error loading rhyme images for page:', assetError);
            });
            return;
          }

          // Navigation is sequential. Only when we are about to advance to the next
          // page (i.e., effectively "adding a new page") do we enforce filling any
          // earlier gaps first. We do not block normal browsing via Next/Previous.
          const entryAfter = nextUsage.usageMap.get(numericPageIndex);
          const isFullAfter = Boolean(entryAfter?.top && entryAfter?.bottom);
          const sequentialNextIndex = isFullAfter
            ? numericPageIndex + (totalPages > 1 ? totalPages : 1)
            : numericPageIndex;

          let targetIndex = sequentialNextIndex;
          const isAdvancing = sequentialNextIndex > numericPageIndex;
          if (isAdvancing) {
            // At submit milestones (24/28/32/…), when the last page is fully filled,
            // we show the milestone banner and suppress the trailing blank page until
            // the user explicitly clicks "Continue". Do not auto-advance into the
            // newly-available blank page in this case.
            const nextSelectedPages = Math.max(
              0,
              Math.min(Number(nextUsage.highestIndex) + 1, MAX_PAGES_PER_GRADE)
            );
            const nextIsSubmitMilestone =
              nextSelectedPages >= 24 &&
              nextSelectedPages % 4 === 0 &&
              nextSelectedPages <= MAX_PAGES_PER_GRADE;
            const nextLastIndex = nextSelectedPages > 0 ? nextSelectedPages - 1 : -1;
            const nextLastEntry = nextLastIndex >= 0 ? nextUsage.usageMap.get(nextLastIndex) : null;
            const nextLastIsComplete = Boolean(nextLastEntry?.top && nextLastEntry?.bottom);

            if (nextIsSubmitMilestone && nextLastIsComplete && milestoneContinuePages === null) {
              targetIndex = numericPageIndex;
            } else {
            const blanksAfter = computeBlankSlotsInSequenceFromUsage(nextUsage);
            const firstBlankAfter = blanksAfter.length > 0 ? blanksAfter[0] : null;
            const nextBlankAfterCurrent = blanksAfter.find((blank) => blank?.pageIndex > numericPageIndex) || null;

            const shouldBlockAdvanceForEarlierBlank =
              firstBlankAfter &&
              Number.isFinite(firstBlankAfter.pageIndex) &&
              firstBlankAfter.pageIndex >= 0 &&
              firstBlankAfter.pageIndex < sequentialNextIndex;

            if (shouldBlockAdvanceForEarlierBlank) {
              targetIndex = firstBlankAfter.pageIndex;
              const missingParts = Array.isArray(firstBlankAfter.missing) ? firstBlankAfter.missing : [];
              const missingLabel =
                missingParts.length === 2 ? 'top and bottom' : (missingParts[0] === 'bottom' ? 'bottom' : 'top');
              toast.info(
                `Page ${firstBlankAfter.pageIndex + 1} (${missingLabel}) is blank. Please fill it before adding new pages.`
              );
            } else if (
              nextBlankAfterCurrent &&
              Number.isFinite(nextBlankAfterCurrent.pageIndex) &&
              nextBlankAfterCurrent.pageIndex >= 0 &&
              nextBlankAfterCurrent.pageIndex <= nextUsage.highestIndex
            ) {
              // After filling a blank, jump to the next blank in the current sequence
              // (before the current highest selected index) so gaps don't get skipped.
              targetIndex = nextBlankAfterCurrent.pageIndex;
            }
            }
          }

          const clampedIndex = Math.max(0, Math.min(targetIndex, MAX_PAGES_PER_GRADE - 1));

          setCurrentPageIndex(clampedIndex);
          if (Number.isFinite(clampedIndex)) {
            ensurePageAssets(clampedIndex, nextArray).catch((assetError) => {
              console.error('Error loading rhyme images for page:', assetError);
            });
          }
        }, 400);
      }
      // Close/clear only if this is the latest selection operation. Prevents an
      // earlier async selection from clearing the slot intent after the user has
      // already opened the menu for the next slot.
      if (rhymeSelectOpRef.current === operationId) {
        setShowTreeMenu(false);
        setCurrentPosition(null);
        pendingPositionRef.current = null;
      }

      await fetchAvailableRhymes();
      await fetchReusableRhymes();
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

  const getDeleteSpanForPage = (rhymesList, pageIndex) => {
    const list = Array.isArray(rhymesList) ? rhymesList : [];
    const targetIndex = Number(pageIndex);
    if (!Number.isFinite(targetIndex) || targetIndex < 0) return null;

    let spanFromStart = 1;
    for (const selection of list) {
      if (!selection) continue;
      const start = Number(selection?.page_index);
      if (!Number.isFinite(start)) continue;
      if (start !== targetIndex) continue;
      const pages = parsePagesValue(selection?.pages);
      if (pages > 1) {
        spanFromStart = Math.max(1, Math.round(pages));
        break;
      }
    }

    for (const selection of list) {
      if (!selection) continue;
      const start = Number(selection?.page_index);
      if (!Number.isFinite(start)) continue;
      const pages = parsePagesValue(selection?.pages);
      if (!(pages > 1)) continue;
      const span = Math.max(1, Math.round(pages));
      if (start < targetIndex && targetIndex < start + span) {
        return null;
      }
    }

    return spanFromStart;
  };

  const openDeletePageDialog = () => {
    if (!ensureEditable()) {
      return;
    }

    const span = getDeleteSpanForPage(selectedRhymesRef.current, currentPageIndex);
    if (!span) {
      toast.error('This page is part of a multi-page rhyme. Delete from the first page of the block.');
      return;
    }

    toast.warning(
      span > 1
        ? `Deleting these ${span} pages will shift later pages forward by ${span}. Page numbers will change — please review before submit.`
        : `Deleting this page will shift later pages forward by 1. Page numbers will change — please review before submit.`
    );

    setDeletePageRequest({ pageIndex: Number(currentPageIndex), span });
    setDeletePageDialogOpen(true);
  };

  const confirmDeletePage = async () => {
    if (!deletePageRequest) {
      return;
    }

    try {
      setDeletePagePending(true);
      await axios.delete(
        `${API}/rhymes/page/${school?.school_id}/${grade}/${deletePageRequest.pageIndex}`
      );
      const deletedIndex = Number(deletePageRequest.pageIndex);
      const postDeletePreferredIndex =
        Number.isFinite(currentPageIndex) && Number(currentPageIndex) === deletedIndex
          ? Math.max(0, deletedIndex - 1)
          : deletedIndex;
      await fetchSelectedRhymes({ preferredPageIndex: postDeletePreferredIndex });
      await fetchAvailableRhymes();
      await fetchReusableRhymes();
      ensurePageAssets(postDeletePreferredIndex, selectedRhymesRef.current).catch(() => {});
      setLastDeletedPageIndex(deletedIndex);
      toast.success('Page deleted. Page numbers shifted — please review before submitting.');
      setDeletePageDialogOpen(false);
      setDeletePageRequest(null);
    } catch (err) {
      console.error('Delete page failed:', err.response?.data || err.message);
      toast.error('Unable to delete page. Please try again.');
    } finally {
      setDeletePagePending(false);
    }
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
    if (position === 'top' || position === 'bottom') {
      if (removeRhymePending[position]) {
        return;
      }
      setRemoveRhymePending((prev) => ({ ...prev, [position]: true }));
    }

    // console.log("→ Deleting rhyme (request):", {
    //   code: rhyme.code,
    //   position,
    //   currentPageIndex,
    //   grade
    // });

    let deleteSucceeded = false;

    try {
      await axios.delete(`${API}/rhymes/remove/${school?.school_id}/${grade}/${currentPageIndex}/${position}`);
      deleteSucceeded = true;

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
    } catch (err) {
      console.error("Delete failed:", err.response?.data || err.message);
    } finally {
      if (position === 'top' || position === 'bottom') {
        setRemoveRhymePending((prev) => ({ ...prev, [position]: false }));
      }
    }

    // Refresh side lists in the background so navigation can resume immediately after delete.
    if (deleteSucceeded) {
      fetchAvailableRhymes().catch((error) => {
        console.error('Error refreshing available rhymes:', error);
      });
      fetchReusableRhymes().catch((error) => {
        console.error('Error refreshing reusable rhymes:', error);
      });
    }
  };

  const handlePageChange = (newPageIndex) => {
    if (removeRhymePending.top || removeRhymePending.bottom) {
      toast.info('Please wait for the delete to finish.');
      return;
    }

    const clampedIndex = Math.max(0, Math.min(newPageIndex, MAX_PAGES_PER_GRADE - 1));

    if (lastDeletedPageIndex !== null) {
      setLastDeletedPageIndex(null);
    }

    setCurrentPageIndex(clampedIndex);

    if (Number.isFinite(clampedIndex)) {
      ensurePageAssets(clampedIndex).catch((error) => {
        console.error('Error loading rhyme images for page:', error);
      });

      const nextIndex = clampedIndex + 1;
      if (nextIndex < MAX_PAGES_PER_GRADE) {
        ensurePageAssets(nextIndex).catch((error) => {
          console.error('Error prefetching next rhyme page images:', error);
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
      const token = await getIdToken?.();

      await axios.patch(
        `${API}/rhymes/swap/${school?.school_id}/${grade}/${pageIndex}`,
        null,
        { headers: { Authorization: `Bearer ${token}` } }
      );

    } catch (error) {
      console.error('Error swapping rhyme order:', error);
      toast.error('Unable to update rhyme order.');
      
    } 
  };

  const pageUsage = useMemo(() => computePageUsage(selectedRhymes), [selectedRhymes]);
  const removeActionPending = Boolean(removeRhymePending.top || removeRhymePending.bottom);
  const lastBookPageIndex = useMemo(() => {
    const value = Number(selectedPages);
    if (!Number.isFinite(value) || value <= 0) return -1;
    return Math.max(0, Math.min(Math.floor(value) - 1, MAX_PAGES_PER_GRADE - 1));
  }, [MAX_PAGES_PER_GRADE, selectedPages]);
  const lastBookPageIsComplete = useMemo(() => {
    if (lastBookPageIndex < 0) return false;
    const entry = pageUsage.usageMap.get(lastBookPageIndex);
    return Boolean(entry?.top && entry?.bottom);
  }, [lastBookPageIndex, pageUsage.usageMap]);

  useEffect(() => {
    // Reset the "Continue adding pages" allowance whenever we leave the milestone
    // state, or when selections progress to a new page count.
    if (!isSubmitMilestone || !lastBookPageIsComplete) {
      if (milestoneContinuePages !== null) {
        setMilestoneContinuePages(null);
      }
      return;
    }

    if (milestoneContinuePages !== null && milestoneContinuePages !== selectedPages) {
      setMilestoneContinuePages(null);
    }
  }, [isSubmitMilestone, lastBookPageIsComplete, milestoneContinuePages, selectedPages]);
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

  const blankSlotsInSequence = useMemo(
    () => computeBlankSlotsInSequenceFromUsage(pageUsage),
    [pageUsage]
  );
  const hasBlankSlotsInSequence = blankSlotsInSequence.length > 0;

  useEffect(() => {
    if (!submitBlankRedirectActive) return;
    if (loading) return;

    if (blankSlotsInSequence.length === 0) {
      if (!submitBlankRedirectToastShown.current) {
        toast.success('All blanks are filled. You can submit now.');
        submitBlankRedirectToastShown.current = true;
      }
      setSubmitBlankRedirectActive(false);
      return;
    }

    const targetIndex = blankSlotsInSequence[0]?.pageIndex;
    if (!Number.isFinite(targetIndex) || targetIndex < 0) return;

    if (Number(currentPageIndex) === Number(targetIndex)) return;

    setCurrentPageIndex(targetIndex);
    ensurePageAssets(targetIndex, selectedRhymesRef.current).catch((assetError) => {
      console.error('Error loading rhyme images for page:', assetError);
    });
  }, [
    blankSlotsInSequence,
    currentPageIndex,
    ensurePageAssets,
    loading,
    submitBlankRedirectActive
  ]);
  
  // Calculate total pages
  const calculateTotalPages = () => {
    const normalizedHighest = Number.isFinite(highestFilledIndex) ? highestFilledIndex : -1;
    const normalizedCurrent = Number.isFinite(currentPageIndex) ? currentPageIndex : 0;

    // Pages are derived from selections. By default, add a trailing blank page
    // only when the current last page is fully filled (top + bottom). This
    // prevents the UI from "adding a new page" after selecting only one
    // half-page rhyme.
    //
    // Exception: at submit milestones (24/28/32/…), hide that trailing page
    // until the user explicitly clicks "Continue".
    let totalFromSelections = 1;
    if (normalizedHighest >= 0) {
      const lastEntry = pageUsage.usageMap.get(normalizedHighest);
      const isLastFull = Boolean(lastEntry?.top && lastEntry?.bottom);
      const baseTotal = Math.min(normalizedHighest + (isLastFull ? 2 : 1), MAX_PAGES_PER_GRADE);

      const shouldSuppressTrailingAtMilestone =
        isLastFull &&
        isSubmitMilestone &&
        selectedPages < MAX_PAGES_PER_GRADE &&
        milestoneContinuePages !== selectedPages;

      totalFromSelections = shouldSuppressTrailingAtMilestone
        ? Math.min(normalizedHighest + 1, MAX_PAGES_PER_GRADE)
        : baseTotal;
    }
    const totalFromCurrent = Math.max(1, normalizedCurrent + 1);

    let total = Math.min(Math.max(totalFromSelections, totalFromCurrent), MAX_PAGES_PER_GRADE);

    // If the user deleted the last page and we navigated back, avoid immediately
    // re-adding a trailing blank page with the same page number as the deleted one.
    if (lastDeletedPageIndex !== null) {
      const deleted = Number(lastDeletedPageIndex);
      const deletedUsage = pageUsage.usageMap.get(deleted);
      const deletedIsBlank = !deletedUsage?.top && !deletedUsage?.bottom;

      if (Number.isFinite(deleted) && deleted >= 0 && deletedIsBlank && deleted > normalizedHighest && total === deleted + 1) {
        total = Math.max(1, total - 1);
      }
    }

    return total;
  };

  useEffect(() => {
    const total = calculateTotalPages();

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
  }, [
    currentPageIndex,
    highestFilledIndex,
    isSubmitMilestone,
    milestoneContinuePages,
    nextAvailablePageIndex,
    pageUsage.usageMap,
    selectedPages
  ]);

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
  const isMultiPageNonFirstPage = isMultiPageRhyme && (currentPageRhymes.multiPageOffset || 0) > 0;
  const showBottomContainer = !isMultiPageRhyme && !isTopFullPage;
  const topSelection = currentPageRhymes.top;
  const bottomSelection = currentPageRhymes.bottom;
  const topImageUrls = Array.isArray(topSelection?.imageUrls) ? topSelection.imageUrls : [];
  const topImageUrl =
    topImageUrls[currentPageRhymes.multiPageOffset] || topImageUrls[0] || '';
  const bottomImageUrls = Array.isArray(bottomSelection?.imageUrls) ? bottomSelection.imageUrls : [];
  const bottomImageUrl = bottomImageUrls[0] || '';
  const topFailed = Boolean(topSelection?.imageLoadFailed);
  const bottomFailed = Boolean(bottomSelection?.imageLoadFailed);
  const topImageLoaded =
    Boolean(topSelection?.imageLoaded) && (topSelection?.imageLoadedUrl || '') === (topImageUrl || '');
  const bottomImageLoaded =
    Boolean(bottomSelection?.imageLoaded) && (bottomSelection?.imageLoadedUrl || '') === (bottomImageUrl || '');
  const topReady =
    !topSelection ||
    topFailed ||
    (topImageUrl.length > 0 ? topImageLoaded : false);
  const bottomReady =
    !showBottomContainer ||
    !bottomSelection ||
    bottomFailed ||
    (bottomImageUrl.length > 0 ? bottomImageLoaded : false);

  const deleteSpanForCurrentPage = getDeleteSpanForPage(selectedRhymes, currentPageIndex);
  const normalizedHighestFilledIndex = Number.isFinite(highestFilledIndex) ? Number(highestFilledIndex) : -1;
  
  const canDeleteCurrentPage =
    hasFreezeField &&
    !isFrozen &&
    !isReadOnly &&
    freezeActionPending === null &&
    normalizedHighestFilledIndex >= 0 &&
    Number(currentPageIndex) <= normalizedHighestFilledIndex &&
    deleteSpanForCurrentPage !== null;

  const currentUsageEntry = pageUsage.usageMap.get(Number(currentPageIndex));
  const currentPageIsFull = Boolean(currentUsageEntry?.top && currentUsageEntry?.bottom);

  const canAddPageAfterDelete =
    !isFrozen &&
    !isReadOnly &&
    freezeActionPending === null &&
    lastDeletedPageIndex !== null &&
    Number.isFinite(currentPageIndex) &&
    currentPageIndex === totalPages - 1 &&
    currentPageIsFull &&
    totalPages < MAX_PAGES_PER_GRADE;
  
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

  const renderUnavailableIndicator = (label) => (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-white/80 p-6 text-center">
      <p className="text-sm font-semibold text-gray-700">Rhyme not available</p>
      {label ? (
        <p className="text-xs text-gray-500">
          We couldn&apos;t load <span className="font-medium">{label}</span> right now.
        </p>
      ) : (
        <p className="text-xs text-gray-500">We couldn&apos;t load this rhyme right now.</p>
      )}
    </div>
  );

  const gradeDisplayName = (customGradeName && customGradeName.trim()) || grade;

  return (
    <div className="min-h-screen bg-slate-50 overflow-x-hidden">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-4 pt-1 pb-2 sm:px-6 sm:pt-3 sm:pb-4">
        {/* Header */}
        <div className="mb-2 flex flex-shrink-0 flex-col gap-3 md:flex-row md:items-center md:justify-between md:mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-800 capitalize">{gradeDisplayName} - Rhyme Selection</h1>
            {school?.school_name && (
              <p className="mt-1 text-sm text-gray-600">{school.school_name}</p>
            )}
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

        {(isReadOnly || isFrozen) && (
          <div className="mb-2 sm:mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-sm">
            <div className="font-semibold">Viewing only</div>
            <div className="mt-1 text-xs text-amber-800">
              {isFrozen
                ? 'Rhyme selections are frozen/approved. Contact an admin for changes.'
                : 'You do not have permission to edit these selections.'}
            </div>
          </div>
        )}

        {/* Main Content */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <div className="relative h-full">

            {/* Dual Container Interface */}
            <div className="flex h-full flex-col items-center">
              <div className="flex h-full w-full flex-col">

                {/* Navigation Controls */}
                <div className="flex-shrink-0 space-y-1 sm:space-y-2">
                  {isSubmitMilestone &&
                    lastBookPageIsComplete &&
                    milestoneContinuePages === null &&
                    currentPageIndex !== 0 &&
                    !isFrozen &&
                    !isReadOnly && (
                    <div className="rounded-xl border border-slate-200 bg-white/80 px-4 py-3 text-sm text-slate-800 shadow-sm">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <div className="font-semibold">
                            You selected {selectedPages} pages{selectedPages === MAX_PAGES_PER_GRADE ? ' (maximum)' :""} for your book
                          </div>
                          <div className="mt-0.5 text-xs text-slate-600">
                            {selectedPages >= MAX_PAGES_PER_GRADE
                              ? 'Go to Page 1 to submit & freeze selections.'
                              : `Go to Page 1 to submit & freeze selections, or continue adding pages up to maximum page limit of ${MAX_PAGES_PER_GRADE}.`}
                          </div>
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => {
                              setCurrentPageIndex(0);
                              ensurePageAssets(0, selectedRhymesRef.current).catch(() => {});
                            }}
                            className="bg-slate-900 text-white hover:bg-slate-800"
                          >
                            Go to Page 1
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={selectedPages >= MAX_PAGES_PER_GRADE}
                            onClick={() => {
                              setMilestoneContinuePages(selectedPages);
                              const nextIndex = Math.max(0, Math.min(Number(selectedPages), MAX_PAGES_PER_GRADE - 1));
                              setCurrentPageIndex(nextIndex);
                              ensurePageAssets(nextIndex, selectedRhymesRef.current).catch(() => {});
                            }}
                            className="bg-white/80"
                          >
                            Continue
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                  {currentPageIndex + 1 === 1 && (
                    <div className="mx-auto flex w-fit flex-col items-center gap-2">
                      {!isFrozen ? (
                        <Button
                          onClick={handleSaveAndSubmit}
                          type="button"
                          disabled={isReadOnly ||  !canSaveAndSubmit || freezeActionPending !== null}
                          className="w-36 h-8 bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-500 disabled:cursor-not-allowed"
                        >
                          {freezeActionPending === 'freeze' ? 'Freezing…' : 'Submit & Freeze'}
                        </Button>
                      ) : isSuperAdmin ? (
                        <Button
                          onClick={handleUnfreeze}
                          variant="outline"
                          type="button"
                          disabled={freezeActionPending !== null}
                          className="w-36 h-8 border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {freezeActionPending === 'unfreeze' ? 'Unfreezing…' : 'Unfreeze'}
                        </Button>
                      ) : null}
                    </div>
                  )}
                  <div className="mx-auto flex w-fit items-center gap-2 text-[11px] text-slate-600">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5">
                      Rhyme book pages selected: {selectedPages}
                    </span>
                    {!isFrozen && !isReadOnly && pageCountHint ? (
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-900">
                        {pageCountHint}
                      </span>
                    ) : null}
                  </div>  
                  {!isFrozen && !isReadOnly && !isSubmitMilestone && lastDeletedPageIndex !== null && (
                    <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-xs text-sky-900 shadow-sm">
                      {(() => {
                        const minPages = 24;
                        const step = 4;
                        const current = Number(selectedPages);

                        if (!Number.isFinite(current) || current <= 0) {
                          return 'Page deleted.';
                        }

                        const nextMilestone =
                          current < minPages ? minPages : (current % step === 0 ? current : current + (step - (current % step)));
                        const prevMilestone =
                          current >= minPages ? (current % step === 0 ? current : current - (current % step)) : null;

                        const canReachNext = nextMilestone <= MAX_PAGES_PER_GRADE;
                        const nextTarget = canReachNext ? nextMilestone : null;
                        const prevTarget = prevMilestone !== null && prevMilestone >= minPages ? prevMilestone : null;

                        const addPages = nextTarget !== null ? Math.max(0, nextTarget - current) : null;
                        const deletePages = prevTarget !== null ? Math.max(0, current - prevTarget) : null;

                        if (current < minPages) {
                          return `Page deleted. Add ${minPages - current} page(s) to reach ${minPages} and submit.`;
                        }

                        if (addPages !== null && deletePages !== null) {
                          return `Page deleted. Add ${addPages} page(s) to reach ${nextTarget} and submit, or delete ${deletePages} page(s) to reach ${prevTarget} and submit.`;
                        }

                        if (addPages !== null) {
                          return `Page deleted. Add ${addPages} page(s) to reach ${nextTarget} and submit.`;
                        }

                        if (deletePages !== null) {
                          return `Page deleted. Delete ${deletePages} page(s) to reach ${prevTarget} and submit.`;
                        }

                        return 'Page deleted.';
                      })()}
                    </div>
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    
                    <Button
                      onClick={() => handlePageChange(Math.max(0, currentPageIndex - 1))}
                      disabled={currentPageIndex === 0 || freezeActionPending !== null || removeActionPending}
                      variant="outline"
                      size="sm"
                    >
                      <ChevronLeft className="w-4 h-4 mr-1" />
                      Previous
                    </Button>
                    
                    <div className="order-3 w-full text-center text-sm text-gray-600 font-medium sm:order-none sm:w-auto">
                      Page {currentPageIndex + 1} of {totalPages}
                    </div>

                    {canShowNextButton ? (
                      <div className="flex items-center gap-2">
                        <Button
                          onClick={() => {
                            if (canAddPageAfterDelete && currentPageIndex >= totalPages - 1) {
                              setLastDeletedPageIndex(null);
                              handlePageChange(currentPageIndex + 1);
                              return;
                            }
                            handlePageChange(Math.min(totalPages - 1, currentPageIndex + 1));
                          }}
                          disabled={freezeActionPending !== null || removeActionPending || (currentPageIndex >= totalPages - 1 && !canAddPageAfterDelete)}
                          variant="outline"
                          size="sm"
                        >
                          {canAddPageAfterDelete && currentPageIndex >= totalPages - 1 ? 'Add page' : 'Next'}
                          <ChevronRight className="w-4 h-4 ml-1" />
                        </Button>
                        
                      </div>
                    ) : (
                      <div className="flex h-10 min-w-[120px] items-center justify-center rounded-full border border-dashed border-orange-200 bg-white/80 px-4 text-xs font-medium text-orange-500">
                        Loading page...
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    {canDeleteCurrentPage ? (
                      <Button
                        onClick={openDeletePageDialog}
                        disabled={deletePagePending || freezeActionPending !== null}
                        variant="outline"
                        size="sm"
                        className="border-red-200 bg-white/80 text-red-700 hover:bg-red-50 disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        <Trash2 className="mr-1 h-4 w-4" />
                        Delete page
                      </Button>
                    ) : null}
                    <Button
                      onClick={() => handlePageChange(0)}
                      disabled={currentPageIndex === 0 || freezeActionPending !== null || removeActionPending}
                      variant="outline"
                      size="sm"
                      aria-label="First page"
                    >
                      <ChevronLeft className="hidden md:inline-block w-4 h-4 mr-1" />
                      <span>First</span>
                    </Button>
                    <Button
                      onClick={() => handlePageChange(Math.max(0, totalPages - 1))}
                      disabled={totalPages <= 1 || currentPageIndex >= totalPages - 1 || freezeActionPending !== null || removeActionPending}
                      variant="outline"
                      size="sm"
                    >
                      Last
                      <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                     
                    <Button
                      onClick={swapCurrentPageOrder}
                      disabled={!canSwapHalfPage || isReadOnly || freezeActionPending !== null}
                      variant="outline"
                      size="sm"
                      className="bg-white/80"
                    >
                      Change order
                    </Button>

                    {!isMultiPageNonFirstPage ? (
                    <Button
                      onClick={toggleSwapAcrossPages}
                      disabled={isReadOnly || freezeActionPending !== null || removeActionPending || swapAcrossPagesPending}
                      variant="outline"
                      size="sm"
                      className={`bg-white/80 ${swapAcrossPagesActive ? 'border-orange-400 text-orange-700' : ''}`}
                    >
                      {swapAcrossPagesPending
                        ? 'Swapping…'
                        : swapAcrossPagesActive
                          ? (swapAcrossPagesSource && swapAcrossPagesSource.pageIndex !== Number(currentPageIndex) ? 'Swap with this page' : 'Cancel swap')
                          : 'Swap pages'}
                    </Button>
                    ) : null}

                    <AlertDialog
                      open={deletePageDialogOpen}
                      onOpenChange={(open) => {
                        setDeletePageDialogOpen(open);
                        if (!open) {
                          setDeletePageRequest(null);
                        }
                      }}
                    >
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            Delete page {deletePageRequest ? deletePageRequest.pageIndex + 1 : currentPageIndex + 1}?
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            This removes the page from the book and shifts all later pages forward by{' '}
                            {deletePageRequest ? deletePageRequest.span : deleteSpanForCurrentPage || 1}. The rhyme sequence stays the same,
                            but page numbers will change. This action can&apos;t be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel disabled={deletePagePending}>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={(event) => {
                              event.preventDefault();
                              confirmDeletePage();
                            }}
                            disabled={deletePagePending}
                            className="bg-red-600 text-white hover:bg-red-700"
                          >
                            {deletePagePending ? 'Deleting…' : 'Delete page'}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>

                <div className="flex-1 min-h-0 flex flex-col">
                  <div className="flex-1 min-h-0 py-0.5 sm:py-1">
                    <div className="flex h-full items-start justify-center">

                      <div className="relative flex w-full justify-center transition-all duration-300 ease-out">

                        <div
                          className="a4-preview relative flex w-full flex-col overflow-hidden"
                          style={{ aspectRatio: IMG_PREVIEW_ASPECT_RATIO }}
                        >
                          {showBottomContainer && (
                            <div className="pointer-events-none absolute inset-x-12 top-1/2 h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent" />
                          )}
                          {/* parent of top nd bottom container */}
                          <div className="rhyme-page-grid h-full">
                                <div

                                  className="relative flex w-full min-h-0 flex-col rhyme-slot"

                                >
                                  {/* if it ha a top rhyme already seected diplay that else dsplay + button to add in top slot*/}
                                  {hasTopRhyme ? (
                                    <div className="relative flex flex-1 min-h-0 flex-col rhyme-slot-wrapper">
                                      {canReplaceTop && (
                                        <div className="z-10 flex justify-end gap-2 px-2 pt-1 sm:absolute sm:top-4 sm:right-4 sm:px-0 sm:pt-0">
                                          <Button
                                            onClick={() => handleReplaceRhyme(topSelection, 'top')}
                                            variant="outline"
                                            disabled={isReadOnly}
                                            className={`bg-white/90 backdrop-blur px-2 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm text-gray-700 shadow-md hover:bg-white${isReadOnly ? ' cursor-not-allowed opacity-60' : ''}`}
                                          >
                                            <Replace className="w-4 h-4 sm:mr-2" />
                                            <span className="hidden sm:inline">Replace</span>
                                          </Button>
                                          <Button
                                            onClick={() => handleRemoveRhyme(topSelection, 'top')}
                                            variant="outline"
                                            disabled={isReadOnly || removeRhymePending.top}
                                            className={`bg-white/90 backdrop-blur px-2 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm text-red-600 shadow-md hover:bg-white hover:text-red-700${isReadOnly || removeRhymePending.top ? ' cursor-not-allowed opacity-60' : ''}`}
                                          >
                                            {removeRhymePending.top ? (
                                              <Loader2 className="w-4 h-4 animate-spin sm:mr-2" />
                                            ) : (
                                              <Trash2 className="w-4 h-4 sm:mr-2" />
                                            )}
                                            <span className="hidden sm:inline">Remove</span>
                                          </Button>
                                        </div>
                                      )}
                                      
                                      <div
                                        className={`rhyme-slot-container${
                                          hasTopRhyme
                                            ? !topFailed && topImageUrl.length > 0
                                              ? ' has-img'
                                              : ''
                                            : ''
                                        }`}
                                        style={{ aspectRatio: IMG_PREVIEW_ASPECT_RATIO }}
                                      >
                                        {!topFailed && topImageUrl.length > 0 ? (
                                          <div className="relative h-full w-full">
                                            {!topImageLoaded && renderLoadingIndicator(currentPageRhymes.top?.name || 'rhyme')}
                                            <img
                                              src={topImageUrl}
                                              alt={`${currentPageRhymes.top?.name || 'Rhyme'} preview`}
                                              width={595}
                                              height={822}
                                              className={`rhyme-img-content${topImageLoaded ? '' : ' opacity-0'}`}
                                              onLoad={() => {
                                                const targetPos = normalizeSlot(topSelection?.position, 'top') || 'top';
                                                setSelectedRhymes((prev) => {
                                                  const prevArrayInner = Array.isArray(prev) ? prev : [];
                                                  const updated = prevArrayInner.map((existing) => {
                                                    if (!existing) return existing;
                                                    if (existing.code !== topSelection?.code) return existing;
                                                    if (Number(existing.page_index) !== Number(topSelection?.page_index)) return existing;
                                                    const existingPos = normalizeSlot(existing.position, 'top') || 'top';
                                                    if (existingPos !== targetPos) return existing;
                                                    return {
                                                      ...existing,
                                                      imageLoaded: true,
                                                      imageLoadedUrl: topImageUrl || '',
                                                      imageFetchPending: false,
                                                      imageLoadFailed: false
                                                    };
                                                  });
                                                  selectedRhymesRef.current = updated;
                                                  return updated;
                                                });
                                              }}
                                              onError={() => {
                                                const targetPos = normalizeSlot(topSelection?.position, 'top') || 'top';
                                                setSelectedRhymes((prev) => {
                                                  const prevArrayInner = Array.isArray(prev) ? prev : [];
                                                  const updated = prevArrayInner.map((existing) => {
                                                    if (!existing) return existing;
                                                    if (existing.code !== topSelection?.code) return existing;
                                                    if (Number(existing.page_index) !== Number(topSelection?.page_index)) return existing;
                                                    const existingPos = normalizeSlot(existing.position, 'top') || 'top';
                                                    if (existingPos !== targetPos) return existing;
                                                    return {
                                                      ...existing,
                                                      imageLoaded: false,
                                                      imageLoadedUrl: '',
                                                      imageFetchPending: false,
                                                      imageLoadFailed: true
                                                    };
                                                  });
                                                  selectedRhymesRef.current = updated;
                                                  return updated;
                                                });
                                              }}
                                            />
                                          </div>
                                        ) : isTopLoading ? (
                                          renderLoadingIndicator(currentPageRhymes.top?.name || 'rhyme')
                                        ) : (
                                          renderUnavailableIndicator(currentPageRhymes.top?.name || 'rhyme')
                                        )}
                                      </div>
                                      {/* if its a multipgae we are displaying message to go to first page for replacement */}
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
                                        <div className="z-10 flex justify-end gap-2 px-2 pt-1 sm:absolute sm:top-4 sm:right-4 sm:px-0 sm:pt-0">
                                          <Button
                                            onClick={() => handleReplaceRhyme(bottomSelection, 'bottom')}
                                            variant="outline"
                                            disabled={isReadOnly}
                                            className={`bg-white/90 backdrop-blur px-2 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm text-gray-700 shadow-md hover:bg-white${isReadOnly ? ' cursor-not-allowed opacity-60' : ''}`}
                                          >
                                            <Replace className="w-4 h-4 sm:mr-2" />
                                            <span className="hidden sm:inline">Replace</span>
                                          </Button>
                                          <Button
                                            onClick={() => handleRemoveRhyme(bottomSelection, 'bottom')}
                                            variant="outline"
                                            disabled={isReadOnly || removeRhymePending.bottom}
                                            className={`bg-white/90 backdrop-blur px-2 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm text-red-600 shadow-md hover:bg-white hover:text-red-700${isReadOnly || removeRhymePending.bottom ? ' cursor-not-allowed opacity-60' : ''}`}
                                          >
                                            {removeRhymePending.bottom ? (
                                              <Loader2 className="w-4 h-4 animate-spin sm:mr-2" />
                                            ) : (
                                              <Trash2 className="w-4 h-4 sm:mr-2" />
                                            )}
                                            <span className="hidden sm:inline">Remove</span>
                                          </Button>
                                        </div>

                                        <div
                                          className={`rhyme-slot-container${
                                            hasBottomRhyme
                                              ? !bottomFailed && bottomImageUrl.length > 0
                                                ? ' has-img'
                                                : ''
                                              : ''
                                          }`}
                                          style={{ aspectRatio: IMG_PREVIEW_ASPECT_RATIO }}
                                        >
                                          {!bottomFailed && bottomImageUrl.length > 0 ? (
                                            <div className="relative h-full w-full">
                                              {!bottomImageLoaded &&
                                                renderLoadingIndicator(currentPageRhymes.bottom?.name || 'rhyme')}
                                              <img
                                                src={bottomImageUrl}
                                                alt={`${currentPageRhymes.bottom?.name || 'Rhyme'} preview`}
                                                width={595}
                                                height={822}
                                                className={`rhyme-img-content${bottomImageLoaded ? '' : ' opacity-0'}`}
                                                onLoad={() => {
                                                  const targetPos = normalizeSlot(bottomSelection?.position, 'top') || 'top';
                                                  setSelectedRhymes((prev) => {
                                                    const prevArrayInner = Array.isArray(prev) ? prev : [];
                                                    const updated = prevArrayInner.map((existing) => {
                                                      if (!existing) return existing;
                                                      if (existing.code !== bottomSelection?.code) return existing;
                                                      if (Number(existing.page_index) !== Number(bottomSelection?.page_index)) return existing;
                                                      const existingPos = normalizeSlot(existing.position, 'top') || 'top';
                                                      if (existingPos !== targetPos) return existing;
                                                      return {
                                                        ...existing,
                                                        imageLoaded: true,
                                                        imageLoadedUrl: bottomImageUrl || '',
                                                        imageFetchPending: false,
                                                        imageLoadFailed: false
                                                      };
                                                    });
                                                    selectedRhymesRef.current = updated;
                                                    return updated;
                                                  });
                                                }}
                                                onError={() => {
                                                  const targetPos = normalizeSlot(bottomSelection?.position, 'top') || 'top';
                                                  setSelectedRhymes((prev) => {
                                                    const prevArrayInner = Array.isArray(prev) ? prev : [];
                                                    const updated = prevArrayInner.map((existing) => {
                                                      if (!existing) return existing;
                                                      if (existing.code !== bottomSelection?.code) return existing;
                                                      if (Number(existing.page_index) !== Number(bottomSelection?.page_index)) return existing;
                                                      const existingPos = normalizeSlot(existing.position, 'top') || 'top';
                                                      if (existingPos !== targetPos) return existing;
                                                      return {
                                                        ...existing,
                                                        imageLoaded: false,
                                                        imageLoadedUrl: '',
                                                        imageFetchPending: false,
                                                        imageLoadFailed: true
                                                      };
                                                    });
                                                    selectedRhymesRef.current = updated;
                                                    return updated;
                                                  });
                                                }}
                                              />
                                            </div>
                                          ) : isBottomLoading ? (
                                            renderLoadingIndicator(currentPageRhymes.bottom?.name || 'rhyme')
                                          ) : (
                                            renderUnavailableIndicator(currentPageRhymes.bottom?.name || 'rhyme')
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
            {/* based on showTreemenu value rendering tree menu  */}
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
                    onClick={() => { setShowTreeMenu(false); setCurrentPosition(null); pendingPositionRef.current = null; }}
                    variant="outline"
                    className="w-full"
                  >
                    <ChevronLeft className="w-4 h-4 mr-2" />
                    Close Menu
                  </Button>
                </div>
                <div className="flex-1 min-h-0 overflow-hidden px-2 pb-4 sm:px-4">
                  {/* passing treemenu props */}
                    <TreeMenu
                      rhymesData={availableRhymes}
                      reusableRhymes={reusableRhymes}
                      showReusable={showReusable}
                      grade={grade}
                      languageConfig={rhymeSettings?.languageConfig || null}
                      currentPageIndex={currentPageIndex}
                      maxPagesPerGrade={MAX_PAGES_PER_GRADE}
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
                onClick={() => { setShowTreeMenu(false); setCurrentPosition(null); pendingPositionRef.current = null; }}
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
                disabled={removeActionPending}
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
  const [modePending, setModePending] = useState(false);
  const [coverStatusChecking, setCoverStatusChecking] = useState(false);
  const [hasBookSelections, setHasBookSelections] = useState<boolean | null>(null);
  const [gateRhymesOption, setGateRhymesOption] = useState(true);
  const [school, setSchool] = useState<SchoolProfile | null>(() => persistedState.school ?? null);
  const [selectedMode, setSelectedMode] = useState(() => persistedState.selectedMode ?? null);
  const [selectedGrade, setSelectedGrade] = useState(() => persistedState.selectedGrade ?? null);
  const [coverWorkflowIntent, setCoverWorkflowIntent] = useState<'edit' | 'view'>('edit');
  const [, setIsCoverDetailsStepComplete] = useState(false);
  const [bookSelectionsPayload, setBookSelectionsPayload] = useState(null)
  const [coverDefaults, setCoverDefaults] = useState(() =>
  
    mergeCoverDefaults({
      ...(persistedState.coverDefaults || {}),
      gradeNames: buildGradeNamesFromSchool(persistedState.school)
    })
  );
  const resolveEnabledGrade = useCallback(
    (gradeId: string): boolean => {
      const entry = school?.grades?.[gradeId];
      if (entry === undefined) {
        return false;
      }
      return Boolean(entry?.enabled);
    },
    [school?.grades]
  );
  const { user, loading: authLoading, signOut: authSignOut, getIdToken } = useAuth();
  const [isEditingSchoolProfile, setIsEditingSchoolProfile] = useState(false);
  const [schoolFormSubmitting, setSchoolFormSubmitting] = useState(false);
  const isSuperAdminUser = workspaceUser?.role === 'super-admin';
  const [coverSelectionsReady, setCoverSelectionsReady] = useState(false);
  const [coverStatusCode, setCoverStatusCode] = useState<string>('1');
  const [rhymesFreeze, setRhymesFreeze] = useState(false)
  
  const coverStatus = useMemo(() => coverStatusCode, [coverStatusCode]);

  const selectionsFrozen = useMemo(() => {
    const status = (coverStatus || '1').toString();
    return status === '4' || status === 'finished';
  }, [coverStatus]);
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
      preflightCheckRef.current = { schoolId: null, done: false };
      setCoverStatusChecking(false);
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
      // toast.info('Selections are frozen. You can only view them.');
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
      rhymesFreeze,
    });
  }, [workspaceUser, school, selectedMode, selectedGrade, coverDefaults, rhymesFreeze]);

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
      /*if (!hasSelectedService) {
        toast.error('Please let us know whether you are taking ID cards, report cards, or certificates.');
        return;
      }*/
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

      const schoolGrades = school?.grades as any;
      const fromSchool =
        schoolGrades && typeof schoolGrades === 'object'
          ? schoolGrades?.[gradeId]?.label
          : null;
      if (typeof fromSchool === 'string' && fromSchool.trim().length > 0) {
        return fromSchool.trim();
      }

      return resolveDefaultGradeLabel(gradeId);
    },
    [school]
  );

  const handleAuth = ({ school: nextSchool, user: nextWorkspaceUser }) => {
    if (school?.school_id && school?.school_id !== nextSchool?.school_id) {
      clearCoverWorkflowForSchool(school.school_id);
    }

    setWorkspaceUser(nextWorkspaceUser);

    // Reset per-school status so the mode selection cards never show the previous
    // school's cover status while the new school's status request is in-flight.
    preflightCheckRef.current = { schoolId: null, done: false };
    coverStatusFetchRef.current = { inFlight: false, schoolId: null };
    bookPresenceFetchRef.current = { inFlight: false, schoolId: null };
    setCoverStatusCode('1');
    setCoverStatusChecking(false);
    setHasBookSelections(null);
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

  const ensureCoverSelectionsExist = useCallback(async () => {
    if (!school?.school_id) {
      toast.error('School information is missing. Please reload and try again.');
      setCoverSelectionsReady(false);
      return false;
    }
    try {
      const token = await getIdToken?.();
      
      const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
      const response = await axios.get(`${API}/cover-selections/${school.school_id}/exists`, {
        headers,
        validateStatus: () => true,
      });
      if (response.status >= 400) {
        toast.warning('Please complete cover page selections before moving to books.');
        setCoverSelectionsReady(false);
        return false;
      }
      const hasCovers = response.data?.has_covers === true;
      
      if (!hasCovers) {
        toast.warning('Please complete cover page selections before moving to books.');
        setCoverSelectionsReady(false);
        return false;
      }
      setCoverSelectionsReady(true);
      return true;
    } catch (error) {
      console.warn('Unable to verify cover selections', error);
      toast.error('Unable to verify cover selections. Please try again.');
      setCoverSelectionsReady(false);
      return false;
    }
  }, [API, getIdToken, school?.school_id]);

  const bookPresenceFetchRef = useRef<{ inFlight: boolean; schoolId: string | null }>({
    inFlight: false,
    schoolId: null
  });
  const preflightCheckRef = useRef<{ schoolId: string | null; done: boolean }>({
    schoolId: null,
    done: false
  });
  const coverStatusFetchRef = useRef<{ inFlight: boolean; schoolId: string | null }>({
    inFlight: false,
    schoolId: null
  });
  
  const refreshBookSelectionsPresence = useCallback(async (force: boolean = false): Promise<boolean | null> => {
    // Defer until Firebase auth is ready so the first request carries a token.
    if (authLoading || !user) {
      return null;
    }
    if (!school?.school_id) {
      setHasBookSelections(null);
      setGateRhymesOption(true);
      bookPresenceFetchRef.current = { inFlight: false, schoolId: null };
      return null;
    }
    if (!force) {
      if (bookPresenceFetchRef.current.inFlight && bookPresenceFetchRef.current.schoolId === school.school_id) {
        return hasBookSelections;
      }
      if (bookPresenceFetchRef.current.schoolId === school.school_id) {
        return hasBookSelections;
      }
    }
    
    bookPresenceFetchRef.current = { inFlight: true, schoolId: school.school_id };
    try {
      const token = await getIdToken?.();
      if (!token) {
        throw new Error('Unable to fetch Firebase token');

      }
      
      const headers = { Authorization: `Bearer ${token}` };
      const response = await axios.get(`${API}/book-selections/${school.school_id}`, {
        headers,
        validateStatus: () => true
      });
      if (response.status >= 400) {
        setHasBookSelections(false);
        // setGateRhymesOption(true);
        return false;
      }
      const payload = response.data;
      setBookSelectionsPayload(payload)
      
      
      
      const selectionsArray = Array.isArray(payload?.classes)
        ? payload.classes
        : Array.isArray(payload?.selections)
          ? payload.selections
          : Array.isArray(payload?.items)
            ? payload.items
            : Array.isArray(payload)
              ? payload
              : [];
      const hasAny = Array.isArray(selectionsArray)
        ? selectionsArray.length > 0
        : Boolean(payload && Object.keys(payload || {}).length);
      setHasBookSelections(hasAny);
      // Gate rhymes when book selections do not exist.
      // setGateRhymesOption(!hasAny);
      return hasAny;
    } catch (error) {
      console.warn('Unable to verify book selections', error);
      setHasBookSelections(false);
      // setGateRhymesOption(true);
      return false;
    } finally {
      bookPresenceFetchRef.current.inFlight = false;
    }
  }, [API, authLoading, getIdToken, hasBookSelections, school?.school_id, user]);
 


useEffect(() => {
    if (authLoading || !user) {
      return;
    }
    if (!school?.school_id) {
      return;
    }
    // Only check presence when the mode selection (main menu) is showing.
    if (selectedMode !== null) {
      
      return;
    }
    // if (!school?.school_id) {
    //   preflightCheckRef.current = { schoolId: null, done: false };
    //   setCoverSelectionsReady(false);
    //   // setCoverStatusCode('1');
    //   setCoverStatusChecking(false);
    //   return;
    // }
    // doc_ref=db.collection("")
    // // Sync status code from persisted school metadata (no network)
    // const statusVal = (school.cover_status || '1').toString();
    
    // setCoverStatusCode(statusVal === 'finished' ? '4' : statusVal);
    
    if (preflightCheckRef.current.schoolId === school.school_id && preflightCheckRef.current.done) {
      setCoverStatusChecking(false);
      return;
    }
    preflightCheckRef.current = { schoolId: school.school_id, done: true };
    setCoverStatusChecking(true);
    void (async () => {
      try {
        const statusHeaders: Record<string, string> = {};
        const token = await getIdToken?.();
        
        if (token) {
          statusHeaders.Authorization = `Bearer ${token}`;
        }
        if (!coverStatusFetchRef.current.inFlight || coverStatusFetchRef.current.schoolId !== school.school_id) {
          coverStatusFetchRef.current = { inFlight: true, schoolId: school.school_id };
          const existsResp = await axios.get(`${API}/cover-status/${school.school_id}`, {
            headers: statusHeaders, 
            validateStatus: () => true,
          });
          if (existsResp.status < 400) {
            const statusVal = (existsResp.data?.status).toString();
            
            setCoverStatusCode(statusVal);
            
            
            // setCoverSelectionsReady(existsResp.data?.has_covers === true);
          }
          coverStatusFetchRef.current.inFlight = false;
        }
      } catch (_) {
        coverStatusFetchRef.current.inFlight = false;
      }
      // if (hasBookSelections !== true) {
        
      //   await refreshBookSelectionsPresence(true);
      // }
      setCoverStatusChecking(false);
    })();
  }, [getIdToken,  school?.school_id, selectedMode, hasBookSelections]);





  useEffect(() => {
    if (authLoading || !user) {
      return;
    }
    if (!school?.school_id) {
      return;
    }
    // Only check presence when the mode selection (main menu) is showing.
    if (selectedMode !== null) {
      
      return;
    }
    
    // Ensure a fresh check on each entry to mode page
    bookPresenceFetchRef.current = { inFlight: false, schoolId: null };
   
    void refreshBookSelectionsPresence(true);
  }, [authLoading, refreshBookSelectionsPresence, school?.school_id, selectedMode, user]);

  
  // Force a book presence refresh when school loads (e.g., after reload).
  useEffect(() => {
    if (!school?.school_id) return;  
    // Reset guard so this fetch always runs for the current school.
    bookPresenceFetchRef.current = { inFlight: false, schoolId: null };
    void refreshBookSelectionsPresence(true);
  }, [refreshBookSelectionsPresence, school?.school_id]);

// useEffect(() => {
//  if (authLoading || !user || (!school?.school_id)) return;
//  if (selectedMode!==null){
//     return
//  }

//    (async () => {
//      const token = await getIdToken();
    
    
//    const res = await axios.get(`${API}/rhymes/freeze/${school?.school_id}/${selectedGrade}`, {
      
//      headers: { Authorization: `Bearer ${token}` },
//      });
//    setRhymesFreeze(res.data.freeze);
 
//    })();


// }, [authLoading,user, school?.school_id, getIdToken]);


  // useEffect(() => {
  //   if (authLoading || !user || !school?.school_id) {
  //     setRhymesFreeze(false);
  //     return;
  //   }
    

  //   const docRef = doc(db, 'rhyme_selections', school.school_id);
    
  //   const unsubscribe = onSnapshot(
  //     docRef,
  //     (snapshot) => {
  //       const data = snapshot.data() || {};
  //       setRhymesFreeze(Boolean((data as any).freeze));
  //     },
  //     (error) => {
  //       console.warn('Unable to subscribe to rhyme freeze status', error);
  //     }
  //   );

  //   return () => unsubscribe();
  // }, [authLoading, school?.school_id, user]);

  const resolveFirstEnabledGrade = useCallback(() => {
    for (const option of GRADE_OPTIONS) {
      if (resolveEnabledGrade(option.id)) {
        return option.id;
      }
    }
    
    return null;
  }, [resolveEnabledGrade]);

  const handleModeSelect = useCallback(
    async (mode) => {
      
      if (modePending) {
        return;
      }
      setModePending(true);
      try {
        if (mode === 'books') {
          // Only check covers/presence for Explore flow; skip for View
          let resolvedHasBooks: boolean | null = hasBookSelections;
          if (resolvedHasBooks === null) {
            resolvedHasBooks = await refreshBookSelectionsPresence(false);
          }
          if (resolvedHasBooks === null) {
            return;
          }
          if (resolvedHasBooks === false) {
            if (!coverSelectionsReady) {
              const ok = await ensureCoverSelectionsExist();
              

              if (!ok) {
                return;
              }
            }
            
          }
          
          if (typeof window !== 'undefined') {
            if (school?.school_id) {
              window.localStorage.setItem('bookSelectionSchoolId', school.school_id);
            }
            if (school?.school_name) {
              window.localStorage.setItem('bookSelectionSchoolName', school.school_name);
            }
          }
          navigate('/wizard');
          return;
        }
        setSelectedMode(mode);
        if (mode === 'cover') {
          // Jump directly into cover workflow with the first enabled grade instead of showing grade selection.
          setSelectedGrade(resolveFirstEnabledGrade());
        } else {
          setSelectedGrade(null);
        }
        if (mode === 'cover') {
          setIsCoverDetailsStepComplete(false);
          setCoverWorkflowIntent(selectionsFrozen ? 'view' : 'edit');
        }

      //   if (mode==='rhymes'){
         
      //   // if (hasBookSelections){
      //   //   setSelectedMode(mode)
      //   //   toast.warning('Please complete book selections before moving to rhymes.');
      //   //   return 
      //   // }
      //   // else{
      //   //   setSelectedMode(m)
      //   // }
        
        

      // }
      } 
      finally {
        setModePending(false);
      }
      
      
      
    },
    [
      ensureCoverSelectionsExist,
      modePending,
      resolveFirstEnabledGrade,
      refreshBookSelectionsPresence,
      selectionsFrozen,
      navigate,
      school
    ]
  );

  const handleGoToBooksFromCover = useCallback(() => {
    void handleModeSelect('books');
  }, [handleModeSelect]);

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

    // Optimistically sync cover status from localStorage so the menu reflects the
    // change immediately after an admin updates status (server refresh runs next).
    try {
      const schoolId = school?.school_id;
      if (schoolId && typeof window !== 'undefined') {
        const cacheKey = `cover-status-${schoolId}`;
        const raw =
          window.sessionStorage.getItem(cacheKey) ??
          window.localStorage.getItem(cacheKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          const statusVal = (parsed?.status ?? '').toString().trim();
          if (statusVal) {
            setCoverStatusCode(statusVal);
          }
        }
      }
    } catch {
      // ignore storage errors
    }

    // Force re-check of cover status when returning to mode selection so the
    // cover card reflects the latest status (avoid stale status due to
    // preflightCheckRef guard).
    preflightCheckRef.current = { schoolId: null, done: false };
    coverStatusFetchRef.current = { inFlight: false, schoolId: null };
    setCoverStatusChecking(false);
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
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('bookSelectionSchoolId');
      window.localStorage.removeItem('bookSelectionSchoolName');
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

  const handleReturnToAdminWorkspace = useCallback(() => {
    if (!isSuperAdminUser) {
      return;
    }
    setSelectedGrade(null);
    setSelectedMode(null);
    setSchool(null);
    setIsEditingSchoolProfile(false);
  }, [isSuperAdminUser]);

  const handleReturnToBranchList = useCallback(() => {
    const currentSchoolId = school?.school_id;
    if (currentSchoolId) {
      clearCoverWorkflowForSchool(currentSchoolId);
    }
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('bookSelectionSchoolId');
      window.localStorage.removeItem('bookSelectionSchoolName');
    }
    clearPersistedAppState();
    setSelectedGrade(null);
    setSelectedMode(null);
    setCoverDefaults(mergeCoverDefaults());
    setSchool(null);
    setIsEditingSchoolProfile(false);
  }, [school, clearCoverWorkflowForSchool]);

  const handleReturnToHome = useCallback(() => {
    setIsEditingSchoolProfile(false);
    navigate('/');
  }, [navigate, setIsEditingSchoolProfile]);
  async function bookselection() {
  const data = await refreshBookSelectionsPresence(); 
  return data// response available here
  // use data
}

  console.log(coverStatusCode)

  
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
            onBackToHome={!isSuperAdminUser ? handleReturnToHome : undefined}
            isSuperAdmin={isSuperAdminUser}
          />
      ) : !selectedMode ? (
        coverStatusChecking ? (
          <div className="flex min-h-screen items-center justify-center bg-slate-50">
            <div className="flex flex-col items-center gap-3 bg-white shadow-lg rounded-lg px-6 py-6 text-slate-700 border border-slate-200">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-orange-400" />
              <div className="text-sm font-medium text-slate-600">Preparing your dashboard…</div>
            </div>
          </div>
        ) : (
        <ModeSelectionPage
          school={school}
          onModeSelect={handleModeSelect}
          isSuperAdmin={isSuperAdminUser}
          isFrozen={selectionsFrozen}
          hasBookSelections={hasBookSelections}
          
          onBackToWorkspace={handleReturnToAdminWorkspace}
          onBackToDashboard={!isSuperAdminUser ? handleReturnToBranchList : undefined}
          coverstatus={coverStatusCode}
          onEditProfile={() => setIsEditingSchoolProfile(true)}
          modePending={modePending}
        />)
      ) : !selectedGrade && (selectedMode === 'rhymes' ) ? (
        <GradeSelectionPage
          school={school}
          mode={selectedMode}
          onGradeSelect={handleGradeSelect}
          onBackToMode={handleBackToModeSelection}
          
          // coverDefaults={coverDefaults}
          
          onCoverIntentChange={setCoverWorkflowIntent}
          bookselections={bookSelectionsPayload}
        
          
        />
      ) : 
      selectedMode === 'rhymes' ? (
        <RhymeSelectionPage
          school={school}
          grade={selectedGrade}
          customGradeName={resolveStoredGradeName(selectedGrade)}
          onBack={handleBackToGrades}
          onLogout={handleLogout}
          isReadOnly={rhymesFreeze}
          isFrozen={rhymesFreeze}
          isSuperAdmin={isSuperAdminUser}
          onRhymeFreezeChange={setRhymesFreeze}
        />
      ) : 
      selectedMode === 'cover' ? (
        <CoverPageWorkflow
          school={school}
          // grade={selectedGrade}
          onBackToMode={handleBackToModeSelection}
          coverDefaults={coverDefaults}
          isReadOnly={selectionsFrozen || coverWorkflowIntent === 'view'}
          onNavigateToBooks={handleGoToBooksFromCover}
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



