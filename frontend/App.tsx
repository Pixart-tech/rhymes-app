
import React, { useState } from 'react';
import { SCHOOL_DATA, getAssessmentForClass, CLASS_THEMES, DEFAULT_THEME } from './constants';
import { BookOption, SelectionRecord, AssessmentVariant } from './types';
import ClassSummary from './components/ClassSummary';
import FinalJson from './components/FinalJson';
import TitleCustomization from './components/TitleCustomization';
import PdfViewer from './components/PdfViewer';
import { ArrowRight, BookOpen, SkipForward, Check, Book, Home, ChevronLeft, Info, Square, CheckSquare } from 'lucide-react';

type ViewState = 'LANDING' | 'WIZARD' | 'TITLES' | 'SUMMARY' | 'FINAL';

export default function App() {
  const [viewState, setViewState] = useState<ViewState>('LANDING');
  
  // Current Progress State
  const [currentClassIndex, setCurrentClassIndex] = useState<number>(-1);
  const [currentSubjectIndex, setCurrentSubjectIndex] = useState<number>(0);
  
  // All selections stored here
  const [selections, setSelections] = useState<SelectionRecord[]>([]);
  // Track excluded assessments per class
  const [excludedAssessments, setExcludedAssessments] = useState<string[]>([]);
  
  // Track assessment variant preferences (With Marks / Without Marks)
  const [assessmentVariants, setAssessmentVariants] = useState<Record<string, AssessmentVariant>>({});

  // Track custom titles for assessments (ClassName -> Title)
  const [customAssessmentTitles, setCustomAssessmentTitles] = useState<Record<string, string>>({});

  // Temporary viewing state within wizard
  const [viewingInfoForOption, setViewingInfoForOption] = useState<string | null>(null);
  
  // State for tracking "Skip Workbook" toggles in the current wizard step
  const [skipWorkMap, setSkipWorkMap] = useState<Record<string, boolean>>({});

  const currentClassData = currentClassIndex >= 0 ? SCHOOL_DATA[currentClassIndex] : null;
  const currentSubject = currentClassData ? currentClassData.subjects[currentSubjectIndex] : null;

  // --- Helpers ---
  
  const getAssessmentVariant = (className: string): AssessmentVariant => {
      return assessmentVariants[className] || 'WITH_MARKS';
  };

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

    // Check assessment
    if (!excludedAssessments.includes(className)) {
        const englishSelection = classSelections.find(s => s.subjectName === "English")?.selectedOption || null;
        const mathsSelection = classSelections.find(s => s.subjectName === "Maths")?.selectedOption || null;
        const assessment = getAssessmentForClass(className, englishSelection, mathsSelection, getAssessmentVariant(className));
        if (assessment) count++;
    }

    return count;
  };

  const getTheme = (className: string) => {
    return CLASS_THEMES[className] || DEFAULT_THEME;
  };

  // --- Handlers ---

  const handleStartClass = (index: number) => {
    setCurrentClassIndex(index);
    setCurrentSubjectIndex(0);
    setViewState('WIZARD');
    setViewingInfoForOption(null);
    setSkipWorkMap({});
  };
  
  const handleViewSummary = (index: number) => {
    setCurrentClassIndex(index);
    setViewState('SUMMARY');
  }

  // Go to Landing page without losing state
  const handleGoHome = () => {
    setViewState('LANDING');
  };

  const handleOptionSelect = (option: BookOption | null) => {
    if (!currentClassData || !currentSubject) return;

    const shouldSkipWork = option && option.workId ? !!skipWorkMap[option.typeId] : false;

    // Logic for Multi-Select Subjects
    if (currentSubject.isMultiSelect) {
        if (option === null) {
            // Skip logic for multi-select: clear all selections for this subject
            const newSelections = selections.filter(
                s => !(s.className === currentClassData.name && s.subjectName === currentSubject.name)
            );
            setSelections(newSelections);
            advanceStep();
            return;
        }

        // Check if this option is already selected
        const existingIndex = selections.findIndex(s => 
            s.className === currentClassData.name && 
            s.subjectName === currentSubject.name && 
            s.selectedOption?.typeId === option.typeId
        );

        let newSelections = [...selections];
        if (existingIndex >= 0) {
            // Deselect: Remove this specific option
            newSelections.splice(existingIndex, 1);
        } else {
            // Select: Add this option
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
        // Do not auto-advance for multi-select
    } else {
        // Logic for Single-Select Subjects (Standard)
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
        
        // Auto-advance if not skip (skip is handled by button which calls this with null)
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
        // Instead of going to SUMMARY directly, go to TITLE Customization
        setViewState('TITLES');
      }
  };

  const handleFinishTitles = () => {
      setViewState('SUMMARY');
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
      setAssessmentVariants(prev => ({
          ...prev,
          [className]: variant
      }));
  };

  const handleUpdateAssessmentTitle = (className: string, title: string) => {
      setCustomAssessmentTitles(prev => ({
          ...prev,
          [className]: title
      }));
  };

  const handleFinishAll = () => {
    setViewState('FINAL');
  };

  const handleReset = () => {
    setSelections([]);
    setExcludedAssessments([]);
    setAssessmentVariants({});
    setCustomAssessmentTitles({});
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

  const getCurrentAssessmentDetails = () => {
      if (!currentClassData) return null;
      const classSelections = selections.filter(s => s.className === currentClassData.name);
      const englishSelection = classSelections.find(s => s.subjectName === "English")?.selectedOption || null;
      const mathsSelection = classSelections.find(s => s.subjectName === "Maths")?.selectedOption || null;
      return getAssessmentForClass(currentClassData.name, englishSelection, mathsSelection, getAssessmentVariant(currentClassData.name));
  };

  // --- Renderers ---

  if (viewState === 'FINAL') {
    return (
        <FinalJson 
            selections={selections} 
            excludedAssessments={excludedAssessments} 
            assessmentVariants={assessmentVariants} 
            customAssessmentTitles={customAssessmentTitles}
            onReset={handleReset} 
        />
    );
  }

  if (viewState === 'TITLES' && currentClassData) {
      return (
          <div className="min-h-screen bg-slate-50 flex flex-col">
              <Header onHome={handleGoHome} hasFinish={selections.length > 0} onFinish={handleFinishAll} />
              <TitleCustomization 
                  classData={currentClassData}
                  selections={selections}
                  onUpdateSelections={handleUpdateSelection}
                  assessmentDetails={getCurrentAssessmentDetails()}
                  customAssessmentTitle={customAssessmentTitles[currentClassData.name]}
                  onUpdateAssessmentTitle={(title) => handleUpdateAssessmentTitle(currentClassData.name, title)}
                  onNext={handleFinishTitles}
                  onBack={() => {
                      setViewState('WIZARD');
                      setCurrentSubjectIndex(currentClassData.subjects.length - 1);
                  }}
              />
          </div>
      );
  }

  if (viewState === 'SUMMARY' && currentClassData) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
          <Header onHome={handleGoHome} hasFinish={selections.length > 0} onFinish={handleFinishAll} />
          <ClassSummary 
            classData={currentClassData}
            selections={selections}
            excludedAssessments={excludedAssessments}
            assessmentVariants={assessmentVariants}
            onUpdateSelections={handleUpdateSelection}
            onExcludeAssessment={handleExcludeAssessment}
            onRestoreAssessment={handleRestoreAssessment}
            onAssessmentVariantChange={handleAssessmentVariantChange}
            onConfirm={handleGoHome}
            onBack={() => {
                setViewState('TITLES');
            }}
          />
      </div>
    );
  }

  if (viewState === 'WIZARD' && currentClassData && currentSubject) {
    const theme = getTheme(currentClassData.name);
    const bookCount = calculateBookCount(currentClassData.name);

    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <Header onHome={handleGoHome} hasFinish={false} onFinish={() => {}} />
        
        <div className="flex-1 flex flex-col items-center py-4 px-3 md:py-6 md:px-4">
            {/* Wizard Header: Class Name + Book Count (No steps/progress) */}
            <div className="w-full max-w-2xl mb-4">
                <div className={`flex items-center gap-1.5 mb-2 cursor-pointer transition-colors ${theme.textSub} hover:${theme.textMain}`} onClick={handleGoHome}>
                    <ChevronLeft size={16} />
                    <span className="text-xs md:text-sm font-medium">Dashboard</span>
                </div>
                <div className="flex items-center justify-between mb-2">
                    <h1 className={`text-lg md:text-xl font-bold ${theme.textMain}`}>{currentClassData.name} Selection</h1>
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
                        {currentSubject.isMultiSelect && <span className="ml-2 text-sm font-normal text-slate-500">(Select multiple)</span>}
                    </h2>
                    <p className="text-slate-500 text-xs md:text-sm mt-1">
                        {currentSubject.isMultiSelect ? "Choose as many as you need from the options below:" : "Select one of the options below:"}
                    </p>
                </div>
                
                <div className="p-3 md:p-6 space-y-3 overflow-y-auto max-h-[65vh] md:max-h-none scrollbar-hide">
                {currentSubject.options.map((option) => {
                    const isSelected = isOptionSelected(option.typeId);
                    return (
                        <div 
                            key={option.typeId} 
                            className={`relative rounded-lg border transition-all duration-200 ${
                                isSelected
                                ? `${theme.selectedBorder} ${theme.selectedBg} border-2` 
                                : `border-slate-200 hover:border-slate-300 hover:bg-slate-50 border`
                            }`}
                        >
                            <div className="p-3 flex items-center gap-3">
                                {/* Left: Checkbox (Multi only) or Info */}
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
                                        <div className="flex items-center flex-wrap gap-x-2 gap-y-1 mb-1">
                                            <span className={`font-semibold text-sm md:text-base leading-tight ${isSelected ? theme.textMain : 'text-slate-800'}`}>
                                                {/* Use jsonSubject as label prefix if available to verify what subject it is, or just label */}
                                                {option.jsonSubject && <span className="mr-1 text-slate-500 font-normal">{option.jsonSubject}:</span>}
                                                {option.label}
                                            </span>
                                            {option.isRecommended && (
                                                <span className={`${theme.light} ${theme.textSub} text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide whitespace-nowrap`}>
                                                    Recommended
                                                </span>
                                            )}
                                        </div>

                                        {option.workId && (
                                            <div className="flex items-center">
                                                <label className={`flex items-center gap-1.5 cursor-pointer text-xs ${theme.textSub} hover:text-slate-900 select-none py-1`}>
                                                    <input 
                                                        type="checkbox" 
                                                        className={`w-3.5 h-3.5 rounded text-indigo-600 focus:ring-0 border-gray-300`} 
                                                        checked={!skipWorkMap[option.typeId]}
                                                        onChange={(e) => { e.stopPropagation(); toggleSkipWork(option.typeId); }}
                                                    />
                                                    <span>Include Workbook</span>
                                                </label>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Right: Actions */}
                                <div className="flex items-center gap-2 shrink-0">
                                    {option.info && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setViewingInfoForOption(viewingInfoForOption === option.typeId ? null : option.typeId);
                                            }}
                                            className={`p-2 rounded-full transition-colors flex items-center justify-center ${viewingInfoForOption === option.typeId ? 'bg-blue-100 text-blue-700' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'}`}
                                            title="View Info"
                                        >
                                            <Info size={18} />
                                        </button>
                                    )}
                                    {!currentSubject.isMultiSelect && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleOptionSelect(option);
                                            }}
                                            className={`px-3 py-1.5 md:px-4 md:py-2 text-white text-xs md:text-sm font-medium rounded-lg shadow-sm ${theme.primary} ${theme.primaryHover} transition-colors whitespace-nowrap`}
                                        >
                                            Select
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Inline Info Viewer */}
                            {viewingInfoForOption === option.typeId && option.info && (
                                <div className="border-t border-slate-200/50 p-3 md:p-4 bg-blue-50/50 animate-in fade-in slide-in-from-top-1">
                                    <p className="text-sm text-slate-700 leading-relaxed">
                                        <span className="font-semibold text-blue-800 block mb-1">Description:</span>
                                        {option.info}
                                    </p>
                                </div>
                            )}
                        </div>
                    );
                })}
                </div>

                <div className="p-3 md:p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-3">
                    {currentSubjectIndex > 0 ? (
                        <button 
                            onClick={() => {
                                setCurrentSubjectIndex(prev => prev - 1);
                                setViewingInfoForOption(null);
                                setSkipWorkMap({});
                            }}
                            className={`text-xs md:text-sm font-medium px-2 py-1 ${theme.textSub} hover:${theme.textMain}`}
                        >
                            &larr; Back
                        </button>
                    ) : (
                        <div className="w-8"></div>
                    )}

                    <div className="flex gap-3">
                        {currentSubject.isMultiSelect ? (
                            <>
                                <button 
                                    onClick={() => handleOptionSelect(null)}
                                    className="flex items-center justify-center gap-1.5 text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded transition-colors text-xs md:text-sm"
                                >
                                    <SkipForward size={14} />
                                    Skip
                                </button>
                                <button 
                                    onClick={advanceStep}
                                    className={`px-4 py-2 text-white text-sm font-medium rounded-lg shadow-sm ${theme.primary} ${theme.primaryHover} transition-colors`}
                                >
                                    Next &rarr;
                                </button>
                            </>
                        ) : (
                            <button 
                                onClick={() => handleOptionSelect(null)}
                                className="flex items-center justify-center gap-1.5 text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded transition-colors text-xs md:text-sm"
                            >
                                <SkipForward size={14} />
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

  // --- LANDING PAGE ---
  
  const configuredClasses = new Set(selections.map(s => s.className));

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Header onHome={handleGoHome} hasFinish={selections.length > 0} onFinish={handleFinishAll} />

      <main className="flex-1 max-w-6xl mx-auto w-full p-4 md:p-8">
        <div className="text-center mb-8 md:mb-12 mt-4 md:mt-8 space-y-2 md:space-y-4">
            <h2 className="text-2xl md:text-5xl font-extrabold text-slate-900 tracking-tight">
               Customise your Curriculum
            </h2>
            <p className="text-slate-600 max-w-2xl mx-auto text-sm md:text-xl leading-relaxed">
                Select book sets for each grade level.
            </p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
          {SCHOOL_DATA.map((cls, index) => {
            const isConfigured = configuredClasses.has(cls.name);
            const bookCount = isConfigured ? calculateBookCount(cls.name) : 0;
            const theme = getTheme(cls.name);
            
            return (
                <div
                    key={cls.name}
                    className={`relative flex flex-col items-center justify-center p-3 md:p-10 rounded-xl md:rounded-2xl border-2 transition-all duration-300 hover:shadow-lg ${theme.cardBg} ${theme.cardBorder} hover:border-opacity-50 text-center gap-2 md:gap-4`}
                >
                    {isConfigured && (
                        <div className="absolute top-2 right-2 md:top-4 md:right-4 text-green-600 bg-green-100 rounded-full p-1 md:p-1.5">
                            <Check size={14} className="md:w-4 md:h-4" strokeWidth={3} />
                        </div>
                    )}
                    
                    <div className="flex-1 w-full flex flex-col items-center justify-center">
                        <h3 className={`text-lg md:text-4xl font-extrabold mb-1 md:mb-2 ${theme.textMain}`}>
                            {cls.name}
                        </h3>
                        
                        {isConfigured && (
                            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 md:px-3 md:py-1 bg-white/60 rounded-full border border-green-200 text-green-800 text-[10px] md:text-sm font-medium">
                                <Book size={12} className="md:w-[14px] md:h-[14px]" />
                                <span>{bookCount} Books</span>
                            </div>
                        )}
                        {!isConfigured && <div className="h-4 sm:h-6"></div>} {/* Spacer to keep height consistent */}
                    </div>
                    
                    <div className="flex flex-col sm:flex-row items-stretch gap-2 w-full mt-2">
                         {isConfigured ? (
                             <>
                                <button 
                                    onClick={() => handleViewSummary(index)}
                                    className={`flex-1 text-[10px] md:text-xs font-medium py-1.5 md:py-2 rounded-lg border bg-white hover:bg-slate-50 text-slate-600 border-slate-200 transition-colors`}
                                >
                                    Summary
                                </button>
                                <button 
                                    onClick={() => handleStartClass(index)}
                                    className={`flex-1 text-[10px] md:text-xs font-medium py-1.5 md:py-2 rounded-lg ${theme.primary} text-white hover:opacity-90 transition-colors`}
                                >
                                    Edit
                                </button>
                             </>
                         ) : (
                             <button
                                onClick={() => handleStartClass(index)}
                                className={`w-full text-xs md:text-sm font-medium py-1.5 md:py-2 rounded-lg flex items-center justify-center gap-1.5 md:gap-2 ${theme.textSub} bg-white border border-transparent hover:border-current transition-all`}
                             >
                                Start <ArrowRight size={14} className="md:w-4 md:h-4" />
                             </button>
                         )}
                    </div>
                </div>
            );
          })}
        </div>
      </main>

      <footer className="bg-white border-t border-slate-200 py-4 text-center text-slate-400 text-xs md:text-sm px-4">
        &copy; {new Date().getFullYear()} Edplore Book Selector System
      </footer>
    </div>
  );
}

