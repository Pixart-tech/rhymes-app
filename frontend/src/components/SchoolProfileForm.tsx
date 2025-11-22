import { cn } from '@/lib/utils';
import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { SchoolFormValues, SchoolServiceType, SchoolProfile } from '../types/types';
import ImageCropperDialog from './ImageCropper';
import { compressImage } from './cropImage';

const getLogoPreview = (vals: SchoolFormValues) => vals.logo_url || '';
const TOTAL_SECTIONS = 3;
type GradeKey = 'toddler' | 'playgroup' | 'nursery' | 'lkg' | 'ukg';
const DEFAULT_GRADE_LABELS: Record<GradeKey, string> = {
  toddler: 'Toddler',
  playgroup: 'Playgroup',
  nursery: 'Nursery',
  lkg: 'LKG',
  ukg: 'UKG'
};
const GRADE_RENDER_ORDER: GradeKey[] = ['toddler', 'playgroup', 'nursery', 'lkg', 'ukg'];
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

export const SCHOOL_SERVICE_KEYS: SchoolServiceType[] = ['id_cards', 'report_cards', 'certificates'];

export const createEmptyServiceSelection = (): Record<SchoolServiceType, boolean> => ({
  id_cards: false,
  report_cards: false,
  certificates: false
});

export const selectionFromServicesArray = (
  services?: SchoolServiceType[] | null
): Record<SchoolServiceType, boolean> => {
  const selection = createEmptyServiceSelection();
  services?.forEach((service) => {
    if (SCHOOL_SERVICE_KEYS.includes(service)) {
      selection[service] = true;
    }
  });
  return selection;
};

export const servicesArrayFromSelection = (
  selection: Record<SchoolServiceType, boolean>
): SchoolServiceType[] => {
  return SCHOOL_SERVICE_KEYS.filter((key) => Boolean(selection?.[key]));
};

export const buildSchoolFormValuesFromProfile = (
  profile?: SchoolProfile | null
): SchoolFormValues => ({
  school_name: profile?.school_name ?? '',
  logo_url: profile?.logo_url ?? null,
  logo_file: null,
  email: profile?.email ?? '',
  phone: profile?.phone ?? '',
  address: profile?.address ?? '',
  tagline: profile?.tagline ?? '',
  website: profile?.website ?? '',
  principal_name: profile?.principal_name ?? '',
  principal_email: profile?.principal_email ?? '',
  principal_phone: profile?.principal_phone ?? '',
  service_type: selectionFromServicesArray(profile?.service_type ?? null)
});

