
export type SchoolServiceType = 'id_cards' | 'report_cards' | 'certificates';

export interface SchoolProfile {
  school_id: string;
  school_name: string;
  logo_url?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  tagline?: string | null;
  principal_name?: string | null;
  principal_email?: string | null;
  principal_phone?: string | null;
  service_type?: SchoolServiceType[];
  created_by_user_id?: string | null;
  created_by_email?: string | null;
  timestamp?: string;
}

export interface SchoolFormValues {
  school_name: string;
  logo_url?: string | null;
  logo_file?: File | null;
  email: string;
  phone: string;
  address: string;
  tagline?: string;
  principal_name: string;
  principal_email: string;
  principal_phone: string;
  service_type: Record<SchoolServiceType, boolean>;
}

export interface RhymeSelectionDetail {
  id?: string | null;
  page_index: number;
  rhyme_code?: string | null;
  rhyme_name?: string | null;
  pages: number;
  position?: string | null;
  timestamp?: string | null;
}

export interface AdminSchoolProfile extends SchoolProfile {
  total_selections: number;
  last_updated?: string | null;
  grades: Record<string, RhymeSelectionDetail[]>;
}

export interface WorkspaceUserUpdatePayload {
  display_name?: string;
  email?: string;
}

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
