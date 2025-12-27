import { getAssessmentForClass } from '../constants/constants';
import { AssessmentVariant, CoverSelectionMeta, FinalOutputItem, SelectionRecord } from '../types/types';

/**
 * Build the flattened book selection payload used for JSON downloads and persistence.
 * Mirrors the structure shown in the Wizard final step.
 */
export const buildFinalBookSelections = (
  selections: SelectionRecord[],
  excludedAssessments: string[],
  assessmentVariants: Record<string, AssessmentVariant> = {},
  customAssessmentTitles: Record<string, string> = {},
  gradeNames: Record<string, string> = {},
  coverSelections: Record<string, CoverSelectionMeta> = {}
): FinalOutputItem[] => {
  const selectionsByClass: Record<string, SelectionRecord[]> = {};

  selections.forEach((selection) => {
    if (!selectionsByClass[selection.className]) {
      selectionsByClass[selection.className] = [];
    }
    selectionsByClass[selection.className].push(selection);
  });

  const finalData: FinalOutputItem[] = [];

  Object.keys(selectionsByClass).forEach((className) => {
    const classSelections = selectionsByClass[className];
    const gradeKey = className.toLowerCase();
    const normalizedKey = gradeKey === 'playgroup' ? 'pg' : gradeKey;
    const gradeLabel = gradeNames[normalizedKey] || className;
    const coverMeta = coverSelections[className] || null;

    const hasActive = (selection: SelectionRecord): boolean => {
      if (!selection.selectedOption) return false;
      const coreActive = !!selection.selectedOption.coreId && !selection.skipCore;
      const workActive = !!selection.selectedOption.workId && !selection.skipWork;
      const addonActive = !!selection.selectedOption.addOnId && !selection.skipAddon;
      return coreActive || workActive || addonActive;
    };

    classSelections.forEach((selection) => {
      if (!selection.selectedOption) return;

      if (selection.skipCore && selection.skipWork && selection.skipAddon) return;

      const coreTitle =
        selection.customCoreTitle ||
        selection.selectedOption.defaultCoreCoverTitle ||
        selection.selectedOption.label;
      const workTitle =
        selection.customWorkTitle ||
        selection.selectedOption.defaultWorkCoverTitle ||
        selection.selectedOption.label;
      const addonTitle =
        selection.customAddonTitle ||
        selection.selectedOption.defaultAddonCoverTitle ||
        selection.selectedOption.label;

      const base = {
        class: gradeLabel,
        class_label: selection.className,
        subject: selection.selectedOption.jsonSubject || selection.subjectName,
        type: selection.selectedOption.label,
        cover_theme_id: coverMeta?.themeId ?? null,
        cover_theme_label: coverMeta?.themeLabel ?? null,
        cover_colour_id: coverMeta?.colourId ?? null,
        cover_colour_label: coverMeta?.colourLabel ?? null,
        cover_status: coverMeta?.status ?? null
      };

      if (!selection.skipCore && selection.selectedOption.coreId) {
        finalData.push({
          ...base,
          component: 'core',
          grade_subject: `${gradeLabel} : ${coreTitle}`,
          core: selection.selectedOption.coreId,
          core_cover: selection.selectedOption.coreCover,
          core_cover_title: selection.customCoreTitle || selection.selectedOption.defaultCoreCoverTitle,
          core_spine: selection.selectedOption.coreSpine,
          work: undefined,
          addOn: undefined
        });
      }

      if (!selection.skipWork && selection.selectedOption.workId) {
        finalData.push({
          ...base,
          component: 'work',
          grade_subject: `${gradeLabel} : ${workTitle}`,
          core: undefined,
          work: selection.selectedOption.workId,
          work_cover: selection.selectedOption.workCover,
          work_cover_title: selection.customWorkTitle || selection.selectedOption.defaultWorkCoverTitle,
          work_spine: selection.selectedOption.workSpine,
          addOn: undefined
        });
      }

      if (!selection.skipAddon && selection.selectedOption.addOnId) {
        finalData.push({
          ...base,
          component: 'addon',
          grade_subject: `${gradeLabel} : ${addonTitle}`,
          core: undefined,
          work: undefined,
          addOn: selection.selectedOption.addOnId,
          addon_cover: selection.selectedOption.addOnCover,
          addon_cover_title: selection.customAddonTitle || selection.selectedOption.defaultAddonCoverTitle,
          addon_spine: selection.selectedOption.addOnSpine
        });
      }
    });

    if (!excludedAssessments.includes(className)) {
      const englishSelection =
        classSelections.find((item) => item.subjectName === 'English' && hasActive(item))?.selectedOption || null;
      const mathsSelection =
        classSelections.find((item) => item.subjectName === 'Maths' && hasActive(item))?.selectedOption || null;
      const assessment = getAssessmentForClass(
        className,
        englishSelection,
        mathsSelection,
        assessmentVariants[className] || 'WITH_MARKS'
      );

        if (assessment) {
          const assessmentTitle = customAssessmentTitles[className] || assessment.defaultCoreCoverTitle || assessment.label;
          finalData.push({
            class: gradeLabel,
            class_label: className,
            subject: 'Assessment',
            grade_subject: `${gradeLabel} : ${assessmentTitle}`,
            type: assessment.label,
            core: assessment.coreId,
            core_cover: assessment.coreCover,
            core_cover_title: customAssessmentTitles[className] || assessment.defaultCoreCoverTitle,
            core_spine: assessment.coreSpine,
            work: undefined,
            addOn: undefined,
            cover_theme_id: coverMeta?.themeId ?? null,
            cover_theme_label: coverMeta?.themeLabel ?? null,
            cover_colour_id: coverMeta?.colourId ?? null,
            cover_colour_label: coverMeta?.colourLabel ?? null,
            cover_status: coverMeta?.status ?? null
        });
      }
    }
  });

  return finalData;
};
