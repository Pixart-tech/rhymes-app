
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { QuestionnaireAnswers } from '../types';
import { useAuth } from '../hooks/useAuth';
import { saveSelection } from '../services/api';
import { CATALOG } from '../data/catalog';

type ClassLevel = 'Nursery' | 'LKG' | 'UKG';

type ClassTheme = {
    bgColor50: string;
    bgColor600: string;
    border200: string;
    border500: string;
    border600: string;
    text600: string;
    text700: string;
    hoverBg50: string;
    hoverBg100: string;
    hoverBg700: string;
    hoverText800: string;
    hoverBorder400: string;
    focusRing500: string;
    focusWithinRing500: string;
    focusWithinBorder500: string;
    ring500: string;
};

const createTheme = (accent: string): ClassTheme => ({
    bgColor50: `bg-${accent}-50`,
    bgColor600: `bg-${accent}-600`,
    border200: `border-${accent}-200`,
    border500: `border-${accent}-500`,
    border600: `border-${accent}-600`,
    text600: `text-${accent}-600`,
    text700: `text-${accent}-700`,
    hoverBg50: `hover:bg-${accent}-50`,
    hoverBg100: `hover:bg-${accent}-100`,
    hoverBg700: `hover:bg-${accent}-700`,
    hoverText800: `hover:text-${accent}-800`,
    hoverBorder400: `hover:border-${accent}-400`,
    focusRing500: `focus:ring-${accent}-500`,
    focusWithinRing500: `focus-within:ring-${accent}-500`,
    focusWithinBorder500: `focus-within:border-${accent}-500`,
    ring500: `ring-${accent}-500`,
});

const CLASS_THEME: Record<ClassLevel, ClassTheme> = {
    Nursery: createTheme('emerald'),
    LKG: createTheme('amber'),
    UKG: createTheme('violet'),
};

// --- OPTIONS CONFIGURATION ---
const OPTIONS = {
  englishSkill: {
    Nursery: ['ABCD', 'SATPIN', 'LTI', 'Jolly Phonics'],
    LKG: ['Caps+vowels', 'Small+vowels'],
    UKG: ['With cursive', 'Without cursive']
  },
  mathSkill: {
    Nursery: ['1–10', '1–20', '1–50'],
    LKG: ['1–100', '1–100 & 1–50 number names', '1–50 tens & ones'],
    UKG: ['1–100 & names', '1–200', '1–500']
  },
  assessment: [
    { value: 'Termwise', description: 'Assessments conducted at the end of each academic term.' },
    { value: 'Annual', description: 'Includes 4 tests, 1 mid-term, and 1 final term exam.' },
    { value: 'Annual (no marks)', description: 'Same structure as Annual, but without grade or mark reporting.' },
  ],
  languageOptions: {
    count: ['None', 'One', 'Two'],
    list: ['Kannada', 'Hindi', 'Tamil', 'Telugu', 'Marathi'],
    variants: {
        LKG: ['Swara V1', 'Swara V2'],
        UKG: ['Swara & Vyanjana V1', 'Swara & Vyanjana V2']
    }
  }
};

type SummaryItem = {
    key: string;
    label: string;
    value: string;
    step: number;
    canRemove?: boolean;
    onRemove?: () => void;
    bookId?: string | null;
    bookLabel?: string;
};

type SummaryBookIds = {
    englishSkill: string | null;
    englishWorkbook: string | null;
    mathSkill: string | null;
    mathWorkbook: string | null;
    assessment: string | null;
    evs: string | null;
    rhymes: string | null;
    art: string | null;
};

const formatEnglishSkillSummary = (answers: QuestionnaireAnswers): string => {
    if (!answers.englishSkill) return 'Not selected';
    return answers.englishSkillWritingFocus
        ? `${answers.englishSkill} (${answers.englishSkillWritingFocus})`
        : answers.englishSkill;
};

const getEnglishWorkbookVariant = (answers: QuestionnaireAnswers): string | null => {
    if (!answers.englishSkill) return null;

    if (answers.classLevel === 'UKG' || answers.englishSkill === 'Jolly Phonics') {
        return answers.englishSkill;
    }

    let skillVariant = answers.englishSkill;
    if (answers.englishSkill === 'LTI') {
        skillVariant = 'LTI (Caps)';
    } else if (answers.englishSkillWritingFocus) {
        skillVariant = `${answers.englishSkill} (${answers.englishSkillWritingFocus})`;
    }

    if (!skillVariant.includes('(')) {
        return `${skillVariant} (Normal)`;
    }

    return `${skillVariant.slice(0, -1)}, Normal)`;
};

const getEnglishWorkbookSummary = (answers: QuestionnaireAnswers): string => {
    return getEnglishWorkbookVariant(answers) ?? 'Not selected';
};

const getMathWorkbookVariant = (answers: QuestionnaireAnswers): string | null => {
    if (!answers.mathSkill) return null;

    if (answers.classLevel === 'Nursery' || answers.classLevel === 'LKG') {
        return `${answers.mathSkill} (Normal)`;
    }

    return answers.mathSkill;
};

const getMathWorkbookSummary = (answers: QuestionnaireAnswers): string => {
    return getMathWorkbookVariant(answers) ?? 'Not selected';
};

const isEnglishSkillReady = (answers: QuestionnaireAnswers): boolean => {
    const requiresWritingFocus = answers.classLevel === 'Nursery'
        && (answers.englishSkill === 'ABCD' || answers.englishSkill === 'SATPIN');
    return !!answers.englishSkill
        && (!requiresWritingFocus || !!answers.englishSkillWritingFocus);
};

const isEnglishWorkbookReady = (answers: QuestionnaireAnswers): boolean => {
    if (!answers.includeEnglishWorkbook) return false;
    if (!isEnglishSkillReady(answers)) return false;

    return getEnglishWorkbookVariant(answers) !== null;
};

const isMathSkillReady = (answers: QuestionnaireAnswers): boolean => !!answers.mathSkill;

const isMathWorkbookReady = (answers: QuestionnaireAnswers): boolean => {
    if (!answers.includeMathWorkbook) return false;
    if (!isMathSkillReady(answers)) return false;

    return getMathWorkbookVariant(answers) !== null;
};

// --- UI COMPONENTS ---
type RadioCardProps = {
    id: string;
    name: string;
    value: string;
    label: string;
    description?: string;
    checked: boolean;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onSelect?: (value: string, checked: boolean, event: React.MouseEvent<HTMLInputElement>) => void;
    theme: ClassTheme;
};

