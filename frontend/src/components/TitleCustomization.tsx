
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ClassData, SelectionRecord } from '../types/types';
import { ArrowRight, ArrowLeft, Edit3, Hash, BookTemplate } from 'lucide-react';

type DraftVariant = 'core' | 'work' | 'addon';
type DraftValue = { title: string; id: string; spine: string };

interface InputGroupProps {
  label: string;
  colorClass: string;
  titleValue: string;
  idValue: string;
  spineValue: string;
  onTitleChange: (val: string) => void;
  onIdChange: (val: string) => void;
  onSpineChange: (val: string) => void;
  defaultTitle?: string;
  defaultId?: string;
  defaultSpine?: string;
  showCodes?: boolean;
}

const InputGroup = React.memo(
  ({
    label,
    colorClass,
    titleValue,
    idValue,
    spineValue,
    onTitleChange,
    onIdChange,
    onSpineChange,
    defaultTitle,
    defaultId,
    defaultSpine,
    showCodes,
  }: InputGroupProps) => (
    <div className="bg-slate-50 p-3 rounded-md border border-slate-200">
      <div className="flex items-center gap-2 mb-2">
        <span
          className={`text-xs font-bold uppercase ${colorClass} bg-white px-2 py-0.5 rounded border border-slate-200`}
        >
          {label}
        </span>
      </div>
      <div className={`grid grid-cols-1 ${showCodes ? 'md:grid-cols-3' : ''} gap-3`}>
        <div className="relative">
          <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1 ml-1">
            Subject Name
          </label>
          <div className="relative">
            <input
              type="text"
              className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-xs md:text-sm placeholder-slate-400 bg-white text-slate-900 !bg-white !text-slate-900 !border-slate-300"
              style={{ backgroundColor: '#ffffff', color: '#0f172a' }}
              value={titleValue}
              onChange={(e) => onTitleChange(e.target.value)}
              placeholder={defaultTitle}
            />
            <Edit3 size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          </div>
        </div>

        {showCodes && (
          <>
            <div className="relative">
              <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1 ml-1">
                Book Code (ID)
              </label>
              <div className="relative">
                <input
                  type="text"
                  className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-xs md:text-sm placeholder-slate-400 bg-white text-slate-900 font-mono !bg-white !text-slate-900 !border-slate-300"
                  style={{ backgroundColor: '#ffffff', color: '#0f172a' }}
                  value={idValue}
                  onChange={(e) => onIdChange(e.target.value)}
                  placeholder={defaultId}
                />
                <Hash size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              </div>
            </div>

            <div className="relative">
              <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1 ml-1">
                Spine Code
              </label>
              <div className="relative">
                <input
                  type="text"
                  className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-xs md:text-sm placeholder-slate-400 bg-white text-slate-900 font-mono !bg-white !text-slate-900 !border-slate-300"
                  style={{ backgroundColor: '#ffffff', color: '#0f172a' }}
                  value={spineValue}
                  onChange={(e) => onSpineChange(e.target.value)}
                  placeholder={defaultSpine}
                />
                <BookTemplate size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
);

interface TitleCustomizationProps {
  classData: ClassData;
  selections: SelectionRecord[];
  onUpdateSelections: (updatedSelections: SelectionRecord[]) => void;
  showCodes?: boolean;
  
  assessmentDetails: { defaultCoreCoverTitle: string } | null;
  customAssessmentTitle: string | undefined;
  onUpdateAssessmentTitle: (title: string) => void;

  onNext: () => void;
  onBack: () => void;
}

const TitleCustomization: React.FC<TitleCustomizationProps> = ({ 
    classData, selections, onUpdateSelections, showCodes = true,
    assessmentDetails, customAssessmentTitle, onUpdateAssessmentTitle,
    onNext, onBack
}) => {
  const [drafts, setDrafts] = useState<Record<string, DraftValue>>({});
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const lastHydratedClass = useRef<string | null>(null);

  const classSelections = useMemo(
    () => selections.filter((s) => s.className === classData.name),
    [classData.name, selections]
  );

  const makeDraftKey = useCallback(
    (subjectName: string, optionTypeId: string, variant: DraftVariant) =>
      [classData.name, subjectName, optionTypeId, variant].join('||'),
    [classData.name]
  );

  const hydrateDrafts = useCallback(() => {
    const next: Record<string, DraftValue> = {};
    classSelections.forEach((s) => {
      if (!s.selectedOption) return;
      const opt = s.selectedOption;
      const setDraft = (variant: DraftVariant, title?: string, id?: string, spine?: string) => {
        next[makeDraftKey(s.subjectName, opt.typeId, variant)] = {
          title: title ?? '',
          id: id ?? '',
          spine: spine ?? '',
        };
      };
      if (opt.coreId && !s.skipCore) {
        setDraft('core', s.customCoreTitle, s.customCoreId, s.customCoreSpine);
      }
      if (opt.workId && !s.skipWork) {
        setDraft('work', s.customWorkTitle, s.customWorkId, s.customWorkSpine);
      }
      if (opt.addOnId && !s.skipAddon) {
        setDraft('addon', s.customAddonTitle, s.customAddonId, s.customAddonSpine);
      }
    });
    setDrafts(next);
    setHasUnsavedChanges(false);
  }, [classSelections, makeDraftKey]);

  useEffect(() => {
    if (lastHydratedClass.current === classData.name) {
      return;
    }
    hydrateDrafts();
    lastHydratedClass.current = classData.name;
  }, [classData.name, hydrateDrafts]);

  const updateDraft = useCallback((key: string, field: keyof DraftValue, value: string) => {
    setDrafts((prev) => ({
      ...prev,
      [key]: {
        title: prev[key]?.title ?? '',
        id: prev[key]?.id ?? '',
        spine: prev[key]?.spine ?? '',
        [field]: value,
      },
    }));
    setHasUnsavedChanges(true);
  }, []);

  const draftFor = useCallback(
    (subjectName: string, optionTypeId: string, variant: DraftVariant) => {
      const key = makeDraftKey(subjectName, optionTypeId, variant);
      const entry = drafts[key] || { title: '', id: '', spine: '' };
      return { key, ...entry };
    },
    [drafts, makeDraftKey]
  );

  const handleSaveDrafts = useCallback(() => {
    const updatedSelections = selections.map((s) => {
        
      if (s.className !== classData.name || !s.selectedOption) return s;
      const opt = s.selectedOption;
      const coreDraft = draftFor(s.subjectName, opt.typeId, 'core');
      const workDraft = draftFor(s.subjectName, opt.typeId, 'work');
      const addonDraft = draftFor(s.subjectName, opt.typeId, 'addon');
      const hasCore = !!opt.coreId && !s.skipCore;
      const hasWork = !!opt.workId && !s.skipWork;
      const hasAddon = !!opt.addOnId && !s.skipAddon;

      return {
        ...s,
        customCoreTitle: hasCore ? coreDraft.title : s.customCoreTitle,
        customCoreId: hasCore ? coreDraft.id : s.customCoreId,
        customCoreSpine: hasCore ? coreDraft.spine : s.customCoreSpine,
        customWorkTitle: hasWork ? workDraft.title : s.customWorkTitle,
        customWorkId: hasWork ? workDraft.id : s.customWorkId,
        customWorkSpine: hasWork ? workDraft.spine : s.customWorkSpine,
        customAddonTitle: hasAddon ? addonDraft.title : s.customAddonTitle,
        customAddonId: hasAddon ? addonDraft.id : s.customAddonId,
        customAddonSpine: hasAddon ? addonDraft.spine : s.customAddonSpine,
      };
    });

    
    
    onUpdateSelections(updatedSelections);
    setHasUnsavedChanges(false);
  }, [classData.name, draftFor, onUpdateSelections, selections]);

  const handleNext = useCallback(() => {
    if (hasUnsavedChanges) {
      handleSaveDrafts();
    }
    onNext();
  }, [handleSaveDrafts, hasUnsavedChanges, onNext]);

  return (
    <div className="max-w-4xl mx-auto w-full p-4 md:p-6 pb-24">
      <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
        <div className="p-4 md:p-6 border-b border-slate-100 bg-slate-50">
           <h2 className="text-xl md:text-2xl font-bold text-slate-800">Customize Details</h2>
           <p className="text-slate-500 text-sm mt-1">
             You can change your subjects names, Select next if given names are ok
           </p>
        </div>

        <div className="p-4 md:p-6 space-y-6 max-h-[65vh] overflow-y-auto">
            {classSelections.length === 0 && (
                <div className="text-center text-slate-400 py-8">No books selected.</div>
            )}

            {classSelections.map((s) => {
                if (!s.selectedOption) return null;
                const opt = s.selectedOption;
                const displaySubject = opt.jsonSubject || s.subjectName;

                const hasCore = opt.coreId && !s.skipCore;
                const hasWork = opt.workId && !s.skipWork;
                const hasAddon = opt.addOnId && !s.skipAddon;

                if (!hasCore && !hasWork && !hasAddon) return null;

                return (
                    <div key={`${s.subjectName}-${opt.typeId}`} className="border border-slate-200 rounded-lg p-4 bg-white shadow-sm">
                        <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2 pb-2 border-b border-slate-100">
                            <span className="bg-indigo-50 px-2 py-0.5 rounded text-xs text-indigo-700 font-bold uppercase tracking-wider">{displaySubject}</span>
                            <span className="text-slate-600">{opt.label}</span>
                        </h3>
                        
                        <div className="space-y-4">
                            {hasCore && (
                            <InputGroup 
                                label="Skill Book / Core"
                                colorClass="text-indigo-600 border-indigo-200"
                                titleValue={draftFor(s.subjectName, opt.typeId, 'core').title}
                                idValue={draftFor(s.subjectName, opt.typeId, 'core').id}
                                spineValue={draftFor(s.subjectName, opt.typeId, 'core').spine}
                                showCodes={showCodes}
                                defaultTitle={opt.defaultCoreCoverTitle}
                                defaultId={opt.coreId}
                                defaultSpine={opt.coreSpine}
                                onTitleChange={(val: string) =>
                                  updateDraft(draftFor(s.subjectName, opt.typeId, 'core').key, 'title', val)
                                }
                                onIdChange={(val: string) =>
                                  updateDraft(draftFor(s.subjectName, opt.typeId, 'core').key, 'id', val)
                                }
                                onSpineChange={(val: string) =>
                                  updateDraft(draftFor(s.subjectName, opt.typeId, 'core').key, 'spine', val)
                                }
                                />
                            )}

                            {hasWork && (
                            <InputGroup 
                                label="Workbook"
                                colorClass="text-green-600 border-green-200"
                                titleValue={draftFor(s.subjectName, opt.typeId, 'work').title}
                                idValue={draftFor(s.subjectName, opt.typeId, 'work').id}
                                spineValue={draftFor(s.subjectName, opt.typeId, 'work').spine}
                                showCodes={showCodes}
                                defaultTitle={opt.defaultWorkCoverTitle}
                                defaultId={opt.workId}
                                defaultSpine={opt.workSpine}
                                onTitleChange={(val: string) =>
                                  updateDraft(draftFor(s.subjectName, opt.typeId, 'work').key, 'title', val)
                                }
                                onIdChange={(val: string) =>
                                  updateDraft(draftFor(s.subjectName, opt.typeId, 'work').key, 'id', val)
                                }
                                onSpineChange={(val: string) =>
                                  updateDraft(draftFor(s.subjectName, opt.typeId, 'work').key, 'spine', val)
                                }
                                />
                            )}

                            {hasAddon && (
                            <InputGroup 
                                label="Add-on"
                                colorClass="text-purple-600 border-purple-200"
                                titleValue={draftFor(s.subjectName, opt.typeId, 'addon').title}
                                idValue={draftFor(s.subjectName, opt.typeId, 'addon').id}
                                spineValue={draftFor(s.subjectName, opt.typeId, 'addon').spine}
                                showCodes={showCodes}
                                defaultTitle={opt.defaultAddonCoverTitle}
                                defaultId={opt.addOnId}
                                defaultSpine={opt.addOnSpine}
                                onTitleChange={(val: string) =>
                                  updateDraft(draftFor(s.subjectName, opt.typeId, 'addon').key, 'title', val)
                                }
                                onIdChange={(val: string) =>
                                  updateDraft(draftFor(s.subjectName, opt.typeId, 'addon').key, 'id', val)
                                }
                                onSpineChange={(val: string) =>
                                  updateDraft(draftFor(s.subjectName, opt.typeId, 'addon').key, 'spine', val)
                                }
                                />
                            )}
                        </div>
                    </div>
                );
            })}
{/* This section will be handled in a future update need to see the feature before removing */}
            {false && assessmentDetails && (
                <div className="border border-blue-200 rounded-lg p-4 bg-blue-50/30">
                    <h3 className="font-bold text-slate-700 mb-3 flex items-center gap-2">
                        <span className="bg-blue-100 px-2 py-0.5 rounded text-xs text-blue-600 font-bold uppercase tracking-wider">Assessment</span>
                    </h3>
                    <div className="bg-white p-3 rounded border border-blue-200">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div className="relative col-span-1 md:col-span-3">
                                <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1 ml-1">Title</label>
                                <div className="relative">
                                    <input 
                                        type="text" 
                                        className="w-full pl-8 pr-3 py-2 border border-blue-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-xs md:text-sm placeholder-slate-400 bg-white text-slate-900 !bg-white !text-slate-900 !border-slate-300"
                                        style={{ backgroundColor: '#ffffff', color: '#0f172a' }}
                                        value={customAssessmentTitle ?? assessmentDetails.defaultCoreCoverTitle ?? ''}
                                        onChange={(e) => onUpdateAssessmentTitle(e.target.value)}
                                        placeholder={assessmentDetails.defaultCoreCoverTitle}
                                    />
                                    <Edit3 size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>

        <div className="p-4 md:p-6 border-t border-slate-200 bg-slate-50 flex justify-between">
            <button 
                onClick={onBack}
                className="flex items-center gap-2 px-4 py-2 text-slate-600 hover:text-slate-900 font-medium transition-colors"
            >
                <ArrowLeft size={16} />
                Back
            </button>
            <div className="flex items-center gap-3">
              <button
                onClick={handleSaveDrafts}
                disabled={!hasUnsavedChanges}
                className={`px-4 py-2 rounded-lg border text-sm font-medium ${
                  hasUnsavedChanges
                    ? 'border-indigo-200 text-indigo-700 bg-white hover:bg-slate-50'
                    : 'border-slate-200 text-slate-400 bg-white cursor-not-allowed'
                }`}
              >
                Save changes
              </button>
            <button 
                onClick={handleNext}
                className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium shadow-sm transition-colors"
            >
                Next to Summary
                <ArrowRight size={16} />
            </button>
            </div>
        </div>
      </div>
    </div>
  );
};

export default TitleCustomization;
