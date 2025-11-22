import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

import { SchoolFormValues, SchoolServiceType } from '../types/types';
import { compressImageFile } from '../lib/imageCompression';

const getLogoPreview = (vals: SchoolFormValues) => vals.logo_url || '';

const SERVICE_OPTIONS: { value: SchoolServiceType; prompt: string }[] = [
  { value: 'id_cards', prompt: 'Are you taking ID cards?'},
  { value: 'report_cards', prompt: 'Are you taking report cards?'},
  { value: 'certificates', prompt: 'Are you taking certificates?' }
];

export interface SchoolFormSubmitPayload {
  values: SchoolFormValues;
}

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
  const [linkPrincipalEmail, setLinkPrincipalEmail] = useState(
    Boolean(initialValues.email && initialValues.email === initialValues.principal_email)
  );
  const [linkPrincipalPhone, setLinkPrincipalPhone] = useState(
    Boolean(initialValues.phone && initialValues.phone === initialValues.principal_phone)
  );

  useEffect(() => {
    setValues(initialValues);
    setLogoPreview(getLogoPreview(initialValues));
    setLinkPrincipalEmail(Boolean(initialValues.email && initialValues.email === initialValues.principal_email));
    setLinkPrincipalPhone(Boolean(initialValues.phone && initialValues.phone === initialValues.principal_phone));
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

  const handleLogoChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      setLogoPreview(getLogoPreview(initialValues));
      setValues((prev) => ({ ...prev, logo_file: null, logo_url: initialValues.logo_url ?? null }));
      return;
    }

    setIsCompressingLogo(true);
    try {
      const { dataUrl, blob, mimeType } = await compressImageFile(file);
      setLogoPreview(dataUrl);
      const extension = file.name?.split('.').pop();
      const normalizedName = extension ? file.name.replace(/\.[^/.]+$/, '') : file.name;
      const filename = `${normalizedName || 'school-logo'}.jpg`;
      const compressedFile = new File([blob], filename, { type: mimeType });
      setValues((prev) => ({ ...prev, logo_file: compressedFile, logo_url: null }));
    } catch (error) {
      console.error('Failed to compress logo', error);
      toast.error('Unable to compress that image. Please try a different file.');
      setLogoPreview(getLogoPreview(initialValues));
      setValues((prev) => ({ ...prev, logo_file: null, logo_url: initialValues.logo_url ?? null }));
    } finally {
      setIsCompressingLogo(false);
    }
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

  return (
    <Card className="w-full max-w-3xl border-0 bg-white/80 backdrop-blur">
      <CardHeader>
        <CardTitle className="text-2xl font-semibold text-gray-800">
          {mode === 'create' ? 'Create School Profile' : 'Edit School Profile'}
        </CardTitle>
        <p className="text-gray-600">
          Help us set up your workspace by sharing the contact details for this school.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit}>
          <fieldset disabled={submitting || isCompressingLogo} className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="school_name">School name</Label>
                <Input
                  id="school_name"
                  value={values.school_name}
                  onChange={handleInputChange('school_name')}
                  required
                  placeholder="Eg: Rainbow International"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tagline">Tagline (optional)</Label>
                <Input
                  id="tagline"
                  value={values.tagline || ''}
                  onChange={handleInputChange('tagline')}
                  placeholder="Play. Learn. Grow."
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="email">School email</Label>
                <Input
                  id="email"
                  type="email"
                  value={values.email}
                  onChange={handleInputChange('email')}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">School phone</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={values.phone}
                  onChange={handleInputChange('phone')}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">School address</Label>
              <Textarea
                id="address"
                value={values.address}
                onChange={handleInputChange('address')}
                required
                rows={3}
                placeholder="Include door number, street, city and pincode"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="principal_name">Principal name</Label>
                <Input
                  id="principal_name"
                  value={values.principal_name}
                  onChange={handleInputChange('principal_name')}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="principal_email">Principal email</Label>
                <Input
                  id="principal_email"
                  type="email"
                  value={values.principal_email}
                  onChange={handleInputChange('principal_email')}
                  disabled={linkPrincipalEmail}
                  required
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
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="principal_phone">Principal phone</Label>
                <Input
                  id="principal_phone"
                  type="tel"
                  value={values.principal_phone}
                  onChange={handleInputChange('principal_phone')}
                  disabled={linkPrincipalPhone}
                  required
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
              <div className="space-y-2">
                <Label htmlFor="logo">School logo</Label>
                <Input
                  id="logo"
                  type="file"
                  accept="image/*"
                  onChange={handleLogoChange}
                  disabled={isCompressingLogo || submitting}
                />
                {isCompressingLogo && (
                  <p className="text-sm text-gray-500 mt-1 flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Compressing image…
                  </p>
                )}
                {logoPreview && !isCompressingLogo && (
                  <img
                    src={logoPreview}
                    alt="School logo preview"
                    className="mt-2 h-16 w-16 rounded border object-cover"
                  />
                )}
              </div>
            </div>

            <div className="space-y-4">
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

            </div>
          </fieldset>

          <CardFooter className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
            {onCancel && (
              <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting || isCompressingLogo}>
                Cancel
              </Button>
            )}
            <Button type="submit" disabled={submitting || isCompressingLogo}>
              {(submitting || isCompressingLogo) && <Loader2 className="h-4 w-4 animate-spin" />}
              {mode === 'create' ? 'Create School' : 'Save Changes'}
            </Button>
          </CardFooter>
        </form>
      </CardContent>
    </Card>
  );
};

export default SchoolForm;
