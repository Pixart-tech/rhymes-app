


export type SchoolServiceType = 'id_cards' | 'report_cards' | 'certificates';

export type ServiceStatus = 'yes' | 'no';
export type OptionalServiceStatus = ServiceStatus | '';
export type ServiceStatusMap = Record<SchoolServiceType, OptionalServiceStatus>;

export type GradeKey =  'playgroup' | 'nursery' | 'lkg' | 'ukg';
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
  selection_status?: 'pending' | 'approved' | 'rejected';
  selections_approved?: boolean;
  selection_locked_at?: string | null;
  selection_locked_by?: string | null;
  id_card_fields?: string[];
  created_by_user_id?: string | null;
  created_by_email?: string | null;
  zoho_customer_id?: string | null;
  timestamp?: string;
}

export interface SchoolFormValues {
  school_name: string;
  logo_url?: string | null;
  logo_file?: File | null;
  email: string;
  phone: string;
  address: string;
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
















export interface BookOption {
  typeId: string; // Unique internal ID for the option
  label: string;
  coreId?: string;
  coreCover?: string;
  coreSpine?: string;
  defaultCoreCoverTitle?: string;
  workId?: string;
  workCover?: string;
  workSpine?: string;
  defaultWorkCoverTitle?: string;
  addOnId?: string;
  addOnCover?: string;
  addOnSpine?: string;
  defaultAddonCoverTitle?: string;
  link?: string;
  info?: string;
  isRecommended: boolean;
  jsonSubject?: string; // Override subject name for JSON output
}

export interface Subject {
  name: string;
  isMultiSelect?: boolean; // If true, allows multiple options to be selected
  options: BookOption[];
}

export interface ClassData {
  name: string;
  subjects: Subject[];
}

export interface SelectionRecord {
  className: string;
  subjectName: string;
  selectedOption: BookOption | null; // null implies skipped
  skipCore?: boolean; // If true, the core book is not selected
  skipWork?: boolean; // If true, the work book is not selected
  skipAddon?: boolean; // If true, the add-on book is not selected
  
  // Custom Overrides
  customCoreTitle?: string;
  customCoreId?: string;
  customCoreSpine?: string;

  customWorkTitle?: string;
  customWorkId?: string;
  customWorkSpine?: string;

  customAddonTitle?: string;
  customAddonId?: string;
  customAddonSpine?: string;
}

export interface FinalOutputItem {
  class: string;
  class_label?: string;
  grade_subject?: string;
  subject: string;
  type: string;
  component?: 'core' | 'work' | 'addon';
  core: string | undefined;
  core_cover?: string | undefined;
  core_cover_title?: string | undefined;
  core_spine?: string | undefined;
  work: string | undefined;
  work_cover?: string | undefined;
  work_cover_title?: string | undefined;
  work_spine?: string | undefined;
  addOn: string | undefined;
  addon_cover?: string | undefined;
  addon_cover_title?: string | undefined;
  addon_spine?: string | undefined;
  cover_theme_id?: string | null;
  cover_theme_label?: string | null;
  cover_colour_id?: string | null;
  cover_colour_label?: string | null;
  cover_status?: string | null;
}

export type AssessmentVariant = 'WITH_MARKS' | 'WITHOUT_MARKS';
