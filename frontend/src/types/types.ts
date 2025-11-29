
export type SchoolServiceType = 'id_cards' | 'report_cards' | 'certificates';

export type ServiceStatus = 'yes' | 'no';
export type OptionalServiceStatus = ServiceStatus | '';
export type ServiceStatusMap = Record<SchoolServiceType, OptionalServiceStatus>;

export type GradeKey = 'toddler' | 'playgroup' | 'nursery' | 'lkg' | 'ukg';
export interface GradeSetting {
  enabled: boolean;
  label: string;
}
export type GradeMap = Record<GradeKey, GradeSetting>;
export type BranchStatus = 'active' | 'inactive';

export interface SchoolProfile {
  school_id: string;
  school_name: string;
  logo_url?: string | null;
  email?: string | null;
  phone?: string | null;
  address_line1?: string | null;
  city?: string | null;
  state?: string | null;
  pin?: string | null;
  branch_parent_id?: string | null;
  tagline?: string | null;
  principal_name?: string | null;
  principal_email?: string | null;
  principal_phone?: string | null;
  website?: string | null;
  service_status?: ServiceStatusMap;
  grades?: GradeMap;
  service_type?: SchoolServiceType[];
  status?: BranchStatus;
  id_card_fields?: string[];
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
  address_line1: string;
  city: string;
  state: string;
  pin: string;
  tagline?: string;
  website: string;
  principal_name: string;
  principal_email: string;
  principal_phone: string;
  service_status: ServiceStatusMap;
  grades: GradeMap;
  id_card_fields: string[];
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