const RadioCard: React.FC<RadioCardProps> = ({
    id,
    name,
    value,
    label,
    description,
    checked,
    onChange,
    onSelect,
    theme,
}) => {
    const baseClasses = `relative flex items-start p-4 border rounded-lg cursor-pointer transition-all focus-within:ring-2 ${theme.focusWithinRing500} ${theme.focusWithinBorder500}`;
    const stateClasses = checked
        ? `${theme.bgColor50} ${theme.border500} ring-2 ${theme.ring500}`
        : `bg-white border-gray-300 ${theme.hoverBorder400}`;

    return (
        <label className={`${baseClasses} ${stateClasses}`}>
            <div className="flex items-center h-5">
                <input
                    id={id}
                    name={name}
                    type="radio"
                    value={value}
                    checked={checked}
                    onChange={onChange}
                    onClick={event => onSelect?.(value, checked, event)}
                    className={`${theme.focusRing500} h-4 w-4 ${theme.text600} border-gray-300`}
                />
            </div>
            <div className="ml-3 text-sm">
                <span className="font-medium text-gray-900">{label}</span>
                {description && <p className="text-gray-500">{description}</p>}
            </div>
        </label>
    );
};

const CheckboxCard = ({
    id,
    name,
    label,
    description,
    checked,
    onChange,
    theme,
    disabled = false,
    children,
}: {
    id: string;
    name: string;
    label: string;
    description?: string;
    checked: boolean;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    theme: ClassTheme;
    disabled?: boolean;
    children?: React.ReactNode;
}) => {
    const baseClasses = `relative flex flex-col p-4 border rounded-lg transition-all focus-within:ring-2 ${theme.focusWithinRing500} ${theme.focusWithinBorder500} ${disabled ? 'cursor-not-allowed opacity-75' : 'cursor-pointer'}`;
    const stateClasses = checked
        ? `${theme.bgColor50} ${theme.border500} ring-2 ${theme.ring500}`
        : disabled
            ? 'bg-gray-50 border-gray-200 text-gray-400'
            : `bg-white border-gray-300 ${theme.hoverBorder400}`;

    const preventWhenDisabled = disabled
        ? (event: React.MouseEvent<HTMLLabelElement>) => {
            event.preventDefault();
            event.stopPropagation();
        }
        : undefined;

    const handleChildrenPointer = (event: React.SyntheticEvent) => {
        event.stopPropagation();
    };

    return (
        <label
            htmlFor={id}
            className={`${baseClasses} ${stateClasses}`}
            aria-disabled={disabled}
            onClick={preventWhenDisabled}
            onMouseDown={preventWhenDisabled}
        >
            <div className="flex items-start">
                <div className="flex items-center h-5">
                    <input
                        id={id}
                        name={name}
                        type="checkbox"
                        checked={checked}
                        onChange={onChange}
                        disabled={disabled}
                        className={`${theme.focusRing500} h-4 w-4 ${theme.text600} border-gray-300 rounded disabled:bg-gray-100 disabled:border-gray-200 disabled:cursor-not-allowed`}
                    />
                </div>
                <div className="ml-3 text-sm">
                    <span className={`font-medium ${disabled ? 'text-gray-400' : 'text-gray-900'}`}>{label}</span>
                    {description && <p className={disabled ? 'text-gray-400' : 'text-gray-500'}>{description}</p>}
                </div>
            </div>
            {children && (
                <div
                    className="mt-3"
                    onClick={handleChildrenPointer}
                    onMouseDown={handleChildrenPointer}
                    onPointerDown={handleChildrenPointer}
                    onTouchStart={handleChildrenPointer}
                >
                    {children}
                </div>
            )}
        </label>
    );
};

const BookPreviewLink: React.FC<{ bookId: string | null; label: string; theme: ClassTheme }> = ({ bookId, label, theme }) => {
    if (!bookId) return null;
    return (
        <Link to={`/pdf/${bookId}`} target="_blank" rel="noopener noreferrer" className={`text-sm font-semibold ${theme.text600} hover:underline ${theme.hoverText800} transition-colors`}>
            {label} ↗
        </Link>
    );
};

