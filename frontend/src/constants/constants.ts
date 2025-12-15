
import { ClassData, BookOption, Subject, AssessmentVariant } from './types';

// Helper to generate IDs
const generateId = () => Math.random().toString(36).substr(2, 9);

export const CLASS_THEMES: Record<string, {
  cardBg: string;
  cardBorder: string;
  textMain: string;
  textSub: string;
  primary: string;      // Button backgrounds, progress bar
  primaryHover: string;
  secondary: string;    // Secondary buttons
  secondaryHover: string;
  light: string;        // Light accents (badges)
  selectedBorder: string;
  selectedBg: string;
  iconBg: string;       // Circle behind class icon
  iconText: string;
}> = {
  "PG": {
    cardBg: "bg-orange-50",
    cardBorder: "border-orange-200",
    textMain: "text-orange-900",
    textSub: "text-orange-700",
    primary: "bg-orange-500",
    primaryHover: "hover:bg-orange-600",
    secondary: "text-orange-600 border-orange-200 hover:bg-orange-50",
    secondaryHover: "hover:bg-orange-100",
    light: "bg-orange-100",
    selectedBorder: "border-orange-500",
    selectedBg: "bg-orange-50",
    iconBg: "bg-white",
    iconText: "text-orange-600"
  },
  "Nursery": {
    cardBg: "bg-sky-50",
    cardBorder: "border-sky-200",
    textMain: "text-sky-900",
    textSub: "text-sky-700",
    primary: "bg-sky-500",
    primaryHover: "hover:bg-sky-600",
    secondary: "text-sky-600 border-sky-200 hover:bg-sky-50",
    secondaryHover: "hover:bg-sky-100",
    light: "bg-sky-100",
    selectedBorder: "border-sky-500",
    selectedBg: "bg-sky-50",
    iconBg: "bg-white",
    iconText: "text-sky-600"
  },
  "LKG": {
    cardBg: "bg-emerald-50",
    cardBorder: "border-emerald-200",
    textMain: "text-emerald-900",
    textSub: "text-emerald-700",
    primary: "bg-emerald-500",
    primaryHover: "hover:bg-emerald-600",
    secondary: "text-emerald-600 border-emerald-200 hover:bg-emerald-50",
    secondaryHover: "hover:bg-emerald-100",
    light: "bg-emerald-100",
    selectedBorder: "border-emerald-500",
    selectedBg: "bg-emerald-50",
    iconBg: "bg-white",
    iconText: "text-emerald-600"
  },
  "UKG": {
    cardBg: "bg-violet-50",
    cardBorder: "border-violet-200",
    textMain: "text-violet-900",
    textSub: "text-violet-700",
    primary: "bg-violet-500",
    primaryHover: "hover:bg-violet-600",
    secondary: "text-violet-600 border-violet-200 hover:bg-violet-50",
    secondaryHover: "hover:bg-violet-100",
    light: "bg-violet-100",
    selectedBorder: "border-violet-500",
    selectedBg: "bg-violet-50",
    iconBg: "bg-white",
    iconText: "text-violet-600"
  }
};

export const DEFAULT_THEME = {
    cardBg: "bg-white",
    cardBorder: "border-slate-200",
    textMain: "text-slate-900",
    textSub: "text-slate-500",
    primary: "bg-indigo-600",
    primaryHover: "hover:bg-indigo-700",
    secondary: "text-slate-600 border-slate-300",
    secondaryHover: "hover:bg-slate-50",
    light: "bg-slate-100",
    selectedBorder: "border-indigo-600",
    selectedBg: "bg-indigo-50",
    iconBg: "bg-slate-100",
    iconText: "text-slate-600"
};


