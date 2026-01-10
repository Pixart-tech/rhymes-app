import { getAssessmentForClass, SCHOOL_DATA } from '../constants/constants';
import { AssessmentVariant, BookOption, CoverSelectionMeta, FinalOutputItem, SelectionRecord } from '../types/types';

// Ensure we always emit the latest cover/spine data from constants, even if a saved
// selection was created before codes changed.
const canonicalOptionIndex: Record<string, BookOption> = (() => {
  const index: Record<string, BookOption> = {};
  SCHOOL_DATA.forEach((cls) => {
    cls.subjects.forEach((subject) => {
      subject.options.forEach((opt) => {
        if (opt.coreId) index[`core:${opt.coreId}`] = opt;
        if (opt.workId) index[`work:${opt.workId}`] = opt;
        if (opt.addOnId) index[`addon:${opt.addOnId}`] = opt;
      });
    });
  });
  return index;
})();

const mergeWithCanonicalOption = (option: BookOption | null): BookOption | null => {
  if (!option) return null;
  const canonical =
    (option.coreId && canonicalOptionIndex[`core:${option.coreId}`]) ||
    (option.workId && canonicalOptionIndex[`work:${option.workId}`]) ||
    (option.addOnId && canonicalOptionIndex[`addon:${option.addOnId}`]);

  if (!canonical) return option;

  return {
    ...option,
    coreCover: canonical.coreCover ?? option.coreCover,
    coreSpine: canonical.coreSpine ?? option.coreSpine,
    defaultCoreCoverTitle: canonical.defaultCoreCoverTitle ?? option.defaultCoreCoverTitle,
    workCover: canonical.workCover ?? option.workCover,
    workSpine: canonical.workSpine ?? option.workSpine,
    defaultWorkCoverTitle: canonical.defaultWorkCoverTitle ?? option.defaultWorkCoverTitle,
    addOnCover: canonical.addOnCover ?? option.addOnCover,
    addOnSpine: canonical.addOnSpine ?? option.addOnSpine,
    defaultAddonCoverTitle: canonical.defaultAddonCoverTitle ?? option.defaultAddonCoverTitle,
  };
};

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
  const excludedSet = new Set(
    (excludedAssessments || []).map((value) => (value || '').toString().trim().toLowerCase())
  );

  selections.forEach((selection) => {
    if (!selectionsByClass[selection.className]) {
      selectionsByClass[selection.className] = [];
    }
    selectionsByClass[selection.className].push(selection);
  });

  const finalData: FinalOutputItem[] = [];

  Object.keys(selectionsByClass).forEach((className) => {
    const classSelections = selectionsByClass[className].map((selection) => ({
      ...selection,
      selectedOption: mergeWithCanonicalOption(selection.selectedOption),
    }));
    const gradeKey = className.toLowerCase();
    const classKey = gradeKey;
    const gradeLabel = gradeNames[gradeKey] || className;
    const displayLabel = gradeLabel || className;
    const coverMeta = coverSelections[className] || null;

    const hasActive = (selection: SelectionRecord): boolean => {
      if (!selection.selectedOption) return false;
      const coreActive = !!selection.selectedOption.coreId && !selection.skipCore;
      const workActive = !!selection.selectedOption.workId && !selection.skipWork;
      const addonActive = !!selection.selectedOption.addOnId && !selection.skipAddon;
      return coreActive || workActive || addonActive;
    };

    const englishSelection =
      classSelections.find(
        (item) =>
          (item.subjectName || '').toString().trim().toLowerCase() === 'english' && hasActive(item)
      )?.selectedOption || null;
    const mathsSelection =
      classSelections.find(
        (item) =>
          (item.subjectName || '').toString().trim().toLowerCase() === 'maths' && hasActive(item)
      )?.selectedOption || null;
    const evsSelection =
      classSelections.find(
        (item) => (item.subjectName || '').toString().trim().toLowerCase() === 'evs' && hasActive(item)
      )?.selectedOption || null;
    const hasCoreSubjects =
      Boolean(englishSelection || mathsSelection || evsSelection) ||
      classSelections.some((item) => {
        const subject = (item.subjectName || '').toString().trim().toLowerCase();
        return ['english', 'maths', 'evs'].includes(subject) && !!item.selectedOption;
      });

    classSelections.forEach((selection) => {
      if (!selection.selectedOption) return;

      const hasActiveCore = !!selection.selectedOption.coreId && !selection.skipCore;
      const hasActiveWork = !!selection.selectedOption.workId && !selection.skipWork;
      const hasActiveAddon = !!selection.selectedOption.addOnId && !selection.skipAddon;
      if (!hasActiveCore && !hasActiveWork && !hasActiveAddon) return;

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
        class: classKey,
        class_label: displayLabel,
        class_name: selection.className,
        subject: selection.selectedOption.jsonSubject || selection.subjectName,
        type: selection.selectedOption.label,
        cover_theme_id: coverMeta?.themeId ?? null,
        cover_theme_label: coverMeta?.themeLabel ?? null,
        cover_colour_id: coverMeta?.colourId ?? null,
        cover_colour_label: coverMeta?.colourLabel ?? null,
        cover_status: coverMeta?.status ?? null
      };

      if (hasActiveCore) {
        finalData.push({
          ...base,
          component: 'core',
          grade_subject: `${displayLabel} : ${coreTitle}`,
          core: selection.selectedOption.coreId,
          core_cover: selection.selectedOption.coreCover,
          core_cover_title: selection.customCoreTitle || selection.selectedOption.defaultCoreCoverTitle,
          core_spine: selection.selectedOption.coreSpine,
          work: undefined,
          addOn: undefined
        });
      }

      if (hasActiveWork) {
        finalData.push({
          ...base,
          component: 'work',
          grade_subject: `${displayLabel} : ${workTitle}`,
          core: undefined,
          work: selection.selectedOption.workId,
          work_cover: selection.selectedOption.workCover,
          work_cover_title: selection.customWorkTitle || selection.selectedOption.defaultWorkCoverTitle,
          work_spine: selection.selectedOption.workSpine,
          addOn: undefined
        });
      }

      if (hasActiveAddon) {
        finalData.push({
          ...base,
          component: 'addon',
          grade_subject: `${displayLabel} : ${addonTitle}`,
          core: undefined,
          work: undefined,
          addOn: selection.selectedOption.addOnId,
          addon_cover: selection.selectedOption.addOnCover,
          addon_cover_title: selection.customAddonTitle || selection.selectedOption.defaultAddonCoverTitle,
          addon_spine: selection.selectedOption.addOnSpine
        });
      }
    });

    const normalizedClassName = (className || '').toString().trim().toLowerCase();
    const isPlaygroup = normalizedClassName === 'playgroup' || normalizedClassName === 'pg';

    if (!excludedSet.has(normalizedClassName) && !isPlaygroup) {
      // Skip assessment only when all three subjects are absent
      if (!hasCoreSubjects) {
        return;
      }
      const assessment = getAssessmentForClass(
        className,
        englishSelection,
        mathsSelection,
        assessmentVariants[className] || 'WITH_MARKS'
      );

        if (assessment) {
          const assessmentTitle = customAssessmentTitles[className] || assessment.defaultCoreCoverTitle || assessment.label;
          finalData.push({
            class: classKey,
            class_label: displayLabel,
            class_name: className,
            component: 'core', // keep parity with legacy payloads for assessment
            subject: 'Assessment',
            grade_subject: `${displayLabel} : ${assessmentTitle}`,
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

  // Deduplicate entries per class/subject/component by keeping the record with more populated fields.
  const pickScore = (item: FinalOutputItem): number => {
    const fields = [
      item.core_cover,
      item.core_cover_title,
      item.core_spine,
      item.work_cover,
      item.work_cover_title,
      item.work_spine,
      item.addon_cover,
      item.addon_cover_title,
      item.addon_spine,
      item.cover_theme_id,
      item.cover_colour_id,
      item.cover_status,
    ];
    return fields.reduce((acc, val) => acc + (val ? 1 : 0), 0);
  };

  const deduped: Record<string, FinalOutputItem> = {};
  finalData.forEach((item) => {
    const classKey = (item.class || item.class_label || '').toString().trim().toLowerCase();
    const key = [
      classKey,
      item.subject || '',
      item.component || '',
      item.core || item.work || item.addOn || '',
    ].join('|');
    const current = deduped[key];
    if (!current || pickScore(item) >= pickScore(current)) {
      deduped[key] = item;
    }
  });

  return Object.values(deduped);
};
