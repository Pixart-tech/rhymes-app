export type ClassLevel = 'Nursery' | 'LKG' | 'UKG';

export type ClassTheme = {
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

const createClassTheme = (accent: string): ClassTheme => ({
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

export const CLASS_THEME: Record<ClassLevel, ClassTheme> = {
  Nursery: createClassTheme('emerald'),
  LKG: createClassTheme('amber'),
  UKG: createClassTheme('violet'),
};

export interface CoverThemeColour {
  id: string;
  label: string;
  number: number;
}

export interface CoverThemeDefinition {
  id: string;
  label: string;
  number: number;
  colours: CoverThemeColour[];
}

export const COVER_THEME_SLOT_COUNT = 16;

const buildThemeCatalogue = (count: number): CoverThemeDefinition[] =>
  Array.from({ length: count }, (_, index) => {
    const themeNumber = index + 1;
    return {
      id: `theme${themeNumber}`,
      label: `Theme ${themeNumber}`,
      number: themeNumber,
      colours: Array.from({ length: 4 }, (_, colourIndex) => {
        const colourNumber = colourIndex + 1;
        return { id: `colour${colourNumber}`, label: `Colour ${colourNumber}`, number: colourNumber };
      }),
    };
  });

export const COVER_THEME_CATALOGUE: CoverThemeDefinition[] = buildThemeCatalogue(COVER_THEME_SLOT_COUNT);

export interface CoverThemeOption {
  id: string;
  label: string;
  description: string;
}

export const COVER_THEME_OPTIONS: CoverThemeOption[] = COVER_THEME_CATALOGUE.map((theme) => ({
  id: theme.id,
  label: theme.label,
  description: 'Upload a PNG thumbnail to preview this theme in the cover workflow.',
}));

export interface CoverColourOption {
  id: string;
  label: string;
  hex: string;
}

export const COVER_COLOUR_OPTIONS: CoverColourOption[] = [
  { id: 'colour1', label: 'Colour 1', hex: '#eea0c6' },
  { id: 'colour2', label: 'Colour 2', hex: '#8faedb' },
  { id: 'colour3', label: 'Colour 3', hex: '#f9b475' },
  { id: 'colour4', label: 'Colour 4', hex: '#c8e9f1' },
];

export const BRAND_FONTS = {
  body: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif",
  code: "'Source Code Pro', Menlo, Monaco, 'Courier New', monospace",
};

export const BRAND_COLORS = {
  primary: '#fb923c',
  primaryDark: '#ef4444',
  primaryLight: '#fde68a',
  background: '#ffffff',
  foreground: '#0f172a',
  border: '#94a3b8',
  accent: '#10b981',
  warning: '#f97316',
  danger: '#dc2626',
};