// Sub-component for Header
const Header = ({ onHome, hasFinish, onFinish }: { onHome: () => void, hasFinish: boolean, onFinish: () => void }) => (
    <header className="bg-white border-b border-slate-200 py-2.5 px-4 md:py-4 md:px-8 shadow-sm sticky top-0 z-20">
    <div className="max-w-6xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2 md:gap-3 cursor-pointer" onClick={onHome}>
                {/* Changed to use logo.png */}
                <img 
                    src="logo.png" 
                    alt="Edplore Logo" 
                    className="w-8 h-8 md:w-10 md:h-10 object-contain"
                    onError={(e) => {
                        // Fallback in case logo is missing
                        e.currentTarget.style.display = 'none';
                        e.currentTarget.nextElementSibling?.classList.remove('hidden');
                    }}
                />
                <div className="hidden bg-emerald-600 p-1.5 md:p-2 rounded-lg text-white">
                    <BookOpen size={18} className="md:w-6 md:h-6" />
                </div>
                <div>
                    <h1 className="text-base md:text-2xl font-bold text-slate-900 leading-none">Edplore Book Selector</h1>
                </div>
            </div>
            <div className="flex items-center gap-2 md:gap-3">
                <button 
                    onClick={onHome}
                    className="flex items-center gap-2 text-slate-600 hover:text-indigo-600 px-2 py-1.5 md:px-3 md:py-2 rounded-lg font-medium transition-colors text-xs md:text-sm"
                >
                    <Home size={16} className="md:w-[18px] md:h-[18px]" />
                    <span className="hidden sm:inline">Dashboard</span>
                </button>
                {hasFinish && (
                    <button 
                    onClick={onFinish}
                    className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 md:px-5 md:py-2 rounded-lg font-medium transition-colors shadow-sm text-xs md:text-sm"
                    >
                        <Check size={16} className="md:w-[18px] md:h-[18px]" />
                        <span className="hidden sm:inline">Finish</span>
                    </button>
                )}
            </div>
    </div>
    </header>
);
