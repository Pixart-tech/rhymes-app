import { cn } from '@/lib/utils';
import axios from 'axios';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import {
  GradeKey,
  GradeMap,
  SchoolFormValues,
  SchoolProfile,
  SchoolServiceType,
  ServiceStatus,
  ServiceStatusMap,
} from '../types/types';
import ImageCropperDialog from './ImageCropper';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';

const getLogoPreview = (vals: SchoolFormValues) => vals.logo_url || '';
const TOTAL_SECTIONS = 3;
const DEFAULT_GRADE_LABELS: Record<GradeKey, string> = {
  playgroup: 'Playgroup',
  nursery: 'Nursery',
  lkg: 'LKG',
  ukg: 'UKG'
};
const GRADE_RENDER_ORDER: GradeKey[] = ['playgroup', 'nursery', 'lkg', 'ukg'];
const formatGradeLabelTitle = (grade: GradeKey): string => {
  if (grade === 'lkg' || grade === 'ukg') {
    return grade.toUpperCase();
  }
  return grade.charAt(0).toUpperCase() + grade.slice(1);
};

const SERVICE_OPTIONS: { value: SchoolServiceType; prompt: string }[] = [
  { value: 'id_cards', prompt: 'Are you taking ID cards?'},
  { value: 'report_cards', prompt: 'Are you taking report cards?'},
  { value: 'certificates', prompt: 'Are you taking certificates?' }
];

const ID_CARD_FIELD_OPTIONS = [
  'Student Name',
  'Class',
  'Student Image',
  'Date of Birth',
  'Father name',
  'Father number',
  'Father image',
  'Mother name',
  'Mother number',
  'Mother image',
  'Address',
  'Student Age',
  'Student Blood group',
  'Admission Number',
  'Roll number'
];
const MAX_ID_CARD_FIELDS = 10;

export const SCHOOL_SERVICE_KEYS: SchoolServiceType[] = ['id_cards', 'report_cards', 'certificates'];

const createDefaultServiceStatus = (): ServiceStatusMap => ({
  id_cards: '',
  report_cards: '',
  certificates: ''
});

const buildServiceStatusFromProfile = (profile?: SchoolProfile | null): ServiceStatusMap => {
  const base = createDefaultServiceStatus();
  if (profile?.service_status) {
    for (const key of SCHOOL_SERVICE_KEYS) {
      const value = profile.service_status[key];
      if (value === 'yes' || value === 'no') {
        base[key] = value;
      }
    }
  } else if (profile?.service_type) {
    for (const service of profile.service_type) {
      if (SCHOOL_SERVICE_KEYS.includes(service)) {
        base[service] = 'yes';
      }
    }
  }
  return base;
};

const createDefaultGradeMap = (): GradeMap => {
  return GRADE_RENDER_ORDER.reduce((acc, grade) => {
    acc[grade] = { enabled: false, label: '' };
    return acc;
  }, {} as GradeMap);
};

const buildGradeMapFromProfile = (profile?: SchoolProfile | null): GradeMap => {
  const base = createDefaultGradeMap();
  if (profile?.grades) {
    for (const grade of GRADE_RENDER_ORDER) {
      const entry = profile.grades[grade];
      if (entry) {
        base[grade] = {
          enabled: Boolean(entry.enabled),
          label: entry.label?.trim() ?? ''
        };
      }
    }
  }
  return base;
};

export const buildSchoolFormValuesFromProfile = (
  profile?: SchoolProfile | null
): SchoolFormValues => {
  return {
    school_name: profile?.school_name ?? '',
    logo_url: profile?.logo_url ?? null,
    logo_file: null,
    email: profile?.email ?? '',
    phone: profile?.phone ?? '',
    address: profile?.address ?? '',
    city: profile?.city ?? '',
    state: profile?.state ?? '',
    pin: profile?.pin ?? '',
    tagline: profile?.tagline ?? '',
    website: profile?.website ?? '',
    principal_name: profile?.principal_name ?? '',
    principal_email: profile?.principal_email ?? '',
    principal_phone: profile?.principal_phone ?? '',
    service_status: buildServiceStatusFromProfile(profile),
    grades: buildGradeMapFromProfile(profile),
    id_card_fields: profile?.id_card_fields ?? []
  };
};

