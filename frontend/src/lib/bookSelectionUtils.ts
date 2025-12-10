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

      const displayTitle = !selection.skipCore && coreTitle
        ? coreTitle
        : !selection.skipWork && workTitle
          ? workTitle
          : !selection.skipAddon && addonTitle
            ? addonTitle
            : selection.selectedOption.label;

      finalData.push({
        class: gradeLabel,
        class_label: selection.className,
        subject: selection.selectedOption.jsonSubject || selection.subjectName,
        grade_subject: `${gradeLabel} : ${displayTitle}`,
        type: selection.selectedOption.label,
        core: selection.skipCore ? undefined : selection.selectedOption.coreId,
        core_cover:
          !selection.skipCore && selection.selectedOption.coreId
            ? selection.selectedOption.coreCover
            : undefined,
        core_cover_title:
          !selection.skipCore && selection.selectedOption.coreId
            ? selection.customCoreTitle || selection.selectedOption.defaultCoreCoverTitle
            : undefined,
        core_spine:
          !selection.skipCore && selection.selectedOption.coreId
            ? selection.selectedOption.coreSpine
            : undefined,
        work: selection.skipWork ? undefined : selection.selectedOption.workId,
        work_cover:
          !selection.skipWork && selection.selectedOption.workId
            ? selection.selectedOption.workCover
            : undefined,
        work_cover_title:
          !selection.skipWork && selection.selectedOption.workId
            ? selection.customWorkTitle || selection.selectedOption.defaultWorkCoverTitle
            : undefined,
        work_spine:
          !selection.skipWork && selection.selectedOption.workId
            ? selection.selectedOption.workSpine
            : undefined,
        addOn: selection.skipAddon ? undefined : selection.selectedOption.addOnId,
        addon_cover:
          !selection.skipAddon && selection.selectedOption.addOnId
            ? selection.selectedOption.addOnCover
            : undefined,
        addon_cover_title:
          !selection.skipAddon && selection.selectedOption.addOnId
            ? selection.customAddonTitle || selection.selectedOption.defaultAddonCoverTitle
            : undefined,
        addon_spine:
          !selection.skipAddon && selection.selectedOption.addOnId
            ? selection.selectedOption.addOnSpine
            : undefined,
        cover_theme_id: coverMeta?.themeId ?? null,
        cover_theme_label: coverMeta?.themeLabel ?? null,
        cover_colour_id: coverMeta?.colourId ?? null,
        cover_colour_label: coverMeta?.colourLabel ?? null,
        cover_status: coverMeta?.status ?? null
      });
    });

    if (!excludedAssessments.includes(className)) {
      const englishSelection =
        classSelections.find((item) => item.subjectName === 'English')?.selectedOption || null;
      const mathsSelection =
        classSelections.find((item) => item.subjectName === 'Maths')?.selectedOption || null;
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