// --- MAIN PAGE COMPONENT ---
const QuestionnairePage: React.FC = () => {
    const { user } = useAuth();
    
    // --- STATE MANAGEMENT ---
    const classOrder: ClassLevel[] = ['Nursery', 'LKG', 'UKG'];
    const [currentClassIndex, setCurrentClassIndex] = useState(0);
    const [step, setStep] = useState(1);
    const [showClassIntro, setShowClassIntro] = useState(true);
    const [showFinalSummary, setShowFinalSummary] = useState(false);
    const [summaryReturnTarget, setSummaryReturnTarget] = useState<null | 'class' | 'final'>(null);
    const [coreSubjectsReached, setCoreSubjectsReached] = useState<Record<ClassLevel, boolean>>({
        Nursery: false,
        LKG: false,
        UKG: false,
    });
    
    const initialAnswers: QuestionnaireAnswers = {
        classLevel: null,
        englishSkill: null,
        englishSkillWritingFocus: null,
        includeEnglishWorkbook: true,
        mathSkill: null,
        includeMathWorkbook: true,
        assessment: null,
        includeEVS: true,
        includeRhymes: true,
        includeArt: true,
        languages: { count: 0, selections: [] },
    };

    const [allAnswers, setAllAnswers] = useState<Record<ClassLevel, QuestionnaireAnswers>>({
        Nursery: { ...initialAnswers, classLevel: 'Nursery' },
        LKG: { ...initialAnswers, classLevel: 'LKG', languages: { count: 0, selections: [] } },
        UKG: { ...initialAnswers, classLevel: 'UKG', languages: { count: 0, selections: [] } },
    });
    
    const [status, setStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
    const [savedId, setSavedId] = useState<string | null>(null);

    const currentClass = classOrder[currentClassIndex];
    const answers = allAnswers[currentClass];
    const theme = useMemo(() => CLASS_THEME[currentClass], [currentClass]);
    
    const updateClassAnswers = useCallback((className: ClassLevel, updater: (current: QuestionnaireAnswers) => QuestionnaireAnswers) => {
        setStatus('idle');
        setSavedId(null);
        setAllAnswers(prev => {
            const currentAnswers = prev[className];
            const nextAnswers = updater(currentAnswers);
            return { ...prev, [className]: nextAnswers };
        });
    }, []);

    const setAnswers = (newAnswers: Partial<QuestionnaireAnswers>) => {
        updateClassAnswers(currentClass, prevAnswers => ({ ...prevAnswers, ...newAnswers }));
    };

    // --- NAVIGATION ---
    const totalStepsPerClass = 6;

    const returnToSummary = useCallback(() => {
        if (summaryReturnTarget === 'final') {
            setShowFinalSummary(true);
        } else if (summaryReturnTarget === 'class') {
            setShowFinalSummary(false);
            setStep(totalStepsPerClass);
        }
        setSummaryReturnTarget(null);
    }, [summaryReturnTarget, totalStepsPerClass]);
    const handleNext = () => {
        if (showClassIntro || showFinalSummary) return;

        const isNurseryLangStep = currentClass === 'Nursery' && step === 4; // Step before languages
        if (isNurseryLangStep) {
            setStep(step + 2); // Skip language step for Nursery
            return;
        }

        if (summaryReturnTarget === 'class') {
            setSummaryReturnTarget(null);
            setStep(totalStepsPerClass);
            return;
        }

        if (summaryReturnTarget === 'final') {
            returnToSummary();
            return;
        }

        if (step < totalStepsPerClass) {
            setStep(step + 1);
            return;
        }

        if (currentClassIndex < classOrder.length - 1) {
            setCurrentClassIndex(currentClassIndex + 1);
            setStep(1);
        } else {
            setShowFinalSummary(true);
        }
    };

    const handleBack = () => {
        setStatus('idle');
        if (showClassIntro) {
            return;
        }
        if (showFinalSummary) {
            setShowFinalSummary(false);
            return;
        }

        if (summaryReturnTarget && step === 1) {
            returnToSummary();
            return;
        }

        const isNurserySummaryStep = currentClass === 'Nursery' && step === 6;
        if (isNurserySummaryStep) {
            setStep(step - 2); // Skip back over language step
            return;
        }

        if (step > 1) {
            setStep(step - 1);
        } else {
            setShowClassIntro(true);
            setSummaryReturnTarget(null);
        }
    };

    const navigateToStep = (classIndex: number, targetStep: number, options: { fromSummary?: 'class' | 'final' } = {}) => {
        setStatus('idle');
        setSavedId(null);
        setCurrentClassIndex(classIndex);
        setStep(targetStep);
        setSummaryReturnTarget(options.fromSummary ?? null);
        setShowFinalSummary(false);
        setShowClassIntro(false);
    };

    const handleEditClass = (classIndex: number) => {
        navigateToStep(classIndex, 1, { fromSummary: 'final' });
    };
    
    // --- DATA & LOGIC ---
    const handleSave = async () => {
        if (!user) return;
        setStatus('saving');
        try {
            const result = await saveSelection(allAnswers, user.schoolId);
            if (result.ok) { setStatus('success'); setSavedId(result.id); } 
            else { setStatus('error'); }
        } catch(e) { setStatus('error'); }
    }

    useEffect(() => {
        if (step === 4) {
            setCoreSubjectsReached(prev => (prev[currentClass]
                ? prev
                : { ...prev, [currentClass]: true }));
        }
    }, [step, currentClass]);

    const progress = useMemo(() => {
        let coreBooksSelected = 0;
        if (isEnglishSkillReady(answers)) {
            coreBooksSelected += 1;
        }
        if (answers.includeEnglishWorkbook && isEnglishWorkbookReady(answers)) {
            coreBooksSelected += 1;
        }
        if (isMathSkillReady(answers)) {
            coreBooksSelected += 1;
        }
        if (answers.includeMathWorkbook && isMathWorkbookReady(answers)) {
            coreBooksSelected += 1;
        }
        if (answers.assessment) coreBooksSelected++;

        const includeCoreSubjects = showFinalSummary || coreSubjectsReached[currentClass];

        if (includeCoreSubjects && answers.includeEVS) coreBooksSelected++;
        if (includeCoreSubjects && answers.includeRhymes) coreBooksSelected++;
        if (includeCoreSubjects && answers.includeArt) coreBooksSelected++;
        return {
            coreBooksSelected,
            languagesSelected: answers.languages.selections.length,
            languagesDesired: answers.languages.count,
        };
    }, [answers, coreSubjectsReached, currentClass, showFinalSummary]);

    const booksSelected = progress.coreBooksSelected + progress.languagesSelected;

    // --- BOOK ID GENERATION ---
    const getBookId = useCallback((subject: string, sourceAnswers: QuestionnaireAnswers = answers): string | null => {
        const book = CATALOG.find(b => {
            if (b.class_level !== sourceAnswers.classLevel || b.subject !== subject) return false;

            let expectedVariant = '';
            switch (subject) {
                case 'English Skill':
                    if (!sourceAnswers.englishSkill) return false;
                    expectedVariant = sourceAnswers.englishSkill;
                    if (sourceAnswers.englishSkill === 'LTI') {
                        expectedVariant = 'LTI (Caps)';
                    } else if (sourceAnswers.englishSkillWritingFocus) {
                        expectedVariant = `${sourceAnswers.englishSkill} (${sourceAnswers.englishSkillWritingFocus})`;
                    }
                    return b.variant === expectedVariant;

                case 'English Workbook': {
                    const workbookVariant = getEnglishWorkbookVariant(sourceAnswers);
                    if (!workbookVariant) return false;

                    return b.variant === workbookVariant;
                }

                case 'Math Skill':
                    return b.variant === sourceAnswers.mathSkill;
                case 'Math Workbook': {
                    const workbookVariant = getMathWorkbookVariant(sourceAnswers);
                    if (!workbookVariant) return false;

                    return b.variant === workbookVariant;
                }

                case 'Assessment':
                    return b.variant === sourceAnswers.assessment;

                case 'EVS':
                case 'Rhymes & Stories':
                case 'Art & Craft':
                    return b.variant === 'Standard';

                default:
                    return false;
            }
        });
        return book ? book.id : null;
    }, [answers]);

    const bookIds = useMemo<SummaryBookIds>(() => ({
        englishSkill: answers.englishSkill ? getBookId('English Skill') : null,
        englishWorkbook: answers.includeEnglishWorkbook && answers.englishSkill ? getBookId('English Workbook') : null,
        mathSkill: answers.mathSkill ? getBookId('Math Skill') : null,
        mathWorkbook: answers.includeMathWorkbook && answers.mathSkill ? getBookId('Math Workbook') : null,
        assessment: answers.assessment ? getBookId('Assessment') : null,
        evs: getBookId('EVS'),
        rhymes: getBookId('Rhymes & Stories'),
        art: getBookId('Art & Craft'),
    }), [answers, getBookId]);

    type SummaryAction =
        | { type: 'englishSkill' }
        | { type: 'englishWorkbook' }
        | { type: 'mathSkill' }
        | { type: 'mathWorkbook' }
        | { type: 'assessment' }
        | { type: 'core'; subject: 'EVS' | 'Rhymes & Stories' | 'Art & Craft' }
        | { type: 'language'; index: number };

    const handleRemoveSelection = useCallback((className: ClassLevel, action: SummaryAction) => {
        updateClassAnswers(className, current => {
            switch (action.type) {
                case 'englishSkill':
                    return {
                        ...current,
                        englishSkill: null,
                        englishSkillWritingFocus: null,
                        includeEnglishWorkbook: true,
                    };
                case 'englishWorkbook':
                    return {
                        ...current,
                        includeEnglishWorkbook: false,
                    };
                case 'mathSkill':
                    return {
                        ...current,
                        mathSkill: null,
                        includeMathWorkbook: true,
                    };
                case 'mathWorkbook':
                    return {
                        ...current,
                        includeMathWorkbook: false,
                    };
                case 'assessment':
                    return {
                        ...current,
                        assessment: null,
                    };
                case 'core':
                    if (action.subject === 'EVS') {
                        return { ...current, includeEVS: false };
                    }
                    if (action.subject === 'Rhymes & Stories') {
                        return { ...current, includeRhymes: false };
                    }
                    return { ...current, includeArt: false };
                case 'language': {
                    const newSelections = current.languages.selections.filter((_, idx) => idx !== action.index);
                    const newCount = Math.min(current.languages.count, newSelections.length) as 0 | 1 | 2;
                    return {
                        ...current,
                        languages: {
                            count: newCount,
                            selections: newSelections,
                        },
                    };
                }
                default:
                    return current;
            }
        });
    }, [updateClassAnswers]);




    const buildSummaryItems = useCallback((className: ClassLevel, classAnswers: QuestionnaireAnswers, classBookIds: SummaryBookIds, includeCoreSubjects: boolean): SummaryItem[] => {
        const englishSkillReady = isEnglishSkillReady(classAnswers);
        const englishWorkbookReady = isEnglishWorkbookReady(classAnswers);
        const mathSkillReady = isMathSkillReady(classAnswers);
        const mathWorkbookReady = isMathWorkbookReady(classAnswers);

        const summaryItems: SummaryItem[] = [];

        if (englishSkillReady) {
            summaryItems.push({
                key: 'english-skill',
                label: 'English Skill Book',
                value: formatEnglishSkillSummary(classAnswers),
                step: 1,
                canRemove: true,
                onRemove: () => handleRemoveSelection(className, { type: 'englishSkill' }),
                bookId: classBookIds.englishSkill,
                bookLabel: 'View English Skill Book',
            });

            if (classAnswers.includeEnglishWorkbook && englishWorkbookReady) {
                summaryItems.push({
                    key: 'english-workbook',
                    label: 'English Workbook',
                    value: getEnglishWorkbookSummary(classAnswers),
                    step: 1,
                    canRemove: true,
                    onRemove: () => handleRemoveSelection(className, { type: 'englishWorkbook' }),
                    bookId: classBookIds.englishWorkbook,
                    bookLabel: 'View English Workbook',
                });
            }
        }

        if (mathSkillReady) {
            summaryItems.push({
                key: 'math-skill',
                label: 'Math Skill Book',
                value: classAnswers.mathSkill as string,
                step: 2,
                canRemove: true,
                onRemove: () => handleRemoveSelection(className, { type: 'mathSkill' }),
                bookId: classBookIds.mathSkill,
                bookLabel: 'View Math Skill Book',
            });

            if (classAnswers.includeMathWorkbook && mathWorkbookReady) {
                summaryItems.push({
                    key: 'math-workbook',
                    label: 'Math Workbook',
                    value: getMathWorkbookSummary(classAnswers),
                    step: 2,
                    canRemove: true,
                    onRemove: () => handleRemoveSelection(className, { type: 'mathWorkbook' }),
                    bookId: classBookIds.mathWorkbook,
                    bookLabel: 'View Math Workbook',
                });
            }
        }

        if (classAnswers.assessment) {
            summaryItems.push({
                key: 'assessment',
                label: 'Assessment',
                value: classAnswers.assessment,
                step: 3,
                canRemove: true,
                onRemove: () => handleRemoveSelection(className, { type: 'assessment' }),
                bookId: classBookIds.assessment,
                bookLabel: 'View Assessment Book',
            });
        }

        if (includeCoreSubjects && classAnswers.includeEVS) {
            summaryItems.push({
                key: 'core-evs',
                label: 'EVS',
                value: 'Included',
                step: 4,
                canRemove: true,
                onRemove: () => handleRemoveSelection(className, { type: 'core', subject: 'EVS' }),
                bookId: classBookIds.evs,
                bookLabel: 'View EVS Book',
            });
        }

        if (includeCoreSubjects && classAnswers.includeRhymes) {
            summaryItems.push({
                key: 'core-rhymes',
                label: 'Rhymes & Stories',
                value: 'Included',
                step: 4,
                canRemove: true,
                onRemove: () => handleRemoveSelection(className, { type: 'core', subject: 'Rhymes & Stories' }),
                bookId: classBookIds.rhymes,
                bookLabel: 'View Rhymes Book',
            });
        }

        if (includeCoreSubjects && classAnswers.includeArt) {
            summaryItems.push({
                key: 'core-art',
                label: 'Art & Craft',
                value: 'Included',
                step: 4,
                canRemove: true,
                onRemove: () => handleRemoveSelection(className, { type: 'core', subject: 'Art & Craft' }),
                bookId: classBookIds.art,
                bookLabel: 'View Art Book',
            });
        }

        if (className !== 'Nursery') {
            const desiredLanguages = classAnswers.languages.count;
            const selectedLanguages = classAnswers.languages.selections;
            const classVariants = OPTIONS.languageOptions.variants[className] || [];
            const variantRequired = classVariants.length > 0;

            if (desiredLanguages > 0) {
                const selectionEntries = selectedLanguages.map((selection, index) => ({ selection, index }));
                const allSelectionsComplete = selectionEntries.length === desiredLanguages
                    && selectionEntries.every(({ selection }) => selection.language && (!variantRequired || !!selection.variant));

                if (allSelectionsComplete) {
                    selectionEntries.forEach(({ selection, index }) => {
                        summaryItems.push({
                            key: `language-${selection.language}-${index}`,
                            label: selection.language,
                            value: variantRequired ? (selection.variant as string) : 'Selected',
                            step: 5,
                            canRemove: true,
                            onRemove: () => handleRemoveSelection(className, { type: 'language', index }),
                        });
                    });
                }
            }
        }

        return summaryItems;
    }, [handleRemoveSelection]);

    const liveSummaryItems = useMemo(() => {
        if (!showClassIntro && !showFinalSummary) {
            const includeCore = coreSubjectsReached[currentClass] || showFinalSummary;
            return buildSummaryItems(currentClass, answers, bookIds, includeCore);
        }

        return [];
    }, [showClassIntro, showFinalSummary, currentClass, answers, bookIds, buildSummaryItems, coreSubjectsReached]);

    
    
    
    // --- RENDER METHODS ---
    const classHighlights: Record<ClassLevel, { title: string; description: string }> = {
        Nursery: {
            title: 'Nursery',
            description: 'Build foundational literacy and numeracy habits with playful, hands-on work.',
        },
        LKG: {
            title: 'LKG',
            description: 'Strengthen letter formations, number sense, and classroom readiness with structured practice.',
        },
        UKG: {
            title: 'UKG',
            description: 'Prepare learners for Grade 1 with confident reading, writing, and problem-solving skills.',
        },
    };

    const handleClassSelection = (index: number) => {
        setStatus('idle');
        setSavedId(null);
        setCurrentClassIndex(index);
        setStep(1);
        setShowClassIntro(false);
        setShowFinalSummary(false);
        setSummaryReturnTarget(null);
    };

    const renderClassSelection = () => (
        <div className="flex flex-col items-center gap-10 text-center">
            <div className="space-y-4 max-w-2xl">
                <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900">
                    Customise your perfect early curriculum
                </h1>
                <p className="text-xl text-gray-700">
                    Choose a class level to personalise English, Math, assessments, and enrichment books tailored to your students.
                </p>
            </div>
            <div className="grid w-full gap-6 md:grid-cols-3">
                {classOrder.map((level, index) => {
                    const cardTheme = CLASS_THEME[level];
                    return (
                        <button
                            key={level}
                            type="button"
                            onClick={() => handleClassSelection(index)}
                            className={`group relative overflow-hidden rounded-xl border ${cardTheme.border200} bg-white p-6 text-left shadow-sm transition-all duration-200 focus:outline-none ${cardTheme.focusRing500} focus:ring-2 hover:-translate-y-1 ${cardTheme.hoverBg50}`}
                        >
                            <div className={`absolute inset-x-0 top-0 h-1 ${cardTheme.bgColor600}`} aria-hidden="true"></div>
                            <div className="space-y-3">
                                <h3 className={`text-2xl font-bold text-gray-900 ${cardTheme.text700}`}>
                                    {classHighlights[level].title}
                                </h3>
                                <p className="text-sm text-gray-600 leading-relaxed">
                                    {classHighlights[level].description}
                                </p>
                                <span className={`inline-flex items-center text-sm font-semibold ${cardTheme.text600} ${cardTheme.hoverText800}`}>
                                    Start customising
                                    <svg className="ml-2 h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                    </svg>
                                </span>
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );

    const renderStepContent = () => {
        // Step definitions: 1: English, 2: Math, 3: Assessment, 4: Core, 5: Languages, 6: Class Summary
        switch (step) {
            case 1: // English
                const showWritingFocus = currentClass === 'Nursery' && (answers.englishSkill === 'ABCD' || answers.englishSkill === 'SATPIN');
                const isEnglishSkillReadyForPreview = isEnglishSkillReady(answers);
                const showWorkbookPreview = answers.includeEnglishWorkbook
                    && isEnglishWorkbookReady(answers);

                const handleEnglishSkillSelection = (skill: string) => {
                    if (answers.englishSkill === skill) {
                        return;
                    }
                    setAnswers({
                        englishSkill: skill,
                        englishSkillWritingFocus: null,
                        includeEnglishWorkbook: true,
                    });
                };

                const handleEnglishSkillClick = (skill: string, wasChecked: boolean) => {
                    if (!wasChecked || answers.englishSkill !== skill) {
                        return;
                    }
                    setAnswers({
                        englishSkill: null,
                        englishSkillWritingFocus: null,
                    });
                };

                const handleWritingFocusChange = (focus: 'Caps' | 'Small' | 'Caps & Small') => {
                    setAnswers({
                        englishSkillWritingFocus: answers.englishSkillWritingFocus === focus ? null : focus,
                    });
                };

                return (<div className="space-y-6">
                    <section className="rounded-xl border border-gray-200 p-6 shadow-sm">
                        <div className="flex flex-col gap-2">
                            <h2 className="text-xl font-semibold text-gray-800">What pattern do you choose?</h2>
                            <p className="text-gray-600">Select the English skill book that fits your class routine.</p>
                        </div>
                        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                            {OPTIONS.englishSkill[currentClass].map(skill => (
                                <RadioCard
                                    key={skill}
                                    id={`eng-${skill}`}
                                    name="englishSkill"
                                    value={skill}
                                    label={skill}
                                    description={skill === 'LTI' ? 'Caps only writing' : 'Select one option'}
                                    checked={answers.englishSkill === skill}
                                    onChange={() => handleEnglishSkillSelection(skill)}
                                    onSelect={(_, wasChecked) => handleEnglishSkillClick(skill, wasChecked)}
                                    theme={theme}
                                />
                            ))}
                        </div>
                        {showWritingFocus && (<div className="mt-6 border-t pt-6">
                            <h3 className="text-lg font-semibold text-gray-800 mb-2">Which letter case do you emphasise?</h3>
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                                <RadioCard
                                    id="focus-caps"
                                    name="writingFocus"
                                    value="Caps"
                                    label="Caps"
                                    description=""
                                    checked={answers.englishSkillWritingFocus === 'Caps'}
                                    onChange={() => handleWritingFocusChange('Caps')}
                                    onSelect={(_, wasChecked) => {
                                        if (wasChecked) {
                                            handleWritingFocusChange('Caps');
                                        }
                                    }}
                                    theme={theme}
                                />
                                <RadioCard
                                    id="focus-small"
                                    name="writingFocus"
                                    value="Small"
                                    label="Small"
                                    description=""
                                    checked={answers.englishSkillWritingFocus === 'Small'}
                                    onChange={() => handleWritingFocusChange('Small')}
                                    onSelect={(_, wasChecked) => {
                                        if (wasChecked) {
                                            handleWritingFocusChange('Small');
                                        }
                                    }}
                                    theme={theme}
                                />
                                <RadioCard
                                    id="focus-caps-small"
                                    name="writingFocus"
                                    value="Caps & Small"
                                    label="Caps & Small"
                                    description=""
                                    checked={answers.englishSkillWritingFocus === 'Caps & Small'}
                                    onChange={() => handleWritingFocusChange('Caps & Small')}
                                    onSelect={(_, wasChecked) => {
                                        if (wasChecked) {
                                            handleWritingFocusChange('Caps & Small');
                                        }
                                    }}
                                    theme={theme}
                                />
                            </div>
                        </div>)}
                    </section>
                    <section className="rounded-xl border border-gray-200 p-6 shadow-sm">
                        <div className="flex flex-col gap-2">
                            <h2 className="text-xl font-semibold text-gray-800">Matching Workbook</h2>
                            <p className="text-gray-600">We automatically include the workbook that matches your selected pattern.</p>
                        </div>
                        {answers.includeEnglishWorkbook ? (
                            isEnglishWorkbookReady(answers) ? (
                                <div className={`mt-4 rounded-lg border ${theme.border200} bg-white p-4`}>
                                    <p className="text-sm text-gray-600">Workbook variant</p>
                                    <p className="text-base font-semibold text-gray-900">{getEnglishWorkbookSummary(answers)}</p>
                                </div>
                            ) : (
                                <p className="mt-4 text-sm text-gray-500">Select a skill book to view the workbook details.</p>
                            )
                        ) : (
                            <div className="mt-4 flex flex-col gap-3 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                                <p className="text-sm text-gray-600">The English workbook is currently excluded for this class.</p>
                                <button
                                    type="button"
                                    onClick={() => setAnswers({ includeEnglishWorkbook: true })}
                                    className={`w-full sm:w-auto px-4 py-2 text-sm font-semibold rounded-md ${theme.bgColor600} text-white ${theme.hoverBg700}`}
                                >
                                    Add Workbook Back
                                </button>
                            </div>
                        )}
                    </section>
                    {isEnglishSkillReadyForPreview && <div className={`mt-2 p-3 ${theme.bgColor50} border ${theme.border200} rounded-lg flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-around`}>
                        <BookPreviewLink bookId={bookIds.englishSkill} label="View Skill Book" theme={theme} />
                        {showWorkbookPreview && <BookPreviewLink bookId={bookIds.englishWorkbook} label="View Workbook" theme={theme} />}
                    </div>}
                </div>);
            case 2: // Math
                const isMathSkillReadyForPreview = isMathSkillReady(answers);
                const showMathWorkbookPreview = answers.includeMathWorkbook
                    && isMathWorkbookReady(answers);

                const handleMathSkillSelection = (skill: string) => {
                    if (answers.mathSkill === skill) {
                        return;
                    }
                    setAnswers({
                        mathSkill: skill,
                        includeMathWorkbook: true,
                    });
                };

                const handleMathSkillClick = (skill: string, wasChecked: boolean) => {
                    if (!wasChecked || answers.mathSkill !== skill) {
                        return;
                    }
                    setAnswers({
                        mathSkill: null,
                    });
                };

                return (<div className="space-y-6">
                    <section className="rounded-xl border border-gray-200 p-6 shadow-sm">
                        <div className="flex flex-col gap-2">
                            <h2 className="text-xl font-semibold text-gray-800">How many numbers do you teach?</h2>
                            <p className="text-gray-600">Pick the math skill book that reflects your counting targets.</p>
                        </div>
                        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                            {OPTIONS.mathSkill[currentClass].map(skill => (
                                <RadioCard
                                    key={skill}
                                    id={`math-${skill}`}
                                    name="mathSkill"
                                    value={skill}
                                    label={skill}
                                    description=""
                                    checked={answers.mathSkill === skill}
                                    onChange={() => handleMathSkillSelection(skill)}
                                    onSelect={(_, wasChecked) => handleMathSkillClick(skill, wasChecked)}
                                    theme={theme}
                                />
                            ))}
                        </div>
                        <div className={`mt-4 inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold ${theme.bgColor50} ${theme.border500} ${theme.text600}`}>
                            <span className="inline-block h-2 w-2 rounded-full bg-current"></span>
                            <span>All variants include pre-math concepts, basic shapes and colours.</span>
                        </div>
                    </section>
                    <section className="rounded-xl border border-gray-200 p-6 shadow-sm">
                        <div className="flex flex-col gap-2">
                            <h2 className="text-xl font-semibold text-gray-800">Matching Workbook</h2>
                            <p className="text-gray-600">We automatically include the workbook that matches your number range.</p>
                        </div>
                        {answers.includeMathWorkbook ? (
                            isMathWorkbookReady(answers) ? (
                                <div className={`mt-4 rounded-lg border ${theme.border200} bg-white p-4`}>
                                    <p className="text-sm text-gray-600">Workbook variant</p>
                                    <p className="text-base font-semibold text-gray-900">{getMathWorkbookSummary(answers)}</p>
                                </div>
                            ) : (
                                <p className="mt-4 text-sm text-gray-500">Select a skill book to view the workbook details.</p>
                            )
                        ) : (
                            <div className="mt-4 flex flex-col gap-3 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                                <p className="text-sm text-gray-600">The Math workbook is currently excluded for this class.</p>
                                <button
                                    type="button"
                                    onClick={() => setAnswers({ includeMathWorkbook: true })}
                                    className={`w-full sm:w-auto px-4 py-2 text-sm font-semibold rounded-md ${theme.bgColor600} text-white ${theme.hoverBg700}`}
                                >
                                    Add Workbook Back
                                </button>
                            </div>
                        )}
                    </section>
                    {isMathSkillReadyForPreview && <div className={`mt-2 p-3 ${theme.bgColor50} border ${theme.border200} rounded-lg flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-around`}>
                        <BookPreviewLink bookId={bookIds.mathSkill} label="View Skill Book" theme={theme} />
                        {showMathWorkbookPreview && <BookPreviewLink bookId={bookIds.mathWorkbook} label="View Workbook" theme={theme} />}
                    </div>}
                </div>)
            case 3: // Assessment
                const handleAssessmentChange = (value: QuestionnaireAnswers['assessment']) => {
                    setAnswers({
                        assessment: answers.assessment === value ? null : value,
                    });
                };

                return (<div>
                    <h2 className="text-xl font-semibold mb-1">Assessment Type</h2>
                    <p className="text-gray-600 mb-4">Select the assessment format for the academic year.</p>
                    <div className="space-y-4">
                        {OPTIONS.assessment.map(type => (
                            <RadioCard
                                key={type.value}
                                id={`assess-${type.value}`}
                                name="assessment"
                                value={type.value}
                                label={type.value}
                                description={type.description}
                                checked={answers.assessment === type.value}
                                onChange={() => handleAssessmentChange(type.value as QuestionnaireAnswers['assessment'])}
                                onSelect={(_, wasChecked) => {
                                    if (wasChecked) {
                                        handleAssessmentChange(type.value as QuestionnaireAnswers['assessment']);
                                    }
                                }}
                                theme={theme}
                            />
                        ))}
                    </div>
                    {answers.assessment && (
                        <div className={`mt-6 p-3 ${theme.bgColor50} border ${theme.border200} rounded-lg flex items-center justify-around`}>
                            <BookPreviewLink bookId={bookIds.assessment} label="View Assessment Book" theme={theme} />
                        </div>
                    )}
                </div>);
            case 4: // Core Subjects
                 return (<div>
                    <h2 className="text-xl font-semibold mb-1">Core Subjects</h2>
                    <p className="text-gray-600 mb-4">These subjects are included by default, but you can opt out.</p>
                    <div className="space-y-4">
                        <CheckboxCard id="evs" name="evs" label="EVS" description="Concepts: My body, family, school, animals, transport, seasons, etc." checked={answers.includeEVS} onChange={e => setAnswers({ includeEVS: e.target.checked })} theme={theme}/>
                        <CheckboxCard id="rhymes" name="rhymes" label="Rhymes & Stories" description="Customise 25 rhymes & 5 stories, or select our default book." checked={answers.includeRhymes} onChange={e => setAnswers({ includeRhymes: e.target.checked })} theme={theme}/>
                        <CheckboxCard id="art" name="art" label="Art & Craft" description="Age-appropriate colouring and simple craft activities." checked={answers.includeArt} onChange={e => setAnswers({ includeArt: e.target.checked })} theme={theme}/>
                    </div>
                    <div className={`mt-6 p-3 ${theme.bgColor50} border ${theme.border200} rounded-lg grid grid-cols-1 sm:grid-cols-3 gap-2 items-center justify-around text-center`}>
                        {answers.includeEVS && <BookPreviewLink bookId={bookIds.evs} label="View EVS Book" theme={theme} />}
                        {answers.includeRhymes && <BookPreviewLink bookId={bookIds.rhymes} label="View Rhymes Book" theme={theme} />}
                        {answers.includeArt && <BookPreviewLink bookId={bookIds.art} label="View Art Book" theme={theme} />}
                    </div>
                </div>);
            case 5: { // Languages
                const classVariants = OPTIONS.languageOptions.variants[currentClass] || [];
                const selectedLanguages = answers.languages.selections;
                const selectionLimitReached = answers.languages.count > 0 && selectedLanguages.length >= answers.languages.count;

                const handleCountSelection = (newCount: 0 | 1 | 2) => {
                    updateClassAnswers(currentClass, current => {
                        if (current.languages.count === newCount) {
                            return current;
                        }

                        const trimmedSelections = current.languages.selections.slice(0, newCount);
                        return {
                            ...current,
                            languages: {
                                count: newCount,
                                selections: trimmedSelections,
                            },
                        };
                    });
                };

                const toggleLanguageSelection = (language: string) => {
                    updateClassAnswers(currentClass, current => {
                        const { count, selections } = current.languages;
                        const existingIndex = selections.findIndex(sel => sel.language === language);

                        if (existingIndex !== -1) {
                            const updatedSelections = [...selections];
                            updatedSelections.splice(existingIndex, 1);
                            return {
                                ...current,
                                languages: {
                                    count,
                                    selections: updatedSelections,
                                },
                            };
                        }

                        if (count === 0 || selections.length >= count) {
                            return current;
                        }

                        return {
                            ...current,
                            languages: {
                                count,
                                selections: [...selections, { language, variant: null }],
                            },
                        };
                    });
                };

                const handleVariantChange = (language: string, variant: string) => {
                    updateClassAnswers(currentClass, current => ({
                        ...current,
                        languages: {
                            count: current.languages.count,
                            selections: current.languages.selections.map(selection =>
                                selection.language === language
                                    ? { ...selection, variant }
                                    : selection
                            ),
                        },
                    }));
                };

                return (<div>
                    <h2 className="text-xl font-semibold mb-1">Add Extra Languages (Optional)</h2>
                    <p className="text-gray-600 mb-4">Start by choosing how many languages you need, then pick them from the list below.</p>

                    <div>
                        <h3 className="text-lg font-semibold mb-2">Number of Languages</h3>
                        <div className="flex flex-wrap gap-4">
                            {OPTIONS.languageOptions.count.map((label, index) => (
                                <RadioCard
                                    key={label}
                                    id={`lang-count-${index}`}
                                    name="lang-count"
                                    value={String(index)}
                                    label={label}
                                    description=""
                                    checked={answers.languages.count === index}
                                    onChange={event => handleCountSelection(Number(event.target.value) as 0 | 1 | 2)}
                                    theme={theme}
                                />
                            ))}
                        </div>
                    </div>

                    {answers.languages.count > 0 && (
                        <>
                            <div className="mt-6 text-sm text-gray-600">
                                Selected {selectedLanguages.length} of {answers.languages.count} allowed.
                                {selectionLimitReached && ' Deselect a language to choose another.'}
                            </div>

                            <div className="mt-4 space-y-4">
                                {OPTIONS.languageOptions.list.map(language => {
                                    const selection = selectedLanguages.find(sel => sel.language === language);
                                    const isSelected = !!selection;
                                    const activeVariant = selection?.variant ?? null;
                                    return (
                                        <CheckboxCard
                                            key={language}
                                            id={`language-${language}`}
                                            name="languages"
                                            label={language}
                                            description={classVariants.length > 0 ? 'Requires choosing a variant after selecting.' : 'Variant selection not required.'}
                                            checked={isSelected}
                                            onChange={event => {
                                                event.preventDefault();
                                                toggleLanguageSelection(language);
                                            }}
                                            theme={theme}
                                            disabled={!isSelected && selectionLimitReached}
                                        >
                                            {isSelected ? (
                                                <>
                                                    {classVariants.length > 0 ? (
                                                        <div className="flex flex-wrap gap-2">
                                                            {classVariants.map(variant => (
                                                                <button
                                                                    key={variant}
                                                                    type="button"
                                                                    onClick={event => {
                                                                        event.preventDefault();
                                                                        event.stopPropagation();
                                                                        handleVariantChange(language, variant);
                                                                    }}
                                                                    className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${activeVariant === variant
                                                                        ? `${theme.bgColor600} text-white ${theme.border600}`
                                                                        : 'bg-white hover:bg-gray-100'}`}
                                                                >
                                                                    {variant}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <p className="text-sm text-gray-500">No variant selection required.</p>
                                                    )}
                                                    {classVariants.length > 0 && !activeVariant && (
                                                        <p className="text-xs text-red-600 mt-2">Select a variant to finalise this language.</p>
                                                    )}
                                                </>
                                            ) : (
                                                !isSelected && selectionLimitReached && (
                                                    <p className="text-xs text-gray-500">Selection limit reached. Deselect another language to choose this one.</p>
                                                )
                                            )}
                                        </CheckboxCard>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </div>);
            }
            case 6: // Class Summary
                const summaryItems = buildSummaryItems(currentClass, answers, bookIds, true);
                return (<div>
                    <h2 className="text-xl font-semibold mb-2">{currentClass} Selection Summary</h2>
                    <p className="text-gray-600 mb-4">Review your selections for this class. Click "Next" to proceed.</p>
                    <div className="mt-4 divide-y divide-gray-200">
                        {summaryItems.map(item => (<div key={item.key} className="py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <p className="text-sm font-semibold text-gray-800">{item.label}</p>
                                <p className="text-sm text-gray-600">{item.value}</p>
                                {item.bookLabel && <div className="mt-1"><BookPreviewLink bookId={item.bookId || null} label={item.bookLabel} theme={theme} /></div>}
                            </div>
                            <div className="flex gap-2 sm:justify-end">
                                <button onClick={() => navigateToStep(currentClassIndex, item.step, { fromSummary: 'class' })} className={`text-sm font-semibold ${theme.text600} ${theme.hoverText800} px-3 py-1 rounded-md ${theme.hoverBg100}`}>
                                    Edit
                                </button>
                                {item.canRemove && item.onRemove && (
                                    <button onClick={item.onRemove} className="text-sm font-semibold text-red-600 hover:text-red-800 px-3 py-1 rounded-md hover:bg-red-100">
                                        Remove
                                    </button>
                                )}
                            </div>
                        </div>))}
                    </div>
                </div>);
            default: return null;
        }
    };

    const renderFinalSummary = () => (
        <div>
            <h2 className="text-xl font-semibold mb-2">Final Summary & Save</h2>
            <p className="text-gray-600 mb-4">Review all your selections below. Click "Save Selection" to confirm.</p>
            <div className="space-y-6">
                {classOrder.map((className, index) => {
                    const classAnswers = allAnswers[className];
                    const classBookIds: SummaryBookIds = {
                        englishSkill: classAnswers.englishSkill ? getBookId('English Skill', classAnswers) : null,
                        englishWorkbook: classAnswers.englishSkill ? getBookId('English Workbook', classAnswers) : null,
                        mathSkill: classAnswers.mathSkill ? getBookId('Math Skill', classAnswers) : null,
                        mathWorkbook: classAnswers.mathSkill ? getBookId('Math Workbook', classAnswers) : null,
                        assessment: classAnswers.assessment ? getBookId('Assessment', classAnswers) : null,
                        evs: classAnswers.includeEVS ? getBookId('EVS', classAnswers) : null,
                        rhymes: classAnswers.includeRhymes ? getBookId('Rhymes & Stories', classAnswers) : null,
                        art: classAnswers.includeArt ? getBookId('Art & Craft', classAnswers) : null,
                    };

                    const includeCoreSubjects = !!coreSubjectsReached[className];
                    const summaryItems = buildSummaryItems(className, classAnswers, classBookIds, includeCoreSubjects);
                    const summaryTheme = CLASS_THEME[className];
                    if (summaryItems.length === 0) {
                        return (
                            <div key={className} className="bg-gray-50 border rounded-lg p-4">
                                <div className="flex justify-between items-center">
                                    <h3 className={`font-bold text-lg ${summaryTheme.text700}`}>{className}</h3>
                                    <button onClick={() => handleEditClass(index)} className={`text-sm font-semibold ${summaryTheme.text600} ${summaryTheme.hoverText800} px-3 py-1 rounded-md ${summaryTheme.hoverBg100}`}>
                                        Edit
                                    </button>
                                </div>
                                <p className="mt-3 text-sm text-gray-600">No selections yet.</p>
                            </div>
                        );
                    }
                    return (
                        <div key={className} className="bg-gray-50 border rounded-lg p-4">
                            <div className="flex justify-between items-center">
                                <h3 className={`font-bold text-lg ${summaryTheme.text700}`}>{className}</h3>
                                <button onClick={() => handleEditClass(index)} className={`text-sm font-semibold ${summaryTheme.text600} ${summaryTheme.hoverText800} px-3 py-1 rounded-md ${summaryTheme.hoverBg100}`}>
                                    Edit
                                </button>
                            </div>
                            <div className="mt-3 divide-y divide-gray-200">
                                {summaryItems.map(item => (
                                    <div key={item.key} className="py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                        <div>
                                            <p className="text-sm font-semibold text-gray-800">{item.label}</p>
                                            <p className="text-sm text-gray-600">{item.value}</p>
                                            {item.bookLabel && (
                                                <div className="mt-1">
                                                    <BookPreviewLink bookId={item.bookId || null} label={item.bookLabel} theme={summaryTheme} />
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex gap-2">
                                            <button onClick={() => navigateToStep(index, item.step, { fromSummary: 'final' })} className={`text-sm font-semibold ${summaryTheme.text600} ${summaryTheme.hoverText800} px-3 py-1 rounded-md ${summaryTheme.hoverBg100}`}>
                                                Edit
                                            </button>
                                            {item.canRemove && item.onRemove && (
                                                <button onClick={item.onRemove} className="text-sm font-semibold text-red-600 hover:text-red-800 px-3 py-1 rounded-md hover:bg-red-100">
                                                    Remove
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    );

                })}
            </div>
            {status === 'idle' && <button onClick={handleSave} className="mt-6 w-full bg-green-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-green-700 transition-colors">Save All Selections</button>}
            {status === 'saving' && <p className="mt-6 text-center text-blue-600">Saving...</p>}
            {status === 'success' && <p className="mt-6 text-center text-green-600 font-semibold">Selection saved successfully! (ID: {savedId})</p>}
            {status === 'error' && <p className="mt-6 text-center text-red-600">Failed to save selection. Please try again.</p>}
        </div>
    );

    const renderLiveSummary = () => {
        if (showClassIntro || showFinalSummary || step === totalStepsPerClass) {
            return null;
        }

        const summaryTheme = CLASS_THEME[currentClass];

        return (
            <aside className="hidden lg:block">
                <div className="lg:sticky lg:top-6 bg-white p-6 rounded-lg border shadow-md">
                    <div>
                        <h2 className="text-lg font-semibold text-gray-800">Current Selections</h2>
                        <p className="text-sm text-gray-600 mt-1">A quick overview of what’s been chosen so far.</p>
                    </div>
                    <div className="mt-4 space-y-2">
                        {liveSummaryItems.length > 0 ? (
                            <div className="divide-y divide-gray-200">
                                {liveSummaryItems.map(item => (
                                    <div key={item.key} className="py-3">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <span
                                                className={`inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold text-white ${summaryTheme.bgColor600}`}
                                            >
                                                {item.label}
                                            </span>
                                            <div className="flex-1 min-w-0">
                                                <span className="block text-sm text-gray-700 truncate max-w-full">
                                                    {item.value}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-sm text-gray-600">Selections will appear here as you make them.</p>
                        )}
                    </div>
                </div>
            </aside>
        );
    };

    const mainHeading = showFinalSummary
        ? 'All Classes : Curriculum Customiser'
        : showClassIntro
            ? 'Welcome to the Curriculum Customiser'
            : `${currentClass} : Curriculum Customiser`;

    const mainContentCard = (
        <div className="bg-white p-8 rounded-lg shadow-md border">
            <div className="mb-6">
                <div className="flex justify-between items-center mb-2">
                    <div>
                        {!showClassIntro && (
                            <h1 className="text-2xl font-bold text-gray-800">{mainHeading}</h1>
                        )}
                    </div>
                    {!showFinalSummary && !showClassIntro && (
                        <span className="text-sm font-semibold text-gray-500">Step {step} of {totalStepsPerClass}</span>
                    )}
                </div>
                {!showFinalSummary && !showClassIntro && (
                    <>
                        <div className="w-full bg-gray-200 rounded-full h-2.5">
                            <div className={`${theme.bgColor600} h-2.5 rounded-full`} style={{ width: `${(step / totalStepsPerClass) * 100}%` }}></div>
                        </div>
                        <div className={`mt-3 text-sm font-semibold ${theme.text700}`}>
                            <span>Books selected: {booksSelected}</span>
                            {currentClass !== 'Nursery' && (
                                <>
                                    <span className="mx-2">•</span>
                                    <span>Languages selected: {progress.languagesSelected}</span>
                                </>
                            )}
                        </div>
                    </>
                )}
            </div>

            <div className="min-h-[400px] py-4">
                {showFinalSummary ? renderFinalSummary() : (showClassIntro ? renderClassSelection() : renderStepContent())}
            </div>

            <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center">
                <button
                    onClick={handleBack}
                    disabled={showClassIntro}
                    className="bg-gray-300 text-gray-800 px-6 py-2 rounded-md hover:bg-gray-400 disabled:bg-gray-200 disabled:cursor-not-allowed"
                >
                    Back
                </button>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    {summaryReturnTarget === 'final' && !showFinalSummary && (
                        <button
                            onClick={returnToSummary}
                            className={`border ${theme.border600} ${theme.text600} px-6 py-2 rounded-md ${theme.hoverBg50}`}
                        >
                            Return to Final Summary
                        </button>
                    )}
                    {!showFinalSummary && (
                        <button
                            onClick={handleNext}
                            disabled={showClassIntro}
                            className={`${theme.bgColor600} text-white px-6 py-2 rounded-md ${theme.hoverBg700} disabled:bg-gray-300 disabled:text-gray-500`}
                        >
                            {step === totalStepsPerClass
                                ? (summaryReturnTarget
                                    ? 'Next'
                                    : (currentClass === 'UKG'
                                        ? 'Finish & View Summary'
                                        : `Next: Customise ${classOrder[currentClassIndex + 1]}`))
                                : 'Next'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );

    // --- MAIN RENDER ---
    return (
        <div className="container mx-auto max-w-6xl px-4 lg:px-0">
            {showClassIntro ? (
                <div className="flex justify-center">
                    <div className="w-full max-w-4xl">
                        {mainContentCard}
                    </div>
                </div>
            ) : (
                <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
                    {mainContentCard}
                    {renderLiveSummary()}
                </div>
            )}
        </div>
    );
};

export default QuestionnairePage;