export const buildSchoolFormData = (values: SchoolFormValues): FormData => {
  const formData = new FormData();
  formData.append('school_name', values.school_name);
  formData.append('email', values.email);
  formData.append('phone', values.phone);
  formData.append('address', values.address);
  formData.append('city', values.city);
  formData.append('state', values.state);
  formData.append('pin', values.pin);
  formData.append('tagline', values.tagline ?? '');
  formData.append('website', values.website ?? '');
  formData.append('principal_name', values.principal_name);
  formData.append('principal_email', values.principal_email);
  formData.append('principal_phone', values.principal_phone);
  const normalizedServiceStatus = Object.fromEntries(
    Object.entries(values.service_status).map(([key, value]) => [key, value || 'no'])
  );
  formData.append('service_status', JSON.stringify(normalizedServiceStatus));
  formData.append('grades', JSON.stringify(values.grades));
  formData.append('id_card_fields', JSON.stringify(values.id_card_fields));
  if (values.logo_file) {
    formData.append('logo_file', values.logo_file);
  }
  return formData;
};

export interface SchoolFormSubmitPayload {
  values: SchoolFormValues;
}

interface AddressFields {
  line1: string;
  city: string;
  state: string;
  pin: string;
}



const composeAddress = (
  line1: string,
  city: string,
  state: string,
  pin: string
): string => {
  const segments: string[] = [];
  if (line1.trim()) {
    segments.push(line1.trim());
  }
  if (city.trim()) {
    segments.push(city.trim());
  }
  const stateSegment = state.trim();
  const pinSegment = pin.trim();
  if (stateSegment || pinSegment) {
    segments.push(
      pinSegment ? `${stateSegment}${stateSegment ? ' - ' : ''}${pinSegment}`.trim() : stateSegment
    );
  }
  return segments.join(', ');
};

export interface SchoolFormProps {
  mode: 'create' | 'edit';
  initialValues: SchoolFormValues;
  submitting: boolean;
  onSubmit: (payload: SchoolFormSubmitPayload) => Promise<void> | void;
  onCancel?: () => void;
  onBackToHome?: () => void;
  isSuperAdmin?: boolean;
  checkEmailAvailability?: (email: string) => Promise<boolean>;
}

export const SchoolForm: React.FC<SchoolFormProps> = ({
  mode,
  initialValues,
  submitting,
  onSubmit,
  onCancel,
  onBackToHome,
  isSuperAdmin,
  checkEmailAvailability,
}) => {
  const [values, setValues] = useState<SchoolFormValues>(initialValues);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string>(getLogoPreview(initialValues));
  const logoPreviewUrlRef = useRef<string | null>(null);
  const imageSrcUrlRef = useRef<string | null>(null);
  const [isCompressingLogo, setIsCompressingLogo] = useState(false);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [currentSection, setCurrentSection] = useState(1);
  const [linkPrincipalEmail, setLinkPrincipalEmail] = useState(
    Boolean(initialValues.email && initialValues.email === initialValues.principal_email)
  );
  const [linkPrincipalPhone, setLinkPrincipalPhone] = useState(
    Boolean(initialValues.phone && initialValues.phone === initialValues.principal_phone)
  );
  const [invalidFields, setInvalidFields] = useState(new Set<string>());
  const [idFieldDialogOpen, setIdFieldDialogOpen] = useState(false);
  const [customIdField, setCustomIdField] = useState('');
  const [showCustomFieldInput, setShowCustomFieldInput] = useState(false);
  const [idFieldDialogSkipped, setIdFieldDialogSkipped] = useState(false);
  const prevIdCardStatus = useRef(initialValues.service_status.id_cards);
  const [isEmailChecking, setIsEmailChecking] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
 
  useEffect(() => {
    setValues(initialValues);
    setLogoPreviewUrl(getLogoPreview(initialValues));
    setLinkPrincipalEmail(Boolean(initialValues.email && initialValues.email === initialValues.principal_email));
    setLinkPrincipalPhone(Boolean(initialValues.phone && initialValues.phone === initialValues.principal_phone));
    setCurrentSection(1);
    setInvalidFields(new Set());
  }, [initialValues]);

  useEffect(() => {
    if (linkPrincipalEmail) {
      setValues((prev) => ({ ...prev, principal_email: prev.email }));
    }
  }, [linkPrincipalEmail, values.email]);

  useEffect(() => {
    if (linkPrincipalPhone) {
      setValues((prev) => ({ ...prev, principal_phone: prev.phone }));
    }
  }, [linkPrincipalPhone, values.phone]);

  useEffect(() => {
    setEmailError(null);
    setInvalidFields((prev) => {
      if (!prev.has('email')) {
        return prev;
      }
      const next = new Set(prev);
      next.delete('email');
      return next;
    });
  }, [values.email]);

  useEffect(() => {
    if (values.logo_file) {
      const previewUrl = URL.createObjectURL(values.logo_file);
      if (logoPreviewUrlRef.current) {
        URL.revokeObjectURL(logoPreviewUrlRef.current);
      }
      logoPreviewUrlRef.current = previewUrl;
      setLogoPreviewUrl(previewUrl);

      return () => {
        if (logoPreviewUrlRef.current === previewUrl) {
          URL.revokeObjectURL(previewUrl);
          logoPreviewUrlRef.current = null;
        }
      };
    }

    if (logoPreviewUrlRef.current) {
      URL.revokeObjectURL(logoPreviewUrlRef.current);
      logoPreviewUrlRef.current = null;
    }
    setLogoPreviewUrl(values.logo_url ?? '');
  }, [values.logo_file, values.logo_url]);

    const handleInputChange =
    (field: keyof SchoolFormValues) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const value = event.target.value;
      setValues((prev) => ({ ...prev, [field]: value }));
    };

