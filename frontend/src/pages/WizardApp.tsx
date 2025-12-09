import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { SCHOOL_DATA, getAssessmentForClass, CLASS_THEMES, DEFAULT_THEME } from '../constants/constants';
import { BookOption, SelectionRecord, AssessmentVariant } from '../types/types';
import ClassSummary from '../components/ClassSummary';
import TitleCustomization from '../components/TitleCustomization';
import { Check, Book, Home, ChevronLeft, Info, Square, CheckSquare } from 'lucide-react';
import { buildFinalBookSelections } from '../lib/bookSelectionUtils';
import { useAuth } from '../hooks/useAuth';
import { API_BASE_URL } from '../lib/utils';
import { loadPersistedAppState } from '../lib/storage';
import { toast } from 'sonner';

export type ViewState = 'LANDING' | 'WIZARD' | 'TITLES' | 'SUMMARY' | 'FINAL';

interface WizardAppProps {
  initialView?: ViewState;
}

const WizardApp: React.FC<WizardAppProps> = ({ initialView = 'LANDING' }) => {
  const navigate = useNavigate();
  const { user, getIdToken } = useAuth();
  const [viewState, setViewState] = useState<ViewState>(initialView);
  
  const defaultGradeNames: Record<string, string> = {
    pg: 'Playgroup',
    playgroup: 'Playgroup',
    nursery: 'Nursery',
    lkg: 'LKG',
    ukg: 'UKG'
  };
  const gradeKeyToClassKey: Record<string, string> = {
    toddler: 'pg',
    playgroup: 'pg',
    nursery: 'nursery',
    lkg: 'lkg',
    ukg: 'ukg'
  };
  const deriveGradeLabelsFromSchool = (grades?: Record<string, { label?: string }> | null) => {
    const merged: Record<string, string> = { ...defaultGradeNames };
    if (!grades) {
      return merged;
    }
    Object.entries(grades).forEach(([rawKey, value]) => {
      const key = rawKey.toLowerCase();
      const mapped = gradeKeyToClassKey[key] || key;
      const label = typeof value?.label === 'string' ? value.label.trim() : '';
      if (mapped && label) {
        merged[mapped] = label;
        if (mapped === 'pg' || mapped === 'playgroup') {
          merged.pg = label;
          merged.playgroup = label;
        }
      }
    });
    if (!merged.pg && merged.playgroup) {
      merged.pg = merged.playgroup;
    }
    return merged;
  };
  const persistedState = loadPersistedAppState() || {};
  const resolveApprovalStatus = (school?: { selection_status?: string; selections_approved?: boolean } | null) => {
    if (!school) {
      return false;
    }
    if (school.selections_approved === true) {
      return true;
    }
    const statusValue = (school.selection_status || '').toString().toLowerCase();
    return statusValue === 'approved';
  };
  const persistedWorkspaceRole = persistedState?.workspaceUser?.role;
  const isPersistedAdmin = persistedWorkspaceRole === 'super-admin';
  const initialGradeNames = deriveGradeLabelsFromSchool(persistedState?.school?.grades);

  const [isLoadingSavedSelections, setIsLoadingSavedSelections] = useState(false);
  const [currentClassIndex, setCurrentClassIndex] = useState<number>(-1);
  const [currentSubjectIndex, setCurrentSubjectIndex] = useState<number>(0);
  const [selections, setSelections] = useState<SelectionRecord[]>([]);
  const [excludedAssessments, setExcludedAssessments] = useState<string[]>([]);
  const [assessmentVariants, setAssessmentVariants] = useState<Record<string, AssessmentVariant>>({});
  const [customAssessmentTitles, setCustomAssessmentTitles] = useState<Record<string, string>>({});
  const [gradeNames, setGradeNames] = useState<Record<string, string>>(initialGradeNames);
  const [viewingInfoForOption, setViewingInfoForOption] = useState<string | null>(null);
  const [skipWorkMap, setSkipWorkMap] = useState<Record<string, boolean>>({});
  const [bookSelectionSchoolId, setBookSelectionSchoolId] = useState<string | null>(null);
  const [isFinalized, setIsFinalized] = useState(resolveApprovalStatus(persistedState?.school));
  const [completedClasses, setCompletedClasses] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') {
      return new Set<string>();
    }
    try {
      const raw = window.localStorage.getItem('bookSelectionCompletedClasses');
      if (!raw) {
        return new Set<string>();
      }
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return new Set(parsed.map((entry) => entry?.toString()));
      }
    } catch (error) {
      console.warn('Unable to load completed classes from storage', error);
    }
    return new Set<string>();
  });
  const API = API_BASE_URL || '/api';
  const isAdmin = (user?.role === 'super-admin') || isPersistedAdmin;
  const configuredClasses = useMemo(() => new Set(selections.map((s) => s.className)), [selections]);
  const configuredOrCompletedClasses = useMemo(() => {
    const combined = new Set<string>();
    selections.forEach((s) => combined.add(s.className));
    completedClasses.forEach((name) => combined.add(name));
    return combined;
  }, [selections, completedClasses]);
  const isClassReadOnly = useCallback(
    (_className: string) => !isAdmin && isFinalized,
    [isAdmin, isFinalized]
  );

  const currentClassData = currentClassIndex >= 0 ? SCHOOL_DATA[currentClassIndex] : null;
  const currentSubject = currentClassData ? currentClassData.subjects[currentSubjectIndex] : null;

  const calculateBookCount = (className: string) => {
    const classSelections = selections.filter(s => s.className === className);
    let count = 0;
    
    classSelections.forEach(s => {
      if (s.selectedOption) {
        if (s.selectedOption.coreId && !s.skipCore) count++;
        if (s.selectedOption.workId && !s.skipWork) count++;
        if (s.selectedOption.addOnId && !s.skipAddon) count++;
      }
    });

    if (!excludedAssessments.includes(className)) {
        const englishSelection = classSelections.find(s => s.subjectName === "English")?.selectedOption || null;
        const mathsSelection = classSelections.find(s => s.subjectName === "Maths")?.selectedOption || null;
        const assessment = getAssessmentForClass(
          className,
          englishSelection,
          mathsSelection,
          assessmentVariants[className] || 'WITH_MARKS'
        );
        if (assessment) count++;
    }

    return count;
  };

  const getTheme = (className: string) => {
    return CLASS_THEMES[className] || DEFAULT_THEME;
  };

  const getAssessmentVariantForClass = (className: string): AssessmentVariant => {
    return assessmentVariants[className] || 'WITH_MARKS';
  };

  const getGradeLabelForClass = (className: string): string => {
    const key = className.toLowerCase();
    const mappedKey = key === 'playgroup' ? 'pg' : key;
    return gradeNames[mappedKey] || className;
  };

  const findOptionForSavedItem = (className: string, item: any): { option: BookOption; subjectName: string } | null => {
    const classData = SCHOOL_DATA.find((c) => c.name.toLowerCase() === className.toLowerCase());
    if (!classData) return null;

    for (const subject of classData.subjects) {
      for (const opt of subject.options) {
        const matchesCore = item.core && opt.coreId === item.core;
        const matchesWork = item.work && opt.workId === item.work;
        const matchesAddon = item.addOn && opt.addOnId === item.addOn;
        const matchesLabel = item.type && opt.label === item.type;
        if (matchesCore || matchesWork || matchesAddon || matchesLabel) {
          return { option: opt, subjectName: subject.name };
        }
      }
    }
    return null;
  };

  const buildSelectionFromSavedItem = useCallback((className: string, item: any): SelectionRecord | null => {
    const match = findOptionForSavedItem(className, item);
    const baseOption: BookOption =
      match?.option || {
        typeId: item.core || item.work || item.addOn || item.type || `${className}-${item.subject || 'item'}`,
        label: item.type || item.subject || 'Selection',
        coreId: item.core,
        workId: item.work,
        addOnId: item.addOn,
        coreCover: item.core_cover,
        workCover: item.work_cover,
        addOnCover: item.addon_cover,
        isRecommended: false
      };

    const option: BookOption = {
      ...baseOption,
      coreId: baseOption.coreId || item.core,
      workId: baseOption.workId || item.work,
      addOnId: baseOption.addOnId || item.addOn,
      defaultCoreCoverTitle: baseOption.defaultCoreCoverTitle || item.core_cover_title,
      defaultWorkCoverTitle: baseOption.defaultWorkCoverTitle || item.work_cover_title,
      defaultAddonCoverTitle: baseOption.defaultAddonCoverTitle || item.addon_cover_title
    };

    const subjectName =
      match?.subjectName ||
      item.subject ||
      option.jsonSubject ||
      option.label ||
      'Subject';

    const skipCore = !item.core;
    const skipWork = !item.work;
    const skipAddon = !item.addOn;

    return {
      className,
      subjectName,
      selectedOption: option,
      skipCore,
      skipWork,
      skipAddon,
      customCoreTitle: item.core_cover_title,
      customWorkTitle: item.work_cover_title,
      customAddonTitle: item.addon_cover_title
    };
  }, [findOptionForSavedItem]);

  const persistCompletedClasses = useCallback((next: Set<string>) => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem('bookSelectionCompletedClasses', JSON.stringify(Array.from(next)));
    } catch (error) {
      console.warn('Unable to persist completed classes', error);
    }
  }, []);

  const handleStartClass = (index: number) => {
    const className = SCHOOL_DATA[index]?.name;
    const readOnlyForClass = className ? isClassReadOnly(className) : false;
    const isConfigured = className ? configuredClasses.has(className) : false;
    setCurrentClassIndex(index);
    if (readOnlyForClass) {
      if (isConfigured) {
        setViewState('SUMMARY');
        setViewingInfoForOption(null);
        setSkipWorkMap({});
        return;
      }
      toast.info('Book selections are locked after finishing.');
      return;
    }
    setCurrentSubjectIndex(0);
    setViewState('WIZARD');
    setViewingInfoForOption(null);
    setSkipWorkMap({});
  };
  
  const handleViewSummary = (index: number) => {
    setCurrentClassIndex(index);
    setViewState('SUMMARY');
  }

  const handleGoHome = () => {
    setViewState('LANDING');
    setCurrentClassIndex(-1);
    setCurrentSubjectIndex(0);
    setViewingInfoForOption(null);
    setSkipWorkMap({});
  };

  const handleReturnToMainMenu = () => {
    setViewState('LANDING');
    setCurrentClassIndex(-1);
    setCurrentSubjectIndex(0);
    navigate('/');
  };

  const handleOptionSelect = (option: BookOption | null) => {
    if (!currentClassData || !currentSubject) return;

    // Any new change unlocks finalized state for editing
    if (isFinalized && !isClassReadOnly(currentClassData.name)) {
      setIsFinalized(false);
    }

    const shouldSkipWork = option && option.workId ? !!skipWorkMap[option.typeId] : false;

    if (currentSubject.isMultiSelect) {
        if (option === null) {
            const newSelections = selections.filter(
                s => !(s.className === currentClassData.name && s.subjectName === currentSubject.name)
            );
            setSelections(newSelections);
            advanceStep();
            return;
        }

        const existingIndex = selections.findIndex(s => 
            s.className === currentClassData.name && 
            s.subjectName === currentSubject.name && 
            s.selectedOption?.typeId === option.typeId
        );

        let newSelections = [...selections];
        if (existingIndex >= 0) {
            newSelections.splice(existingIndex, 1);
        } else {
            newSelections.push({
                className: currentClassData.name,
                subjectName: currentSubject.name,
                selectedOption: option,
                skipWork: shouldSkipWork,
                skipAddon: false,
                skipCore: false
            });
        }
        setSelections(newSelections);
    } else {
        const newSelections = selections.filter(
          s => !(s.className === currentClassData.name && s.subjectName === currentSubject.name)
        );

        newSelections.push({
          className: currentClassData.name,
          subjectName: currentSubject.name,
          selectedOption: option,
          skipWork: shouldSkipWork,
          skipAddon: false,
          skipCore: false
        });

        setSelections(newSelections);
        setSkipWorkMap({});
        advanceStep();
    }
  };

  const advanceStep = () => {
      if (!currentClassData) return;
      if (currentSubjectIndex < currentClassData.subjects.length - 1) {
        setCurrentSubjectIndex(prev => prev + 1);
        setViewingInfoForOption(null);
        setSkipWorkMap({});
      } else {
        setViewState('TITLES');
      }
  };

  const handleUpdateSelection = (updatedSelections: SelectionRecord[]) => {
      setSelections(updatedSelections);
  };
  
  const handleExcludeAssessment = (className: string) => {
      setExcludedAssessments(prev => [...prev, className]);
  };
  
  const handleRestoreAssessment = (className: string) => {
      setExcludedAssessments(prev => prev.filter(c => c !== className));
  };

  const handleAssessmentVariantChange = (className: string, variant: AssessmentVariant) => {
      setAssessmentVariants(prev => ({ ...prev, [className]: variant }));
  };

  const handleUpdateAssessmentTitle = (className: string, title: string) => {
      setCustomAssessmentTitles(prev => ({ ...prev, [className]: title }));
  };

  const markClassCompleted = (className: string) => {
    const next = new Set(completedClasses);
    next.add(className);
    setCompletedClasses(next);
    persistCompletedClasses(next);
  };

  const handleFinishAll = async () => {
    const saved = await persistFinalSelections();
    if (!saved) {
      return;
    }
    const allClasses = new Set(completedClasses);
    selections.forEach((s) => allClasses.add(s.className));
    setCompletedClasses(allClasses);
    persistCompletedClasses(allClasses);
    setViewState('LANDING');
    setCurrentClassIndex(-1);
    setCurrentSubjectIndex(0);
    setViewingInfoForOption(null);
    setSkipWorkMap({});
  };

  const handleReset = () => {
    setSelections([]);
    setExcludedAssessments([]);
    setAssessmentVariants({});
    setCustomAssessmentTitles({});
    setCompletedClasses(new Set());
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('bookSelectionCompletedClasses');
    }
    setIsFinalized(false);
    setCurrentClassIndex(-1);
    setCurrentSubjectIndex(0);
    setViewState('LANDING');
  };

  const getSelectionsForCurrentSubject = () => {
    if (!currentClassData || !currentSubject) return [];
    return selections.filter(
      s => s.className === currentClassData.name && s.subjectName === currentSubject.name
    );
  };

  const getCurrentAssessmentDetails = () => {
    if (!currentClassData) return null;
    const classSelections = selections.filter(s => s.className === currentClassData.name);
    const englishSelection = classSelections.find(s => s.subjectName === "English")?.selectedOption || null;
    const mathsSelection = classSelections.find(s => s.subjectName === "Maths")?.selectedOption || null;
    return getAssessmentForClass(
      currentClassData.name,
      englishSelection,
      mathsSelection,
      getAssessmentVariantForClass(currentClassData.name)
    );
  };
  
  const toggleSkipWork = (optionId: string) => {
    setSkipWorkMap(prev => ({
        ...prev,
        [optionId]: !prev[optionId]
    }));
  };
  
  const isOptionSelected = (optionId: string) => {
      const currentSelections = getSelectionsForCurrentSubject();
      return currentSelections.some(s => s.selectedOption?.typeId === optionId);
  };

  const resolveLatestGradeNames = useCallback(() => {
    const persistedState = loadPersistedAppState();
    const persistedGrades = persistedState?.school?.grades;
    return deriveGradeLabelsFromSchool(persistedGrades);
  }, []);

  const persistFinalSelections = useCallback(async (): Promise<boolean> => {
    const schoolIdFromStorage =
      typeof window !== 'undefined' ? window.localStorage.getItem('bookSelectionSchoolId') : null;
    const persistedState = loadPersistedAppState();
    const schoolIdFromPersisted =
      persistedState?.school?.school_id ?? null;

    const resolvedSchoolId =
      bookSelectionSchoolId ||
      schoolIdFromStorage ||
      schoolIdFromPersisted ||
      null;

    if (!resolvedSchoolId) {
      console.warn('Missing school id for book selections; not saving');
      return;
    }
    if (selections.length === 0) {
      return;
    }

    const latestGradeNames = resolveLatestGradeNames();
    setGradeNames(latestGradeNames);

    const payload = {
      school_id: resolvedSchoolId,
      selections: buildFinalBookSelections(
        selections,
        excludedAssessments,
        assessmentVariants,
        customAssessmentTitles,
        latestGradeNames
      ),
      excluded_assessments: excludedAssessments,
      grade_names: latestGradeNames,
      source: 'wizard'
    };

    try {
      const token = await getIdToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
      await axios.post(`${API}/book-selections`, payload, { headers });
      toast.success('Book selections saved successfully');
      return true;
    } catch (error) {
      console.warn('Unable to persist book selections', error);
      toast.error('Unable to save book selections. Please try again.');
      return false;
    }
  }, [API, assessmentVariants, bookSelectionSchoolId, customAssessmentTitles, excludedAssessments, getIdToken, resolveLatestGradeNames, selections, user?.schoolId]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedId = window.localStorage.getItem('bookSelectionSchoolId');
      if (storedId) {
        setBookSelectionSchoolId(storedId);
      }

      try {
        const raw = window.localStorage.getItem('bookSelectionCompletedClasses');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            setCompletedClasses(new Set(parsed.map((entry) => entry?.toString())));
          }
        }
      } catch (error) {
        console.warn('Unable to load completed classes from storage', error);
      }
    }

      const persistedState = loadPersistedAppState();
      const persistedSchoolId = persistedState?.school?.school_id;
      const persistedGrades = persistedState?.school?.grades;
      setGradeNames(deriveGradeLabelsFromSchool(persistedGrades));

      if (persistedSchoolId) {
        setBookSelectionSchoolId(persistedSchoolId);
        if (typeof window !== 'undefined') {
          window.localStorage.setItem('bookSelectionSchoolId', persistedSchoolId);
        }
      }
  }, []);

  const fetchSavedSelections = useCallback(async () => {
    if (!bookSelectionSchoolId) {
      return;
    }
    setIsLoadingSavedSelections(true);
    try {
      const token = await getIdToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
      const response = await axios.get(`${API}/book-selections/${bookSelectionSchoolId}`, { headers, validateStatus: () => true });
      if (response.status >= 400) {
        return;
      }
      const classes = response.data?.classes || [];
      const nextSelections: SelectionRecord[] = [];
      const nextExcluded: Set<string> = new Set();
      const nextCompleted: Set<string> = new Set(completedClasses);

      classes.forEach((entry: any) => {
        const rawClass = entry.class || entry.class_name || '';
        if (!rawClass) {
          return;
        }
        const normalizedClass =
          SCHOOL_DATA.find((c) => c.name.toLowerCase() === rawClass.toLowerCase())?.name ||
          rawClass;
        const items = Array.isArray(entry.items) ? entry.items : [];
      const excludedList = Array.isArray(entry.excluded_assessments) ? entry.excluded_assessments : [];
      excludedList.forEach((c) => {
        if (typeof c === 'string') {
          nextExcluded.add(
            SCHOOL_DATA.find((cls) => cls.name.toLowerCase() === c.toLowerCase())?.name || c
          );
        }
      });
      items.forEach((item: any) => {
        const selection = buildSelectionFromSavedItem(normalizedClass, item);
        if (selection) {
          nextSelections.push(selection);
        }
      });
      if (items.length > 0) {
        nextCompleted.add(normalizedClass);
      }
    });

      const serverApproved = Array.isArray(classes)
        ? classes.some((entry: any) => {
            const statusValue = (entry?.selection_status || entry?.status || '').toString().toLowerCase();
            return entry?.approved === true || statusValue === 'approved';
          })
        : false;

      setSelections(nextSelections);
      setExcludedAssessments(Array.from(nextExcluded));
      setCompletedClasses((prev) => {
        const merged = new Set(prev);
        nextCompleted.forEach((cls) => merged.add(cls));
        persistCompletedClasses(merged);
        return merged;
      });
      setIsFinalized(resolveApprovalStatus(persistedState?.school) || serverApproved);
    } catch (error) {
      console.warn('Unable to fetch saved book selections', error);
    } finally {
      setIsLoadingSavedSelections(false);
    }
  }, [API, bookSelectionSchoolId, buildSelectionFromSavedItem, getIdToken, persistCompletedClasses, resolveApprovalStatus, persistedState?.school]);

  const lastFetchedSchoolId = useRef<string | null>(null);

  useEffect(() => {
    if (!bookSelectionSchoolId) {
      return;
    }
    if (lastFetchedSchoolId.current === bookSelectionSchoolId) {
      return;
    }
    lastFetchedSchoolId.current = bookSelectionSchoolId;
    void fetchSavedSelections();
  }, [bookSelectionSchoolId, fetchSavedSelections]);

  if (viewState === 'TITLES' && currentClassData) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <Header
          onHome={handleGoHome}
          hasFinish={selections.length > 0}
          onFinish={handleFinishAll}
          showReturnToMenu={viewState === 'LANDING'}
          onReturnToMenu={handleReturnToMainMenu}
        />
        <TitleCustomization
          classData={currentClassData}
          selections={selections}
          onUpdateSelections={handleUpdateSelection}
          assessmentDetails={getCurrentAssessmentDetails()}
          customAssessmentTitle={customAssessmentTitles[currentClassData.name]}
          onUpdateAssessmentTitle={(title) => handleUpdateAssessmentTitle(currentClassData.name, title)}
          onNext={() => setViewState('SUMMARY')}
          onBack={() => {
            setViewState('WIZARD');
            setCurrentSubjectIndex(Math.max(currentClassData.subjects.length - 1, 0));
          }}
        />
      </div>
    );
  }

  if (viewState === 'SUMMARY' && currentClassData) {
    const readOnlySummary = isClassReadOnly(currentClassData.name);
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
          <Header
            onHome={handleGoHome}
            hasFinish={selections.length > 0}
            onFinish={handleFinishAll}
            showReturnToMenu={viewState === 'LANDING'}
            onReturnToMenu={handleReturnToMainMenu}
          />
          <ClassSummary 
            classData={currentClassData}
            selections={selections}
            excludedAssessments={excludedAssessments}
            assessmentVariants={assessmentVariants}
            readOnly={readOnlySummary}
            onUpdateSelections={handleUpdateSelection}
            onExcludeAssessment={handleExcludeAssessment}
            onRestoreAssessment={handleRestoreAssessment}
            onConfirm={() => {
              if (!readOnlySummary) {
                markClassCompleted(currentClassData.name);
              }
              handleGoHome();
            }}
            onBack={() => {
                if (readOnlySummary) {
                  handleGoHome();
                  return;
                }
                setViewState('TITLES');
            }}
          />
      </div>
    );
  }

  if (viewState === 'WIZARD' && currentClassData && currentSubject) {
    const theme = getTheme(currentClassData.name);
    const bookCount = calculateBookCount(currentClassData.name);
    const currentGradeLabel = getGradeLabelForClass(currentClassData.name);

    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <Header
          onHome={handleGoHome}
          hasFinish={false}
          onFinish={() => {}}
          showReturnToMenu={viewState === 'LANDING'}
          onReturnToMenu={handleReturnToMainMenu}
        />
        
        <div className="flex-1 flex flex-col items-center py-4 px-3 md:py-6 md:px-4">
            {/* Wizard header */}
            <div className="w-full max-w-2xl mb-4">
                <div className={`flex items-center gap-1.5 mb-2 cursor-pointer ${theme.textSub}`} onClick={handleGoHome}>
                    <ChevronLeft size={16} />
                    <span className="text-xs md:text-sm font-medium">Dashboard</span>
                </div>
                <div className="flex items-center justify-between mb-2">
                    <h1 className={`text-lg md:text-xl font-bold ${theme.textMain}`}>{currentGradeLabel} Selection</h1>
                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${theme.light}`}>
                        <Book size={16} className={theme.iconText} />
                        <span className={`text-sm font-bold ${theme.iconText}`}>
                            {bookCount} Books Selected
                        </span>
                    </div>
                </div>
            </div>

            {/* Question Card */}
            <div className="w-full max-w-2xl bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden flex flex-col">
                <div className="p-4 border-b border-slate-100">
                    <h2 className="text-xl md:text-2xl font-bold text-slate-800 leading-tight">
                        {currentSubject.name}
                        {currentSubject.isMultiSelect && <span className="ml-2 text-sm text-slate-500">(Select multiple)</span>}
                    </h2>
                </div>
                
                <div className="p-3 md:p-6 space-y-3 overflow-y-auto max-h-[65vh] md:max-h-none">
                {currentSubject.options.map((option) => {
                    const isSelected = isOptionSelected(option.typeId);

                    return (
                        <div 
                            key={option.typeId} 
                            className={`relative rounded-lg border ${isSelected ? theme.selectedBorder + " " + theme.selectedBg : "border-slate-200"}`}
                        >
                            <div className="p-3 flex items-center gap-3">
                                <div className="flex-1 min-w-0 flex items-start gap-3">
                                    {currentSubject.isMultiSelect && (
                                        <div 
                                            onClick={(e) => { e.stopPropagation(); handleOptionSelect(option); }}
                                            className="mt-1 cursor-pointer"
                                        >
                                            {isSelected 
                                                ? <CheckSquare className={`${theme.textMain}`} size={20} /> 
                                                : <Square className="text-slate-300" size={20} />
                                            }
                                        </div>
                                    )}
                                    
                                    <div className="flex-1">
                                        <div className="flex items-center gap-x-2 mb-1">
                                            <span className={`font-semibold text-sm ${isSelected ? theme.textMain : 'text-slate-800'}`}>
                                                {option.jsonSubject && <span className="mr-1 text-slate-500">{option.jsonSubject}:</span>}
                                                {option.label}
                                            </span>
                                        </div>

                                        {option.workId && (
                                            <label className="flex items-center gap-1.5 text-xs cursor-pointer text-slate-500">
                                                <input 
                                                    type="checkbox" 
                                                    checked={!skipWorkMap[option.typeId]}
                                                    onChange={() => toggleSkipWork(option.typeId)}
                                                />
                                                <span>Include Workbook</span>
                                            </label>
                                        )}
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    {option.info && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setViewingInfoForOption(viewingInfoForOption === option.typeId ? null : option.typeId);
                                            }}
                                            className="p-2 text-slate-400 hover:text-slate-700"
                                        >
                                            <Info size={18} />
                                        </button>
                                    )}

                                    {!currentSubject.isMultiSelect && (
                                        <button
                                            onClick={() => handleOptionSelect(option)}
                                            className={`px-3 py-1.5 text-white text-xs rounded-lg ${theme.primary}`}
                                        >
                                            Select
                                        </button>
                                    )}
                                </div>
                            </div>

                            {viewingInfoForOption === option.typeId && option.info && (
                                <div className="p-3 bg-blue-50">
                                    <p className="text-sm text-slate-700">
                                        <strong>Description:</strong> {option.info}
                                    </p>
                                </div>
                            )}
                        </div>
                    );
                })}
                </div>

                <div className="p-3 bg-slate-50 border-t flex justify-between">
                    {currentSubjectIndex > 0 ? (
                        <button 
                            onClick={() => {
                                setCurrentSubjectIndex(prev => prev - 1);
                                setViewingInfoForOption(null);
                            }}
                            className="text-xs text-slate-500"
                        >
                            &lt; Back
                        </button>
                    ) : (
                        <div />
                    )}

                    <div className="flex gap-3">
                        {currentSubject.isMultiSelect ? (
                            <>
                                <button 
                                    onClick={() => handleOptionSelect(null)}
                                    className="text-xs text-slate-500"
                                >
                                    Skip
                                </button>
                                <button 
                                    onClick={advanceStep}
                                    className={`px-4 py-2 text-white text-sm rounded-lg ${theme.primary}`}
                                >
                                    Next 
                                </button>
                            </>
                        ) : (
                            <button 
                                onClick={() => handleOptionSelect(null)}
                                className="text-xs text-slate-500"
                            >
                                Skip Subject
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------
  // LANDING PAGE (default)
  // ------------------------------------------------------------

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Header
        onHome={handleGoHome}
        hasFinish={selections.length > 0}
        onFinish={handleFinishAll}
        showReturnToMenu={viewState === 'LANDING'}
        onReturnToMenu={handleReturnToMainMenu}
      />

      <main className="flex-1 max-w-6xl mx-auto w-full p-4">
        {!isAdmin && isFinalized && (
          <div className="mb-6">
            <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg shadow-sm text-sm">
              Book selections are approved and locked. Further changes are disabled. Please contact an admin for any updates.
            </div>
          </div>
        )}
        <div className="text-center mt-6 mb-10">
            <h2 className="text-4xl font-extrabold">Customise your Curriculum</h2>
            <p className="text-slate-600 mt-2">Select book sets for each grade level.</p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {SCHOOL_DATA.map((cls, index) => {
            const isConfigured = configuredOrCompletedClasses.has(cls.name);
            const bookCount = isConfigured ? calculateBookCount(cls.name) : 0;
            const theme = getTheme(cls.name);
            const gradeLabel = getGradeLabelForClass(cls.name);
            const readOnlyForClass = isClassReadOnly(cls.name);
            const isCompleted = completedClasses.has(cls.name);
            
            return (
                <div
                    key={cls.name}
                    className={`relative p-4 rounded-xl border-2 ${theme.cardBg} ${theme.cardBorder}`}
                >
                    {isConfigured && (
                        <div className="absolute top-2 right-2 text-green-600 bg-green-100 rounded-full p-1">
                            <Check size={14} strokeWidth={3} />
                        </div>
                    )}
                    
                    <div className="text-center">
                        <h3 className={`text-xl font-extrabold ${theme.textMain}`}>
                            {gradeLabel}
                        </h3>
                        
                        {isConfigured && (
                            <div className="inline-flex items-center gap-1 px-2 py-1 bg-white/60 rounded-full border border-green-200 text-green-800 text-xs font-medium mt-2">
                                <Book size={12} />
                                <span>{bookCount} Books</span>
                            </div>
                        )}
                    </div>
                    
                    <div className="mt-4 flex gap-2">
                         {isConfigured ? (
                             <>
                                <button 
                                    type="button"
                                    onClick={() => handleViewSummary(index)}
                                    className="flex-1 text-xs py-2 bg-white border rounded-lg"
                                >
                                    {readOnlyForClass || isCompleted ? 'View' : 'Summary'}
                                </button>
                                {!readOnlyForClass && (
                                  <button 
                                      type="button"
                                      onClick={() => handleStartClass(index)}
                                      className={`flex-1 text-xs py-2 rounded-lg ${theme.primary} text-white`}
                                  >
                                      Edit
                                  </button>
                                )}
                             </>
                         ) : (
                             <button
                                type="button"
                                onClick={() => handleStartClass(index)}
                                disabled={readOnlyForClass}
                                className={`w-full text-xs py-2 rounded-lg ${theme.textSub} bg-white ${readOnlyForClass ? 'opacity-50 cursor-not-allowed' : ''}`}
                             >
                                Start
                             </button>
                         )}
                    </div>
                </div>
            );
          })}
        </div>
      </main>

      <footer className="bg-white border-t py-4 text-center text-slate-400 text-xs">
        (c) {new Date().getFullYear()} Edplore Book Selector System
      </footer>
    </div>
  );
}

export default WizardApp;

type HeaderProps = {
    onHome: () => void;
    hasFinish: boolean;
    onFinish: () => void;
    showReturnToMenu?: boolean;
    onReturnToMenu?: () => void;
};

// HEADER Component
const Header = ({ onHome, hasFinish, onFinish, showReturnToMenu = false, onReturnToMenu }: HeaderProps) => (
    <header className="bg-white border-b py-3 px-6 shadow-sm sticky top-0">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2 cursor-pointer" onClick={onHome}>
                <img src=".../Edplore-book-selector-logo.png" alt="Logo" className="w-8 h-8" />

                <h1 className="text-xl font-bold">Edplore Book Selector</h1>
            </div>

            <div className="flex items-center gap-3">
                {showReturnToMenu ? (
                    <button 
                        onClick={onReturnToMenu ?? onHome}
                        className="flex items-center gap-2 text-slate-600 hover:text-indigo-600"
                    >
                        <ChevronLeft size={16} />
                        <span className="hidden sm:inline">Return to main menu</span>
                    </button>
                ) : (
                    <button 
                        onClick={onHome}
                        className="flex items-center gap-2 text-slate-600 hover:text-indigo-600"
                    >
                        <Home size={16} />
                        <span className="hidden sm:inline">Dashboard</span>
                    </button>
                )}

                {hasFinish && (
                    <button 
                    onClick={onFinish}
                    className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg"
                    >
                        <Check size={16} />
                        <span className="hidden sm:inline">Finish</span>
                    </button>
                )}
            </div>
        </div>
    </header>
);