export const SCHOOL_DATA: ClassData[] = [
  {
    name: "Nursery",
    subjects: [
      {
        name: "English",
        options: [
          { typeId: generateId(), label: "ABCD caps", coreId: "100000203", coreCover: "0201", coreSpine: "N2", defaultCoreCoverTitle: "English Skillbook", workId: "100000204", workCover: "0202", workSpine: "N3", defaultWorkCoverTitle: "English Workbook", link: "pdf1", info: "Introduction of both cases of letters and writing practice of Uppercase letters", isRecommended: true },
          { typeId: generateId(), label: "ABCD caps & small", coreId: "100000205", coreCover: "0201", coreSpine: "N10", defaultCoreCoverTitle: "English Skillbook", workId: "100000206", workCover: "0202", workSpine: "N11", defaultWorkCoverTitle: "English Workbook", link: "pdf2", info: "Introduction , activity, and writing of both cases of letters", isRecommended: false },
          { typeId: generateId(), label: "ABCD small", coreId: "100000207", coreCover: "0201", coreSpine: "N12", defaultCoreCoverTitle: "English Skillbook", workId: "100000208", workCover: "0202", workSpine: "N13", defaultWorkCoverTitle: "English Workbook", link: "pdf3", info: "Introduction, activity and writing of lowercase letters", isRecommended: false },
          { typeId: generateId(), label: "SATPIN small", coreId: "100000209", coreCover: "0201", coreSpine: "N14", defaultCoreCoverTitle: "English Skillbook", workId: "100000210", workCover: "0202", workSpine: "N15", defaultWorkCoverTitle: "English Workbook", link: "pdf4", info: "Introduction, Activity and writing of Lowercase letters in satpin sequence", isRecommended: false },
          { typeId: generateId(), label: "LTI caps", coreId: "100000211", coreCover: "0201", coreSpine: "N16", defaultCoreCoverTitle: "English Skillbook", workId: "100000212", workCover: "0202", workSpine: "N17", defaultWorkCoverTitle: "English Workbook", link: "pdf5", info: "Introduction, activity and writing of Uppercase letters in LTI  sequence", isRecommended: false },
          { typeId: generateId(), label: "Jolly phonics", coreId: "100000213", coreCover: "0201", coreSpine: "N9", defaultCoreCoverTitle: "English Phonics", link: "pdf6", info: "Similar learning outcome of Jolly phonics book", isRecommended: false },
        ]
      },
      {
        name: "Maths",
        options: [
          { typeId: generateId(), label: "1 to 20", coreId: "100000214", coreCover: "0203", coreSpine: "N4", defaultCoreCoverTitle: "Maths Skillbook", workId: "100000215", workCover: "0204", workSpine: "N5", defaultWorkCoverTitle: "Maths Workbook", isRecommended: true, link: "pdf_n_math_1", info: "Premath, Introduction, activity and writing of number 1-20 with 4 basic shapes and 4 colours" },
          { typeId: generateId(), label: "1 to 50", coreId: "100000214", coreCover: "0203", coreSpine: "N4", defaultCoreCoverTitle: "Maths Skillbook", workId: "100000215", workCover: "0204", workSpine: "N5", defaultWorkCoverTitle: "Maths Workbook", addOnId: "100000216", addOnCover: "0205", addOnSpine: "N18", defaultAddonCoverTitle: "Maths 21-50", isRecommended: false, link: "pdf_n_math_2", info: "Add on book - 21-50 number practice with post math concepts" },
        ]
      },
      {
        name: "EVS",
        options: [
          { typeId: generateId(), label: "EVS", coreId: "100000201", coreCover: "0206", coreSpine: "N1", defaultCoreCoverTitle: "EVS", isRecommended: true, link: "pdf_n_evs", info: "17 concepts : All About Me, Personal Hygiene, Action Words, My Home, My Family, My School, Clothes, Fruits, Vegetables, Flowers, Farm Animals, Wild Animals, Birds, Community Helpers, My Neighbourhood, Transportation, Seasons" },
        ]
      },
      {
        name: "Rhymes & stories",
        options: [
          { typeId: generateId(), label: "Rhymes & Stories (Customisable)", coreId: "100000202", coreCover: "0208", coreSpine: "N8", defaultCoreCoverTitle: "Rhymes & Stories", isRecommended: true, link: "pdf_n_rhymes", info: "25 Rhymes & 5 Stories" },
        ]
      },
      {
        name: "Art & craft",
        options: [
          { typeId: generateId(), label: "Art & Craft", coreId: "100000217", coreCover: "0209", coreSpine: "N6", defaultCoreCoverTitle: "Art & Craft", isRecommended: true, link: "pdf_n_art", info: "25 colouring activities & 15 craft activities" },
        ]
      }
    ]
  },
  {
    name: "LKG",
    subjects: [
      {
        name: "English",
        options: [
          { typeId: generateId(), label: "small + vowels", coreId: "100000303", coreCover: "0301", coreSpine: "L2", defaultCoreCoverTitle: "English Skillbook", workId: "100000304", workCover: "0302", workSpine: "L3", defaultWorkCoverTitle: "English Workbook", isRecommended: true, link: "pdf_l_eng_1", info: "Upper and lower case letter association and lower case writing practice along with Vowels" },
          { typeId: generateId(), label: "caps + vowels", coreId: "100000305", coreCover: "0301", coreSpine: "L14", defaultCoreCoverTitle: "English Skillbook", workId: "100000306", workCover: "0302", workSpine: "L15", defaultWorkCoverTitle: "English Workbook", isRecommended: false, link: "pdf_l_eng_2", info: "Upper and lower case letter association and Upper case writing practice along with Vowels" },
          { typeId: generateId(), label: "Jolly phonics", coreId: "100000307", coreCover: "0301", coreSpine: "L13", defaultCoreCoverTitle: "English Phonics", isRecommended: false, link: "pdf_l_eng_3", info: "Similar learning outcome of Jolly phonics book" },
        ]
      },
      {
        name: "Maths",
        options: [
          { typeId: generateId(), label: "1-50 and 1-10 number names", coreId: "100000308", coreCover: "0303", coreSpine: "L4", defaultCoreCoverTitle: "Maths Skillbook", workId: "100000309", workCover: "0304", workSpine: "L5", defaultWorkCoverTitle: "Maths Workbook", isRecommended: true, link: "pdf_l_math_1", info: "Premath, Introduction, activity and writing of number 1-50 and 1-10 numner names with 2 secondary shapes and 2 secondary colours, pictorial addition and subtraction" },
          { typeId: generateId(), label: "51-100", coreId: "100000308", coreCover: "0303", coreSpine: "L4", defaultCoreCoverTitle: "Maths Skillbook", workId: "100000309", workCover: "0304", workSpine: "L5", defaultWorkCoverTitle: "Maths Workbook", addOnId: "100000310", addOnCover: "0305", addOnSpine: "L16", defaultAddonCoverTitle: "Maths 51-100", isRecommended: false, link: "pdf_l_math_2", info: "Add on book - 51-100 number practice and post math concepts" },
        ]
      },
      {
        name: "EVS",
        options: [
          { typeId: generateId(), label: "EVS (default)", coreId: "100000301", coreCover: "0306", coreSpine: "L1", defaultCoreCoverTitle: "EVS", isRecommended: true, link: "pdf_l_evs", info: "28 concepts :All About Me, Sense Organs, My Family, House, My School, Good Manners, Healthy Food, Plants, Flowers, Fruits, Vegetables, Domestic Animals, Wild Animals, Animals & Young Ones, Aquatic Animals, Birds, Insects, Transportation, Traffic Signals, Seasons, My Neighbourhood, India, Festivals, Water Uses, National Symbols, Living & Non-Living" },
        ]
      },
      {
        name: "Art & craft",
        options: [
          { typeId: generateId(), label: "Art & Craft", coreId: "100000311", coreCover: "0308", coreSpine: "L6", defaultCoreCoverTitle: "Art & Craft", isRecommended: true, link: "pdf_l_art", info: "13 Colourinf activities & 22 colouring activities" },
        ]
      },
      {
        name: "Rhymes & stories",
        options: [
          { typeId: generateId(), label: "Rhymes & Stories (Customisable)", coreId: "100000302", coreCover: "0309", coreSpine: "L8", defaultCoreCoverTitle: "Rhymes & Stories", isRecommended: true, link: "pdf_l_rhymes", info: "24 Rhymes & 5 stories" },
        ]
      },
      {
        name: "Languages",
        isMultiSelect: true,
        options: [
          { typeId: generateId(), label: "Swara", jsonSubject: "Kannada", coreId: "100000314", coreCover: "0310", coreSpine: "L10", defaultCoreCoverTitle: "Kannada", isRecommended: false, link: "pdf_l_kan", info: "Kannada letter-writing practice for all swara, picture drills, tracing, and combined-letter exercises." },
          { typeId: generateId(), label: "Swara", jsonSubject: "Hindi", coreId: "100000315", coreCover: "0311", coreSpine: "L9", defaultCoreCoverTitle: "Hindi", isRecommended: false, link: "pdf_l_hin", info: "Hindi letter-writing practice for all swara, picture drills, tracing, and combined-letter exercises." },
          { typeId: generateId(), label: "Swara", jsonSubject: "Tamil", coreId: "100000316", coreCover: "0312", coreSpine: "L11", defaultCoreCoverTitle: "Tamil", isRecommended: false, link: "pdf_l_tam", info: "Telugu letter-writing practice for all swara, picture drills, tracing, and combined-letter exercises." },
          { typeId: generateId(), label: "Swara", jsonSubject: "Telugu", coreId: "100000317", coreCover: "0313", coreSpine: "L12", defaultCoreCoverTitle: "Telugu", isRecommended: false, link: "pdf_l_tel", info: "Tamil letter-writing practice for all swara, picture drills, tracing, and combined-letter exercises." },
        ]
      }
    ]
  },
  {
    name: "UKG",
    subjects: [
      {
        name: "English",
        options: [
          { typeId: generateId(), label: "without cursive+ long vowels + blends + diaphrams + simple sentences", coreId: "100000403", coreCover: "0401", coreSpine: "U2", defaultCoreCoverTitle: "English Skillbook", workId: "100000404", workCover: "CU2", workSpine: "U3", defaultWorkCoverTitle: "English Workbook", isRecommended: true, link: "pdf_u_eng_1" },
          { typeId: generateId(), label: "With cursive+ long vowels + blends + diaphrams + simple sentences", coreId: "100000403", coreCover: "0401", coreSpine: "U2", defaultCoreCoverTitle: "English Skillbook", workId: "100000404", workCover: "CU2", workSpine: "U3", defaultWorkCoverTitle: "English Workbook", addOnId: "100000406", addOnCover: "CU3", addOnSpine: "U12", defaultAddonCoverTitle: "Cursive", isRecommended: false, link: "pdf_u_eng_2" },
          { typeId: generateId(), label: "Jolly phonics", coreId: "100000405", coreCover: "0401", coreSpine: "U13", defaultCoreCoverTitle: "English Phonics", isRecommended: false, link: "pdf_u_eng_3" },
          { typeId: generateId(), label: "Jolly phonics + Cursive", coreId: "100000405", coreCover: "0401", coreSpine: "U13", defaultCoreCoverTitle: "English Phonics", addOnId: "100000406", addOnCover: "CU3", addOnSpine: "U12", defaultAddonCoverTitle: "Cursive", isRecommended: false, link: "pdf_u_eng_4", info: "Similar learning outcome of Jolly phonics book + Cursive practice" },
        ]
      },
      {
        name: "Maths",
        options: [
          { typeId: generateId(), label: "1-100 and 1-100 number names", coreId: "100000407", coreCover: "CU4", coreSpine: "U4", defaultCoreCoverTitle: "Maths Skillbook", workId: "100000408", workCover: "CU5", workSpine: "U5", defaultWorkCoverTitle: "Maths Workbook", isRecommended: true, link: "pdf_u_math_1", info: "1-50 recap , 51-100 numbers and number names upto 100, Post math concepts , single digit addition and subtraction, introduction to time and division" },
          { typeId: generateId(), label: "101-200", coreId: "100000407", coreCover: "CU4", coreSpine: "U4", defaultCoreCoverTitle: "Maths Skillbook", workId: "100000408", workCover: "CU5", workSpine: "U5", defaultWorkCoverTitle: "Maths Workbook", addOnId: "100000409", addOnCover: "CU6", addOnSpine: "U14", defaultAddonCoverTitle: "Maths 101-200", isRecommended: false, link: "pdf_u_math_2", info: "Add on book - From 101-200" },
          { typeId: generateId(), label: "101-500", coreId: "100000407", coreCover: "CU4", coreSpine: "U4", defaultCoreCoverTitle: "Maths Skillbook", workId: "100000408", workCover: "CU5", workSpine: "U5", defaultWorkCoverTitle: "Maths Workbook", addOnId: "100000410", addOnCover: "CU6", addOnSpine: "U15", defaultAddonCoverTitle: "Maths 101-500", isRecommended: false, link: "pdf_u_math_3", info: "Add on book - From 101-500" },
        ]
      },
      {
        name: "EVS",
        options: [
          { typeId: generateId(), label: "EVS", coreId: "100000401", coreCover: "CU7", coreSpine: "U1", defaultCoreCoverTitle: "EVS", isRecommended: true, link: "pdf_u_evs", info: "All About Me, Sense Organs, Internal Body Parts, Daily Routine and Good Habits, My Family, Safety at Home, Types of Houses, My School, Healthy and Unhealthy Food, Types of Plants, Germination of Plants, Things We Get from Trees, Things the Plant Needs to Grow, Fruits, Vegetables, Flowers, Animals and Their Young Ones, Animal Homes, Animal Sounds, Types of Animals, Types of Birds, Lifecycle of a Butterfly, Emergency Vehicles, Traffic Rules, My Neighbourhood, Worship Places and Festivals, Community Helpers, Water Cycle, Reduce Reuse Recycle, Machines, Parts of a Computer, Living and Non-living Things, Monuments of India, Our National Leaders, Seasons, Games and Sports" },
        ]
      },
      {
        name: "Rhymes & stories",
        options: [
          { typeId: generateId(), label: "Rhymes & Stories (Customisable)", coreId: "100000402", coreCover: "CU9", coreSpine: "U8", defaultCoreCoverTitle: "Rhymes & Stories", isRecommended: true, link: "pdf_u_rhymes", info: "24 Rhymes & 5 stories" },
        ]
      },
      {
        name: "Art & craft",
        options: [
          { typeId: generateId(), label: "Art & Craft", coreId: "100000411", coreCover: "0410", coreSpine: "U6", defaultCoreCoverTitle: "Art & Craft", isRecommended: true, link: "pdf_u_art", info: "6 Colouring activities & 28 craft activities" },
        ]
      },
      {
        name: "Languages",
        isMultiSelect: true,
        options: [
          { typeId: generateId(), label: "Swara & vyanjana", jsonSubject: "Kannada", coreId: "100000415", coreCover: "0411", coreSpine: "U10", defaultCoreCoverTitle: "Kannada", isRecommended: false, link: "pdf_u_kan", info: "The book covers Kannada letter practice (varnamale) for all consonant groups, each with writing, picture-reading, and recognition activities, followed by revision pages placed after every major set." },
          { typeId: generateId(), label: "Swara & vyanjana", jsonSubject: "Hindi", coreId: "100000416", coreCover: "0412", coreSpine: "U9", defaultCoreCoverTitle: "Hindi", isRecommended: false, link: "pdf_u_hin", info: "The book covers Hindi letter practice (varnamala) for all consonant groups, each with writing, picture-reading, and recognition activities, followed by revision pages placed after every major set." },
          { typeId: generateId(), label: "Swara & vyanjana", jsonSubject: "Tamil", coreId: "100000417", coreCover: "0413", coreSpine: "U11", defaultCoreCoverTitle: "Tamil", isRecommended: false, link: "pdf_u_tam", info: "The book covers Tamil letter practice (varnamale) for all consonant groups, each with writing, picture-reading, and recognition activities, followed by revision pages placed after every major set." },
        ]
      }
    ]
  },
  {
    name: "PG",
    subjects: [
      {
        name: "EVS",
        options: [{ typeId: generateId(), label: "Standard", coreId: "100000101", coreCover: "0101", coreSpine: "PG1", defaultCoreCoverTitle: "EVS", isRecommended: true, link: "pdf_p_evs", info: "All About Me, About Myself, My Face, Myself, Body Hygiene, My Birthday, Family, My Family Tree, Home, Different Rooms at Home, Living Room, Kitchen, Bathroom, Bedroom, Seasons, Farm Animals, Wild Animals, Birds, Transportation, Flowers, Vegetables and Fruits" }]
      },
      {
        name: "Rhymes and stories",
        options: [{ typeId: generateId(), label: "Standard", coreId: "100000102", coreCover: "0102", coreSpine: "PG6", defaultCoreCoverTitle: "Rhymes and stories", isRecommended: true, link: "pdf_p_rhymes", info: "24 Rhymes & 5 stories" }]
      },
      {
        name: "English",
        options: [{ typeId: generateId(), label: "Standard", coreId: "100000103", coreCover: "0103", coreSpine: "PG2", defaultCoreCoverTitle: "English", isRecommended: true, link: "pdf_p_eng", info: "Upper case introduction, recognition , finger tracing and colouring activities" }]
      },
      {
        name: "Maths",
        options: [{ typeId: generateId(), label: "Standard", coreId: "100000104", coreCover: "0104", coreSpine: "PG3", defaultCoreCoverTitle: "Maths", isRecommended: true, link: "pdf_p_math", info: "Premath concepts, basic colours and shapes and 1-10 introduction and recognition" }]
      },
      {
        name: "Art & craft",
        options: [{ typeId: generateId(), label: "Standard", coreId: "100000105", coreCover: "0105", coreSpine: "PG4", defaultCoreCoverTitle: "Art & craft", isRecommended: true, link: "pdf_p_art", info: "A to Z aphabetical colouring activities" }]
      },
      {
        name: "Pattern",
        options: [{ typeId: generateId(), label: "Standard", coreId: "100000106", coreCover: "0106", coreSpine: "PG5", defaultCoreCoverTitle: "Pattern", isRecommended: true, link: "pdf_p_pattern", info: "12 Different pre writing strokes" }]
      },
    ]
  }
];

