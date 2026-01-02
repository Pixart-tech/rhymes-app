import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { SCHOOL_DATA, getAssessmentForClass, CLASS_THEMES, DEFAULT_THEME } from '../constants/constants';
import { BookOption, SelectionRecord, AssessmentVariant, FinalOutputItem } from '../types/types';
import ClassSummary from '../components/ClassSummary';
import TitleCustomization from '../components/TitleCustomization';
import { Check, Book, Home, ChevronLeft, Info, Square, CheckSquare } from 'lucide-react';
import { buildFinalBookSelections } from '../lib/bookSelectionUtils';
import { useAuth } from '../hooks/useAuth';
import { API_BASE_URL } from '../lib/utils';
import { loadPersistedAppState } from '../lib/storage';
import { toast } from 'sonner';
const SIGNATURE_FIELDS = [
  'class',
  'class_label',
  'subject',
  'grade_subject',
  'type',
  'core',
  'core_cover',
  'core_cover_title',
  'core_spine',
  'work',
  'work_cover',
  'work_cover_title',
  'work_spine',
  'addOn',
  'addon_cover',
  'addon_cover_title',
  'addon_spine',
  // 'cover_theme_id',
  // 'cover_theme_label',
  // 'cover_colour_id',
  // 'cover_colour_label',
  'cover_status',
];

const buildStableObject = (value: any): any => {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => buildStableObject(entry));
  }
  const sortedKeys = Object.keys(value).sort();
  const result: Record<string, any> = {};
  sortedKeys.forEach((key) => {
    result[key] = buildStableObject(value[key]);
  });
  return result;
};

