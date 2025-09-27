import React, { useEffect, useMemo, useState } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Separator } from './ui/separator';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const GRADE_LABELS = {
  nursery: 'Nursery',
  lkg: 'LKG',
  ukg: 'UKG',
  playgroup: 'Playgroup'
};

const COVER_THEMES = [
  {
    id: 'nature-discovery',
    name: 'Nature Discovery',
    description: 'Soft botanical shapes and warm sunlight to welcome curious explorers.',
    icon: '🌿',
    colors: [
      {
        id: 'spring-harmony',
        name: 'Spring Harmony',
        stops: ['#34d399', '#22d3ee'],
        accent: '#facc15',
        background: '#f0fdfa',
        text: '#064e3b'
      },
      {
        id: 'sunny-meadow',
        name: 'Sunny Meadow',
        stops: ['#f97316', '#facc15'],
        accent: '#fcd34d',
        background: '#fff7ed',
        text: '#92400e'
      },
      {
        id: 'forest-mist',
        name: 'Forest Mist',
        stops: ['#0ea5e9', '#6366f1'],
        accent: '#a5b4fc',
        background: '#eef2ff',
        text: '#1e293b'
      },
      {
        id: 'petal-pop',
        name: 'Petal Pop',
        stops: ['#fb7185', '#f97316'],
        accent: '#fda4af',
        background: '#fff1f2',
        text: '#831843'
      }
    ]
  },
  {
    id: 'space-adventure',
    name: 'Space Adventure',
    description: 'A cosmic voyage filled with friendly planets and gleaming stars.',
    icon: '🪐',
    colors: [
      {
        id: 'starlight',
        name: 'Starlight',
        stops: ['#4338ca', '#7c3aed'],
        accent: '#fbbf24',
        background: '#eef2ff',
        text: '#1f2937'
      },
      {
        id: 'cosmic-dream',
        name: 'Cosmic Dream',
        stops: ['#4f46e5', '#0ea5e9'],
        accent: '#38bdf8',
        background: '#e0f2fe',
        text: '#0f172a'
      },
      {
        id: 'meteor-shower',
        name: 'Meteor Shower',
        stops: ['#c026d3', '#fb7185'],
        accent: '#f472b6',
        background: '#fdf4ff',
        text: '#581c87'
      },
      {
        id: 'aurora',
        name: 'Aurora Glow',
        stops: ['#2dd4bf', '#818cf8'],
        accent: '#c4b5fd',
        background: '#ecfeff',
        text: '#064e3b'
      }
    ]
  },
  {
    id: 'ocean-friends',
    name: 'Ocean Friends',
    description: 'Playful underwater scenes with bubbly waves and smiling sea creatures.',
    icon: '🌊',
    colors: [
      {
        id: 'sea-breeze',
        name: 'Sea Breeze',
        stops: ['#38bdf8', '#22d3ee'],
        accent: '#a5f3fc',
        background: '#ecfeff',
        text: '#0f172a'
      },
      {
        id: 'coral-reef',
        name: 'Coral Reef',
        stops: ['#f97316', '#f472b6'],
        accent: '#f9a8d4',
        background: '#fff7ed',
        text: '#7c2d12'
      },
      {
        id: 'deep-blue',
        name: 'Deep Blue',
        stops: ['#0f172a', '#1e40af'],
        accent: '#38bdf8',
        background: '#1d4ed8',
        text: '#f8fafc'
      },
      {
        id: 'lagoon',
        name: 'Lagoon Glow',
        stops: ['#22d3ee', '#10b981'],
        accent: '#bbf7d0',
        background: '#f0fdfa',
        text: '#0f172a'
      }
    ]
  },
  {
    id: 'joyful-shapes',
    name: 'Joyful Shapes',
    description: 'Bright geometric playtime with confetti patterns and bold colour pops.',
    icon: '🎨',
    colors: [
      {
        id: 'confetti',
        name: 'Confetti Burst',
        stops: ['#f97316', '#ef4444'],
        accent: '#facc15',
        background: '#fff7ed',
        text: '#7c2d12'
      },
      {
        id: 'bubblegum',
        name: 'Bubblegum Pop',
        stops: ['#fb7185', '#c084fc'],
        accent: '#f0abfc',
        background: '#fdf4ff',
        text: '#701a75'
      },
      {
        id: 'rainbow-sky',
        name: 'Rainbow Sky',
        stops: ['#22d3ee', '#f59e0b'],
        accent: '#fde68a',
        background: '#ecfeff',
        text: '#0f172a'
      },
      {
        id: 'candy-splash',
        name: 'Candy Splash',
        stops: ['#f472b6', '#6366f1'],
        accent: '#c4b5fd',
        background: '#fdf2f8',
        text: '#701a75'
      }
    ]
  }
];