export const getAssessmentForClass = (
    className: string, 
    englishOpt: BookOption | null, 
    mathsOpt: BookOption | null,
    variant: AssessmentVariant
): { label: string, coreId: string, coreCover: string, coreSpine: string, defaultCoreCoverTitle: string, link: string } | null => {
  if (!englishOpt && !mathsOpt) return null;
  
  const isWithMarks = variant === 'WITH_MARKS';
  const defaultCoreCoverTitle = "Assessment";
  
  if (className === "Nursery") {
     if (!englishOpt || !mathsOpt) return null;
     const eng = englishOpt.label.toLowerCase();
     const mat = mathsOpt.label;

     const is50 = mat.includes("1 to 50");
     
     const coreCover = "0207";

     if (eng.includes("abcd caps") && !eng.includes("small")) {
        return is50 
            ? { 
                label: `ABCD 1-50${isWithMarks ? '' : ' (NM)'}`, 
                coreId: isWithMarks ? "100000224" : "100000234", 
                coreCover, 
                coreSpine: isWithMarks ? "N24" : "N34",
                defaultCoreCoverTitle,
                link: "pdf_n_ass_abcd_50" 
              } 
            : { 
                label: `ABCD 1-20${isWithMarks ? '' : ' (NM)'}`, 
                coreId: isWithMarks ? "100000218" : "100000228", 
                coreCover, 
                coreSpine: isWithMarks ? "N7" : "N28",
                defaultCoreCoverTitle,
                link: "pdf_n_ass_abcd_20" 
              };
     }
     if (eng.includes("lti caps")) {
        return is50 
            ? { 
                label: `LTI 1-50${isWithMarks ? '' : ' (NM)'}`, 
                coreId: isWithMarks ? "100000223" : "100000233", 
                coreCover, 
                coreSpine: isWithMarks ? "N23" : "N33",
                defaultCoreCoverTitle,
                link: "pdf_n_ass_lti_50" 
              } 
            : { 
                label: `LTI 1-20${isWithMarks ? '' : ' (NM)'}`, 
                coreId: isWithMarks ? "100000219" : "100000229", 
                coreCover, 
                coreSpine: isWithMarks ? "N19" : "N29",
                defaultCoreCoverTitle,
                link: "pdf_n_ass_lti_20" 
              };
     }
     if (eng.includes("satpin small")) {
        return is50 
            ? { 
                label: `satpin 1-50${isWithMarks ? '' : ' (NM)'}`, 
                coreId: isWithMarks ? "100000225" : "100000235", 
                coreCover, 
                coreSpine: isWithMarks ? "N25" : "N35",
                defaultCoreCoverTitle,
                link: "pdf_n_ass_satpin_50" 
              } 
            : { 
                label: `satpin 1-20${isWithMarks ? '' : ' (NM)'}`, 
                coreId: isWithMarks ? "100000220" : "100000230", 
                coreCover, 
                coreSpine: isWithMarks ? "N20" : "N30",
                defaultCoreCoverTitle,
                link: "pdf_n_ass_satpin_20" 
              };
     }
     if (eng.includes("abcd small")) {
        return is50 
            ? { 
                label: `abcd 1-50${isWithMarks ? '' : ' (NM)'}`, 
                coreId: isWithMarks ? "100000226" : "100000236", 
                coreCover, 
                coreSpine: isWithMarks ? "N26" : "N36",
                defaultCoreCoverTitle,
                link: "pdf_n_ass_abcd_sm_50" 
              } 
            : { 
                label: `abcd 1-20${isWithMarks ? '' : ' (NM)'}`, 
                coreId: isWithMarks ? "100000221" : "100000231", 
                coreCover, 
                coreSpine: isWithMarks ? "N21" : "N31",
                defaultCoreCoverTitle,
                link: "pdf_n_ass_abcd_sm_20" 
              };
     }
     if (eng.includes("abcd caps & small")) {
        return is50 
            ? { 
                label: `AaBb 1-50${isWithMarks ? '' : ' (NM)'}`, 
                coreId: isWithMarks ? "100000227" : "100000237", 
                coreCover, 
                coreSpine: isWithMarks ? "N27" : "N37",
                defaultCoreCoverTitle,
                link: "pdf_n_ass_aabb_50" 
              } 
            : { 
                label: `AaBb 1-20${isWithMarks ? '' : ' (NM)'}`, 
                coreId: isWithMarks ? "100000222" : "100000232", 
                coreCover, 
                coreSpine: isWithMarks ? "N22" : "N32",
                defaultCoreCoverTitle,
                link: "pdf_n_ass_aabb_20" 
              };
     }
  }

  if (className === "LKG") {
     if (!englishOpt) return null;
     const eng = englishOpt.label.toLowerCase();
     const coreCover = "0307";
     if (eng.includes("small + vowels")) {
         return { 
            label: `Small 1-50${isWithMarks ? '' : ' (NM)'}`, 
            coreId: isWithMarks ? "100000312" : "100000314", 
            coreCover, 
            coreSpine: isWithMarks ? "L7" : "L18",
            defaultCoreCoverTitle,
            link: "pdf_l_ass_sm_50" 
         };
     }
     if (eng.includes("caps + vowels")) {
         return { 
            label: `Big1-50${isWithMarks ? '' : ' (NM)'}`, 
            coreId: isWithMarks ? "100000313" : "100000315", 
            coreCover, 
            coreSpine: isWithMarks ? "L17" : "L19",
            defaultCoreCoverTitle,
            link: "pdf_l_ass_bg_50" 
         };
     }
  }

  if (className === "UKG") {
     if (!mathsOpt) return null;
     const mat = mathsOpt.label;
     const coreCover = "CU8";
     if (mat.includes("1-100") && mat.includes("number names")) {
         return { 
            label: `1-100${isWithMarks ? '' : ' (NM)'}`, 
            coreId: isWithMarks ? "100000412" : "100000415", 
            coreCover, 
            coreSpine: isWithMarks ? "U7" : "U18",
            defaultCoreCoverTitle,
            link: "pdf_u_ass_100" 
         };
     }
     if (mat.includes("101-200")) {
         return { 
            label: `1-200${isWithMarks ? '' : ' (NM)'}`, 
            coreId: isWithMarks ? "100000413" : "100000416", 
            coreCover, 
            coreSpine: isWithMarks ? "U16" : "U19",
            defaultCoreCoverTitle,
            link: "pdf_u_ass_200" 
         };
     }
     if (mat.includes("101-500")) {
         return { 
            label: `1-500${isWithMarks ? '' : ' (NM)'}`, 
            coreId: isWithMarks ? "100000414" : "100000417", 
            coreCover, 
            coreSpine: isWithMarks ? "U17" : "U20",
            defaultCoreCoverTitle,
            link: "pdf_u_ass_500" 
         };
     }
  }
  
  return null;
}
