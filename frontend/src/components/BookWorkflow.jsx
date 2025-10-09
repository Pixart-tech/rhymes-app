import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Separator } from './ui/separator';
import { ScrollArea } from './ui/scroll-area';
import { loadBookWorkflowState, saveBookWorkflowState, clearBookWorkflowState } from '../lib/storage';

const GRADE_LABELS = {
  nursery: 'Nursery',
  lkg: 'LKG',
  ukg: 'UKG',
  playgroup: 'Playgroup'
};

const resolveGradeLabel = (grade, customGradeName) => {
  if (customGradeName && customGradeName.trim()) {
    return customGradeName.trim();
  }

  if (GRADE_LABELS[grade]) {
    return GRADE_LABELS[grade];
  }

  if (typeof grade === 'string' && grade.trim()) {
    return grade.trim().toUpperCase();
  }

  return 'Grade';
};

const BOOK_LIBRARY = {
  nursery: [
    {
      id: 'nursery-colour-garden',
      title: 'Colours in the Garden',
      author: 'Priya Menon',
      subjects: ['Art', 'Language'],
      format: 'Picture book',
      readingLevel: 'Read-aloud',
      description:
        'A gentle exploration of colours through a friendly garden adventure featuring relatable characters and repetitive phrases.',
      skills: ['Vocabulary', 'Observation', 'Colour recognition']
    },
    {
      id: 'nursery-counting-friends',
      title: 'Ten Tiny Friends',
      author: 'Ravi Kapoor',
      subjects: ['Math', 'Motor Skills'],
      format: 'Board book',
      readingLevel: 'Guided reading',
      description:
        'Bright illustrations and tactile elements invite young learners to count, trace and clap along as the tiny friends play through the day.',
      skills: ['Counting', 'Fine motor', 'Pattern recognition']
    },
    {
      id: 'nursery-animal-rhymes',
      title: 'Animal Rhythm Parade',
      author: 'Leela Thomas',
      subjects: ['Language', 'Music'],
      format: 'Rhyme collection',
      readingLevel: 'Read-aloud',
      description:
        'Playful poems introduce animal sounds and actions, encouraging dramatic play and rhythm through call-and-response storytelling.',
      skills: ['Phonemic awareness', 'Creative play', 'Listening']
    },
    {
      id: 'nursery-bedtime-stars',
      title: 'Goodnight, Little Star',
      author: 'Ananya Rao',
      subjects: ['Values', 'Language'],
      format: 'Bedtime story',
      readingLevel: 'Read-aloud',
      description:
        'A calming bedtime routine story that models gentle breathing, gratitude and kindness for little learners winding down for the night.',
      skills: ['Emotional regulation', 'Sequencing', 'Empathy']
    },
    {
      id: 'nursery-nature-sounds',
      title: 'Listen to the Rainforest',
      author: 'Kabir Desai',
      subjects: ['Science', 'Language'],
      format: 'Sound exploration',
      readingLevel: 'Guided discovery',
      description:
        'Sound words, movement prompts and sensory illustrations spark curiosity about animal habitats and weather patterns in the rainforest.',
      skills: ['Listening', 'Curiosity', 'Environmental awareness']
    },
    {
      id: 'nursery-celebrations',
      title: 'Festival of Lights',
      author: 'Rina Patel',
      subjects: ['Social', 'Art'],
      format: 'Celebration story',
      readingLevel: 'Read-aloud',
      description:
        'Families prepare for a community celebration, highlighting traditions, colours and collaborative preparation through simple text.',
      skills: ['Community building', 'Creativity', 'Cultural awareness']
    }
  ],
  lkg: [
    {
      id: 'lkg-letter-adventure',
      title: 'Alphabet Safari',
      author: 'Samaira Khan',
      subjects: ['Language', 'Science'],
      format: 'Interactive story',
      readingLevel: 'Early reader',
      description:
        'Children explore a safari park while collecting letter sounds, practising tracing motions and spotting beginning sounds in the wild.',
      skills: ['Letter-sound mapping', 'Tracing', 'Fact recall']
    },
    {
      id: 'lkg-number-journey',
      title: 'Journey of Numbers',
      author: 'Neel Varma',
      subjects: ['Math', 'Problem Solving'],
      format: 'Story-based workbook',
      readingLevel: 'Guided reading',
      description:
        'Story-led challenges and manipulative prompts build confidence with early addition, subtraction and comparing quantities.',
      skills: ['Number sense', 'Reasoning', 'Perseverance']
    },
    {
      id: 'lkg-curious-science',
      title: 'Curious Questions Club',
      author: 'Divya Nair',
      subjects: ['Science', 'Values'],
      format: 'Inquiry journal',
      readingLevel: 'Shared reading',
      description:
        'A group of friends conduct simple experiments, modelling how to ask questions, record observations and share discoveries kindly.',
      skills: ['Inquiry skills', 'Collaboration', 'Communication']
    },
    {
      id: 'lkg-story-sequencing',
      title: 'The Mystery Picnic',
      author: 'Arjun Dutta',
      subjects: ['Language', 'Social'],
      format: 'Narrative adventure',
      readingLevel: 'Early reader',
      description:
        'Sequencing puzzles and picture clues support comprehension as children predict, retell and organise events from a picnic surprise.',
      skills: ['Comprehension', 'Sequencing', 'Critical thinking']
    },
    {
      id: 'lkg-mindful-mornings',
      title: 'Morning Mindful Moments',
      author: 'Ishita Bose',
      subjects: ['Values', 'Wellness'],
      format: 'Routine guide',
      readingLevel: 'Shared reading',
      description:
        'Short activities and breathing exercises create calm classroom openings, introducing gratitude, reflection and positive affirmations.',
      skills: ['Mindfulness', 'Self-awareness', 'Routine building']
    },
    {
      id: 'lkg-creative-makers',
      title: 'Little Makers Lab',
      author: 'Siddharth Mehra',
      subjects: ['Art', 'STEM'],
      format: 'Project book',
      readingLevel: 'Guided discovery',
      description:
        'Step-by-step prompts and open-ended challenges invite children to invent, build and share using everyday classroom materials.',
      skills: ['Design thinking', 'Fine motor', 'Imagination']
    }
  ],
  ukg: [
    {
      id: 'ukg-story-builders',
      title: 'Story Builders Workshop',
      author: 'Charu Mench',
      subjects: ['Language', 'Art'],
      format: 'Writing journal',
      readingLevel: 'Independent practice',
      description:
        'Graphic organisers, vocabulary prompts and mentor texts empower learners to craft their own stories with structured guidance.',
      skills: ['Creative writing', 'Grammar foundations', 'Imagination']
    },
    {
      id: 'ukg-math-puzzles',
      title: 'Math Puzzle Trail',
      author: 'Rahul Banerjee',
      subjects: ['Math', 'Logic'],
      format: 'Puzzle book',
      readingLevel: 'Independent practice',
      description:
        'Progressive puzzles and game boards strengthen place value understanding, skip counting and logical reasoning.',
      skills: ['Computation', 'Logic', 'Strategic thinking']
    },
    {
      id: 'ukg-stem-explorers',
      title: 'STEM Explorers Journal',
      author: 'Meera Joseph',
      subjects: ['STEM', 'Science'],
      format: 'Project journal',
      readingLevel: 'Guided discovery',
      description:
        'Hands-on investigations blend science, technology and maths with real-world challenges that promote curiosity and resilience.',
      skills: ['Experimentation', 'Measurement', 'Problem solving']
    },
    {
      id: 'ukg-community-helpers',
      title: 'Community Heroes',
      author: 'Aditya Pillai',
      subjects: ['Social', 'Values'],
      format: 'Informational text',
      readingLevel: 'Shared reading',
      description:
        'Profiles of everyday heroes spark discussions on responsibility, empathy and how communities collaborate.',
      skills: ['Civic awareness', 'Empathy', 'Oral communication']
    },
    {
      id: 'ukg-nature-journal',
      title: 'Seasons Discovery Log',
      author: 'Ira Mukherjee',
      subjects: ['Science', 'Language'],
      format: 'Observation journal',
      readingLevel: 'Independent practice',
      description:
        'Learners document seasonal changes, compare habitats and create mini-reports blending descriptive language with data charts.',
      skills: ['Data handling', 'Observation', 'Informational writing']
    },
    {
      id: 'ukg-values-companion',
      title: 'Kindness Companions',
      author: 'Tanvi Reddy',
      subjects: ['Values', 'Language'],
      format: 'Discussion stories',
      readingLevel: 'Shared reading',
      description:
        'Discussion starters and reflective prompts nurture empathy, perspective taking and collaborative conflict resolution.',
      skills: ['Social-emotional learning', 'Reflection', 'Teamwork']
    }
  ],
  playgroup: [
    {
      id: 'playgroup-sensory-play',
      title: 'Sensory Playtime',
      author: 'Gayathri Iyer',
      subjects: ['Motor Skills', 'Wellness'],
      format: 'Activity guide',
      readingLevel: 'Educator resource',
      description:
        'Quick, low-prep sensory stations engage toddlers with textures, sounds and movements that strengthen core motor skills.',
      skills: ['Gross motor', 'Sensory integration', 'Self-regulation']
    },
    {
      id: 'playgroup-mini-melodies',
      title: 'Mini Melodies',
      author: 'Farah Siddiqui',
      subjects: ['Music', 'Language'],
      format: 'Song collection',
      readingLevel: 'Read-aloud',
      description:
        'Call-and-response songs introduce rhythm, rhyme and new vocabulary while encouraging joyful movement.',
      skills: ['Listening', 'Phonemic awareness', 'Coordination']
    },
    {
      id: 'playgroup-picture-talk',
      title: 'Picture Talk Prompts',
      author: 'Manish Arora',
      subjects: ['Language', 'Social'],
      format: 'Visual cards',
      readingLevel: 'Facilitated discussion',
      description:
        'Vivid picture cards spark expressive language, turn-taking and early comprehension through guided prompts.',
      skills: ['Speaking', 'Social cues', 'Vocabulary']
    },
    {
      id: 'playgroup-movement-mania',
      title: 'Movement Mania',
      author: 'Ayesha Fernandes',
      subjects: ['Motor Skills', 'Wellness'],
      format: 'Movement cards',
      readingLevel: 'Active play',
      description:
        'Short burst movement games build stamina, balance and confidence while weaving in imaginative storytelling.',
      skills: ['Balance', 'Confidence', 'Body awareness']
    },
    {
      id: 'playgroup-little-chefs',
      title: 'Little Chefs Together',
      author: 'Rohit Pradhan',
      subjects: ['Life Skills', 'Math'],
      format: 'Recipe cards',
      readingLevel: 'Guided activity',
      description:
        'Simple snack recipes encourage measuring, sequencing and cooperative play during pretend and real cooking sessions.',
      skills: ['Counting', 'Teamwork', 'Following instructions']
    },
    {
      id: 'playgroup-story-circle',
      title: 'Story Circle Tales',
      author: 'Lina George',
      subjects: ['Language', 'Values'],
      format: 'Story collection',
      readingLevel: 'Read-aloud',
      description:
        'Short, warm stories about friendship and feelings prompt toddlers to connect stories with their own experiences.',
      skills: ['Empathy', 'Memory', 'Listening']
    }
  ]
};