const defaultFormValues = {
  title: '',
  studentName: '',
  teacherName: '',
  academicYear: '',
  message: ''
};

const wrapMessage = (message, maxChars = 32, maxLines = 3) => {
  if (!message) {
    return ['Add a special message to make this cover unique.'];
  }

  const words = message.split(/\s+/).filter(Boolean);
  const lines = [];
  let currentLine = '';

  words.forEach((word) => {
    const tentative = currentLine ? `${currentLine} ${word}` : word;
    if (tentative.length > maxChars && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = tentative;
    }
  });

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.slice(0, maxLines);
};

const formatGradeLabel = (gradeId) => GRADE_LABELS[gradeId] || gradeId;

const buildSampleCover = (gradeId) => {
  const theme = COVER_THEMES[0];
  const colour = theme.colors[0];
  const gradeLabel = formatGradeLabel(gradeId);

  return {
    id: `sample-${gradeId}`,
    grade: gradeId,
    isSample: true,
    themeId: theme.id,
    colorId: colour.id,
    details: {
      title: `${gradeLabel} Adventures`,
      studentName: 'Student Name',
      teacherName: 'Class Teacher',
      academicYear: '2024 - 2025',
      message: 'This is a sample preview. Submit real details to replace it.'
    }
  };
};

const CoverPreview = ({ cover, gradeLabel }) => {
  if (!cover) {
    return null;
  }

  const theme = COVER_THEMES.find((item) => item.id === cover.themeId) || COVER_THEMES[0];
  const colour = theme.colors.find((item) => item.id === cover.colorId) || theme.colors[0];
  const gradientId = `cover-gradient-${theme.id}-${colour.id}`;
  const details = cover.details || {};
  const title = details.title || `${gradeLabel} Adventures`;
  const studentName = details.studentName || 'Student Name';
  const teacherName = details.teacherName || 'Class Teacher';
  const academicYear = details.academicYear || 'Academic Year';
  const messageLines = wrapMessage(details.message);

  return (
    <svg viewBox="0 0 432 302" preserveAspectRatio="xMidYMid meet" role="img" aria-label={`Preview cover for ${gradeLabel}`}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={colour.stops[0]} />
          <stop offset="100%" stopColor={colour.stops[1]} />
        </linearGradient>
      </defs>

      <rect x="0" y="0" width="432" height="302" rx="28" fill={`url(#${gradientId})`} />
      <rect x="16" y="16" width="400" height="270" rx="22" fill={colour.background} />

      <circle cx="360" cy="60" r="38" fill={colour.accent} opacity="0.4" />
      <circle cx="84" cy="80" r="36" fill={colour.accent} opacity="0.18" />

      <text x="84" y="92" fontSize="46" textAnchor="middle" aria-hidden="true">
        {theme.icon}
      </text>

      <text x="216" y="110" fontFamily="'Inter', sans-serif" fontSize="28" fontWeight="700" textAnchor="middle" fill={colour.text}>
        {title}
      </text>

      <text x="216" y="140" fontFamily="'Inter', sans-serif" fontSize="16" textAnchor="middle" fill={colour.text} opacity="0.75">
        {gradeLabel}
      </text>

      <rect x="40" y="156" width="352" height="2" fill={colour.accent} opacity="0.35" />

      <text x="56" y="182" fontFamily="'Inter', sans-serif" fontSize="14" fontWeight="600" fill={colour.text}>
        Student
      </text>
      <text x="56" y="200" fontFamily="'Inter', sans-serif" fontSize="16" fill={colour.text}>
        {studentName || '—'}
      </text>

      <text x="216" y="182" fontFamily="'Inter', sans-serif" fontSize="14" fontWeight="600" textAnchor="middle" fill={colour.text}>
        Academic Year
      </text>
      <text x="216" y="200" fontFamily="'Inter', sans-serif" fontSize="16" textAnchor="middle" fill={colour.text}>
        {academicYear || '—'}
      </text>

      <text x="376" y="182" fontFamily="'Inter', sans-serif" fontSize="14" fontWeight="600" textAnchor="end" fill={colour.text}>
        Teacher
      </text>
      <text x="376" y="200" fontFamily="'Inter', sans-serif" fontSize="16" textAnchor="end" fill={colour.text}>
        {teacherName || '—'}
      </text>

      <text x="56" y="230" fontFamily="'Inter', sans-serif" fontSize="13" fontWeight="600" fill={colour.text}>
        Message
      </text>
      {messageLines.map((line, index) => (
        <text
          key={index}
          x="56"
          y={248 + index * 16}
          fontFamily="'Inter', sans-serif"
          fontSize="14"
          fill={colour.text}
          opacity="0.85"
        >
          {line}
        </text>
      ))}
    </svg>
  );
};

