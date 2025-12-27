import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { getDownloadURL, ref } from 'firebase/storage';
import {
  Loader2,
  School,
  Edit3,
  Eye,
  Plus,
  RefreshCw,
  Trash2,
  UserRoundPen,
  Search,
  MoreVertical,
  TrendingUp,
  LogOut
} from 'lucide-react';

import { useAuth } from '../hooks/useAuth';
import { storage } from '../lib/firebase';
import { API_BASE_URL, cn } from '../lib/utils';
import { Button } from './ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from './ui/card';
import {
  AdminSchoolProfile,
  BranchStatus,
  SchoolProfile,
  SchoolFormValues,
  SchoolServiceType,
  WorkspaceUserUpdatePayload
} from '../types/types';
import BranchForm, { type BranchFormValues } from './BranchForm';
import {
  SchoolForm,
  SchoolFormSubmitPayload,
  buildSchoolFormData,
  buildSchoolFormValuesFromProfile
} from './SchoolProfileForm';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from './ui/dropdown-menu';

const API = API_BASE_URL || '/api';

const SERVICE_KEYS: SchoolServiceType[] = ['id_cards', 'report_cards', 'certificates'];
const SERVICE_LABELS: Record<SchoolServiceType, string> = {
  id_cards: 'ID cards',
  report_cards: 'Report cards',
  certificates: 'Certificates'
};
type AdminServiceFilter = 'all' | SchoolServiceType;
const PAGE_SIZE_OPTIONS = [5, 10, 25, 50];
const BRANCH_NAME_MIN_LENGTH = 2;
const COORDINATOR_NAME_MIN_LENGTH = 2;
const COORDINATOR_PHONE_MIN_LENGTH = 5;
const COORDINATOR_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const getAxiosDetailMessage = (error: unknown): string | null => {
  if (!axios.isAxiosError(error)) {
    return null;
  }
  const responseData = error.response?.data;
  if (!responseData) {
    return null;
  }
  if (typeof responseData === 'string') {
    return responseData;
  }
  if (typeof responseData.detail === 'string') {
    return responseData.detail;
  }
  if (Array.isArray(responseData.detail)) {
    return responseData.detail
      .map((entry) => {
        if (typeof entry === 'string') {
          return entry;
        }
        if (entry && typeof entry === 'object') {
          return (entry as { msg?: string }).msg ?? JSON.stringify(entry);
        }
        return '';
      })
      .filter(Boolean)
      .join(' ');
  }
  if (typeof responseData.message === 'string') {
    return responseData.message;
  }
  return null;
};

const getLogoSrc = (school: SchoolProfile, resolvedLogos?: Record<string, string>): string | null => {
  if (resolvedLogos?.[school.school_id]) {
    return resolvedLogos[school.school_id];
  }
  return school.logo_url ?? null;
};

const formatBranchAddress = (branch: SchoolProfile): string | null => {
  const segments = [
    branch.address?.trim(),
    branch.city?.trim(),
    branch.state?.trim(),
    branch.pin?.trim()
  ].filter(Boolean);
  if (segments.length > 0) {
    return segments.join(', ');
  }
  return branch.address?.trim() || null;
};


export interface WorkspaceUserProfile {
  uid: string;
  email?: string | null;
  display_name?: string | null;
  role: 'super-admin' | 'user';
  school_ids: string[];
}

interface WorkspaceSession {
  user: WorkspaceUserProfile;
  schools: SchoolProfile[];
}

interface AuthPageProps {
  onAuth: (selection: { school: SchoolProfile; user: WorkspaceUserProfile }) => void;
  onLogout: () => void;
}

interface PaginatedAdminSchoolsResponse {
  schools: AdminSchoolProfile[];
  totalCount?: number;
  total_count?: number;
}