const handleAddressFieldChange =
  (field: keyof Pick<SchoolFormValues, 'address' | 'city' | 'state' | 'pin'>) =>
  (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setValues((prev) => ({ ...prev, [field]: value }));
  };
  const handleGradeLabelChange =
    (grade: GradeKey) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const value = event.target.value;
      setValues((prev) => ({
        ...prev,
        grades: {
          ...prev.grades,
          [grade]: {
            ...prev.grades[grade],
            label: value
          }
        }
      }));
    };

  const handleGradeEnabledChange = (grade: GradeKey, checked: boolean) => {
    setValues((prev) => {
      const current = prev.grades[grade];
      return {
        ...prev,
        grades: {
          ...prev.grades,
          [grade]: {
            enabled: checked,
            label: checked ? current.label || DEFAULT_GRADE_LABELS[grade] : ''
          }
        }
      };
    });
  };

  const handleCropperClose = useCallback(() => {
    if (imageSrcUrlRef.current) {
      URL.revokeObjectURL(imageSrcUrlRef.current);
      imageSrcUrlRef.current = null;
    }
    setImageSrc(null);
  }, [setImageSrc]);

  const handleLogoChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const input = event.target;
      const file = input?.files?.[0] ?? null;
      if (!file) {
        handleCropperClose();
        return;
      }

      const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg'];
      if (!allowedTypes.includes(file.type)) {
        toast.error('Invalid file type. Please select a PNG or JPEG image.');
        handleCropperClose();
        setValues((prev) => ({ ...prev, logo_file: null }));
        input.value = '';
        return;
      }

      const maxSizeInBytes = 20 * 1024 * 1024; // 20MB
      if (file.size > maxSizeInBytes) {
        toast.error('File is too large. Please select an image smaller than 20MB.');
        handleCropperClose();
        setValues((prev) => ({ ...prev, logo_file: null }));
        input.value = '';
        return;
      }

      if (imageSrcUrlRef.current) {
        URL.revokeObjectURL(imageSrcUrlRef.current);
      }

      const objectUrl = URL.createObjectURL(file);
      imageSrcUrlRef.current = objectUrl;
      setImageSrc(objectUrl);
      input.value = '';
    },
    [handleCropperClose]
  );

  const onCropComplete = useCallback(
    async (croppedImage: Blob) => {
      const file = new File([croppedImage], 'logo.png', { type: 'image/png' });
      setValues((prev) => ({ ...prev, logo_file: file, logo_url: null }));
    },
    []
  );

  const handleDialogDone = useCallback(() => {
    setIdFieldDialogOpen(false);
    setShowCustomFieldInput(false);
  }, []);

  const handleDialogSkip = useCallback(() => {
    setIdFieldDialogSkipped(true);
    setIdFieldDialogOpen(false);
    setShowCustomFieldInput(false);
  }, []);

  useEffect(() => {
    return () => {
      if (imageSrcUrlRef.current) {
        URL.revokeObjectURL(imageSrcUrlRef.current);
        imageSrcUrlRef.current = null;
      }
      if (logoPreviewUrlRef.current) {
        URL.revokeObjectURL(logoPreviewUrlRef.current);
        logoPreviewUrlRef.current = null;
      }
    };
  }, []);

  const handleServiceSelection = (service: SchoolServiceType, status: ServiceStatus) => {
    setValues((prev) => ({
      ...prev,
      service_status: {
        ...prev.service_status,
        [service]: status
      }
    }));
    if (service === 'id_cards' && status !== 'yes') {
      setIdFieldDialogSkipped(false);
    }
  };

  useEffect(() => {
    const current = values.service_status.id_cards;
    if (current === 'yes' && prevIdCardStatus.current !== 'yes' && !idFieldDialogSkipped) {
      setShowCustomFieldInput(false);
      setIdFieldDialogOpen(true);
    }
    prevIdCardStatus.current = current;
  }, [values.service_status.id_cards, idFieldDialogSkipped]);

  const toggleIdCardField = useCallback(
    (field: string) => {
      setValues((prev) => {
        const exists = prev.id_card_fields.includes(field);
        if (exists) {
          return { ...prev, id_card_fields: prev.id_card_fields.filter((name) => name !== field) };
        }
        if (prev.id_card_fields.length >= MAX_ID_CARD_FIELDS) {
          toast.error(`You can select up to ${MAX_ID_CARD_FIELDS} fields.`);
          return prev;
        }
        return { ...prev, id_card_fields: [...prev.id_card_fields, field] };
      });
      setIdFieldDialogSkipped(false);
    },
    []
  );

  const handleAddCustomIdField = useCallback(() => {
    const trimmed = customIdField.trim();
    if (!trimmed) {
      return;
    }
    if (values.id_card_fields.includes(trimmed)) {
      toast.error('Field already selected.');
      return;
    }
    if (values.id_card_fields.length >= MAX_ID_CARD_FIELDS) {
      toast.error(`You can select up to ${MAX_ID_CARD_FIELDS} fields.`);
      return;
    }
    setValues((prev) => ({ ...prev, id_card_fields: [...prev.id_card_fields, trimmed] }));
    setIdFieldDialogSkipped(false);
    setCustomIdField('');
  }, [customIdField, values.id_card_fields]);

  useEffect(() => {
    const current = values.service_status.id_cards;
    if (current === 'yes' && prevIdCardStatus.current !== 'yes' && !idFieldDialogSkipped) {
      setShowCustomFieldInput(false);
      setIdFieldDialogOpen(true);
    }
    prevIdCardStatus.current = current;
  }, [values.service_status.id_cards, idFieldDialogSkipped]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setInvalidFields(new Set());
    if (!validateSection3()) {
      setCurrentSection(TOTAL_SECTIONS);
      return;
    }
    onSubmit({ values });
  };

  const validateSection1 = () => {
    const errors = new Set<string>();
    const fieldsToValidate: { [key: string]: string | undefined | null } = {
        school_name: values.school_name,
        email: values.email,
        phone: values.phone,
        address: values.address,
        'address-city': values.city,
        'address-state': values.state,
        'address-pin': values.pin,
        principal_name: values.principal_name,
        principal_phone: values.principal_phone,
        principal_email: values.principal_email,
    };

    for (const [id, value] of Object.entries(fieldsToValidate)) {
        if (!value) {
            errors.add(id);
        }
    }

    if (!values.logo_file && !values.logo_url) {
        errors.add('logo');
    }

    setInvalidFields(errors);

    if (errors.size > 0) {
        toast.error("Please fill out all required fields, marked in red.");
        return false;
    }

    return true;
  };

  const validateSection2 = () => {
    const errors = new Set<string>();
    for (const grade of GRADE_RENDER_ORDER) {
      const gradeEntry = values.grades[grade];
      if (gradeEntry.enabled && !gradeEntry.label.trim()) {
        errors.add(`grade-${grade}`);
      }
    }
    const hasSelectedGrade = GRADE_RENDER_ORDER.some((grade) => values.grades[grade].enabled);
    if (mode === 'create' && !hasSelectedGrade) {
      errors.add('grade-selection');
    }
    setInvalidFields(errors);
    if (errors.size > 0) {
      if (errors.has('grade-selection')) {
        toast.error('Please select at least one class before continuing.');
      } else {
        toast.error('Please provide a name for all enabled grades.');
      }
      return false;
    }
    return true;
  };

  const validateSection3 = () => {
    const hasSelection = Object.values(values.service_status).some((status) => status !== '');
    if (!hasSelection) {
      const errors = new Set<string>();
      errors.add('service_status');
      setInvalidFields(errors);
      toast.error('Please select at least one service option.');
      return false;
    }
    if (values.service_status.id_cards === 'yes' && values.id_card_fields.length === 0 && !idFieldDialogSkipped) {
      const errors = new Set<string>();
      errors.add('id_card_fields');
      setInvalidFields(errors);
      toast.error('Select at least one ID card field.');
      return false;
    }
    return true;
  };

  const ensureEmailIsUnique = useCallback(async () => {
    if (mode !== 'create' || !checkEmailAvailability) {
      return true;
    }

    const trimmedEmail = values.email?.trim();
    if (!trimmedEmail) {
      return true;
    }

    setIsEmailChecking(true);
    try {
      await checkEmailAvailability(trimmedEmail);
      return true;
    } catch (error) {
      const detail =
        axios.isAxiosError(error) && error.response?.data
          ? error.response.data.detail
          : 'Unable to verify this email address right now.';
      const message = detail || 'Unable to verify this email address right now.';
      setEmailError(message);
      setInvalidFields((prev) => {
        const next = new Set(prev);
        next.add('email');
        return next;
      });
      toast.error(message);
      return false;
    } finally {
      setIsEmailChecking(false);
    }
  }, [checkEmailAvailability, mode, values.email]);

  const handleNextSection = async () => {
    let isValid = true;
    if (currentSection === 1) {
        isValid = validateSection1();
        if (isValid) {
          isValid = await ensureEmailIsUnique();
        }
    } else if (currentSection === 2) {
        isValid = validateSection2();
    }
    
    if (isValid) {
        setInvalidFields(new Set());
        setCurrentSection((prev) => Math.min(prev + 1, TOTAL_SECTIONS));
    }
  };

  const handlePreviousSection = () => {
    setInvalidFields(new Set());
    setCurrentSection((prev) => Math.max(prev - 1, 1));
  };
  const progress = (currentSection / TOTAL_SECTIONS) * 100;

  return (
    <Card className="w-full max-w-3xl border-0 bg-white/80 backdrop-blur">
      <ImageCropperDialog
        imageSrc={imageSrc}
        onCropComplete={onCropComplete}
        onClose={handleCropperClose}
      />
      <CardHeader className="space-y-6">
        <div className="flex justify-between items-center">
          {onBackToHome && !isSuperAdmin && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onBackToHome}
              disabled={submitting || isCompressingLogo}
              className="flex items-center gap-1 text-gray-600 hover:text-gray-900 -ml-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Home
            </Button>
          )}
          {(onCancel && isSuperAdmin) || (onCancel && !onBackToHome) ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onCancel}
              disabled={submitting || isCompressingLogo}
              className="flex items-center gap-1 text-gray-600 hover:text-gray-900 -ml-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          ) : null}
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm text-gray-600">
            <span>Section {currentSection} of {TOTAL_SECTIONS}</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
            <div className="h-full bg-orange-500 transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
        </div>
        <div>
          <CardTitle className="text-2xl font-semibold text-gray-800">
            {mode === 'create' ? 'Create School Profile' : 'Edit School Profile'}
          </CardTitle>
          <p className="text-gray-600">
            Help us set up your workspace by sharing the contact details for this school.
          </p>
          <p className="mt-2 rounded-md bg-orange-50 px-3 py-2 text-sm text-orange-700">
            Note: The provided details will appear on the cover page layout.
          </p>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit}>
          <fieldset disabled={submitting || isCompressingLogo} className="space-y-6">
            {currentSection === 1 && (
              <div className="space-y-8">
                <section className="space-y-4">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-wide text-gray-500">School details</p>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="school_name">School name</Label>
                      <Input
                        id="school_name"
                        value={values.school_name}
                        onChange={handleInputChange('school_name')}
                        required
                        placeholder="Eg: Your School Name"
                        className={cn(invalidFields.has('school_name') && 'border-red-500')}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">School email</Label>
                      <Input
                        id="email"
                        type="email"
                        value={values.email}
                        onChange={handleInputChange('email')}
                        required
                        className={cn(invalidFields.has('email') && 'border-red-500')}
                      />
                      {emailError && (
                        <p className="text-xs text-red-600">{emailError}</p>
                      )}
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="logo">School logo</Label>
                    <Input
                      id="logo"
                      type="file"
                      accept="image/png"
                      onChange={handleLogoChange}
                      disabled={submitting}
                      required={!logoPreviewUrl}
                      className={cn(invalidFields.has('logo') && 'border-red-500')}
                    />
                    {logoPreviewUrl && (
                      <div className="mt-2 flex items-center gap-4">
                        <img
                          src={logoPreviewUrl}
                          alt="School logo preview"
                          className="h-16 w-16 border object-cover bg-white"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => document.getElementById('logo')?.click()}
                        >
                          Change
                        </Button>
                      </div>
                    )}
                  </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone">School phone</Label>
                      <Input
                        id="phone"
                        type="tel"
                        value={values.phone}
                        onChange={handleInputChange('phone')}
                        required
                        className={cn(invalidFields.has('phone') && 'border-red-500')}
                      />
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="website">Website</Label>
                      <Input
                        id="website"
                        value={values.website}
                        onChange={handleInputChange('website')}
                        placeholder="https://www.yourschoolwebsite.com"
                        className={cn(invalidFields.has('website') && 'border-red-500')}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="tagline">Tagline</Label>
                      <Input
                        id="tagline"
                        value={values.tagline || ''}
                        onChange={handleInputChange('tagline')}
                        placeholder="Play. Learn. Grow."
                        className={cn(invalidFields.has('tagline') && 'border-red-500')}
                      />
                    </div>
                  </div>
                </section>

                <section className="space-y-4">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-wide text-gray-500">School address</p>
                    <p className="text-sm text-gray-600">
                      Add it line by line to keep the cover page tidy.
                    </p>
                  </div>
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label htmlFor="address">Address</Label>
                      <Input
                        id="address"
                        value={values.address}
                        onChange={handleAddressFieldChange('address')}
                        required
                        placeholder="Door no, Street"
                        className={cn(invalidFields.has('address') && 'border-red-500')}
                      />
                    </div>
                    <div className="grid gap-4 md:grid-cols-3">
                      <div className="space-y-2">
                        <Label htmlFor="address-city">City</Label>
                        <Input
                          id="address-city"
                          value={values.city}
                          onChange={handleAddressFieldChange('city')}
                          required
                          className={cn(invalidFields.has('address-city') && 'border-red-500')}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="address-state">State</Label>
                        <Input
                          id="address-state"
                          value={values.state}
                          onChange={handleAddressFieldChange('state')}
                          required
                          className={cn(invalidFields.has('address-state') && 'border-red-500')}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="address-pin">PIN code</Label>
                        <Input
                          id="address-pin"
                          value={values.pin}
                          onChange={handleAddressFieldChange('pin')}
                          required
                          className={cn(invalidFields.has('address-pin') && 'border-red-500')}
                        />
                      </div>
                    </div>
                  </div>
                </section>

                <section className="space-y-4">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                      Principal / head details
                    </p>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="principal_name">Name</Label>
                      <Input
                        id="principal_name"
                        value={values.principal_name}
                        onChange={handleInputChange('principal_name')}
                        required
                        className={cn(invalidFields.has('principal_name') && 'border-red-500')}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="principal_phone">Phone</Label>
                      <Input
                        id="principal_phone"
                        type="tel"
                        value={values.principal_phone}
                        onChange={handleInputChange('principal_phone')}
                        disabled={linkPrincipalPhone}
                        required
                        className={cn(invalidFields.has('principal_phone') && 'border-red-500')}
                      />
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Checkbox
                          id="principal-phone-same"
                          checked={linkPrincipalPhone}
                          onCheckedChange={(checked: any) => setLinkPrincipalPhone(Boolean(checked))}
                        />
                        <label htmlFor="principal-phone-same" className="cursor-pointer">
                          Same as school phone
                        </label>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="principal_email">Email</Label>
                    <Input
                      id="principal_email"
                      type="email"
                      value={values.principal_email}
                      onChange={handleInputChange('principal_email')}
                      disabled={linkPrincipalEmail}
                      required
                      className={cn(invalidFields.has('principal_email') && 'border-red-500')}
                    />
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Checkbox
                        id="principal-email-same"
                        checked={linkPrincipalEmail}
                        onCheckedChange={(checked: any) => setLinkPrincipalEmail(Boolean(checked))}
                      />
                      <label htmlFor="principal-email-same" className="cursor-pointer">
                        Same as school email
                      </label>
                    </div>
                  </div>
                </section>
              </div>
            )}

            {currentSection === 2 && (
              <div className="space-y-6">
                <section className="space-y-3">
                  <p className="text-sm font-semibold uppercase tracking-wide text-gray-500">Grade name</p>
                  <p className="text-sm text-gray-600">
                    What do you call these classes when you speak to parents or place them on the cover?
                  </p>
                </section>

                <section className="space-y-5">
                  <div className="grid gap-4 md:grid-cols-2">
                    {GRADE_RENDER_ORDER.map((grade) => (
                      <div key={grade} className="space-y-2">
                        <div className="flex items-center gap-2">
                        <Checkbox
                          id={`enable-grade-${grade}`}
                          checked={values.grades[grade].enabled}
                          onCheckedChange={(checked: any) => handleGradeEnabledChange(grade, Boolean(checked))}
                        />
                          <Label htmlFor={`grade-${grade}`}>{formatGradeLabelTitle(grade)}</Label>
                        </div>
                        <Input
                          id={`grade-${grade}`}
                          value={values.grades[grade].label}
                          onChange={handleGradeLabelChange(grade)}
                          disabled={!values.grades[grade].enabled}
                          placeholder="Check to edit name"
                          required={values.grades[grade].enabled}
                          className={cn(invalidFields.has(`grade-${grade}`) && 'border-red-500')}
                        />
                      </div>
                    ))}
                  </div>
                </section>
                {invalidFields.has('grade-selection') && (
                  <p className="text-xs text-red-600">Please select at least one class before continuing.</p>
                )}
              </div>
            )}

            {currentSection === 3 && (
              <section className="space-y-4">
                <div>
                  <Label className="text-base text-gray-800">What are you currently taking with us?</Label>
                  <p className="text-sm text-gray-600">
                    Select all services you are currently taking.
                  </p>
                </div>
                <div className="space-y-4">
                  {SERVICE_OPTIONS.map((option) => (
                    <div key={option.value} className="flex items-center justify-between">
                      <span className="text-gray-800 font-medium">{option.prompt}</span>

                      <div className="flex items-center gap-4">
                        <label className="flex items-center gap-1 cursor-pointer">
                          <input
                            type="radio"
                            name={option.value}
                            value="yes"
                            checked={values.service_status[option.value] === 'yes'}
                            onChange={() => handleServiceSelection(option.value, 'yes')}
                          />
                          Yes
                        </label>

                        <label className="flex items-center gap-1 cursor-pointer">
                          <input
                            type="radio"
                            name={option.value}
                            value="no"
                            checked={values.service_status[option.value] === 'no'}
                            onChange={() => handleServiceSelection(option.value, 'no')}
                          />
                          No
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
                {invalidFields.has('service_status') && (
                  <p className="text-xs text-red-600">Please select at least one service option.</p>
                )}
                {values.service_status.id_cards === 'yes' && (
                  <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">ID card fields</span>
                      <span>
                        {values.id_card_fields.length}/{MAX_ID_CARD_FIELDS}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">
                      Select up to {MAX_ID_CARD_FIELDS} fields. Add custom fields if needed.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setIdFieldDialogSkipped(false);
                        setIdFieldDialogOpen(true);
                      }}
                    >
                      Configure ID card fields
                    </Button>
                    {invalidFields.has('id_card_fields') && (
                      <p className="text-xs text-red-600">Please choose at least one field for the ID card.</p>
                    )}
                  </div>
                )}
              </section>
            )}
          </fieldset>

          <Dialog
            open={idFieldDialogOpen}
            onOpenChange={(open) => {
              setIdFieldDialogOpen(open);
              if (!open) {
                setShowCustomFieldInput(false);
              }
            }}
          >
            <DialogContent className="max-w-xl">
              <DialogHeader className="space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <DialogTitle>Select ID card fields</DialogTitle>
                    <p className="text-xs text-slate-500">
                      Selected fields will be collected further—kindly cooperate with us.
                    </p>
                  </div>
                  <Button type="button" variant="ghost" size="sm" onClick={handleDialogSkip}>
                    Skip for now
                  </Button>
                </div>
                <DialogDescription>
                  Choose up to {MAX_ID_CARD_FIELDS} fields you'd like to show on ID cards.
                </DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-3 max-h-72 overflow-y-auto pb-4">
                {ID_CARD_FIELD_OPTIONS.map((field) => {
                  const checked = values.id_card_fields.includes(field);
                  const isDisabled = !checked && values.id_card_fields.length >= MAX_ID_CARD_FIELDS;
                  return (
                    <label
                      key={field}
                      className={`flex items-center gap-3 rounded-lg border px-3 py-2 hover:border-slate-300 ${
                        isDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={isDisabled}
                        onChange={() => toggleIdCardField(field)}
                      />
                      <span className={`text-sm ${checked ? 'font-semibold' : ''}`}>{field}</span>
                    </label>
                  );
                })}
              </div>
              <div className="space-y-3 border-t border-slate-100 pt-4">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="toggle-custom-field"
                    checked={showCustomFieldInput}
                    onCheckedChange={(checked) => setShowCustomFieldInput(Boolean(checked))}
                  />
                  <Label htmlFor="toggle-custom-field">Add custom field</Label>
                </div>
                {showCustomFieldInput && (
                  <div className="flex gap-2">
                    <Input
                      placeholder="Custom field name (e.g. House name)"
                      value={customIdField}
                      onChange={(event) => setCustomIdField(event.target.value)}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleAddCustomIdField}
                      disabled={
                        !customIdField.trim() || values.id_card_fields.length >= MAX_ID_CARD_FIELDS
                      }
                    >
                      Add
                    </Button>
                  </div>
                )}
                <p className="text-xs text-slate-500">
                  Selected {values.id_card_fields.length}/{MAX_ID_CARD_FIELDS} fields.
                </p>
              </div>
              <DialogFooter className="pt-4">
                <Button type="button" onClick={handleDialogDone}>
                  Done
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <CardFooter className="mt-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-end">
            <div className="flex gap-2">
              {onCancel && (isSuperAdmin || !onBackToHome) ? (
                <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting || isCompressingLogo}>
                  Cancel
                </Button>
              ) : null}
              <Button type="button" variant="outline" onClick={handlePreviousSection} disabled={currentSection === 1}>
                Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleNextSection}
                disabled={currentSection === TOTAL_SECTIONS || isEmailChecking}
              >
                Next
              </Button>
            </div>
            {currentSection === TOTAL_SECTIONS && (
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button type="submit" disabled={submitting || isCompressingLogo}>
                  {(submitting || isCompressingLogo) && <Loader2 className="h-4 w-4 animate-spin" />}
                  {mode === 'create' ? 'Create School' : 'Save Changes'}
                </Button>
              </div>
            )}
          </CardFooter>
        </form>
      </CardContent>
    </Card>
  );
};

export default SchoolForm;
