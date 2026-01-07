export function loadPersistedAppState(): any | null;
export function savePersistedAppState(state: any): void;
export function clearPersistedAppState(): void;
export function loadWorkspaceCache(): any | null;
export function saveWorkspaceCache(state: any): void;
export function clearWorkspaceCache(): void;

export function loadCoverWorkflowState(schoolId: string, grade: string): any | null;
export function saveCoverWorkflowState(schoolId: string, grade: string, state: any): void;
export function clearCoverWorkflowState(schoolId: string, grade: string): void;

export function loadBookWorkflowState(schoolId: string, grade: string): any | null;
export function saveBookWorkflowState(schoolId: string, grade: string, state: any): void;
export function clearBookWorkflowState(schoolId: string, grade: string): void;
