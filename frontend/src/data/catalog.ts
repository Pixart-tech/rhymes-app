
import { Book } from '../types';

export const CATALOG: Book[] = [
  // --- Nursery ---
  // English Skill Books
  { id: 'NUR-ENG-SKILL-ABCD-C', class_level: 'Nursery', subject: 'English Skill', language: null, variant: 'ABCD (Caps)', price_inr: 250 },
  { id: 'NUR-ENG-SKILL-ABCD-CS', class_level: 'Nursery', subject: 'English Skill', language: null, variant: 'ABCD (Caps & Small)', price_inr: 250 },
  { id: 'NUR-ENG-SKILL-ABCD-S', class_level: 'Nursery', subject: 'English Skill', language: null, variant: 'ABCD (Small)', price_inr: 250 },
  { id: 'NUR-ENG-SKILL-SATPIN-C', class_level: 'Nursery', subject: 'English Skill', language: null, variant: 'SATPIN (Caps)', price_inr: 250 },
  { id: 'NUR-ENG-SKILL-SATPIN-S', class_level: 'Nursery', subject: 'English Skill', language: null, variant: 'SATPIN (Small)', price_inr: 250 },
  { id: 'NUR-ENG-SKILL-SATPIN-CS', class_level: 'Nursery', subject: 'English Skill', language: null, variant: 'SATPIN (Caps & Small)', price_inr: 250 },
  { id: 'NUR-ENG-SKILL-LTI-C', class_level: 'Nursery', subject: 'English Skill', language: null, variant: 'LTI (Caps)', price_inr: 250 },
  { id: 'NUR-ENG-SKILL-JOLLY', class_level: 'Nursery', subject: 'English Skill', language: null, variant: 'Jolly Phonics', price_inr: 250 },

  // English Workbooks
  { id: 'NUR-ENG-WB-ABCD-C-N', class_level: 'Nursery', subject: 'English Workbook', language: null, variant: 'ABCD (Caps, Normal)', price_inr: 200 },
  { id: 'NUR-ENG-WB-ABCD-C-A', class_level: 'Nursery', subject: 'English Workbook', language: null, variant: 'ABCD (Caps, Writing Assist)', price_inr: 200 },
  { id: 'NUR-ENG-WB-ABCD-CS-N', class_level: 'Nursery', subject: 'English Workbook', language: null, variant: 'ABCD (Caps & Small, Normal)', price_inr: 200 },
  { id: 'NUR-ENG-WB-ABCD-CS-A', class_level: 'Nursery', subject: 'English Workbook', language: null, variant: 'ABCD (Caps & Small, Writing Assist)', price_inr: 200 },
  { id: 'NUR-ENG-WB-ABCD-S-N', class_level: 'Nursery', subject: 'English Workbook', language: null, variant: 'ABCD (Small, Normal)', price_inr: 200 },
  { id: 'NUR-ENG-WB-ABCD-S-A', class_level: 'Nursery', subject: 'English Workbook', language: null, variant: 'ABCD (Small, Writing Assist)', price_inr: 200 },
  { id: 'NUR-ENG-WB-SATPIN-C-N', class_level: 'Nursery', subject: 'English Workbook', language: null, variant: 'SATPIN (Caps, Normal)', price_inr: 200 },
  { id: 'NUR-ENG-WB-SATPIN-C-A', class_level: 'Nursery', subject: 'English Workbook', language: null, variant: 'SATPIN (Caps, Writing Assist)', price_inr: 200 },
  { id: 'NUR-ENG-WB-SATPIN-S-N', class_level: 'Nursery', subject: 'English Workbook', language: null, variant: 'SATPIN (Small, Normal)', price_inr: 200 },
  { id: 'NUR-ENG-WB-SATPIN-S-A', class_level: 'Nursery', subject: 'English Workbook', language: null, variant: 'SATPIN (Small, Writing Assist)', price_inr: 200 },
  { id: 'NUR-ENG-WB-SATPIN-CS-N', class_level: 'Nursery', subject: 'English Workbook', language: null, variant: 'SATPIN (Caps & Small, Normal)', price_inr: 200 },
  { id: 'NUR-ENG-WB-SATPIN-CS-A', class_level: 'Nursery', subject: 'English Workbook', language: null, variant: 'SATPIN (Caps & Small, Writing Assist)', price_inr: 200 },
  { id: 'NUR-ENG-WB-LTI-C-N', class_level: 'Nursery', subject: 'English Workbook', language: null, variant: 'LTI (Caps, Normal)', price_inr: 200 },
  { id: 'NUR-ENG-WB-LTI-C-A', class_level: 'Nursery', subject: 'English Workbook', language: null, variant: 'LTI (Caps, Writing Assist)', price_inr: 200 },
  { id: 'NUR-ENG-WB-JOLLY', class_level: 'Nursery', subject: 'English Workbook', language: null, variant: 'Jolly Phonics', price_inr: 200 },

  // Math Skill & Workbook
  { id: 'NUR-MATH-SKILL-1-10', class_level: 'Nursery', subject: 'Math Skill', language: null, variant: '1–10', price_inr: 250 },
  { id: 'NUR-MATH-SKILL-1-20', class_level: 'Nursery', subject: 'Math Skill', language: null, variant: '1–20', price_inr: 250 },
  { id: 'NUR-MATH-SKILL-1-50', class_level: 'Nursery', subject: 'Math Skill', language: null, variant: '1–50', price_inr: 250 },
  { id: 'NUR-MATH-WB-1-10-N', class_level: 'Nursery', subject: 'Math Workbook', language: null, variant: '1–10 (Normal)', price_inr: 200 },
  { id: 'NUR-MATH-WB-1-10-A', class_level: 'Nursery', subject: 'Math Workbook', language: null, variant: '1–10 (Writing Assist)', price_inr: 200 },
  { id: 'NUR-MATH-WB-1-20-N', class_level: 'Nursery', subject: 'Math Workbook', language: null, variant: '1–20 (Normal)', price_inr: 200 },
  { id: 'NUR-MATH-WB-1-20-A', class_level: 'Nursery', subject: 'Math Workbook', language: null, variant: '1–20 (Writing Assist)', price_inr: 200 },
  { id: 'NUR-MATH-WB-1-50-N', class_level: 'Nursery', subject: 'Math Workbook', language: null, variant: '1–50 (Normal)', price_inr: 200 },
  { id: 'NUR-MATH-WB-1-50-A', class_level: 'Nursery', subject: 'Math Workbook', language: null, variant: '1–50 (Writing Assist)', price_inr: 200 },
  
  // Nursery Core
  { id: 'NUR-EVS', class_level: 'Nursery', subject: 'EVS', language: null, variant: 'Standard', price_inr: 300 },
  { id: 'NUR-ASSESS-TERM', class_level: 'Nursery', subject: 'Assessment', language: null, variant: 'Termwise', price_inr: 200 },
  { id: 'NUR-ASSESS-ANNUAL', class_level: 'Nursery', subject: 'Assessment', language: null, variant: 'Annual', price_inr: 200 },
  { id: 'NUR-ASSESS-ANNUAL-NOMARKS', class_level: 'Nursery', subject: 'Assessment', language: null, variant: 'Annual (no marks)', price_inr: 200 },
  { id: 'NUR-RHYMES', class_level: 'Nursery', subject: 'Rhymes & Stories', language: null, variant: 'Standard', price_inr: 200 },
  { id: 'NUR-ART', class_level: 'Nursery', subject: 'Art & Craft', language: null, variant: 'Standard', price_inr: 200 },

  // --- LKG ---
  // English Skill & Workbook
  { id: 'LKG-ENG-SKILL-CAPS-VOW', class_level: 'LKG', subject: 'English Skill', language: null, variant: 'Caps+vowels', price_inr: 250 },
  { id: 'LKG-ENG-SKILL-SMALL-VOW', class_level: 'LKG', subject: 'English Skill', language: null, variant: 'Small+vowels', price_inr: 250 },
  { id: 'LKG-ENG-WB-CAPS-VOW-N', class_level: 'LKG', subject: 'English Workbook', language: null, variant: 'Caps+vowels (Normal)', price_inr: 200 },
  { id: 'LKG-ENG-WB-CAPS-VOW-A', class_level: 'LKG', subject: 'English Workbook', language: null, variant: 'Caps+vowels (Writing Assist)', price_inr: 200 },
  { id: 'LKG-ENG-WB-SMALL-VOW-N', class_level: 'LKG', subject: 'English Workbook', language: null, variant: 'Small+vowels (Normal)', price_inr: 200 },
  { id: 'LKG-ENG-WB-SMALL-VOW-A', class_level: 'LKG', subject: 'English Workbook', language: null, variant: 'Small+vowels (Writing Assist)', price_inr: 200 },
  
  // Math Skill & Workbook
  { id: 'LKG-MATH-SKILL-1-100', class_level: 'LKG', subject: 'Math Skill', language: null, variant: '1–100', price_inr: 250 },
  { id: 'LKG-MATH-SKILL-1-100-NAMES', class_level: 'LKG', subject: 'Math Skill', language: null, variant: '1–100 & 1–50 number names', price_inr: 250 },
  { id: 'LKG-MATH-SKILL-1-50-TENS', class_level: 'LKG', subject: 'Math Skill', language: null, variant: '1–50 tens & ones', price_inr: 250 },
  { id: 'LKG-MATH-WB-1-100-N', class_level: 'LKG', subject: 'Math Workbook', language: null, variant: '1–100 (Normal)', price_inr: 200 },
  { id: 'LKG-MATH-WB-1-100-A', class_level: 'LKG', subject: 'Math Workbook', language: null, variant: '1–100 (Writing Assist)', price_inr: 200 },
  { id: 'LKG-MATH-WB-1-100-NAMES-N', class_level: 'LKG', subject: 'Math Workbook', language: null, variant: '1–100 & 1–50 number names (Normal)', price_inr: 200 },
  { id: 'LKG-MATH-WB-1-100-NAMES-A', class_level: 'LKG', subject: 'Math Workbook', language: null, variant: '1–100 & 1–50 number names (Writing Assist)', price_inr: 200 },
  { id: 'LKG-MATH-WB-1-50-TENS-N', class_level: 'LKG', subject: 'Math Workbook', language: null, variant: '1–50 tens & ones (Normal)', price_inr: 200 },
  { id: 'LKG-MATH-WB-1-50-TENS-A', class_level: 'LKG', subject: 'Math Workbook', language: null, variant: '1–50 tens & ones (Writing Assist)', price_inr: 200 },

  // LKG Core
  { id: 'LKG-EVS', class_level: 'LKG', subject: 'EVS', language: null, variant: 'Standard', price_inr: 250 },
  { id: 'LKG-ASSESS-TERM', class_level: 'LKG', subject: 'Assessment', language: null, variant: 'Termwise', price_inr: 200 },
  { id: 'LKG-ASSESS-ANNUAL', class_level: 'LKG', subject: 'Assessment', language: null, variant: 'Annual', price_inr: 200 },
  { id: 'LKG-ASSESS-ANNUAL-NOMARKS', class_level: 'LKG', subject: 'Assessment', language: null, variant: 'Annual (no marks)', price_inr: 200 },
  { id: 'LKG-RHYMES', class_level: 'LKG', subject: 'Rhymes & Stories', language: null, variant: 'Standard', price_inr: 200 },
  { id: 'LKG-ART', class_level: 'LKG', subject: 'Art & Craft', language: null, variant: 'Standard', price_inr: 200 },
  
  // LKG Languages
  { id: 'LKG-LANG-KAN-SWARA-V1', class_level: 'LKG', subject: 'Language', language: 'Kannada', variant: 'Swara V1', price_inr: 200 },
  { id: 'LKG-LANG-KAN-SWARA-V2', class_level: 'LKG', subject: 'Language', language: 'Kannada', variant: 'Swara V2', price_inr: 200 },
  { id: 'LKG-LANG-HIN-SWARA-V1', class_level: 'LKG', subject: 'Language', language: 'Hindi', variant: 'Swara V1', price_inr: 200 },
  { id: 'LKG-LANG-HIN-SWARA-V2', class_level: 'LKG', subject: 'Language', language: 'Hindi', variant: 'Swara V2', price_inr: 200 },
  { id: 'LKG-LANG-TAM-SWARA-V1', class_level: 'LKG', subject: 'Language', language: 'Tamil', variant: 'Swara V1', price_inr: 200 },
  { id: 'LKG-LANG-TAM-SWARA-V2', class_level: 'LKG', subject: 'Language', language: 'Tamil', variant: 'Swara V2', price_inr: 200 },
  
  // --- UKG ---
  // English Skill & Workbook
  { id: 'UKG-ENG-SKILL-NOCURSIVE', class_level: 'UKG', subject: 'English Skill', language: null, variant: 'Without cursive', price_inr: 250 },
  { id: 'UKG-ENG-SKILL-CURSIVE', class_level: 'UKG', subject: 'English Skill', language: null, variant: 'With cursive', price_inr: 250 },
  { id: 'UKG-ENG-WB-NOCURSIVE', class_level: 'UKG', subject: 'English Workbook', language: null, variant: 'Without cursive', price_inr: 200 },
  { id: 'UKG-ENG-WB-CURSIVE', class_level: 'UKG', subject: 'English Workbook', language: null, variant: 'With cursive', price_inr: 200 },
  
  // Math Skill & Workbook
  { id: 'UKG-MATH-SKILL-1-100-NAMES', class_level: 'UKG', subject: 'Math Skill', language: null, variant: '1–100 & names', price_inr: 250 },
  { id: 'UKG-MATH-SKILL-1-200', class_level: 'UKG', subject: 'Math Skill', language: null, variant: '1–200', price_inr: 250 },
  { id: 'UKG-MATH-SKILL-1-500', class_level: 'UKG', subject: 'Math Skill', language: null, variant: '1–500', price_inr: 250 },
  { id: 'UKG-MATH-WB-1-100-NAMES', class_level: 'UKG', subject: 'Math Workbook', language: null, variant: '1–100 & names', price_inr: 200 },
  { id: 'UKG-MATH-WB-1-200', class_level: 'UKG', subject: 'Math Workbook', language: null, variant: '1–200', price_inr: 200 },
  { id: 'UKG-MATH-WB-1-500', class_level: 'UKG', subject: 'Math Workbook', language: null, variant: '1–500', price_inr: 200 },
  
  // UKG Core
  { id: 'UKG-EVS', class_level: 'UKG', subject: 'EVS', language: null, variant: 'Standard', price_inr: 250 },
  { id: 'UKG-ASSESS-TERM', class_level: 'UKG', subject: 'Assessment', language: null, variant: 'Termwise', price_inr: 200 },
  { id: 'UKG-ASSESS-ANNUAL', class_level: 'UKG', subject: 'Assessment', language: null, variant: 'Annual', price_inr: 200 },
  { id: 'UKG-ASSESS-ANNUAL-NOMARKS', class_level: 'UKG', subject: 'Assessment', language: null, variant: 'Annual (no marks)', price_inr: 200 },
  { id: 'UKG-RHYMES', class_level: 'UKG', subject: 'Rhymes & Stories', language: null, variant: 'Standard', price_inr: 200 },
  { id: 'UKG-ART', class_level: 'UKG', subject: 'Art & Craft', language: null, variant: 'Standard', price_inr: 200 },

  // UKG Languages
  { id: 'UKG-LANG-KAN-SWAVY-V1', class_level: 'UKG', subject: 'Language', language: 'Kannada', variant: 'Swara & Vyanjana V1', price_inr: 250 },
  { id: 'UKG-LANG-KAN-SWAVY-V2', class_level: 'UKG', subject: 'Language', language: 'Kannada', variant: 'Swara & Vyanjana V2', price_inr: 250 },
  { id: 'UKG-LANG-HIN-SWAVY-V1', class_level: 'UKG', subject: 'Language', language: 'Hindi', variant: 'Swara & Vyanjana V1', price_inr: 250 },
  { id: 'UKG-LANG-HIN-SWAVY-V2', class_level: 'UKG', subject: 'Language', language: 'Hindi', variant: 'Swara & Vyanjana V2', price_inr: 250 },
  { id: 'UKG-LANG-TAM-SWAVY-V1', class_level: 'UKG', subject: 'Language', language: 'Tamil', variant: 'Swara & Vyanjana V1', price_inr: 250 },
  { id: 'UKG-LANG-TAM-SWAVY-V2', class_level: 'UKG', subject: 'Language', language: 'Tamil', variant: 'Swara & Vyanjana V2', price_inr: 250 }
];