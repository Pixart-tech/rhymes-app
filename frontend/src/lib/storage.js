const APP_STATE_KEY = 'rhymes-app::state';
const WORKSPACE_CACHE_KEY = 'rhymes-app::workspace-cache';
const ADMIN_WORKSPACE_RETURN_KEY = 'rhymes-app::admin-workspace-return';
const COVER_WORKFLOW_KEY_PREFIX = 'rhymes-app::cover::';
const BOOK_WORKFLOW_KEY_PREFIX = 'rhymes-app::books::';

const isBrowser = () => typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

const resolveAppStateStorage = () => {
  if (!isBrowser()) {
    return null;
  }

  // Persist app state per-tab so opening a new tab always starts at the dashboard
  // (instead of restoring where another tab left off).
  if (typeof window.sessionStorage !== 'undefined') {
    return window.sessionStorage;
  }

  return window.localStorage;
};

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

  const storage = resolveAppStateStorage();
  if (!storage) {
    return null;
  }

  const raw = storage.getItem(APP_STATE_KEY);
  return safeParseJson(raw);
};

export const savePersistedAppState = (state) => {
  if (!isBrowser()) {
    return;
  }

  const storage = resolveAppStateStorage();
  if (!storage) {
    return;
  }

  if (!state) {
    storage.removeItem(APP_STATE_KEY);
    return;
  }

  try {
    const payload = JSON.stringify(state);
    storage.setItem(APP_STATE_KEY, payload);
  } catch (error) {
    console.warn('Unable to persist application state:', error);
  }
};

export const clearPersistedAppState = () => {
  if (!isBrowser()) {
    return;
  }
  const storage = resolveAppStateStorage();
  if (!storage) {
    return;
  }
  storage.removeItem(APP_STATE_KEY);
};

export const loadWorkspaceCache = () => {
  if (!isBrowser()) {
    return null;
  }
  return safeParseJson(window.localStorage.getItem(WORKSPACE_CACHE_KEY));
};

export const saveWorkspaceCache = (payload) => {
  if (!isBrowser()) {
    return;
  }
  if (!payload) {
    window.localStorage.removeItem(WORKSPACE_CACHE_KEY);
    return;
  }
  try {
    const serialized = JSON.stringify(payload);
    window.localStorage.setItem(WORKSPACE_CACHE_KEY, serialized);
  } catch (error) {
    console.warn('Unable to persist workspace cache:', error);
  }
};

export const clearWorkspaceCache = () => {
  if (!isBrowser()) {
    return;
  }
  window.localStorage.removeItem(WORKSPACE_CACHE_KEY);
};

export const loadAdminWorkspaceReturn = () => {
  if (!isBrowser()) {
    return null;
  }
  return safeParseJson(window.localStorage.getItem(ADMIN_WORKSPACE_RETURN_KEY));
};

export const saveAdminWorkspaceReturn = (payload) => {
  if (!isBrowser()) {
    return;
  }
  if (!payload) {
    window.localStorage.removeItem(ADMIN_WORKSPACE_RETURN_KEY);
    return;
  }
  try {
    window.localStorage.setItem(ADMIN_WORKSPACE_RETURN_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn('Unable to persist admin workspace return payload:', error);
  }
};

export const clearAdminWorkspaceReturn = () => {
  if (!isBrowser()) {
    return;
  }
  window.localStorage.removeItem(ADMIN_WORKSPACE_RETURN_KEY);
};

const createWorkflowStorage = (keyPrefix) => {
  const buildKey = (schoolId, grade) => {
    if (!schoolId || !grade) {
      return '';
    }
    const normalizedSchool = schoolId.toString().trim();
    const normalizedGrade = grade.toString().trim();
    if (!normalizedSchool || !normalizedGrade) {
      return '';
    }
    return `${keyPrefix}${normalizedSchool}::${normalizedGrade}`;
  };

  return {
    load: (schoolId, grade) => {
      if (!isBrowser()) return null;
      const key = buildKey(schoolId, grade);
      return key ? safeParseJson(window.localStorage.getItem(key)) : null;
    },
    save: (schoolId, grade, state) => {
      if (!isBrowser()) return;
      const key = buildKey(schoolId, grade);
      if (!key) return;
      if (!state) {
        window.localStorage.removeItem(key);
        return;
      }
      try {
        const payload = JSON.stringify({ ...state, updatedAt: Date.now() });
        window.localStorage.setItem(key, payload);
      } catch (error) {
        console.warn(`Unable to persist workflow state for key [${key}]:`, error);
      }
    },
    clear: (schoolId, grade) => {
      if (!isBrowser()) return;
      const key = buildKey(schoolId, grade);
      if (key) {
        window.localStorage.removeItem(key);
      }
    }
  };
};

const coverWorkflowStorage = createWorkflowStorage(COVER_WORKFLOW_KEY_PREFIX);
export const loadCoverWorkflowState = coverWorkflowStorage.load;
export const saveCoverWorkflowState = coverWorkflowStorage.save;
export const clearCoverWorkflowState = coverWorkflowStorage.clear;

const bookWorkflowStorage = createWorkflowStorage(BOOK_WORKFLOW_KEY_PREFIX);
export const loadBookWorkflowState = bookWorkflowStorage.load;
export const saveBookWorkflowState = bookWorkflowStorage.save;
export const clearBookWorkflowState = bookWorkflowStorage.clear;