const buildSubjectList = (books) => {
  const subjectSet = new Set();
  books.forEach((book) => {
    (book.subjects || []).forEach((subject) => subjectSet.add(subject));
  });
  return Array.from(subjectSet).sort((a, b) => a.localeCompare(b));
};

const BookWorkflow = ({
  school,
  grade,
  customGradeName,
  onBackToGrades,
  onBackToMode,
  onLogout
}) => {
  const gradeLabel = useMemo(() => resolveGradeLabel(grade, customGradeName), [grade, customGradeName]);
  const booksForGrade = useMemo(() => BOOK_LIBRARY[grade] || BOOK_LIBRARY.nursery, [grade]);
  const availableSubjects = useMemo(() => buildSubjectList(booksForGrade), [booksForGrade]);

  const [searchTerm, setSearchTerm] = useState('');
  const [activeSubjects, setActiveSubjects] = useState([]);
  const [selectedBooks, setSelectedBooks] = useState([]);

  const schoolId = school?.school_id || '';

  useEffect(() => {
    if (!schoolId || !grade) {
      setSearchTerm('');
      setActiveSubjects([]);
      setSelectedBooks([]);
      return;
    }

    const storedState = loadBookWorkflowState(schoolId, grade);
    if (!storedState) {
      setSearchTerm('');
      setActiveSubjects([]);
      setSelectedBooks([]);
      return;
    }

    setSearchTerm(storedState.searchTerm || '');
    setActiveSubjects(Array.isArray(storedState.activeSubjects) ? storedState.activeSubjects : []);
    setSelectedBooks(Array.isArray(storedState.selectedBooks) ? storedState.selectedBooks : []);
  }, [schoolId, grade]);

  useEffect(() => {
    if (!schoolId || !grade) {
      return;
    }

    saveBookWorkflowState(schoolId, grade, {
      searchTerm,
      activeSubjects,
      selectedBooks
    });
  }, [schoolId, grade, searchTerm, activeSubjects, selectedBooks]);

  const filteredBooks = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    if (!normalizedSearch && activeSubjects.length === 0) {
      return booksForGrade;
    }

    return booksForGrade.filter((book) => {
      const matchesSubjects =
        activeSubjects.length === 0 || (book.subjects || []).some((subject) => activeSubjects.includes(subject));

      if (!matchesSubjects) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const haystack = [
        book.title,
        book.author,
        book.description,
        book.format,
        book.readingLevel,
        ...(book.subjects || []),
        ...(book.skills || [])
      ]
        .filter(Boolean)
        .map((value) => value.toString().toLowerCase());

      return haystack.some((value) => value.includes(normalizedSearch));
    });
  }, [booksForGrade, searchTerm, activeSubjects]);

  const selectedBookDetails = useMemo(() => {
    if (!selectedBooks.length) {
      return [];
    }

    const idSet = new Set(selectedBooks);
    return booksForGrade.filter((book) => idSet.has(book.id));
  }, [selectedBooks, booksForGrade]);

  const selectedSubjects = useMemo(() => {
    const subjectSet = new Set();
    selectedBookDetails.forEach((book) => {
      (book.subjects || []).forEach((subject) => subjectSet.add(subject));
    });
    return Array.from(subjectSet).sort((a, b) => a.localeCompare(b));
  }, [selectedBookDetails]);

  const handleToggleSubject = useCallback((subject) => {
    setActiveSubjects((current) => {
      if (current.includes(subject)) {
        return current.filter((item) => item !== subject);
      }
      return [...current, subject];
    });
  }, []);

  const handleClearFilters = useCallback(() => {
    setSearchTerm('');
    setActiveSubjects([]);
  }, []);

  const handleToggleBook = useCallback((bookId) => {
    setSelectedBooks((current) => {
      if (current.includes(bookId)) {
        return current.filter((id) => id !== bookId);
      }
      return [...current, bookId];
    });
  }, []);

  const handleResetWorkflow = useCallback(() => {
    setSearchTerm('');
    setActiveSubjects([]);
    setSelectedBooks([]);
    if (schoolId && grade) {
      clearBookWorkflowState(schoolId, grade);
    }
  }, [schoolId, grade]);

  const isSubjectActive = useCallback((subject) => activeSubjects.includes(subject), [activeSubjects]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-red-50 py-10 px-6">
      <div className="mx-auto max-w-6xl space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-2">
            <p className="text-sm font-medium text-orange-500">Book planning workflow</p>
            <h1 className="text-3xl font-semibold text-slate-900">{school.school_name}</h1>
            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
              <Badge variant="secondary">Grade: {gradeLabel}</Badge>
              <span>School ID: {school.school_id}</span>
              <span>Books selected: {selectedBooks.length}</span>
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

        <Card className="border-none bg-white/70 shadow-md shadow-orange-100/40">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-orange-500">Planning summary</p>
              <p className="text-base font-semibold text-slate-800">
                {selectedBooks.length > 0
                  ? `${selectedBooks.length} book${selectedBooks.length === 1 ? '' : 's'} selected for ${gradeLabel}`
                  : 'Start building your reading plan'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
              <div className="flex items-center gap-2">
                <span className="font-medium text-slate-700">Focus subjects:</span>
                {selectedSubjects.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {selectedSubjects.map((subject) => (
                      <Badge key={`summary-${subject}`} variant="outline" className="border-orange-200 bg-orange-50 text-orange-600">
                        {subject}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <span>All subjects</span>
                )}
              </div>
              <Separator orientation="vertical" className="hidden h-6 sm:block" />
              <Button variant="ghost" onClick={handleResetWorkflow} className="text-orange-600 hover:text-orange-700">
                Reset selection
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-xl shadow-orange-100/60">
          <CardHeader className="space-y-2">
            <CardTitle className="text-xl font-semibold text-slate-900">Filter and discover</CardTitle>
            <p className="text-sm text-slate-600">
              Search by title, author or skill and refine by subject focus to curate a balanced set of books for your class.
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
              <div className="space-y-2">
                <Label htmlFor="book-search" className="text-sm font-medium text-slate-700">
                  Search books
                </Label>
                <Input
                  id="book-search"
                  type="text"
                  placeholder="Search by title, author or skill"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  className="bg-white/80"
                />
              </div>
              <div className="flex items-end justify-end">
                <Button type="button" variant="outline" onClick={handleClearFilters} className="border-orange-200 text-orange-600">
                  Clear filters
                </Button>
              </div>
            </div>

            {availableSubjects.length > 0 && (
              <div className="space-y-3">
                <p className="text-sm font-medium text-slate-700">Focus subjects</p>
                <div className="flex flex-wrap gap-2">
                  {availableSubjects.map((subject) => {
                    const active = isSubjectActive(subject);
                    return (
                      <button
                        key={`subject-filter-${subject}`}
                        type="button"
                        onClick={() => handleToggleSubject(subject)}
                        className={`rounded-full border px-3 py-1 text-sm font-medium transition focus:outline-none focus-visible:ring-4 focus-visible:ring-orange-300 ${
                          active
                            ? 'border-orange-500 bg-orange-500 text-white shadow'
                            : 'border-orange-200 bg-white/80 text-orange-600 hover:border-orange-300 hover:bg-orange-50'
                        }`}
                      >
                        {subject}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-none shadow-xl shadow-orange-100/60">
          <CardHeader className="space-y-2">
            <CardTitle className="text-xl font-semibold text-slate-900">Recommended books for {gradeLabel}</CardTitle>
            <p className="text-sm text-slate-600">
              Tap a book to add it to your plan. Selected titles appear in the summary so you can review the mix at a glance.
            </p>
          </CardHeader>
          <CardContent>
            {filteredBooks.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 p-6 text-center text-sm text-slate-500">
                No books match the current search and subject filters. Try clearing a filter to see more options.
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {filteredBooks.map((book) => {
                  const isSelected = selectedBooks.includes(book.id);
                  return (
                    <Card
                      key={book.id}
                      className={`h-full border-2 transition ${
                        isSelected ? 'border-orange-400 shadow-lg shadow-orange-200' : 'border-transparent shadow-sm'
                      } bg-white/85 backdrop-blur-sm`}
                    >
                      <CardContent className="flex h-full flex-col gap-4 p-6">
                        <div className="space-y-1">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <h3 className="text-lg font-semibold text-slate-900">{book.title}</h3>
                              <p className="text-sm text-slate-500">by {book.author}</p>
                            </div>
                            {isSelected && <Badge className="bg-orange-500 text-white">Selected</Badge>}
                          </div>
                          <div className="flex flex-wrap gap-2 text-xs text-orange-600">
                            <Badge variant="outline" className="border-orange-200 bg-orange-50 text-orange-600">
                              {book.readingLevel}
                            </Badge>
                            <Badge variant="outline" className="border-slate-200 bg-white text-slate-600">
                              {book.format}
                            </Badge>
                          </div>
                        </div>
                        <p className="text-sm leading-relaxed text-slate-600">{book.description}</p>
                        {book.subjects && book.subjects.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {book.subjects.map((subject) => (
                              <Badge key={`${book.id}-subject-${subject}`} variant="secondary" className="bg-slate-100 text-slate-700">
                                {subject}
                              </Badge>
                            ))}
                          </div>
                        )}
                        {book.skills && book.skills.length > 0 && (
                          <div className="space-y-1">
                            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Key skills</p>
                            <div className="flex flex-wrap gap-2">
                              {book.skills.map((skill) => (
                                <Badge key={`${book.id}-skill-${skill}`} variant="outline" className="border-dashed border-orange-300 text-orange-600">
                                  {skill}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                        <div className="mt-auto pt-2">
                          <Button
                            type="button"
                            onClick={() => handleToggleBook(book.id)}
                            className={`w-full ${isSelected ? 'bg-orange-500 hover:bg-orange-600' : ''}`}
                            variant={isSelected ? 'default' : 'outline'}
                          >
                            {isSelected ? 'Remove from plan' : 'Add to plan'}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-none shadow-xl shadow-orange-100/60">
          <CardHeader className="space-y-2">
            <CardTitle className="text-xl font-semibold text-slate-900">Selected books</CardTitle>
            <p className="text-sm text-slate-600">
              Review the current plan and share it with your team. You can always revisit this page to refine the list.
            </p>
          </CardHeader>
          <CardContent>
            {selectedBookDetails.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 p-6 text-center text-sm text-slate-500">
                No books have been added yet. Use the filters above to explore recommendations and build your shortlist.
              </div>
            ) : (
              <ScrollArea className="max-h-64">
                <div className="space-y-4 pr-2">
                  {selectedBookDetails.map((book) => (
                    <div
                      key={`selected-${book.id}`}
                      className="rounded-2xl border border-orange-100 bg-white/80 p-4 shadow-sm"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-base font-semibold text-slate-800">{book.title}</p>
                          <p className="text-sm text-slate-500">{book.author}</p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          className="text-orange-600 hover:text-orange-700"
                          onClick={() => handleToggleBook(book.id)}
                        >
                          Remove
                        </Button>
                      </div>
                      <p className="mt-2 text-sm text-slate-600">{book.description}</p>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default BookWorkflow;