const AuthPage: React.FC<AuthPageProps> = ({ onAuth, onLogout }) => {
  const { user, signInWithGoogle, loading: authLoading, getIdToken } = useAuth();
  const [workspaceUser, setWorkspaceUser] = useState<WorkspaceUserProfile | null>(null);
  const [schools, setSchools] = useState<SchoolProfile[]>([]);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [view, setView] = useState<'list' | 'create' | 'edit' | 'branch'>('list');
  const [editingSchool, setEditingSchool] = useState<SchoolProfile | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [branchParent, setBranchParent] = useState<SchoolProfile | null>(null);
  const [branchSubmitting, setBranchSubmitting] = useState(false);
  const [branchStatusUpdatingId, setBranchStatusUpdatingId] = useState<string | null>(null);
  const [adminSchools, setAdminSchools] = useState<AdminSchoolProfile[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [schoolsPerPage, setSchoolsPerPage] = useState(10);
  const [totalAdminSchoolsCount, setTotalAdminSchoolsCount] = useState(0);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [profileForm, setProfileForm] = useState({ display_name: '', email: '' });
  const [profileSubmitting, setProfileSubmitting] = useState(false);
  const [deletingSchoolId, setDeletingSchoolId] = useState<string | null>(null);
  const [logoMap, setLogoMap] = useState<Record<string, string>>({});
  const [adminSearch, setAdminSearch] = useState('');
  const [serviceFilter, setServiceFilter] = useState<AdminServiceFilter>('all');
  const [approvingSchoolId, setApprovingSchoolId] = useState<string | null>(null);
  const workspaceFetchInFlight = useRef(false);
  const lastFetchedWorkspaceUserId = useRef<string | null>(null);
  const allSchoolsForLogos = useMemo(() => {
    const deduped: Record<string, SchoolProfile> = {};
    [...schools, ...adminSchools].forEach((school) => {
      if (school?.school_id) {
        deduped[school.school_id] = school;
      }
    });
    return Object.values(deduped);
  }, [schools, adminSchools]);
  const branchStructure = useMemo(() => {
    const rootSchools: SchoolProfile[] = [];
    const branchMap = new Map<string, SchoolProfile[]>();
    schools.forEach((school) => {
      if (school.branch_parent_id) {
        const current = branchMap.get(school.branch_parent_id) ?? [];
        current.push(school);
        branchMap.set(school.branch_parent_id, current);
      } else {
        rootSchools.push(school);
      }
    });
    const rootIds = new Set(rootSchools.map((school) => school.school_id));
    const orphanBranches: SchoolProfile[] = [];
    branchMap.forEach((list, parentId) => {
      if (!rootIds.has(parentId)) {
        orphanBranches.push(...list);
      }
    });
    return { rootSchools, branchMap, orphanBranches };
  }, [schools]);
  const isSchoolApproved = useCallback(
    (school?: { selection_status?: string; selections_approved?: boolean } | null) => {
      if (!school) {
        return false;
      }
      if (school.selections_approved === true) {
        return true;
      }
      const statusValue = (school.selection_status || '').toString().toLowerCase();
      return statusValue === 'approved';
    },
    []
  );
  const resolveDirectLogoUrl = useCallback((value?: string | null) => {
    if (!value) {
      return null;
    }
    if (/^data:/i.test(value) || /^https?:\/\//i.test(value)) {
      return value;
    }
    if (value.startsWith('/')) {
      if (API_BASE_URL && /^https?:\/\//i.test(API_BASE_URL)) {
        try {
          return new URL(value, API_BASE_URL).toString();
        } catch (error) {
          console.warn('Unable to build absolute logo url', error);
        }
      }
      return value;
    }
    return null;
  }, []);

  const fetchWorkspace = useCallback(async (options?: { force?: boolean }) => {
    if (!user) {
      return;
    }

    if (workspaceFetchInFlight.current) {
      return;
    }

    const currentUserId = user.uid;
    if (!options?.force && lastFetchedWorkspaceUserId.current === currentUserId) {
      return;
    }

    workspaceFetchInFlight.current = true;
    setWorkspaceLoading(true);
    setWorkspaceError(null);

    try {
      const token = await getIdToken();
      if (!token) {
        throw new Error('Unable to fetch Firebase token');
      }

      const response = await axios.get<WorkspaceSession>(`${API}/users/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const nextUser = response.data.user;
      setWorkspaceUser(nextUser);
      setSchools(response.data.schools);
      const shouldStartInCreate = nextUser.role !== 'super-admin' && response.data.schools.length === 0;
      setView(shouldStartInCreate ? 'create' : 'list');
      lastFetchedWorkspaceUserId.current = currentUserId;
    } catch (error) {
      console.error('Failed to load workspace', error);
      setWorkspaceError('Unable to load your workspace. Please try again.');
      toast.error('Unable to load your workspace. Please try again.');
      lastFetchedWorkspaceUserId.current = null;
    } finally {
      setWorkspaceLoading(false);
      workspaceFetchInFlight.current = false;
    }
  }, [user, getIdToken]);

  useEffect(() => {
    if (!user) {
      setWorkspaceUser(null);
      setSchools([]);
      setView('list');
      setEditingSchool(null);
      lastFetchedWorkspaceUserId.current = null;
      return;
    }
    void fetchWorkspace();
  }, [user, fetchWorkspace]);

  useEffect(() => {
    if (workspaceUser) {
      setProfileForm({
        display_name: workspaceUser.display_name ?? '',
        email: workspaceUser.email ?? ''
      });
    } else {
      setProfileForm({ display_name: '', email: '' });
    }
    setProfileDialogOpen(false);
  }, [workspaceUser]);

  useEffect(() => {
    if (view !== 'branch' && branchParent) {
      setBranchParent(null);
    }
  }, [view, branchParent]);

  const fetchAdminSchools = useCallback(
    async (
      pageArg?: number,
      limitArg?: number,
      { showLoading = true }: FetchOptions = {}
    ) => {
      if (!workspaceUser || workspaceUser.role !== 'super-admin') {
        return;
      }
      if (showLoading) {
        setAdminLoading(true);
        setAdminError(null);
      }
      const page = pageArg ?? currentPage;
      const limit = limitArg ?? schoolsPerPage;
      try {
        const token = await getIdToken();
        if (!token) {
          throw new Error('Unable to fetch Firebase token');
        }
        const response = await axios.get<PaginatedAdminSchoolsResponse>(
          `${API}/admin/schools?page=${page}&limit=${limit}`,
          {
            headers: { Authorization: `Bearer ${token}` }
          }
        );
        setAdminSchools(response.data.schools);
        setTotalAdminSchoolsCount(
          response.data.totalCount ??
          response.data.total_count ??
          response.data.schools.length
        );
        setAdminError(null);
      } catch (error) {
        console.error('Failed to load admin schools', error);
        if (showLoading) {
          setAdminError('Unable to load the admin school list. Please try again.');
          toast.error('Unable to load the admin school list. Please try again.');
        }
      } finally {
        if (showLoading) {
          setAdminLoading(false);
        }
      }
    },
    [workspaceUser, getIdToken, currentPage, schoolsPerPage]
  );

  useEffect(() => {
    if (workspaceUser?.role === 'super-admin') {
      void fetchAdminSchools(currentPage, schoolsPerPage);
    } else {
      setAdminSchools([]);
      setAdminError(null);
      setAdminLoading(false);
      setDeletingSchoolId(null);
    }
  }, [workspaceUser, fetchAdminSchools, currentPage, schoolsPerPage]);

  const availablePageSizeOptions = useMemo(() => {
    const total = Math.max(totalAdminSchoolsCount, schoolsPerPage, 5);
    const maxMultiple = Math.ceil(total / 5) * 5;
    const options = new Set<number>(PAGE_SIZE_OPTIONS);
    for (let size = 5; size <= maxMultiple; size += 5) {
      options.add(size);
    }
    return Array.from(options).sort((a, b) => a - b);
  }, [totalAdminSchoolsCount, schoolsPerPage]);

  const handlePageSizeChange = useCallback((value: string) => {
    const nextSize = Number(value);
    if (!Number.isFinite(nextSize) || nextSize <= 0) {
      return;
    }
    setCurrentPage(1);
    setSchoolsPerPage(nextSize);
  }, []);

  useEffect(() => {
    if (!user) {
      return;
    }
    if (typeof window === 'undefined') {
      return;
    }

    const syncDashboards = () => {
      void fetchWorkspace({ showLoading: false });
      if (workspaceUser?.role === 'super-admin') {
        void fetchAdminSchools(undefined, undefined, { showLoading: false });
      }
    };

    window.addEventListener('focus', syncDashboards);

    return () => {
      window.removeEventListener('focus', syncDashboards);
    };
  }, [user, workspaceUser?.role, fetchWorkspace, fetchAdminSchools]);

  useEffect(() => {
    if (allSchoolsForLogos.length === 0) {
      return;
    }

    const directUpdates: Record<string, string> = {};
    const firebaseTargets: SchoolProfile[] = [];

    allSchoolsForLogos.forEach((school) => {
      if (!school.logo_url || logoMap[school.school_id]) {
        return;
      }
      const directUrl = resolveDirectLogoUrl(school.logo_url);
      if (directUrl) {
        directUpdates[school.school_id] = directUrl;
      } else {
        firebaseTargets.push(school);
      }
    });

    if (Object.keys(directUpdates).length > 0) {
      setLogoMap((prev) => ({ ...prev, ...directUpdates }));
    }

    if (firebaseTargets.length === 0) {
      return;
    }

    let cancelled = false;
    const fetchFirebaseLogos = async () => {
      const entries = await Promise.all(
        firebaseTargets.map(async (school) => {
          if (!school.logo_url) {
            return null;
          }
          try {
            const storageRef = ref(storage, school.logo_url);
            const downloadUrl = await getDownloadURL(storageRef);
            return [school.school_id, downloadUrl] as const;
          } catch (error) {
            console.warn('Failed to fetch logo from Firebase storage', { schoolId: school.school_id, error });
            return null;
          }
        })
      );

      const updates: Record<string, string> = {};
      entries.forEach((entry) => {
        if (!entry) {
          return;
        }
        const [schoolId, downloadUrl] = entry;
        updates[schoolId] = downloadUrl;
      });

      if (!cancelled && Object.keys(updates).length > 0) {
        setLogoMap((prev) => ({ ...prev, ...updates }));
      }
    };

    void fetchFirebaseLogos();
    return () => {
      cancelled = true;
    };
  }, [allSchoolsForLogos, logoMap, resolveDirectLogoUrl]);

  const buildFormValues = useCallback(
    (school?: SchoolProfile): SchoolFormValues => {
      const baseValues = buildSchoolFormValuesFromProfile(school);
      return {
        ...baseValues,
        email: school?.email ?? workspaceUser?.email ?? user?.email ?? baseValues.email,
        principal_email:
          school?.principal_email ??
          school?.email ??
          workspaceUser?.email ??
          user?.email ??
          baseValues.principal_email,
        principal_phone: school?.principal_phone ?? school?.phone ?? baseValues.principal_phone
      };
    },
    [workspaceUser, user]
  );

  const currentFormValues = useMemo(() => {
    if (view === 'edit' && editingSchool) {
      return buildFormValues(editingSchool);
    }
    return buildFormValues();
  }, [view, editingSchool, buildFormValues]);
  const filteredAdminSchools = useMemo(() => {
    if (adminSchools.length === 0) {
      return [];
    }
    const normalizedSearch = adminSearch.trim().toLowerCase();
    return adminSchools.filter((school) => {
      const matchesSearch = normalizedSearch
        ? Boolean(
            school.school_name?.toLowerCase().includes(normalizedSearch) ||
              school.school_id?.toLowerCase().includes(normalizedSearch) ||
              school.email?.toLowerCase().includes(normalizedSearch)
          )
        : true;
      const matchesService =
        serviceFilter === 'all' ||
        Boolean(school.service_type && school.service_type.includes(serviceFilter));
      return matchesSearch && matchesService;
    });
  }, [adminSchools, adminSearch, serviceFilter]);
  const adminStats = useMemo(() => {
    const totalSelections = adminSchools.reduce((sum, school) => sum + (school.total_selections || 0), 0);
    const lastUpdated = adminSchools.reduce<Date | null>((latest, school) => {
      const timestamp = school.last_updated ?? school.timestamp;
      if (!timestamp) {
        return latest;
      }
      const nextDate = new Date(timestamp);
      if (!latest || nextDate > latest) {
        return nextDate;
      }
      return latest;
    }, null);
    return {
      totalSelections,
      lastUpdated
    };
  }, [adminSchools]);
  const adminBranchCount = useMemo(
    () => adminSchools.filter((school) => Boolean(school.branch_parent_id)).length,
    [adminSchools]
  );
    const activeAdminSchoolsCount = useMemo(
      () =>
        adminSchools.filter((school) => {
          const status = school.status ?? 'active';
          return status === 'active';
        }).length,
      [adminSchools]
    );
    const inactiveAdminSchoolsCount = Math.max(0, totalAdminSchoolsCount - activeAdminSchoolsCount);
    const adminUserCount = useMemo(() => {
    const userIds = new Set<string>();
    adminSchools.forEach((school) => {
      const identifier = school.created_by_user_id ?? school.created_by_email ?? '';
      if (identifier) {
        userIds.add(identifier);
      }
    });
    return userIds.size;
  }, [adminSchools]);
  const adminBranchChildren = useMemo(() => {
    const counts = new Map<string, number>();
    adminSchools.forEach((school) => {
      const parentId = school.branch_parent_id;
      if (!parentId) {
        return;
      }
      counts.set(parentId, (counts.get(parentId) ?? 0) + 1);
    });
    return counts;
  }, [adminSchools]);
  const formatDate = useCallback((value?: string | Date | null) => {
    if (!value) {
      return 'No activity yet';
    }
    const dateValue = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(dateValue.getTime())) {
      return 'No activity yet';
    }
    return dateValue.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }, []);

  const handleProfileInputChange = (field: 'display_name' | 'email') =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      setProfileForm((prev) => ({ ...prev, [field]: value }));
    };

  const handleProfileSave = useCallback(async () => {
    if (!workspaceUser) {
      return;
    }

    const payload: WorkspaceUserUpdatePayload = {};
    const trimmedName = profileForm.display_name.trim();
    const trimmedEmail = profileForm.email.trim();

    if (trimmedName !== (workspaceUser.display_name ?? '')) {
      payload.display_name = trimmedName;
    }
    if (trimmedEmail !== (workspaceUser.email ?? '')) {
      payload.email = trimmedEmail;
    }

    if (Object.keys(payload).length === 0) {
      setProfileDialogOpen(false);
      return;
    }

    setProfileSubmitting(true);
    try {
      const token = await getIdToken();
      if (!token) {
        throw new Error('Unable to fetch Firebase token');
      }
      const response = await axios.patch<WorkspaceUserProfile>(`${API}/users/me`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setWorkspaceUser(response.data);
      toast.success('Profile updated');
      setProfileDialogOpen(false);
    } catch (error) {
      console.error('Failed to update profile', error);
      toast.error('Unable to update your profile. Please try again.');
    } finally {
      setProfileSubmitting(false);
    }
  }, [workspaceUser, profileForm, getIdToken]);

  const handleSchoolSelect = (school: SchoolProfile) => {
    if (!workspaceUser) {
      return;
    }
    onAuth({ school, user: workspaceUser });
  };

  const handleDownloadBinder = useCallback(
    async (school: SchoolProfile) => {
      try {
        const token = await getIdToken();
        const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
        const response = await axios.get(`${API}/admin/binder-json/${school.school_id}?zip=1`, {
          headers,
          responseType: 'blob'
        });
        const downloadUrl = URL.createObjectURL(response.data);
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = `${school.school_id}-binder.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(downloadUrl);
        toast.success('Binder JSON download started');
      } catch (error) {
        console.error('Failed to download binder JSON', error);
        toast.error('Unable to download binder JSON. Please try again.');
      }
    },
    [getIdToken]
  );

  const handleApproveSelections = useCallback(
    async (school: SchoolProfile) => {
      if (!workspaceUser || workspaceUser.role !== 'super-admin') {
        return;
      }
      setApprovingSchoolId(school.school_id);
      try {
        const token = await getIdToken();
        if (!token) {
          throw new Error('Unable to fetch Firebase token');
        }
        const response = await axios.patch<SchoolProfile>(
          `${API}/admin/schools/${school.school_id}/approve-selections`,
          {},
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const updatedSchool = response.data;
        setAdminSchools((prev) =>
          prev.map((entry) => (entry.school_id === school.school_id ? { ...entry, ...updatedSchool } : entry))
        );
        setSchools((prev) =>
          prev.map((entry) => (entry.school_id === school.school_id ? { ...entry, ...updatedSchool } : entry))
        );
        toast.success('Selections approved and frozen for this school.');
      } catch (error) {
        console.error('Failed to approve selections', error);
        toast.error('Unable to approve selections. Please try again.');
      } finally {
        setApprovingSchoolId(null);
      }
    },
    [workspaceUser, getIdToken]
  );

  const handleBranchSubmit = useCallback(
    async (values: BranchFormValues) => {
      if (!workspaceUser || !branchParent) {
        return;
      }

      const branchName = values.branch_name.trim();
      const coordinatorName = values.coordinator_name.trim();
      const coordinatorEmail = values.coordinator_email.trim();
      const coordinatorPhone = values.coordinator_phone.trim();

      if (branchName.length < BRANCH_NAME_MIN_LENGTH) {
        toast.error(`Branch name must be at least ${BRANCH_NAME_MIN_LENGTH} characters.`);
        return;
      }
      if (coordinatorName.length < COORDINATOR_NAME_MIN_LENGTH) {
        toast.error(`Coordinator name must be at least ${COORDINATOR_NAME_MIN_LENGTH} characters.`);
        return;
      }
      if (!COORDINATOR_EMAIL_PATTERN.test(coordinatorEmail)) {
        toast.error('Please provide a valid coordinator email address.');
        return;
      }
      if (coordinatorPhone.length < COORDINATOR_PHONE_MIN_LENGTH) {
        toast.error(`Coordinator phone must be at least ${COORDINATOR_PHONE_MIN_LENGTH} characters.`);
        return;
      }

      setBranchSubmitting(true);
      try {
        const token = await getIdToken();
        if (!token) {
          throw new Error('Unable to fetch Firebase token');
        }
        const cleanString = (value: string) => value.trim() || undefined;
        const payload = {
          parent_school_id: branchParent.school_id,
          branch_name: branchName,
          coordinator_name: coordinatorName,
          coordinator_email: coordinatorEmail,
          coordinator_phone: coordinatorPhone,
          address: cleanString(values.address),
          city: cleanString(values.city),
          state: cleanString(values.state),
          pin: cleanString(values.pin)
        };
        const response = await axios.post<SchoolProfile>(`${API}/branches`, payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const createdBranch = response.data;
        void fetchWorkspace({ force: true });
        toast.success('Branch created');
        setView('list');
        setBranchParent(null);
      } catch (error) {
        console.error('Failed to create branch', error);
        const serverMessage = getAxiosDetailMessage(error);
        if (serverMessage) {
          toast.error(serverMessage);
        } else {
          toast.error('Unable to create branch. Please try again.');
        }
      } finally {
        setBranchSubmitting(false);
      }
    },
    [branchParent, getIdToken, workspaceUser]
  );

  const handleBranchCancel = useCallback(() => {
    setBranchParent(null);
    setView('list');
  }, []);

  const handleEditSchool = useCallback(
    (school: SchoolProfile) => {
      setEditingSchool(school);
      setView('edit');
    },
    [setView]
  );

  const handleEditBranch = useCallback(
    (branch: SchoolProfile) => {
      setEditingSchool(branch);
      setView('edit');
    },
    [setView]
  );

  const handleBranchStatusChange = useCallback(
    async (branch: SchoolProfile, targetStatus: BranchStatus) => {
      if (!workspaceUser) {
        return;
      }
      if (targetStatus === 'inactive') {
        const confirmed = window.confirm('Are you sure you want to discontinue this branch? This cannot be undone.');
        if (!confirmed) {
          return;
        }
      }
      setBranchStatusUpdatingId(branch.school_id);
      try {
        const token = await getIdToken();
        if (!token) {
          throw new Error('Unable to fetch Firebase token');
        }
        const response = await axios.patch<SchoolProfile>(
          `${API}/schools/${branch.school_id}/status`,
          { status: targetStatus },
          {
            headers: { Authorization: `Bearer ${token}` }
          }
        );
        const updatedBranch = response.data;
        setSchools((prev) => prev.map((school) => (school.school_id === updatedBranch.school_id ? updatedBranch : school)));
        setAdminSchools((prev) =>
          prev.map((school) => (school.school_id === updatedBranch.school_id ? { ...school, ...updatedBranch } : school))
        );
        toast.success(
          targetStatus === 'active' ? 'Branch activated' : 'Branch discontinued'
        );
      } catch (error) {
        console.error('Failed to update branch status', error);
        toast.error(
          `Unable to ${targetStatus === 'active' ? 'activate' : 'discontinue'} branch. Please try again.`
        );
      } finally {
        setBranchStatusUpdatingId(null);
      }
    },
    [getIdToken, setAdminSchools, setSchools, workspaceUser]
  );

  const handleAddBranch = useCallback(
    (school: SchoolProfile) => {
      setBranchParent(school);
      setView('branch');
    },
    [setView, setBranchParent]
  );

  const handleAdminDelete = useCallback(
    async (schoolId: string) => {
      if (!workspaceUser || workspaceUser.role !== 'super-admin') {
        return;
      }
      const confirmed = window.confirm('Are you sure you want to delete this school? This action cannot be undone.');
      if (!confirmed) {
        return;
      }
      setDeletingSchoolId(schoolId);
      try {
        const token = await getIdToken();
        if (!token) {
          throw new Error('Unable to fetch Firebase token');
        }
        await axios.delete(`${API}/admin/schools/${schoolId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        toast.success('School deleted');
        setAdminSchools((prev) => prev.filter((school) => school.school_id !== schoolId));
      } catch (error) {
        console.error('Failed to delete school', error);
        toast.error('Unable to delete school. Please try again.');
      } finally {
        setDeletingSchoolId(null);
      }
    },
    [workspaceUser, getIdToken]
  );

  const handleCreateSubmit = useCallback(
    async ({ values }: SchoolFormSubmitPayload) => {
      if (!workspaceUser) {
        return;
      }
    const serviceStatusAnswered = Object.values(values.service_status).every(
      (status) => status === 'yes' || status === 'no'
    );
    if (!serviceStatusAnswered) {
      toast.error('Please confirm for each service whether you are taking it.');
      return;
    }
      setSubmitting(true);
      try {
        const token = await getIdToken();
        if (!token) {
          throw new Error('Unable to fetch Firebase token');
        }

        const formData = buildSchoolFormData(values);
        const response = await axios.post<SchoolProfile>(`${API}/schools`, formData, {
          headers: { Authorization: `Bearer ${token}` }
        });

        const createdSchool = response.data;
        toast.success('School created successfully');
        setSchools((prev) => [...prev, createdSchool]);
        const updatedUser = {
          ...workspaceUser,
          school_ids: workspaceUser.school_ids.includes(createdSchool.school_id)
            ? workspaceUser.school_ids
            : [...workspaceUser.school_ids, createdSchool.school_id]
        };
        setWorkspaceUser(updatedUser);
        if (workspaceUser.role === 'super-admin') {
          void fetchAdminSchools();
        }
        onAuth({ school: createdSchool, user: updatedUser });
      } catch (error) {
        console.error('Failed to create school', error);
        if (axios.isAxiosError(error) && error.response?.status === 409) {
          toast.error(error.response.data.detail);
        } else {
          toast.error('Unable to create school. Please try again.');
        }
      } finally {
        setSubmitting(false);
      }
    },
    [workspaceUser, getIdToken, onAuth, fetchAdminSchools]
  );

  const handleEditSubmit = useCallback(
    async ({ values }: SchoolFormSubmitPayload) => {
      if (!editingSchool) {
        return;
      }
      const hasSelectedService = Object.values(values.service_status).some(
        (status) => status === 'yes'
      );
      if (!hasSelectedService) {
        toast.error('Please let us know whether you are taking ID cards, report cards, or certificates.');
        return;
      }
      setSubmitting(true);
      try {
        const token = await getIdToken();
        if (!token) {
          throw new Error('Unable to fetch Firebase token');
        }

        const formData = buildSchoolFormData(values);
        const response = await axios.put<SchoolProfile>(`${API}/schools/${editingSchool.school_id}`, formData, {
          headers: { Authorization: `Bearer ${token}` }
        });

        const updatedSchool = response.data;
        toast.success('School details updated');
        setSchools((prev) =>
          prev.map((school) => (school.school_id === updatedSchool.school_id ? updatedSchool : school))
        );
        if (workspaceUser?.role === 'super-admin') {
          setAdminSchools((prev) =>
            prev.map((school) =>
              school.school_id === updatedSchool.school_id ? { ...school, ...updatedSchool } : school
            )
          );
        }
        setEditingSchool(null);
        setView('list');
      } catch (error) {
        console.error('Failed to update school', error);
        if (axios.isAxiosError(error) && error.response?.status === 409) {
          toast.error(error.response.data.detail);
        } else {
          toast.error('Unable to update school. Please try again.');
        }
      } finally {
        setSubmitting(false);
      }
    },
    [editingSchool, getIdToken, workspaceUser]
  );

  const handleGoogleSignIn = async () => {
    try {
      await signInWithGoogle();
    } catch (error) {
      console.error('Failed to start Google sign-in', error);
      toast.error('Google sign-in was cancelled or failed. Please try again.');
    }
  };

  const isSuperAdmin = workspaceUser?.role === 'super-admin';
  const isCreateView = view === 'create' || (!isSuperAdmin && schools.length === 0);
  const isEditView = view === 'edit' && Boolean(editingSchool);
  const isBranchView = view === 'branch' && Boolean(branchParent);

  const renderUserDashboard = () => {
    const { rootSchools, branchMap, orphanBranches } = branchStructure;
    const hasSchools = schools.length > 0;
    const hasRootSchools = rootSchools.length > 0;
    const primarySchool = hasRootSchools ? rootSchools[0] : null;
    const primaryBranches = primarySchool ? branchMap.get(primarySchool.school_id) ?? [] : [];

    return (
      <div className="space-y-6">
        <Card className="border border-slate-200 bg-white shadow-sm">
          <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Signed in as</p>
              <CardTitle className="text-2xl text-slate-900 font-semibold">
                {workspaceUser?.display_name || user?.name || 'School Admin'}
              </CardTitle>
              <p className="text-sm text-slate-600">{workspaceUser?.email}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button
                variant="outline"
                className="border-slate-200 text-slate-700 hover:border-slate-300"
                onClick={() => setProfileDialogOpen(true)}
              >
                <UserRoundPen className="h-4 w-4" />
                Edit profile
              </Button>
              <Button
                variant="outline"
                className="border-rose-200 text-rose-700 hover:border-rose-300"
                onClick={onLogout}
              >
                Logout
              </Button>
            </div>
          </CardHeader>
          <div className="h-1 w-28 rounded-full bg-gradient-to-r from-sky-300 via-cyan-200 to-emerald-200 mx-auto md:mx-0" aria-hidden="true" />
          <CardContent className="space-y-6">
            {!hasSchools ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-8 text-center text-slate-500">
                <p>No schools found yet.</p>
                <Button className="mt-4 border border-slate-300 text-slate-700 bg-white" onClick={() => setView('create')}>
                  Create your first school
                </Button>
              </div>
            ) : (
              <>
                {!hasRootSchools ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-8 text-center text-slate-500">
                    <p>No parent school profiles found yet.</p>
                    <Button className="mt-4 border border-slate-300 text-slate-700 bg-white" onClick={() => setView('create')}>
                      Create a parent school
                    </Button>
                  </div>
                ) : primarySchool ? (
                  <div className="space-y-5">
                    <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-6 shadow-inner">
                      <div className="flex items-center gap-4">
                        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-sky-100 to-emerald-100 text-slate-700 shadow">
                          {getLogoSrc(primarySchool, logoMap) ? (
                            <img
                              src={getLogoSrc(primarySchool, logoMap)}
                              alt={primarySchool.school_name}
                              className="h-14 w-14 rounded-full object-cover"
                            />
                          ) : (
                            <School className="h-6 w-6" />
                          )}
                        </div>
                        <div>
                          <CardTitle className="text-xl text-slate-900">{primarySchool.school_name}</CardTitle>
                          <p className="text-xs uppercase tracking-wide text-slate-500">ID: {primarySchool.school_id}</p>
                        </div>
                      </div>
                      <div className="mt-4 space-y-1 text-sm text-slate-600">
                        {primarySchool.email && <p>Email: {primarySchool.email}</p>}
                        {primarySchool.phone && <p>Phone: {primarySchool.phone}</p>}
                        {primarySchool.address && <p className="line-clamp-2">Address: {primarySchool.address}</p>}
                        {primarySchool.tagline && <p className="italic text-slate-500">{primarySchool.tagline}</p>}
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          className="flex items-center gap-2 border-slate-200 text-slate-700 hover:border-slate-300"
                          onClick={() => handleSchoolSelect(primarySchool)}
                        >
                          <Eye className="h-4 w-4" />
                          View
                        </Button>
                        <Button
                          variant="outline"
                          className="flex items-center gap-2 border-amber-200 text-amber-700 hover:border-amber-300"
                          onClick={() => handleEditSchool(primarySchool)}
                        >
                          <Edit3 className="h-4 w-4" />
                          Edit
                        </Button>
                      </div>
                      <div className="mt-5 space-y-3 rounded-2xl border border-slate-100 bg-white/70 p-4">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-slate-700">Branches ({primaryBranches.length})</p>
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex items-center gap-1 border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:border-emerald-300"
                            onClick={() => {
                              if (primarySchool) handleAddBranch(primarySchool);
                            }}
                          >
                            <Plus className="h-4 w-4" />
                            Add branch
                          </Button>
                        </div>
                        {primaryBranches.length === 0 ? (
                          <p className="text-xs text-slate-500">No branches yet.</p>
                        ) : (
                          <div className="grid gap-3 sm:grid-cols-2">
                            {primaryBranches.map((branch) => {
                              const branchAddress = formatBranchAddress(branch);
                              const branchStatus = branch.status ?? 'active';
                              const isActive = branchStatus === 'active';
                              const isUpdating = branchStatusUpdatingId === branch.school_id;
                              return (
                                <div
                                  key={branch.school_id}
                                  className={cn(
                                    'rounded-2xl border p-3 transition-colors',
                                    isActive ? 'border-slate-200 bg-slate-50/70' : 'border-rose-200 bg-rose-50/80'
                                  )}
                                >
                                  <div className="flex items-center justify-between gap-3">
                                    <div>
                                      <p className="text-sm font-semibold text-slate-900">{branch.school_name}</p>
                                      <p className="text-xs text-slate-500">ID: {branch.school_id}</p>
                                    </div>
                                  </div>
                                  <div className="mt-2 space-y-1 text-xs text-slate-500">
                                    {branch.principal_name && <p>Coordinator: {branch.principal_name}</p>}
                                    {branch.principal_email && <p>Email: {branch.principal_email}</p>}
                                    {branch.principal_phone && <p>Phone: {branch.principal_phone}</p>}
                                    {branchAddress && <p>Address: {branchAddress}</p>}
                                  </div>
                                  {!isActive && (
                                    <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-rose-700">
                                      Status: inactive
                                    </p>
                                  )}
                                  <div className="mt-4 flex flex-wrap gap-2">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:border-emerald-300"
                                      onClick={() => handleEditBranch(branch)}
                                      disabled={isUpdating}
                                    >
                                      <Edit3 className="h-4 w-4" />
                                      Edit
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 hover:border-amber-300"
                                      onClick={() => handleSchoolSelect(branch)}
                                    >
                                      <Eye className="h-4 w-4" />
                                      View
                                    </Button>
                                    {isActive ? (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 hover:border-rose-300 shadow-sm"
                                        onClick={() => handleBranchStatusChange(branch, 'inactive')}
                                        disabled={isUpdating}
                                      >
                                        <Trash2 className="h-4 w-4" />
                                        Discontinue
                                      </Button>
                                    ) : (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:border-emerald-300"
                                        onClick={() => handleBranchStatusChange(branch, 'active')}
                                        disabled={isUpdating}
                                      >
                                        <Eye className="h-4 w-4" />
                                        Activate
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : null}
                {orphanBranches.length > 0 && (
                  <Card className="border border-slate-100 bg-white/80 shadow-sm">
                    <CardHeader className="space-y-2">
                      <CardTitle className="text-lg text-slate-900">Branches without a parent school</CardTitle>
                      <p className="text-sm text-slate-500">
                        These branches reference a school that is not currently listed in your workspace.
                      </p>
                    </CardHeader>
                    <CardContent className="grid gap-3 sm:grid-cols-2">
                      {orphanBranches.map((branch) => {
                        const branchAddress = formatBranchAddress(branch);
                        return (
                          <div
                            key={branch.school_id}
                            className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-slate-900">{branch.school_name}</p>
                                <p className="text-xs text-slate-500">ID: {branch.school_id}</p>
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                className="border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 hover:border-sky-300"
                                onClick={() => handleSchoolSelect(branch)}
                              >
                                <Eye className="h-4 w-4" />
                                View
                              </Button>
                            </div>
                            <p className="text-xs text-slate-500">Parent ID: {branch.branch_parent_id}</p>
                            <div className="mt-2 space-y-1 text-xs text-slate-500">
                              {branch.principal_name && <p>Coordinator: {branch.principal_name}</p>}
                              {branch.principal_email && <p>Email: {branch.principal_email}</p>}
                              {branch.principal_phone && <p>Phone: {branch.principal_phone}</p>}
                              {branchAddress && <p>Address: {branchAddress}</p>}
                            </div>
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    );
  };

  const renderAdminDashboard = () => {
    const serviceFilterOptions: { label: string; value: AdminServiceFilter }[] = [
      { label: 'All services', value: 'all' },
      ...SERVICE_KEYS.map((key) => ({ value: key, label: SERVICE_LABELS[key] }))
    ];
    const schoolsToRender = filteredAdminSchools;
    const emptyStateMessage =
      adminSchools.length === 0 ? 'No schools available yet.' : 'No schools match the current filters.';
    const totalPages = Math.max(1, Math.ceil(totalAdminSchoolsCount / schoolsPerPage));

    return (
      <div className="space-y-6">
        <Card className="border border-slate-200 bg-white shadow-sm">
        <CardHeader className="space-y-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Super admin</p>
                <CardTitle className="text-3xl font-semibold text-slate-900">
                  {workspaceUser?.display_name || user?.name || 'Admin'}
                </CardTitle>
                <p className="text-sm text-slate-600">{workspaceUser?.email}</p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button
                  variant="outline"
                  className="border-slate-200 text-slate-700 hover:border-slate-300"
                  onClick={() => setProfileDialogOpen(true)}
                >
                  <UserRoundPen className="h-4 w-4" />
                  Edit profile
                </Button>
                <Button
                  variant="outline"
                  className="border-rose-200 text-rose-700 hover:border-rose-300"
                  onClick={onLogout}
                >
                  <LogOut className="h-4 w-4" />
                  Logout
                </Button>
                <Button asChild variant="outline" className="border-slate-200 text-slate-700 hover:border-slate-300">
                  <Link to="/admin/upload">Admin tools</Link>
                </Button>
                <Button
                  className="bg-slate-900 text-white hover:bg-slate-800"
                  onClick={() => {
                    setEditingSchool(null);
                    setView('create');
                  }}
                >
                  <Plus className="h-4 w-4" />
                  Create school
                </Button>
            </div>
          </div>
        </CardHeader>
            <div className="h-1 w-32 rounded-full bg-gradient-to-r from-sky-300 via-cyan-100 to-emerald-200" aria-hidden="true" />
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-5">
              <p className="text-sm text-slate-500">Total selections</p>
              <p className="text-3xl font-semibold text-slate-900">{adminStats.totalSelections}</p>
              <span className="mt-2 inline-flex items-center gap-1 text-xs text-slate-500">
                <TrendingUp className="h-3.5 w-3.5" />
                Last update {formatDate(adminStats.lastUpdated)}
              </span>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-5">
              <p className="text-sm text-slate-500">Total schools</p>
              <p className="text-3xl font-semibold text-slate-900">{totalAdminSchoolsCount}</p>
              <span className="mt-2 inline-flex items-center gap-1 text-xs text-slate-500">
                <School className="h-3.5 w-3.5" />
                All schools currently listed
              </span>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-100 bg-emerald-50 p-4">
                  <p className="text-xs uppercase tracking-wide text-emerald-700">Active schools</p>
                  <p className="text-2xl font-semibold text-emerald-900">{activeAdminSchoolsCount}</p>
                </div>
                <div className="rounded-2xl border border-slate-100 bg-rose-50 p-4">
                  <p className="text-xs uppercase tracking-wide text-rose-700">Inactive schools</p>
                  <p className="text-2xl font-semibold text-rose-900">{inactiveAdminSchoolsCount}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-slate-200 bg-white shadow-sm">
          <CardHeader className="space-y-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="Search by school name, email, or ID"
                  className="pl-10 border border-slate-200 bg-slate-50 focus:border-slate-300"
                  value={adminSearch}
                  onChange={(event) => setAdminSearch(event.target.value)}
                />
              </div>
              <div className="flex flex-wrap items-center gap-4 rounded-2xl bg-slate-100 px-4 py-3 shadow-sm">
                <span className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                  Filter by service
                </span>
                <Select
                  value={serviceFilter}
                  onValueChange={(value) => setServiceFilter(value as AdminServiceFilter)}
                >
                  <SelectTrigger className="w-48 rounded-2xl border border-slate-200 bg-white px-3 shadow-sm">
                    <SelectValue placeholder="All services" />
                  </SelectTrigger>
                  <SelectContent className="border border-slate-100 bg-white shadow-lg">
                    {serviceFilterOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="border-slate-200 text-slate-700 hover:border-slate-300"
                  onClick={() => {
                    void fetchAdminSchools(currentPage, schoolsPerPage);
                  }}
                  disabled={adminLoading}
                >
                  <RefreshCw className={`h-4 w-4 ${adminLoading ? 'animate-spin' : ''}`} />
                  Sync now
                </Button>
              </div>
            </div>
            {adminError && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{adminError}</div>
            )}
          </CardHeader>
          <CardContent className="space-y-5">
            {adminLoading ? (
              <div className="flex items-center justify-center gap-3 rounded-xl border border-dashed border-slate-200 px-6 py-10 text-slate-600">
                <Loader2 className="h-5 w-5 animate-spin text-slate-700" />
                Fetching the latest schools…
              </div>
            ) : schoolsToRender.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 px-6 py-12 text-center text-slate-500">
                {emptyStateMessage}
              </div>
            ) : (
              <>
                <div className="overflow-x-auto rounded-2xl border border-slate-100">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                          School
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Services
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                          User
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Branches
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Status
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Selections
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Grades
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Last updated
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {schoolsToRender.map((school) => {
                        const logoSrc = getLogoSrc(school, logoMap);
                        const gradeCount = Object.values(school.grades || {}).filter((grade) => grade.enabled).length;
                        const isDeleting = deletingSchoolId === school.school_id;
                        const branchStatus = school.status ?? 'active';
                        const isBranch = Boolean(school.branch_parent_id);
                        const isBranchUpdating = branchStatusUpdatingId === school.school_id;
                        const isApproved = isSchoolApproved(school);
                        const isApproving = approvingSchoolId === school.school_id;
                        const services = school.service_type ?? [];

                        return (
                          <tr key={school.school_id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-4">
                              <div className="flex items-center gap-3">
                                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-50 text-slate-500">
                                  {logoSrc ? (
                                    <img
                                      src={logoSrc}
                                      alt={school.school_name}
                                      className="h-11 w-11 rounded-full object-cover"
                                    />
                                  ) : (
                                    <School className="h-5 w-5" />
                                  )}
                                </div>
                                <div>
                                  <div className="font-semibold text-slate-900">{school.school_name}</div>
                                  <p className="text-xs text-slate-500">ID: {school.school_id}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-4">
                              <div className="flex flex-wrap gap-1">
                                {services.length === 0
                                  ? '—'
                                  : services.map((service) => (
                                      <span
                                        key={service}
                                        className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600"
                                      >
                                        {SERVICE_LABELS[service]}
                                      </span>
                                    ))}
                              </div>
                            </td>
                            <td className="px-4 py-4 text-slate-700">
                              <p className="font-semibold text-slate-900">
                                {school.created_by_email ?? school.created_by_user_id ?? '—'}
                              </p>
                              <p className="text-xs uppercase tracking-wide text-slate-400">
                                {school.created_by_email ? 'Email' : school.created_by_user_id ? 'User' : '—'}
                              </p>
                            </td>
                            <td className="px-4 py-4 text-slate-700">
                              {school.branch_parent_id ? (
                                <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                                  Child of {school.branch_parent_id}
                                </span>
                              ) : (
                                <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800">
                                  {adminBranchChildren.get(school.school_id) ?? 0} branch
                                  {(adminBranchChildren.get(school.school_id) ?? 0) === 1 ? '' : 'es'}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-4">
                              <span
                                className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                                  branchStatus === 'active'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-rose-50 text-rose-700'
                                }`}
                              >
                                {branchStatus === 'active' ? 'Active' : 'Inactive'}
                              </span>
                            </td>
                            <td className="px-4 py-4 text-slate-700">
                              <div className="flex items-center gap-2">
                                <span>{school.total_selections ?? 0}</span>
                                {isApproved && (
                                  <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                                    Frozen
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-4 text-slate-700">{gradeCount}</td>
                            <td className="px-4 py-4 text-slate-700">
                              {formatDate(school.last_updated ?? school.timestamp ?? null)}
                            </td>
                            <td className="px-4 py-4">
                              <DropdownMenu>
                                <DropdownMenuTrigger
                                  className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-white shadow hover:bg-slate-800"
                                  aria-label="More actions"
                                >
                                  <MoreVertical className="h-4 w-4" />
                                </DropdownMenuTrigger>
                                <DropdownMenuContent
                                  align="end"
                                  className="w-48 rounded-2xl border border-slate-100 bg-white shadow-lg"
                                >
                                  <DropdownMenuItem onClick={() => handleSchoolSelect(school)}>
                                    View
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => {
                                      setEditingSchool(school);
                                      setView('edit');
                                    }}
                                  >
                                    Edit
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => {
                                      void handleApproveSelections(school);
                                    }}
                                    disabled={isApproved || isApproving}
                                  >
                                    {isApproved ? 'Selections approved' : isApproving ? 'Approving...' : 'Approve selections'}
                                  </DropdownMenuItem>
                                  {school.branch_parent_id ? (
                                    branchStatus === 'inactive' ? (
                                      <DropdownMenuItem
                                        onClick={() => handleBranchStatusChange(school, 'active')}
                                        disabled={isBranchUpdating}
                                      >
                                        Activate
                                      </DropdownMenuItem>
                                    ) : (
                                      <DropdownMenuItem
                                        onClick={() => handleBranchStatusChange(school, 'inactive')}
                                        disabled={isBranchUpdating}
                                        className="text-rose-600"
                                      >
                                        Discontinue
                                      </DropdownMenuItem>
                                    )
                                  ) : (
                                    <DropdownMenuItem
                                      onClick={() => {
                                        void handleAdminDelete(school.school_id);
                                      }}
                                      disabled={deletingSchoolId === school.school_id}
                                      className="text-red-600"
                                    >
                                      Delete
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuItem onClick={() => handleDownloadBinder(school)}>
                                    Binder JSON
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-slate-200 text-slate-700 hover:border-slate-300"
                      onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                    >
                      Previous
                    </Button>
                    <div className="text-sm font-medium text-slate-700">
                      Page {currentPage} of {totalPages}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-slate-200 text-slate-700 hover:border-slate-300"
                      onClick={() =>
                        setCurrentPage((prev) => Math.min(totalPages, prev + 1))
                      }
                      disabled={currentPage === totalPages}
                    >
                      Next
                    </Button>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span>Rows per page</span>
                    <Select
                      value={String(schoolsPerPage)}
                      onValueChange={handlePageSizeChange}
                    >
                      <SelectTrigger className="w-20 rounded-2xl border border-slate-200 bg-white px-2 py-1 text-xs shadow-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="border border-slate-100 bg-white shadow-lg">
                        {availablePageSizeOptions.map((option) => (
                          <SelectItem key={option} value={String(option)}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    );
  };

  if (authLoading) {
    return <div className="flex min-h-screen items-center justify-center text-lg">Loading session...</div>;
  }

  if (!user) {
    const isProcessing = authLoading;
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-red-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-2xl border-0 bg-white/80 backdrop-blur-sm">
          <CardHeader className="text-center pb-8">
            <div className="w-20 h-20 bg-gradient-to-r from-orange-400 to-red-400 rounded-full flex items-center justify-center mx-auto mb-4">
              <School className="w-10 h-10 text-white" />
            </div>
            <CardTitle className="text-2xl font-bold text-gray-800 mb-2">Personalised Curriculum Generator</CardTitle>
            <p className="text-gray-600 text-sm">Sign in with your Google account to continue</p>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <Button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isProcessing}
                className="w-full h-12 bg-white text-gray-800 border border-gray-200 hover:bg-gray-50 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all duration-200 disabled:opacity-70"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin text-primary-600" />
                    Getting your workspace ready...
                  </>
                ) : (
                  <>
                    <svg className="h-5 w-5" viewBox="0 0 533.5 544.3" xmlns="http://www.w3.org/2000/svg">
                      <path fill="#4285f4" d="M533.5 278.4c0-17.4-1.6-34.1-4.6-50.2H272v95.1h147.3c-6.4 34.7-25.6 64.1-54.6 83.7v68h88.4c51.7-47.6 80.4-117.8 80.4-196.6z" />
                      <path fill="#34a853" d="M272 544.3c73.8 0 135.8-24.5 181.1-66.3l-88.4-68c-24.5 16.4-55.7 26-92.7 26-71.3 0-131.7-48.2-153.4-113.1H28.1v70.9c45 87 137 150.5 243.9 150.5z" />
                      <path fill="#fbbc04" d="M118.6 322.9c-8.6-25.4-8.6-52.6 0-78l.1-70.9H28.1C3.1 208.5-7.5 250.6-7.5 294s10.6 85.4 35.6 120.1l90.5-69.1z" />
                      <path fill="#ea4335" d="M272 107.7c39.9-.6 78.3 14.6 107.5 41.6l80-80C417.6 24.2 346.5-3.5 272 0 165.1 0 73.1 63.5 28.1 150.5l90.5 70.9C140.3 155.9 200.7 107.7 272 107.7z" />
                    </svg>
                    Continue with Google
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (workspaceLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-amber-50 via-orange-50 to-red-50">
        <div className="flex items-center gap-3 rounded-xl bg-white/90 px-6 py-4 shadow-lg">
          <Loader2 className="h-5 w-5 animate-spin text-primary-600" />
          <p className="text-gray-700">Loading your workspace…</p>
        </div>
      </div>
    );
  }

  if (workspaceError) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-red-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md border-0 bg-white/90">
          <CardHeader>
            <CardTitle className="text-xl text-gray-800">Something went wrong</CardTitle>
            <p className="text-gray-600 text-sm">{workspaceError}</p>
          </CardHeader>
          <CardFooter>
            <Button onClick={() => fetchWorkspace()}>Try again</Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  if (!workspaceUser) {
    return null;
  }

  const dashboardContent = isSuperAdmin ? renderAdminDashboard() : renderUserDashboard();

  return (
    <div className="min-h-screen bg-slate-50 flex items-start justify-center px-4 py-10">
      <div className="w-full max-w-6xl space-y-6">
        {isSuperAdmin && view !== 'list' && (
          <div className="flex justify-end">
            <Button
              variant="outline"
              className="border-rose-200 text-rose-700 hover:border-rose-300"
              onClick={onLogout}
            >
              <LogOut className="h-4 w-4" />
              Logout
            </Button>
          </div>
        )}
        {isCreateView ? (
          <div className="w-full max-w-4xl">
            <SchoolForm
              mode="create"
              initialValues={currentFormValues}
              submitting={submitting}
              onSubmit={handleCreateSubmit}
              onCancel={isSuperAdmin || schools.length > 0 ? () => setView('list') : undefined}
            />
          </div>
        ) : isEditView && editingSchool ? (
          <div className="w-full max-w-4xl">
            <SchoolForm
              mode="edit"
              initialValues={currentFormValues}
              submitting={submitting}
              onSubmit={handleEditSubmit}
              onCancel={() => {
                setEditingSchool(null);
                setView('list');
              }}
            />
          </div>
        ) : isBranchView && branchParent ? (
          <div className="w-full max-w-4xl">
            <BranchForm
              parentSchool={branchParent}
              submitting={branchSubmitting}
              onSubmit={handleBranchSubmit}
              onCancel={handleBranchCancel}
            />
          </div>
        ) : (
          <div className="w-full">{dashboardContent}</div>
        )}
      </div>
      <Dialog
        open={profileDialogOpen}
        onOpenChange={(open) => {
          if (!profileSubmitting) {
            setProfileDialogOpen(open);
          }
        }}
        className="z-50"
      >
        <DialogContent>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void handleProfileSave();
            }}
            className="space-y-6"
          >
            <DialogHeader>
              <DialogTitle>Edit profile</DialogTitle>
              <p className="text-sm text-slate-500">Update the name and email associated with your workspace.</p>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="profile_name">Display name</Label>
                <Input
                  id="profile_name"
                  value={profileForm.display_name}
                  onChange={handleProfileInputChange('display_name')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="profile_email">Email</Label>
                <Input
                  id="profile_email"
                  type="email"
                  required
                  value={profileForm.email}
                  onChange={handleProfileInputChange('email')}
                />
              </div>
            </div>
            <DialogFooter className="flex gap-3">
              <Button type="button" variant="outline" onClick={() => setProfileDialogOpen(false)} disabled={profileSubmitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={profileSubmitting}>
                {profileSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AuthPage;