const CoverPageWorkflow = ({ school, grade, onBackToGrades, onBackToMode, onLogout }) => {
  const gradeLabel = formatGradeLabel(grade);
  const sampleCover = useMemo(() => buildSampleCover(grade), [grade]);

  const [step, setStep] = useState('theme');
  const [selectedThemeId, setSelectedThemeId] = useState(null);
  const [selectedColorId, setSelectedColorId] = useState(null);
  const [formValues, setFormValues] = useState(defaultFormValues);
  const [covers, setCovers] = useState([sampleCover]);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    setStep('theme');
    setSelectedThemeId(null);
    setSelectedColorId(null);
    setFormValues(defaultFormValues);
    setCovers([sampleCover]);
    setActiveIndex(0);
  }, [sampleCover]);

  const selectedTheme = useMemo(
    () => COVER_THEMES.find((theme) => theme.id === selectedThemeId) || null,
    [selectedThemeId]
  );

  const selectedColour = useMemo(() => {
    if (!selectedTheme) {
      return null;
    }
    return selectedTheme.colors.find((colour) => colour.id === selectedColorId) || null;
  }, [selectedTheme, selectedColorId]);

  const draftCover = useMemo(() => {
    if (!selectedTheme || !selectedColour) {
      return null;
    }

    return {
      id: 'draft',
      grade,
      themeId: selectedTheme.id,
      colorId: selectedColour.id,
      details: {
        title: formValues.title.trim() || `${gradeLabel} Adventures`,
        studentName: formValues.studentName.trim(),
        teacherName: formValues.teacherName.trim(),
        academicYear: formValues.academicYear.trim(),
        message: formValues.message.trim()
      }
    };
  }, [selectedTheme, selectedColour, formValues, grade, gradeLabel]);

  const activeCover = covers.length > 0 ? covers[Math.min(activeIndex, covers.length - 1)] : sampleCover;
  const previewCover = draftCover || activeCover || sampleCover;

  const previewTheme = COVER_THEMES.find((theme) => theme.id === previewCover.themeId) || COVER_THEMES[0];
  const previewColour = previewTheme.colors.find((colour) => colour.id === previewCover.colorId) || previewTheme.colors[0];

  const handleThemeSelect = (themeId) => {
    setSelectedThemeId(themeId);
    setSelectedColorId(null);
    setStep('details');
  };

  const handleColourSelect = (colourId) => {
    setSelectedColorId(colourId);
  };

  const handleFormChange = (field) => (event) => {
    setFormValues((previous) => ({
      ...previous,
      [field]: event.target.value
    }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!draftCover) {
      return;
    }

    const savedCover = {
      ...draftCover,
      id: `cover-${Date.now()}`,
      createdAt: new Date().toISOString()
    };

    setCovers((previous) => {
      const next = [...previous, savedCover];
      setActiveIndex(next.length - 1);
      return next;
    });

    setStep('preview');
  };

  const canSubmit = Boolean(
    draftCover &&
      draftCover.details.studentName &&
      draftCover.details.teacherName &&
      draftCover.details.academicYear
  );

  const handleCreateAnother = () => {
    setStep('theme');
    setSelectedThemeId(null);
    setSelectedColorId(null);
    setFormValues(defaultFormValues);
  };

  const stepCopy = {
    theme: {
      title: 'Pick a cover theme',
      description: 'Choose one of the four creative themes to begin personalising this grade\'s cover.'
    },
    details: {
      title: 'Select colours & personalise',
      description: 'Pick a colour palette, enter the student details and preview the cover in real time.'
    },
    preview: {
      title: 'Review saved cover pages',
      description: 'Use the carousel to browse every cover created for this grade. You can add more at any time.'
    }
  };

  const currentCopy = stepCopy[step];

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-red-50 py-10 px-6">
      <div className="mx-auto max-w-6xl space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-2">
            <p className="text-sm font-medium text-orange-500">Cover pages workflow</p>
            <h1 className="text-3xl font-semibold text-slate-900">{school.school_name}</h1>
            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
              <Badge variant="secondary">Grade: {gradeLabel}</Badge>
              <span>School ID: {school.school_id}</span>
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-3">
            <Button variant="outline" onClick={onBackToGrades} className="bg-white/80 hover:bg-white">
              Back to grades
            </Button>
            <Button variant="outline" onClick={onBackToMode} className="bg-white/80 hover:bg-white">
              Back to menu
            </Button>
            <Button variant="outline" onClick={onLogout} className="bg-white/80 hover:bg-white">
              Logout
            </Button>
          </div>
        </div>

        <Card className="border-none shadow-xl shadow-orange-100/60">
          <CardHeader className="space-y-2">
            <CardTitle className="text-2xl font-semibold text-slate-900">{currentCopy.title}</CardTitle>
            <p className="text-sm text-slate-600">{currentCopy.description}</p>
          </CardHeader>
          <CardContent>
            <div className="cover-workflow-grid">
              <div className="space-y-6">
                {step === 'theme' && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {COVER_THEMES.map((theme) => (
                      <button
                        key={theme.id}
                        type="button"
                        onClick={() => handleThemeSelect(theme.id)}
                        className="cover-theme-card bg-white/80 p-6 text-left shadow-sm"
                      >
                        <div className="flex items-start gap-4">
                          <span className="text-3xl" aria-hidden="true">{theme.icon}</span>
                          <div className="space-y-1">
                            <p className="text-lg font-semibold text-slate-800">{theme.name}</p>
                            <p className="text-sm text-slate-500 leading-relaxed">{theme.description}</p>
                          </div>
                        </div>
                        <Separator className="my-4" />
                        <div className="flex items-center gap-2">
                          {theme.colors.map((colour) => (
                            <span
                              key={colour.id}
                              className="h-2 w-10 rounded-full"
                              style={{
                                background: `linear-gradient(135deg, ${colour.stops[0]}, ${colour.stops[1]})`
                              }}
                              aria-hidden="true"
                            />
                          ))}
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {step === 'details' && (
                  <div className="space-y-6">
                    {selectedTheme ? (
                      <>
                        <div className="space-y-3">
                          <div>
                            <p className="text-sm font-medium text-slate-700">Theme selected</p>
                            <p className="text-lg font-semibold text-slate-900">{selectedTheme.name}</p>
                          </div>
                          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                            {selectedTheme.colors.map((colour) => {
                              const isSelected = selectedColorId === colour.id;
                              return (
                                <button
                                  key={colour.id}
                                  type="button"
                                  onClick={() => handleColourSelect(colour.id)}
                                  className={`cover-color-swatch${isSelected ? ' is-selected' : ''}`}
                                  style={{
                                    background: `linear-gradient(135deg, ${colour.stops[0]}, ${colour.stops[1]})`
                                  }}
                                  aria-label={colour.name}
                                />
                              );
                            })}
                          </div>
                          <p className="text-sm text-slate-500">
                            Pick one of the colours to see the preview update instantly.
                          </p>
                        </div>

                        <Separator />

                        <form className="space-y-5" onSubmit={handleSubmit}>
                          <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-1.5">
                              <label className="text-sm font-medium text-slate-700">Cover title</label>
                              <Input
                                value={formValues.title}
                                onChange={handleFormChange('title')}
                                placeholder={`${gradeLabel} Adventures`}
                                className="h-11"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-sm font-medium text-slate-700">Academic year</label>
                              <Input
                                value={formValues.academicYear}
                                onChange={handleFormChange('academicYear')}
                                placeholder="2024 - 2025"
                                className="h-11"
                                required
                              />
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-sm font-medium text-slate-700">Student name</label>
                              <Input
                                value={formValues.studentName}
                                onChange={handleFormChange('studentName')}
                                placeholder="Enter student name"
                                className="h-11"
                                required
                              />
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-sm font-medium text-slate-700">Teacher name</label>
                              <Input
                                value={formValues.teacherName}
                                onChange={handleFormChange('teacherName')}
                                placeholder="Class teacher"
                                className="h-11"
                                required
                              />
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-sm font-medium text-slate-700">Special message</label>
                            <Textarea
                              value={formValues.message}
                              onChange={handleFormChange('message')}
                              placeholder="Add a warm note, motto or vision statement."
                              rows={4}
                            />
                          </div>
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <Button
                              type="button"
                              variant="ghost"
                              onClick={() => setStep('theme')}
                              className="text-slate-600 hover:text-slate-800"
                            >
                              Back to themes
                            </Button>
                            <Button type="submit" disabled={!canSubmit} className="bg-gradient-to-r from-orange-400 to-red-400 text-white">
                              Save cover page
                            </Button>
                          </div>
                        </form>
                      </>
                    ) : (
                      <p className="text-sm text-slate-500">Choose a theme to personalise the cover.</p>
                    )}
                  </div>
                )}

                {step === 'preview' && (
                  <div className="space-y-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-lg font-semibold text-slate-900">Saved cover pages</p>
                        <p className="text-sm text-slate-500">
                          Use the carousel controls to browse every cover generated for this grade.
                        </p>
                      </div>
                      <Button variant="outline" onClick={handleCreateAnother} className="bg-white">
                        Create another cover
                      </Button>
                    </div>

                    <div className="cover-carousel-controls">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => setActiveIndex((index) => (index - 1 + covers.length) % covers.length)}
                        className="bg-white"
                        aria-label="Previous cover"
                      >
                        <ChevronLeft className="h-5 w-5" />
                      </Button>
                      <span className="text-sm font-medium text-slate-700">
                        {activeIndex + 1} of {covers.length}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => setActiveIndex((index) => (index + 1) % covers.length)}
                        className="bg-white"
                        aria-label="Next cover"
                      >
                        <ChevronRight className="h-5 w-5" />
                      </Button>
                    </div>

                    <div className="cover-carousel-indicators">
                      {covers.map((cover, index) => (
                        <button
                          key={cover.id}
                          type="button"
                          onClick={() => setActiveIndex(index)}
                          className={`h-2.5 w-2.5 rounded-full transition ${index === activeIndex ? 'is-active' : ''}`}
                          aria-label={`Go to cover ${index + 1}`}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-4">
                <div className="cover-preview-frame">
                  <CoverPreview cover={previewCover} gradeLabel={gradeLabel} />
                </div>

                <div className="rounded-2xl bg-white/70 p-4 shadow-sm">
                  <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-800">Theme:</span>
                      <span>{previewTheme.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-800">Colour:</span>
                      <span>{previewColour.name}</span>
                    </div>
                    {previewCover.isSample && <Badge variant="outline">Sample data</Badge>}
                  </div>
                  <Separator className="my-3" />
                  <div className="grid gap-3 text-sm text-slate-700 sm:grid-cols-2">
                    <div>
                      <p className="font-medium">Student</p>
                      <p className="text-slate-500">{previewCover.details?.studentName || '—'}</p>
                    </div>
                    <div>
                      <p className="font-medium">Teacher</p>
                      <p className="text-slate-500">{previewCover.details?.teacherName || '—'}</p>
                    </div>
                    <div>
                      <p className="font-medium">Academic year</p>
                      <p className="text-slate-500">{previewCover.details?.academicYear || '—'}</p>
                    </div>
                    <div>
                      <p className="font-medium">Message</p>
                      <p className="text-slate-500">
                        {previewCover.details?.message || 'Add a message to see it appear on the cover.'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default CoverPageWorkflow;
