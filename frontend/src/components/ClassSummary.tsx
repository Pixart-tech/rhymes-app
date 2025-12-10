
import React, { useState, useMemo } from 'react';
import { ClassData, SelectionRecord, AssessmentVariant } from '../types/types';
import { getAssessmentForClass, CLASS_THEMES, DEFAULT_THEME } from '../constants/constants';
import { Eye, EyeOff, AlertTriangle, Book, Trash2, ArrowLeft, Check, RotateCcw, Plus, X } from 'lucide-react';
import PdfViewer from './PdfViewer';

interface ClassSummaryProps {
  classData: ClassData;
  selections: SelectionRecord[];
  excludedAssessments: string[];
  assessmentVariants: Record<string, AssessmentVariant>;
  readOnly?: boolean;
  onUpdateSelections: (newSelections: SelectionRecord[]) => void;
  onExcludeAssessment: (className: string) => void;
  onRestoreAssessment: (className: string) => void;
  onAssessmentVariantChange: (className: string, variant: AssessmentVariant) => void;
  onAddManualSubject: (className: string, subject: string, coreCode: string, coreCover: string, coreSpine: string) => void;
  onConfirm: () => void;
  onBack: () => void;
}

interface PhysicalBookItem {
  id: string; // Unique key for rendering
  title: string;
  type: 'Core' | 'Work' | 'Addon' | 'Assessment';
  link?: string;
  subjectName: string;
  className: string;
  // Actions
  canDrop: boolean;
  isExcluded?: boolean;
  onDrop?: (e: React.MouseEvent) => void;
  onRestore?: (e: React.MouseEvent) => void;
}

