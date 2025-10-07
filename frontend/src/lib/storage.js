const APP_STATE_KEY = 'rhymes-app::state';
const COVER_WORKFLOW_KEY_PREFIX = 'rhymes-app::cover::';

const isBrowser = () => typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

const safeParseJson = (value) => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    console.warn('Failed to parse persisted state payload:', error);
    return null;
  }
};

export const loadPersistedAppState = () => {
  if (!isBrowser()) {
    return null;
  }

  const raw = window.localStorage.getItem(APP_STATE_KEY);
  return safeParseJson(raw);
};

export const savePersistedAppState = (state) => {
  if (!isBrowser()) {
    return;
  }

  if (!state) {
    window.localStorage.removeItem(APP_STATE_KEY);
    return;
  }

  try {
    const payload = JSON.stringify(state);
    window.localStorage.setItem(APP_STATE_KEY, payload);
  } catch (error) {
    console.warn('Unable to persist application state:', error);
  }
};

export const clearPersistedAppState = () => {
  if (!isBrowser()) {
    return;
  }
  window.localStorage.removeItem(APP_STATE_KEY);
};

const buildCoverWorkflowKey = (schoolId, grade) => {
  if (!schoolId || !grade) {
    return '';
  }

  const normalizedSchool = schoolId.toString().trim();
  const normalizedGrade = grade.toString().trim();

  if (!normalizedSchool || !normalizedGrade) {
    return '';
  }

  return `${COVER_WORKFLOW_KEY_PREFIX}${normalizedSchool}::${normalizedGrade}`;
};

export const loadCoverWorkflowState = (schoolId, grade) => {
  if (!isBrowser()) {
    return null;
  }

  const key = buildCoverWorkflowKey(schoolId, grade);
  if (!key) {
    return null;
  }

  const raw = window.localStorage.getItem(key);
  return safeParseJson(raw);
};

export const saveCoverWorkflowState = (schoolId, grade, state) => {
  if (!isBrowser()) {
    return;
  }

  const key = buildCoverWorkflowKey(schoolId, grade);
  if (!key) {
    return;
  }

  if (!state) {
    window.localStorage.removeItem(key);
    return;
  }

  try {
    const payload = JSON.stringify({ ...state, updatedAt: Date.now() });
    window.localStorage.setItem(key, payload);
  } catch (error) {
    console.warn('Unable to persist cover workflow state:', error);
  }
};

export const clearCoverWorkflowState = (schoolId, grade) => {
  if (!isBrowser()) {
    return;
  }

  const key = buildCoverWorkflowKey(schoolId, grade);
  if (!key) {
    return;
  }

  window.localStorage.removeItem(key);
};