const normalizeItemForSignature = (item: any) => {
  if (!item || typeof item !== 'object') {
    return item;
  }
  const normalized: Record<string, any> = {};
  SIGNATURE_FIELDS.forEach((key) => {
    if (item[key] !== undefined) {
      normalized[key] = item[key];
    }
  });
  return normalized;
};

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
  const [finishStatus, setFinishStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [hasAcceptedTerms, setHasAcceptedTerms] = useState<boolean>(() => {
    if (typeof window === 'undefined') {
      return false;
    }
    try {
      return window.localStorage.getItem('bookSelectionTermsAccepted') === 'true';
    } catch {
      return false;
    }
  });
  const [showTermsModal, setShowTermsModal] = useState(false);
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
  const [savedClassSignatures, setSavedClassSignatures] = useState<Record<string, string>>({});
  const [savedExcludedAssessments, setSavedExcludedAssessments] = useState<string[]>([]);
  const configuredClasses = useMemo(() => new Set(selections.map((s) => s.className)), [selections]);
  const configuredOrCompletedClasses = useMemo(() => {
    const combined = new Set<string>();
    selections.forEach((s) => combined.add(s.className));
    completedClasses.forEach((name) => combined.add(name));
    return combined;
  }, [selections, completedClasses]);
  const isClassReadOnly = useCallback(
    (_className: string) => isFinalized,
    [isFinalized]
  );
  const selectionSignature = useMemo(
    () =>
      JSON.stringify({
        selections,
        excludedAssessments,
        assessmentVariants,
        customAssessmentTitles,
      }),
    [assessmentVariants, customAssessmentTitles, excludedAssessments, selections]
  );
  const lastSavedSelectionSignature = useRef<string | null>(null);
  const hasPendingSelections = selections.length > 0;
  const needsTermsAcceptance = !isFinalized && hasPendingSelections && !hasAcceptedTerms;
  const canFinish = !isFinalized && hasPendingSelections && finishStatus !== 'success' && hasAcceptedTerms;

  useEffect(() => {
    if (finishStatus === 'success' && selectionSignature !== lastSavedSelectionSignature.current) {
      setFinishStatus('idle');
    }
    if (finishStatus === 'error' && selectionSignature === lastSavedSelectionSignature.current) {
      setFinishStatus('idle');
    }
  }, [finishStatus, selectionSignature]);

  useEffect(() => {
    if (!hasAcceptedTerms) {
      return;
    }
    if (typeof window === 'undefined') {
      return;
    }
    try {
      window.localStorage.setItem('bookSelectionTermsAccepted', 'true');
    } catch (error) {
      console.warn('Unable to persist terms acceptance', error);
    }
  }, [hasAcceptedTerms]);

  const currentClassData = currentClassIndex >= 0 ? SCHOOL_DATA[currentClassIndex] : null;
  const currentSubject = currentClassData ? currentClassData.subjects[currentSubjectIndex] : null;

  const calculateBookCount = (className: string) => {
    const classSelections = selections.filter(s => s.className === className);
    let count = 0;

    const hasActive = (s: SelectionRecord): boolean => {
      if (!s.selectedOption) return false;
      const coreActive = !!s.selectedOption.coreId && !s.skipCore;
      const workActive = !!s.selectedOption.workId && !s.skipWork;
      const addonActive = !!s.selectedOption.addOnId && !s.skipAddon;
      return coreActive || workActive || addonActive;
    };
    
    classSelections.forEach(s => {
      if (s.selectedOption) {
        if (hasActive(s) && !!s.selectedOption.coreId && !s.skipCore) count++;
        if (hasActive(s) && !!s.selectedOption.workId && !s.skipWork) count++;
        if (hasActive(s) && !!s.selectedOption.addOnId && !s.skipAddon) count++;
      }
    });

    if (!excludedAssessments.includes(className)) {
        const englishSelection = classSelections.find(s => s.subjectName === "English" && hasActive(s))?.selectedOption || null;
        const mathsSelection = classSelections.find(s => s.subjectName === "Maths" && hasActive(s))?.selectedOption || null;
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

  const computeClassSignature = useCallback(
    (items: any[]) => {
      const normalized = items.map((item) => buildStableObject(normalizeItemForSignature(item)));
      const uniqueStrings = Array.from(new Set(normalized.map((entry) => JSON.stringify(entry)))).sort(
        (a, b) => a.localeCompare(b)
      );
      return JSON.stringify(uniqueStrings);
    },
    [buildStableObject, normalizeItemForSignature]
  );

  const buildPayloadClassSignatures = useCallback(
    (finalItems: FinalOutputItem[]) => {
      const grouped: Record<string, FinalOutputItem[]> = {};
      finalItems.forEach((item) => {
        const classKey = item.class_label || item.class || '';
        if (!classKey) {
          return;
        }
        if (!grouped[classKey]) {
          grouped[classKey] = [];
        }
        grouped[classKey].push(item);
      });

      const signatures: Record<string, string> = {};
      Object.entries(grouped).forEach(([className, items]) => {
        signatures[className] = computeClassSignature(items);
      });

      return signatures;
    },
    [computeClassSignature]
  );

  const getGradeLabelForClass = (className: string): string => {
    const key = className.toLowerCase();
    const mappedKey = key === 'playgroup' ? 'pg' : key;
    return gradeNames[mappedKey] || className;
  };

  const findOptionForSavedItem = (className: string, item: any): { option: BookOption; subjectName: string } | null => {
    const classData = SCHOOL_DATA.find((c) => c.name.toLowerCase() === className.toLowerCase());
    if (!classData) return null;

    let subjectAwareLabelMatch: { option: BookOption; subjectName: string } | null = null;
    let labelMatch: { option: BookOption; subjectName: string } | null = null;

    const normalizedSavedSubject = typeof item?.subject === 'string' ? item.subject.toLowerCase() : null;

    for (const subject of classData.subjects) {
      for (const opt of subject.options) {
        const matchesCore = item.core && opt.coreId === item.core;
        const matchesWork = item.work && opt.workId === item.work;
        const matchesAddon = item.addOn && opt.addOnId === item.addOn;
        if (matchesCore || matchesWork || matchesAddon) {
          return { option: opt, subjectName: subject.name };
        }

        const matchesLabel = item.type && opt.label === item.type;
        const matchesLabelAndSubject =
          matchesLabel &&
          normalizedSavedSubject &&
          typeof opt.jsonSubject === 'string' &&
          opt.jsonSubject.toLowerCase() === normalizedSavedSubject;

        if (matchesLabelAndSubject && !subjectAwareLabelMatch) {
          subjectAwareLabelMatch = { option: opt, subjectName: subject.name };
        } else if (matchesLabel && !labelMatch) {
          labelMatch = { option: opt, subjectName: subject.name };
        }
      }
    }

    return subjectAwareLabelMatch || labelMatch;
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

  const handleAcceptTerms = () => {
    setHasAcceptedTerms(true);
    setShowTermsModal(false);
  };

  const handleDismissTerms = () => {
    setShowTermsModal(false);
  };

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
            // Clear all selections for this subject when skipping in edit mode
            const clearedSelections = selections.filter(
              s => !(s.className === currentClassData.name && s.subjectName === currentSubject.name)
            );
            setSelections(clearedSelections);
            setSkipWorkMap({});
            advanceStep();
            return;
        }

        const existingIndex = selections.findIndex(
          s =>
            s.className === currentClassData.name &&
            s.subjectName === currentSubject.name &&
            s.selectedOption?.typeId === option.typeId
        );

        const nextSelections = [...selections];

        if (existingIndex >= 0) {
          nextSelections.splice(existingIndex, 1);
          setSelections(nextSelections);
          setSkipWorkMap((prev) => {
            const next = { ...prev };
            delete next[option.typeId];
            return next;
          });
        } else {
          nextSelections.push({
            className: currentClassData.name,
            subjectName: currentSubject.name,
            selectedOption: option,
            skipWork: shouldSkipWork,
            skipAddon: false,
            skipCore: false
          });
          setSelections(nextSelections);
        }
    } else {
        if (option === null) {
          // Skip subject in edit mode without removing existing selections
          advanceStep();
          return;
        }

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

  const handleAddManualSubject = (
    className: string,
    subject: string,
    coreCode: string,
    coreCover: string,
    coreSpine: string
  ) => {
    const trimmedSubject = subject.trim();
    const subjectName = trimmedSubject || 'Custom Subject';
    const option: BookOption = {
      typeId: `manual-${className}-${subjectName}-${coreCode}`.replace(/\s+/g, '-').toLowerCase(),
      label: 'Custom',
      coreId: coreCode,
      coreCover: coreCover || undefined,
      coreSpine: coreSpine || undefined,
      isRecommended: false,
      jsonSubject: subjectName
    };

    setSelections((prev) => {
      const filtered = prev.filter(
        (item) =>
          !(
            item.className === className &&
            item.subjectName.toLowerCase() === subjectName.toLowerCase() &&
            item.selectedOption?.typeId === option.typeId
          )
      );

      return [
        ...filtered,
        {
          className,
          subjectName,
          selectedOption: option,
          skipCore: false,
          skipWork: true,
          skipAddon: true
        }
      ];
    });
  };

  const markClassCompleted = (className: string) => {
    const next = new Set(completedClasses);
    next.add(className);
    setCompletedClasses(next);
    persistCompletedClasses(next);
  };

  const handleFinishAll = async () => {
    if (!hasAcceptedTerms) {
      setShowTermsModal(true);
      toast.error('Please accept the terms and conditions before finishing.');
      return;
    }

    setFinishStatus('saving');
    const saved = await persistFinalSelections();
    if (!saved) {
      setFinishStatus('error');
      return;
    }
    // Refresh from server so the UI shows the latest selections without a manual reload
    await fetchSavedSelections();
    setFinishStatus('success');
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
    setHasAcceptedTerms(false);
    setShowTermsModal(false);
    setCompletedClasses(new Set());
    setFinishStatus('idle');
    lastSavedSelectionSignature.current = null;
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('bookSelectionCompletedClasses');
      window.localStorage.removeItem('bookSelectionTermsAccepted');
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
      toast.error('Unable to save book selections. Missing school information.');
      return false;
    }
    if (selections.length === 0) {
      toast.error('Select at least one book before finishing.');
      return false;
    }

    const latestGradeNames = resolveLatestGradeNames();
    setGradeNames(latestGradeNames);

    const finalSelections = buildFinalBookSelections(
      selections,
      excludedAssessments,
      assessmentVariants,
      customAssessmentTitles,
      latestGradeNames
    );

    const currentSignatures = buildPayloadClassSignatures(finalSelections);
    const removedClasses = Object.keys(savedClassSignatures).filter(
      (className) => !(className in currentSignatures)
    );

    const normalizeClassKey = (value: string) => (value || '').trim().toLowerCase();
    const savedSignatureMap: Record<string, string> = {};
    Object.entries(savedClassSignatures).forEach(([key, signature]) => {
      savedSignatureMap[normalizeClassKey(key)] = signature;
    });

    const dirtyClassKeys = new Set<string>();
    Object.entries(currentSignatures).forEach(([className, signature]) => {
      const normalized = normalizeClassKey(className);
      if (savedSignatureMap[normalized] !== signature) {
        dirtyClassKeys.add(normalized);
      }
    });

    const savedExcludedSet = new Set(savedExcludedAssessments.map(normalizeClassKey));
    const currentExcludedSet = new Set(excludedAssessments.map(normalizeClassKey));
    savedExcludedSet.forEach((cls) => {
      if (!currentExcludedSet.has(cls)) {
        dirtyClassKeys.add(cls);
      }
    });
    currentExcludedSet.forEach((cls) => {
      if (!savedExcludedSet.has(cls)) {
        dirtyClassKeys.add(cls);
      }
    });

    const filteredSelections = finalSelections.filter((item) =>
      dirtyClassKeys.has(normalizeClassKey(item.class_label || item.class || ''))
    );

    if (filteredSelections.length === 0 && removedClasses.length === 0) {
      toast.info('No changes to save.');
      return true;
    }

    const payload = {
      school_id: resolvedSchoolId,
      selections: filteredSelections,
      excluded_assessments: excludedAssessments,
      grade_names: latestGradeNames,
      source: 'wizard',
      deleted_classes: removedClasses,
    };

    try {
      const token = await getIdToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
      await axios.post(`${API}/book-selections`, payload, { headers });
      toast.success('Book selections saved successfully');
      setSavedClassSignatures(currentSignatures);
      setSavedExcludedAssessments(excludedAssessments);
      lastSavedSelectionSignature.current = selectionSignature;
      return true;
    } catch (error) {
      console.warn('Unable to persist book selections', error);
      toast.error('Unable to save book selections. Please try again.');
      return false;
    }
  }, [API, assessmentVariants, bookSelectionSchoolId, buildPayloadClassSignatures, customAssessmentTitles, excludedAssessments, getIdToken, resolveLatestGradeNames, savedClassSignatures, selectionSignature, selections, user?.schoolId]);

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
    const resolveClassName = (raw: string): string => {
      const trimmed = (raw || '').trim();
      if (!trimmed) return '';
      const lower = trimmed.toLowerCase();
      if (lower === 'playgroup') return 'PG';
      return (
        SCHOOL_DATA.find((c) => c.name.toLowerCase() === lower)?.name ||
        trimmed
      );
    };
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
      const nextSignatures: Record<string, string> = {};
      const seenSelections: Set<string> = new Set();

      classes.forEach((entry: any) => {
        const rawClass = entry.class || entry.class_name || '';
        if (!rawClass) {
          return;
        }
        const normalizedClass = resolveClassName(rawClass);
        const items = Array.isArray(entry.items) ? entry.items : [];
        const excludedList = Array.isArray(entry.excluded_assessments) ? entry.excluded_assessments : [];
        excludedList.forEach((c) => {
          if (typeof c === 'string') {
            const mapped = resolveClassName(c);
            nextExcluded.add(mapped || c);
          }
        });
        nextSignatures[normalizedClass] = computeClassSignature(items);

        // Merge separate component rows (core/work/addon) back into a single selection per subject/type.
        const grouped: Record<string, any> = {};
        items.forEach((item: any) => {
          const subjectKey = (item.subject || '').toString().trim().toLowerCase();
          const typeKey = (item.type || '').toString().trim().toLowerCase();
          const key = [subjectKey, typeKey].join('||');
          if (!grouped[key]) {
            grouped[key] = { ...item };
          } else {
            const target = grouped[key];
            if (item.core) {
              target.core = item.core;
              target.core_cover = item.core_cover;
              target.core_cover_title = item.core_cover_title;
              target.core_spine = item.core_spine;
            }
            if (item.work) {
              target.work = item.work;
              target.work_cover = item.work_cover;
              target.work_cover_title = item.work_cover_title;
              target.work_spine = item.work_spine;
            }
            if (item.addOn) {
              target.addOn = item.addOn;
              target.addon_cover = item.addon_cover;
              target.addon_cover_title = item.addon_cover_title;
              target.addon_spine = item.addon_spine;
            }
          }
        });

        Object.values(grouped).forEach((item: any) => {
          const selection = buildSelectionFromSavedItem(normalizedClass, item);
          if (selection) {
            const optionKey =
              selection.selectedOption?.typeId ||
              selection.selectedOption?.coreId ||
              selection.selectedOption?.workId ||
              selection.selectedOption?.addOnId ||
              selection.selectedOption?.label ||
              'unknown';
            const dedupeKey = [
              selection.className,
              selection.subjectName,
              optionKey,
              selection.selectedOption?.coreId || '',
              selection.selectedOption?.workId || '',
              selection.selectedOption?.addOnId || '',
            ].join('::');

            if (seenSelections.has(dedupeKey)) {
              return;
            }
            seenSelections.add(dedupeKey);
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
      setSavedExcludedAssessments(Array.from(nextExcluded));
      setSavedClassSignatures(nextSignatures);
      setCompletedClasses((prev) => {
        const merged = new Set(prev);
        nextCompleted.forEach((cls) => merged.add(cls));
        persistCompletedClasses(merged);
        return merged;
      });
      setIsFinalized(resolveApprovalStatus(persistedState?.school) || serverApproved);
      const loadedSignature = JSON.stringify({
        selections: nextSelections,
        excludedAssessments: Array.from(nextExcluded),
        assessmentVariants,
        customAssessmentTitles,
      });
      lastSavedSelectionSignature.current = loadedSignature;
      if (nextSelections.length > 0) {
        setFinishStatus('success');
      }
    } catch (error) {
      console.warn('Unable to fetch saved book selections', error);
    } finally {
      setIsLoadingSavedSelections(false);
    }
  }, [API, assessmentVariants, bookSelectionSchoolId, buildSelectionFromSavedItem, customAssessmentTitles, getIdToken, persistCompletedClasses, resolveApprovalStatus, persistedState?.school]);

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
          hasFinish={canFinish}
          onFinish={handleFinishAll}
          finishStatus={finishStatus}
          showReturnToMenu={viewState === 'LANDING'}
          onReturnToMenu={handleReturnToMainMenu}
        />
        <TermsModal
          open={showTermsModal}
          onAccept={handleAcceptTerms}
          onClose={handleDismissTerms}
        />
        <TitleCustomization
          classData={currentClassData}
          selections={selections}
          onUpdateSelections={handleUpdateSelection}
          showCodes={isAdmin}
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
            hasFinish={canFinish}
            onFinish={handleFinishAll}
            finishStatus={finishStatus}
            showReturnToMenu={viewState === 'LANDING'}
            onReturnToMenu={handleReturnToMainMenu}
          />
          <TermsModal
            open={showTermsModal}
            onAccept={handleAcceptTerms}
            onClose={handleDismissTerms}
          />
          <ClassSummary 
            classData={currentClassData}
            selections={selections}
            excludedAssessments={excludedAssessments}
            assessmentVariants={assessmentVariants}
            readOnly={readOnlySummary}
            isAdmin={isAdmin}
            onUpdateSelections={handleUpdateSelection}
            onExcludeAssessment={handleExcludeAssessment}
            onRestoreAssessment={handleRestoreAssessment}
            onAssessmentVariantChange={handleAssessmentVariantChange}
            onAddManualSubject={handleAddManualSubject}
            onConfirm={() => {
              if (!readOnlySummary) {
                markClassCompleted(currentClassData.name);
                if (!hasAcceptedTerms) {
                  setShowTermsModal(true);
                }
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
        <TermsModal
          open={showTermsModal}
          onAccept={handleAcceptTerms}
          onClose={handleDismissTerms}
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
        hasFinish={canFinish}
        onFinish={handleFinishAll}
        finishStatus={finishStatus}
        showReturnToMenu={viewState === 'LANDING'}
        onReturnToMenu={handleReturnToMainMenu}
      />

      <TermsModal
        open={showTermsModal}
        onAccept={handleAcceptTerms}
        onClose={handleDismissTerms}
      />

      <main className="flex-1 max-w-6xl mx-auto w-full p-4">
        {isFinalized && (
          <div className="mb-6">
            <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg shadow-sm text-sm">
              {isAdmin
                ? 'Book selections are approved and currently view-only.'
                : 'Book selections are approved and locked. Further changes are disabled. Please contact an admin for any updates.'}
            </div>
          </div>
        )}
        {needsTermsAcceptance && (
          <div className="mb-6">
            <div className="max-w-3xl mx-auto bg-white border border-slate-200 rounded-xl shadow-sm p-4 md:p-5">
              <h3 className="text-lg font-bold text-slate-800 mb-1">Terms &amp; Conditions</h3>
              <p className="text-sm text-slate-600">
                Curriculum may be subjected to changes. Please review and accept the terms before finishing your selections.
              </p>
              <div className="mt-4 flex flex-col sm:flex-row sm:justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowTermsModal(true)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg bg-white hover:bg-slate-50 text-sm font-medium"
                >
                  View details
                </button>
                <button
                  type="button"
                  onClick={handleAcceptTerms}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700"
                >
                  Accept &amp; continue
                </button>
              </div>
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
            const classHasSelections = selections.some((s) => s.className === cls.name);
            const bookCount = classHasSelections ? calculateBookCount(cls.name) : 0;
            const theme = getTheme(cls.name);
            const gradeLabel = getGradeLabelForClass(cls.name);
            const readOnlyForClass = isClassReadOnly(cls.name);
            const isCompleted = completedClasses.has(cls.name);
            
            return (
                <div
                    key={cls.name}
                    className={`relative p-4 rounded-xl border-2 ${theme.cardBg} ${theme.cardBorder}`}
                >
                    {classHasSelections && (
                        <div className="absolute top-2 right-2 text-green-600 bg-green-100 rounded-full p-1">
                            <Check size={14} strokeWidth={3} />
                        </div>
                    )}
                    
                    <div className="text-center">
                        <h3 className={`text-xl font-extrabold ${theme.textMain}`}>
                            {gradeLabel}
                        </h3>
                        
                        {classHasSelections && (
                            <div className="inline-flex items-center gap-1 px-2 py-1 bg-white/60 rounded-full border border-green-200 text-green-800 text-xs font-medium mt-2">
                                <Book size={12} />
                                <span>{bookCount} Books</span>
                            </div>
                        )}
                    </div>
                    
                    <div className="mt-4 flex gap-2">
                         {classHasSelections ? (
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
    finishStatus?: 'idle' | 'saving' | 'success' | 'error';
};

// HEADER Component
const Header = ({ onHome, hasFinish, onFinish, showReturnToMenu = false, onReturnToMenu, finishStatus = 'idle' }: HeaderProps) => {
    const isSaving = finishStatus === 'saving';
    const isSaved = finishStatus === 'success';
    const showFinish = hasFinish && finishStatus !== 'success';
    const finishLabel = isSaving ? 'Saving...' : 'Finish';

    return (
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

                    {isSaved && (
                        <span className="inline-flex items-center gap-2 rounded-full bg-green-50 px-3 py-1 text-xs font-semibold text-green-700 border border-green-200">
                            <Check size={14} />
                            Saved
                        </span>
                    )}

                    {showFinish && (
                        <button 
                        onClick={onFinish}
                        disabled={isSaving}
                        className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg"
                        >
                            <Check size={16} />
                            <span className="hidden sm:inline">{finishLabel}</span>
                        </button>
                    )}
                </div>
            </div>
        </header>
    );
};

type TermsModalProps = {
  open: boolean;
  onAccept: () => void;
  onClose: () => void;
};

const TermsModal = ({ open, onAccept, onClose }: TermsModalProps) => {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-5 md:p-6 border border-slate-200">
        <h3 className="text-xl font-bold text-slate-800 mb-2">Terms &amp; Conditions</h3>
        <p className="text-sm text-slate-700 leading-relaxed">
          Curriculum may be subjected to changes. By accepting, you acknowledge that future updates may modify the current selections.
        </p>
        <div className="mt-5 flex flex-col sm:flex-row sm:justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 text-sm font-medium hover:bg-slate-50"
          >
            Close
          </button>
          <button
            type="button"
            onClick={onAccept}
            className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
};