export const buildSchoolFormData = (
  values: SchoolFormValues,
  selectedServices: SchoolServiceType[]
): FormData => {
  const formData = new FormData();
  formData.append('school_name', values.school_name);
  formData.append('email', values.email);
  formData.append('phone', values.phone);
  formData.append('address', values.address);
  formData.append('tagline', values.tagline ?? '');
  formData.append('website', values.website ?? '');
  formData.append('principal_name', values.principal_name);
  formData.append('principal_email', values.principal_email);
  formData.append('principal_phone', values.principal_phone);
  selectedServices.forEach((service) => formData.append('service_type', service));
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

const createEmptyAddressFields = (): AddressFields => ({
  line1: '',
  city: '',
  state: '',
  pin: ''
});

const parseAddressFields = (address?: string | null): AddressFields => {
  if (!address) {
    return createEmptyAddressFields();
  }
  const [line1 = '', city = '', stateAndPin = ''] = address.split(',').map((part) => part.trim());
  let state = '';
  let pin = '';
  if (stateAndPin) {
    const [statePart = '', pinPart = ''] = stateAndPin.split('-').map((part) => part.trim());
    state = statePart;
    pin = pinPart;
  }
  return {
    line1,
    city,
    state,
    pin
  };
};

const composeAddress = (fields: AddressFields): string => {
  const segments: string[] = [];
  if (fields.line1.trim()) {
    segments.push(fields.line1.trim());
  }
  if (fields.city.trim()) {
    segments.push(fields.city.trim());
  }
  const stateSegment = fields.state.trim();
  const pinSegment = fields.pin.trim();
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
}

export const SchoolForm: React.FC<SchoolFormProps> = ({ mode, initialValues, submitting, onSubmit, onCancel }) => {
  const [values, setValues] = useState<SchoolFormValues>(initialValues);
  const [logoPreview, setLogoPreview] = useState<string>(getLogoPreview(initialValues));
  const [isCompressingLogo, setIsCompressingLogo] = useState(false);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [currentSection, setCurrentSection] = useState(1);
  const [addressFields, setAddressFields] = useState<AddressFields>(() => parseAddressFields(initialValues.address));
  const [gradeLabels, setGradeLabels] = useState<Record<GradeKey, string>>({
    toddler: '',
    playgroup: '',
    nursery: '',
    lkg: '',
    ukg: '',
  });
  const [enabledGrades, setEnabledGrades] = useState<Record<GradeKey, boolean>>({
    toddler: false,
    playgroup: false,
    nursery: false,
    lkg: false,
    ukg: false,
  });
  const [linkPrincipalEmail, setLinkPrincipalEmail] = useState(
    Boolean(initialValues.email && initialValues.email === initialValues.principal_email)
  );
  const [linkPrincipalPhone, setLinkPrincipalPhone] = useState(
    Boolean(initialValues.phone && initialValues.phone === initialValues.principal_phone)
  );
  const [invalidFields, setInvalidFields] = useState(new Set<string>());

  useEffect(() => {
    setValues(initialValues);
    setLogoPreview(getLogoPreview(initialValues));
    setLinkPrincipalEmail(Boolean(initialValues.email && initialValues.email === initialValues.principal_email));
    setLinkPrincipalPhone(Boolean(initialValues.phone && initialValues.phone === initialValues.principal_phone));
    setAddressFields(parseAddressFields(initialValues.address));
    setCurrentSection(1);
    setGradeLabels({
      toddler: '',
      playgroup: '',
      nursery: '',
      lkg: '',
      ukg: '',
    });
    setEnabledGrades({
      toddler: false,
      playgroup: false,
      nursery: false,
      lkg: false,
      ukg: false,
    });
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

    const handleInputChange =
    (field: keyof SchoolFormValues) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const value = event.target.value;
      setValues((prev) => ({ ...prev, [field]: value }));
    };

  const handleAddressFieldChange = (field: keyof AddressFields) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setAddressFields((prev) => {
      const updated = { ...prev, [field]: value };
      setValues((prevValues) => ({ ...prevValues, address: composeAddress(updated) }));
      return updated;
    });
  };
  const handleGradeLabelChange =
    (grade: GradeKey) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const value = event.target.value;
      setGradeLabels((prev) => ({ ...prev, [grade]: value }));
    };

  const handleGradeEnabledChange = (grade: GradeKey, checked: boolean) => {
    setEnabledGrades(prev => ({ ...prev, [grade]: checked }));
    if (checked) {
      setGradeLabels(prev => ({ ...prev, [grade]: DEFAULT_GRADE_LABELS[grade] }));
    } else {
      setGradeLabels(prev => ({ ...prev, [grade]: '' }));
    }
  };

  const handleLogoChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Invalid file type. Please select a PNG or JPEG image.');
      return;
    }

    const maxSizeInBytes = 20 * 1024 * 1024; // 20MB
    if (file.size > maxSizeInBytes) {
      toast.error('File is too large. Please select an image smaller than 20MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setImageSrc(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const onCropComplete = async (croppedImage: string) => {
    setLogoPreview(croppedImage);
    const blob = await(await fetch(croppedImage)).blob();
    const file = new File([blob], 'logo.jpg', { type: 'image/jpeg' });
    setValues((prev) => ({ ...prev, logo_file: file, logo_url: null }));
    setImageSrc(null); // Close the dialog
  };

  const handleServiceSelection = (service: SchoolServiceType, checked: boolean) => {
    setValues((prev) => ({
      ...prev,
      service_type: {
        ...prev.service_type,
        [service]: checked
      }
    }));
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit({ values });
  };

  const validateSection1 = () => {
    const errors = new Set<string>();
    const fieldsToValidate: { [key: string]: string | undefined | null } = {
        'school_name': values.school_name,
        'email': values.email,
        'phone': values.phone,
        'address-line1': addressFields.line1,
        'address-city': addressFields.city,
        'address-state': addressFields.state,
        'address-pin': addressFields.pin,
        'principal_name': values.principal_name,
        'principal_phone': values.principal_phone,
        'principal_email': values.principal_email,
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
        if (enabledGrades[grade] && !gradeLabels[grade]) {
            errors.add(`grade-${grade}`);
        }
    }
    setInvalidFields(errors);
    if (errors.size > 0) {
        toast.error("Please provide a name for all enabled grades.");
        return false;
    }
    return true;
  };

  const handleNextSection = () => {
    let isValid = true;
    if (currentSection === 1) {
        isValid = validateSection1();
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
        onClose={() => setImageSrc(null)}
      />
      <CardHeader className="space-y-6">
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
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="logo">School logo</Label>
                    <Input
                      id="logo"
                      type="file"
                      accept="image/png, image/jpeg"
                      onChange={handleLogoChange}
                      disabled={submitting}
                      required={!logoPreview}
                      className={cn(invalidFields.has('logo') && 'border-red-500')}
                    />
                    {logoPreview && (
                      <div className="mt-2 flex items-center gap-4">
                        <img
                          src={logoPreview}
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
                        value={(values as any).website || ''}
                        onChange={handleInputChange('website' as any)}
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
                      <Label htmlFor="address-line1">Address line 1</Label>
                      <Input
                        id="address-line1"
                        value={addressFields.line1}
                        onChange={handleAddressFieldChange('line1')}
                        required
                        placeholder="Door no, Street"
                        className={cn(invalidFields.has('address-line1') && 'border-red-500')}
                      />
                    </div>
                    <div className="grid gap-4 md:grid-cols-3">
                      <div className="space-y-2">
                        <Label htmlFor="address-city">City</Label>
                        <Input
                          id="address-city"
                          value={addressFields.city}
                          onChange={handleAddressFieldChange('city')}
                          required
                          className={cn(invalidFields.has('address-city') && 'border-red-500')}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="address-state">State</Label>
                        <Input
                          id="address-state"
                          value={addressFields.state}
                          onChange={handleAddressFieldChange('state')}
                          required
                          className={cn(invalidFields.has('address-state') && 'border-red-500')}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="address-pin">PIN code</Label>
                        <Input
                          id="address-pin"
                          value={addressFields.pin}
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
                            checked={enabledGrades[grade]}
                            onCheckedChange={(checked: any) => handleGradeEnabledChange(grade, Boolean(checked))}
                          />
                          <Label htmlFor={`grade-${grade}`}>{formatGradeLabelTitle(grade)}</Label>
                        </div>
                        <Input
                          id={`grade-${grade}`}
                          value={gradeLabels[grade]}
                          onChange={handleGradeLabelChange(grade)}
                          disabled={!enabledGrades[grade]}
                          placeholder="Check to edit name"
                          required={enabledGrades[grade]}
                          className={cn(invalidFields.has(`grade-${grade}`) && 'border-red-500')}
                        />
                      </div>
                    ))}
                  </div>
                </section>
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
                            checked={values.service_type[option.value] === true}
                            onChange={() => handleServiceSelection(option.value, true)}
                          />
                          Yes
                        </label>

                        <label className="flex items-center gap-1 cursor-pointer">
                          <input
                            type="radio"
                            name={option.value}
                            value="no"
                            checked={values.service_type[option.value] === false}
                            onChange={() => handleServiceSelection(option.value, false)}
                          />
                          No
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </fieldset>


          <CardFooter className="mt-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-end">
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={handlePreviousSection} disabled={currentSection === 1}>
                Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleNextSection}
                disabled={currentSection === TOTAL_SECTIONS}
              >
                Next
              </Button>
            </div>
            {currentSection === TOTAL_SECTIONS && (
              <div className="flex flex-col gap-2 sm:flex-row">
                {onCancel && (
                  <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting || isCompressingLogo}>
                    Cancel
                  </Button>
                )}
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
