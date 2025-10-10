
export interface Book {
  id: string;
  class_level: string;
  subject: string;
  language: string | null;
  variant: string;
  price_inr: number;
}

export interface LanguageSelection {
  language: string;
  variant: string | null;
}

export interface QuestionnaireAnswers {
  classLevel: 'Nursery' | 'LKG' | 'UKG' | null;
  englishSkill: string | null;
  englishSkillWritingFocus: 'Caps' | 'Small' | 'Caps & Small' | null;
  includeEnglishWorkbook: boolean;
  mathSkill: string | null;
  includeMathWorkbook: boolean;
  assessment: 'Termwise' | 'Annual' | 'Annual (no marks)' | null;
  includeEVS: boolean;
  includeRhymes: boolean;
  includeArt: boolean;
  languages: {
    count: 0 | 1 | 2;
    selections: LanguageSelection[];
  };
}