const ClassSummary: React.FC<ClassSummaryProps> = ({ 
    classData, selections, excludedAssessments, assessmentVariants, readOnly = false,
    onUpdateSelections, onExcludeAssessment, onRestoreAssessment, onAssessmentVariantChange, onAddManualSubject,
    onConfirm, onBack 
}) => {
  const [expandedPdf, setExpandedPdf] = useState<string | null>(null);
  const [isAddingManual, setIsAddingManual] = useState(false);
  const [manualForm, setManualForm] = useState({ subject: '', coreCode: '', coreCover: '', coreSpine: '' });

  const togglePdf = (id: string) => {
    setExpandedPdf(prev => prev === id ? null : id);
  };

  const classSelections = selections.filter(s => s.className === classData.name);
  const theme = CLASS_THEMES[classData.name] || DEFAULT_THEME;
  const currentAssessmentVariant = assessmentVariants[classData.name] || 'WITH_MARKS';

  // Drop Handlers

  const handleSkipCore = (e: React.MouseEvent, subjectName: string, optionTypeId: string) => {
    if (readOnly) return;
    e.stopPropagation();
    const newSelections = selections.map(s => {
        if (s.className === classData.name && s.subjectName === subjectName && s.selectedOption?.typeId === optionTypeId) {
            return { ...s, skipCore: true };
        }
        return s;
    });
    onUpdateSelections(newSelections);
  };

  const handleRestoreCore = (e: React.MouseEvent, subjectName: string, optionTypeId: string) => {
    if (readOnly) return;
    e.stopPropagation();
    const newSelections = selections.map(s => {
        if (s.className === classData.name && s.subjectName === subjectName && s.selectedOption?.typeId === optionTypeId) {
            return { ...s, skipCore: false };
        }
        return s;
    });
    onUpdateSelections(newSelections);
  };

  const handleSkipWorkbook = (e: React.MouseEvent, subjectName: string, optionTypeId: string) => {
    if (readOnly) return;
    e.stopPropagation();
    const newSelections = selections.map(s => {
        if (s.className === classData.name && s.subjectName === subjectName && s.selectedOption?.typeId === optionTypeId) {
            return { ...s, skipWork: true };
        }
        return s;
    });
    onUpdateSelections(newSelections);
  };

  const handleRestoreWorkbook = (e: React.MouseEvent, subjectName: string, optionTypeId: string) => {
    if (readOnly) return;
    e.stopPropagation();
    const newSelections = selections.map(s => {
        if (s.className === classData.name && s.subjectName === subjectName && s.selectedOption?.typeId === optionTypeId) {
            return { ...s, skipWork: false };
        }
        return s;
    });
    onUpdateSelections(newSelections);
  };
  
  const handleSkipAddon = (e: React.MouseEvent, subjectName: string, optionTypeId: string) => {
    if (readOnly) return;
    e.stopPropagation();
    const newSelections = selections.map(s => {
        if (s.className === classData.name && s.subjectName === subjectName && s.selectedOption?.typeId === optionTypeId) {
            return { ...s, skipAddon: true };
        }
        return s;
    });
    onUpdateSelections(newSelections);
  };

  const handleRestoreAddon = (e: React.MouseEvent, subjectName: string, optionTypeId: string) => {
    if (readOnly) return;
    e.stopPropagation();
    const newSelections = selections.map(s => {
        if (s.className === classData.name && s.subjectName === subjectName && s.selectedOption?.typeId === optionTypeId) {
            return { ...s, skipAddon: false };
        }
        return s;
    });
    onUpdateSelections(newSelections);
  };
  
  const handleDropAssessment = (e: React.MouseEvent) => {
      if (readOnly) return;
      e.stopPropagation();
      onExcludeAssessment(classData.name);
  };

  const handleRestoreAssessment = (e: React.MouseEvent) => {
      if (readOnly) return;
      e.stopPropagation();
      onRestoreAssessment(classData.name);
  };
  
  const handleManualSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (readOnly) return;
      if (manualForm.subject && manualForm.coreCode) {
          onAddManualSubject(classData.name, manualForm.subject, manualForm.coreCode, manualForm.coreCover, manualForm.coreSpine);
          setManualForm({ subject: '', coreCode: '', coreCover: '', coreSpine: '' });
          setIsAddingManual(false);
      }
  };

  // Process selections into a flat list of physical books
  const books: PhysicalBookItem[] = useMemo(() => {
    const list: PhysicalBookItem[] = [];
    const canMutate = !readOnly;

    // 1. Regular Selections
    classSelections.forEach(s => {
        if (!s.selectedOption) return;
        const opt = s.selectedOption;
        const displaySubject = opt.jsonSubject || s.subjectName;

        // Core Book
        if (opt.coreId) {
            let coreSuffix = " (Core)";
            let titleBase = opt.label;
            
            // Apply naming conventions for Nursery, LKG, UKG
            if (s.className !== 'PG') {
                const subLower = s.subjectName.toLowerCase();
                if (subLower === 'english' || subLower === 'maths') {
                    coreSuffix = " (Skill Book)";
                } else if (subLower === 'evs' || subLower.includes('rhymes') || subLower.includes('art')) {
                    coreSuffix = "";
                }
            }

            // Custom Subject Handling
            if (opt.typeId.startsWith('manual-') || opt.label === 'Custom') {
                 titleBase = displaySubject;
                 coreSuffix = " (Custom Book)";
            }

            const fullTitle = `${titleBase}${coreSuffix}`;

            if (s.skipCore) {
                // Dropped Core Book
                list.push({
                    id: `${s.subjectName}-${opt.typeId}-core-dropped`,
                    title: fullTitle,
                    type: 'Core',
                    subjectName: displaySubject,
                    className: s.className,
                    canDrop: false,
                    isExcluded: true,
                    onRestore: (e) => handleRestoreCore(e, s.subjectName, opt.typeId)
                });
            } else {
                // Active Core Book
                list.push({
                    id: `${s.subjectName}-${opt.typeId}-core`,
                    title: fullTitle,
                    type: 'Core',
                    link: opt.link,
                    subjectName: displaySubject,
                    className: s.className,
                    canDrop: canMutate,
                    onDrop: canMutate ? (e) => handleSkipCore(e, s.subjectName, opt.typeId) : undefined
                });
            }
        }

        // Workbook
        if (opt.workId) {
            if (s.skipWork) {
                list.push({
                    id: `${s.subjectName}-${opt.typeId}-work-dropped`,
                    title: `${opt.label} (Workbook)`,
                    type: 'Work',
                    subjectName: displaySubject,
                    className: s.className,
                    canDrop: false,
                    isExcluded: true,
                    onRestore: (e) => handleRestoreWorkbook(e, s.subjectName, opt.typeId)
                });
            } else {
                list.push({
                    id: `${s.subjectName}-${opt.typeId}-work`,
                    title: `${opt.label} (Workbook)`,
                    type: 'Work',
                    link: opt.link, // Assuming same PDF link for now
                    subjectName: displaySubject,
                    className: s.className,
                    canDrop: canMutate,
                    onDrop: canMutate ? (e) => handleSkipWorkbook(e, s.subjectName, opt.typeId) : undefined
                });
            }
        }

        // Add-on
        if (opt.addOnId) {
            if (s.skipAddon) {
                list.push({
                    id: `${s.subjectName}-${opt.typeId}-addon-dropped`,
                    title: `${opt.label} (Add-on)`,
                    type: 'Addon',
                    subjectName: displaySubject,
                    className: s.className,
                    canDrop: false,
                    isExcluded: true,
                    onRestore: (e) => handleRestoreAddon(e, s.subjectName, opt.typeId)
                });
            } else {
                list.push({
                    id: `${s.subjectName}-${opt.typeId}-addon`,
                    title: `${opt.label} (Add-on)`,
                    type: 'Addon',
                    link: opt.link,
                    subjectName: displaySubject,
                    className: s.className,
                    canDrop: canMutate,
                    onDrop: canMutate ? (e) => handleSkipAddon(e, s.subjectName, opt.typeId) : undefined
                });
            }
        }
    });

    // 2. Assessment
    const englishSelection = classSelections.find(s => s.subjectName === "English")?.selectedOption || null;
    const mathsSelection = classSelections.find(s => s.subjectName === "Maths")?.selectedOption || null;
    const assessment = getAssessmentForClass(classData.name, englishSelection, mathsSelection, currentAssessmentVariant);

    if (assessment) {
        if (!excludedAssessments.includes(classData.name)) {
            list.push({
                id: 'assessment',
                title: `${assessment.label} (Assessment)`,
                type: 'Assessment',
                subjectName: 'General',
                className: classData.name,
                canDrop: canMutate,
                onDrop: canMutate ? handleDropAssessment : undefined,
                link: assessment.link
            });
        } else {
            // Excluded state for undo
            list.push({
                id: 'assessment-dropped',
                title: `${assessment.label} (Assessment)`,
                type: 'Assessment',
                subjectName: 'General',
                className: classData.name,
                canDrop: false,
                isExcluded: true,
                onRestore: canMutate ? handleRestoreAssessment : undefined
            });
        }
    }

    return list;
  }, [selections, classData, excludedAssessments, currentAssessmentVariant, readOnly]);

  return (
    <div className="max-w-4xl mx-auto w-full p-4 md:p-6 pb-24">
      <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
        <div className={`p-4 md:p-6 border-b ${theme.cardBg} ${theme.cardBorder}`}>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
             <div>
                <h2 className={`text-xl md:text-2xl font-bold ${theme.textMain}`}>Summary: {classData.name}</h2>
                <div className="flex items-center gap-2 mt-1">
                    <span className={`text-xs md:text-sm ${theme.textSub}`}>Total Books Selected:</span>
                    <span className={`inline-flex items-center justify-center ${theme.primary} text-white text-xs md:text-sm font-bold px-2.5 py-0.5 rounded-full`}>
                        {books.filter(b => !b.isExcluded).length}
                    </span>
                </div>
             </div>
          </div>
          
          <div className="mt-4 flex items-start gap-2 p-3 bg-amber-50 text-amber-800 rounded-md text-xs md:text-sm border border-amber-200">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <p>Please go through the selection carefully before moving onto the next class.</p>
          </div>
        </div>

        <div className="p-2 md:p-6 bg-slate-50/50">
          {books.length === 0 ? (
             <div className="text-center py-10 text-slate-500 italic text-sm">
                 No books selected for this class yet.
             </div>
          ) : (
             <div className="space-y-2 md:space-y-3">
                 {/* Header Row for Desktop */}
                 <div className="hidden md:grid grid-cols-12 gap-4 px-4 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                     <div className="col-span-5">Subject / Book</div>
                     <div className="col-span-2">Type</div>
                     <div className="col-span-5 text-right">Actions</div>
                 </div>

                 {books.map((book, idx) => {
                     if (book.isExcluded) {
                         // Render Dropped/Excluded State
                         return (
                            <div key={`${book.id}-${idx}`} className="bg-white border border-slate-200 border-dashed rounded-lg p-3 md:p-4 flex items-center justify-between opacity-75">
                                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                                    <div className="flex items-center gap-2">
                                         <span className="text-sm md:text-base font-medium text-slate-500 line-through decoration-slate-400">{book.title}</span>
                                         <span className="text-[10px] md:text-xs font-bold text-red-600 bg-red-50 border border-red-100 px-2 py-0.5 rounded uppercase tracking-wide">Dropped</span>
                                    </div>
                                    <span className="text-xs text-slate-400">({book.subjectName})</span>
                                </div>
                                {book.onRestore && (
                                  <button 
                                      onClick={book.onRestore}
                                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs md:text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors"
                                  >
                                      <RotateCcw size={16} />
                                      Undo
                                  </button>
                                )}
                           </div>
                         );
                     }

                     // Render Normal State
                     return (
                     <div key={`${book.id}-${idx}`} className="bg-white border border-slate-200 rounded-lg overflow-hidden hover:shadow-sm transition-shadow">
                        <div className="p-3 md:p-4 flex flex-row items-start md:items-center md:grid md:grid-cols-12 gap-3 md:gap-4">
                            
                            {/* Info Section (Left on mobile, Col 1 on desktop) */}
                            <div className="flex-1 md:col-span-5 flex flex-col items-start gap-1">
                                {/* Mobile Header: Subject + Type */}
                                <div className="flex items-center gap-2 md:hidden w-full">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate max-w-[50%]">{book.subjectName}</span>
                                    <span className={`px-1.5 py-0.5 rounded-[4px] text-[10px] font-bold border shrink-0
                                        ${book.type === 'Core' ? 'bg-indigo-50 text-indigo-700 border-indigo-100' : ''}
                                        ${book.type === 'Work' ? 'bg-green-50 text-green-700 border-green-100' : ''}
                                        ${book.type === 'Addon' ? 'bg-purple-50 text-purple-700 border-purple-100' : ''}
                                        ${book.type === 'Assessment' ? 'bg-blue-50 text-blue-700 border-blue-100' : ''}
                                    `}>
                                        {book.type}
                                    </span>
                                </div>
                                
                                {/* Desktop Subject */}
                                <div className="hidden md:block text-xs text-slate-500 mb-0.5">{book.subjectName}</div>
                                
                                {/* Title */}
                                <div className="font-semibold text-slate-800 text-sm md:text-base flex items-start md:items-center gap-2 leading-tight">
                                    <Book size={16} className={`hidden md:block shrink-0 ${book.type === 'Assessment' ? 'text-blue-500' : 'text-slate-400'}`} />
                                    <span>{book.title}</span>
                                </div>
                                
                                {/* Assessment Variant Selector */}
                                {book.type === 'Assessment' && !book.isExcluded && (
                                    <div className="mt-2 flex items-center gap-3">
                                        <label className="flex items-center gap-1.5 cursor-pointer">
                                            <input 
                                                type="radio" 
                                                name={`assessment-variant-${classData.name}`} 
                                                checked={currentAssessmentVariant === 'WITH_MARKS'}
                                                onChange={() => onAssessmentVariantChange(classData.name, 'WITH_MARKS')}
                                                disabled={readOnly}
                                                className="w-3.5 h-3.5 text-blue-600 focus:ring-blue-500"
                                            />
                                            <span className="text-xs text-slate-600">With Marks</span>
                                        </label>
                                        <label className="flex items-center gap-1.5 cursor-pointer">
                                            <input 
                                                type="radio" 
                                                name={`assessment-variant-${classData.name}`} 
                                                checked={currentAssessmentVariant === 'WITHOUT_MARKS'}
                                                onChange={() => onAssessmentVariantChange(classData.name, 'WITHOUT_MARKS')}
                                                disabled={readOnly}
                                                className="w-3.5 h-3.5 text-blue-600 focus:ring-blue-500"
                                            />
                                            <span className="text-xs text-slate-600">Without Marks</span>
                                        </label>
                                    </div>
                                )}
                            </div>

                            {/* Type Badge (Desktop Only) */}
                            <div className="hidden md:flex col-span-2 items-center">
                                <span className={`px-2 py-1 rounded text-xs font-medium border
                                    ${book.type === 'Core' ? 'bg-indigo-50 text-indigo-700 border-indigo-100' : ''}
                                    ${book.type === 'Work' ? 'bg-green-50 text-green-700 border-green-100' : ''}
                                    ${book.type === 'Addon' ? 'bg-purple-50 text-purple-700 border-purple-100' : ''}
                                    ${book.type === 'Assessment' ? 'bg-blue-50 text-blue-700 border-blue-100' : ''}
                                `}>
                                    {book.type}
                                </span>
                            </div>

                            {/* Actions (Right on mobile, Col 3 on desktop) */}
                            <div className="flex items-center justify-end gap-2 md:col-span-5 self-center shrink-0">
                                {book.link && (
                                    <button 
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); togglePdf(book.id); }}
                                        className={`flex items-center justify-center gap-1.5 transition-colors rounded border
                                            md:px-3 md:py-1.5 md:text-sm md:font-medium 
                                            w-8 h-8 md:w-auto md:h-auto
                                            ${expandedPdf === book.id ? 'bg-slate-200 text-slate-700 border-slate-300' : 'text-slate-600 bg-slate-50 hover:bg-slate-100 border-slate-200'}
                                        `}
                                        title="View PDF"
                                    >
                                        {expandedPdf === book.id ? <EyeOff size={16} /> : <Eye size={16} />}
                                        <span className="hidden md:inline">{expandedPdf === book.id ? 'Hide' : 'View'} PDF</span>
                                    </button>
                                )}
                                
                                {book.canDrop && book.onDrop && (
                                    <button 
                                        type="button"
                                        onClick={book.onDrop}
                                        className="flex items-center justify-center gap-1.5 transition-colors rounded border text-red-600 bg-red-50 hover:bg-red-100 border-red-200
                                            md:px-3 md:py-1.5 md:text-sm md:font-medium
                                            w-8 h-8 md:w-auto md:h-auto"
                                        title={`Drop ${book.type}`}
                                    >
                                        <Trash2 size={16} />
                                        <span className="hidden md:inline">Drop</span>
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Inline PDF Viewer */}
                        {book.link && expandedPdf === book.id && (
                            <div className="border-t border-slate-100 p-2 md:p-4 bg-slate-50 animate-in fade-in">
                                <PdfViewer link={book.link} />
                            </div>
                        )}
                     </div>
                 );
                 })}
             </div>
          )}

          {/* Add Manual Subject Section */}
          {!readOnly && (
            <div className="mt-6 border-t border-slate-200 pt-6">
                {!isAddingManual ? (
                    <button
                        onClick={() => setIsAddingManual(true)}
                        className={`flex items-center gap-2 text-sm font-medium ${theme.textMain} hover:underline decoration-dashed`}
                    >
                        <Plus size={16} />
                        Add more subjects
                    </button>
                ) : (
                    <form onSubmit={handleManualSubmit} className="bg-slate-100 rounded-lg p-4 border border-slate-200">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-sm font-bold text-slate-700">Add Custom Subject</h3>
                            <button type="button" onClick={() => setIsAddingManual(false)} className="text-slate-400 hover:text-slate-600">
                                <X size={16} />
                            </button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
                            <div>
                                <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Subject Name</label>
                                <input 
                                    required
                                    type="text" 
                                    placeholder="e.g. French"
                                    className="w-full text-sm p-2 rounded border border-slate-300 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 !bg-white !text-slate-900 !border-slate-300"
                                    value={manualForm.subject}
                                    onChange={e => setManualForm({...manualForm, subject: e.target.value})}
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Book Code (ID)</label>
                                <input 
                                    required
                                    type="text" 
                                    placeholder="e.g. 999001"
                                    className="w-full text-sm p-2 rounded border border-slate-300 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 font-mono !bg-white !text-slate-900 !border-slate-300"
                                    value={manualForm.coreCode}
                                    onChange={e => setManualForm({...manualForm, coreCode: e.target.value})}
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Cover Code</label>
                                <input 
                                    type="text" 
                                    placeholder="e.g. C-FR1"
                                    className="w-full text-sm p-2 rounded border border-slate-300 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 font-mono !bg-white !text-slate-900 !border-slate-300"
                                    value={manualForm.coreCover}
                                    onChange={e => setManualForm({...manualForm, coreCover: e.target.value})}
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Spine Code</label>
                                <input 
                                    type="text" 
                                    placeholder="e.g. S-FR1"
                                    className="w-full text-sm p-2 rounded border border-slate-300 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 font-mono !bg-white !text-slate-900 !border-slate-300"
                                    value={manualForm.coreSpine}
                                    onChange={e => setManualForm({...manualForm, coreSpine: e.target.value})}
                                />
                            </div>
                        </div>
                        <div className="flex justify-end">
                            <button 
                                type="submit"
                                className="px-4 py-2 bg-slate-800 text-white text-xs font-bold uppercase rounded hover:bg-slate-900 transition-colors"
                            >
                                Add Subject
                            </button>
                        </div>
                    </form>
                )}
            </div>
          )}
        </div>

        <div className="p-4 md:p-6 bg-slate-50 border-t border-slate-200 flex flex-col-reverse sm:flex-row justify-between gap-3">
          <button 
            type="button"
            onClick={onBack}
            className="w-full sm:w-auto px-6 py-2.5 border border-slate-300 bg-white text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition-colors flex items-center justify-center gap-2 shadow-sm text-sm md:text-base"
          >
            <ArrowLeft size={18} />
            Add/Edit Subjects
          </button>
          <button 
            type="button"
            onClick={onConfirm}
            className="w-full sm:w-auto px-6 py-2.5 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 transition-colors shadow-sm flex items-center justify-center gap-2 text-sm md:text-base"
          >
            <Check size={18} />
            Confirm Class
          </button>
        </div>
      </div>
    </div>
  );
};

export default ClassSummary;
