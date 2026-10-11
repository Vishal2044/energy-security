import { useEffect, useState } from 'react';
import { ArrowLeft, Save, ShieldCheck } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, getData } from '../lib/api';
import { Dropdown, PageHeader, UserAvatar } from '../components/ui';
import { bankOptions, FileUploadCard } from './AdminUserForm';

type EditForm = {
  name: string;
  mobile: string;
  alternateMobile: string;
  email: string;
  aadharNumber: string;
  bankName: string;
  branchName: string;
  bankAccountNumber: string;
  ifscCode: string;
  assignedSite: string;
  monthlySalary: string;
  employmentStatus: 'ACTIVE' | 'INACTIVE';
};
type GuardDetails = {
  guard: { id: string; employeeCode: string; name: string; mobile: string; alternateMobile?: string; assignedSite?: string; monthlySalary: number; employmentStatus: 'ACTIVE' | 'INACTIVE'; profilePhotoUrl?: string; bank?: { bankName?: string; branchName?: string; accountNumber?: string; ifscCode?: string } };
  profile?: { email?: string; alternateMobile?: string; aadharNumber?: string; bank?: { bankName?: string; branchName?: string; accountNumber?: string; ifscCode?: string } };
};
type SiteOption = { id: string; siteCode: string; siteName: string };
type Uploads = { userPhoto?: File; aadharDocument?: File; bankPassbook?: File };

const emptyForm: EditForm = { name: '', mobile: '', alternateMobile: '', email: '', aadharNumber: '', bankName: '', branchName: '', bankAccountNumber: '', ifscCode: '', assignedSite: '', monthlySalary: '24000', employmentStatus: 'ACTIVE' };

export function AdminGuardEditPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<EditForm>(emptyForm);
  const [uploads, setUploads] = useState<Uploads>({});
  const details = useQuery({ queryKey: ['guard', id], queryFn: () => getData<GuardDetails>(`/guards/${id}`), enabled: Boolean(id) });
  const sites = useQuery({ queryKey: ['sites'], queryFn: () => getData<{ sites: SiteOption[] }>('/sites') });
  const save = useMutation({
    mutationFn: () => {
      const body = new FormData();
      Object.entries(form).forEach(([key, value]) => body.append(key, value));
      Object.entries(uploads).forEach(([key, file]) => { if (file) body.append(key, file); });
      return api.patch(`/guards/${id}`, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guards'] });
      queryClient.invalidateQueries({ queryKey: ['guard', id] });
      navigate('/guards');
    },
  });

  useEffect(() => {
    const guard = details.data?.guard;
    if (!guard) return;
    const bank = details.data.profile?.bank ?? guard.bank ?? {};
    setForm({
      name: guard.name,
      mobile: guard.mobile,
      alternateMobile: details.data.profile?.alternateMobile ?? guard.alternateMobile ?? '',
      email: details.data.profile?.email ?? '',
      aadharNumber: details.data.profile?.aadharNumber ?? '',
      bankName: bank.bankName ?? '',
      branchName: bank.branchName ?? '',
      bankAccountNumber: bank.accountNumber ?? '',
      ifscCode: bank.ifscCode ?? '',
      assignedSite: guard.assignedSite ?? '',
      monthlySalary: String(guard.monthlySalary ?? 24000),
      employmentStatus: guard.employmentStatus,
    });
  }, [details.data]);

  const setField = (key: keyof EditForm, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const currentPhoto = details.data?.guard.profilePhotoUrl;

  if (details.isLoading) return <div className="loading-state">Loading guard profile…</div>;
  if (!details.data) return <div className="empty-state"><h3>Guard profile not found</h3><button className="button secondary" onClick={() => navigate('/guards')}>Back to guards</button></div>;

  return <div className="user-form-page guard-edit-page">
    <PageHeader eyebrow="GUARD PROFILE" title={`Edit ${details.data.guard.name}`} description="Update the guard record stored in the database." action={<button className="button secondary" onClick={() => navigate('/guards')}><ArrowLeft size={16} /> Back</button>} />
    <form className="content-form-card panel content-form" onSubmit={(event) => { event.preventDefault(); if (event.currentTarget.reportValidity()) save.mutate(); }}>
      <div className="edit-profile-banner"><Link className="edit-profile-identity" to={`/profile/${id}`}><UserAvatar name={details.data.guard.name} src={currentPhoto} className="edit-profile-avatar" /><div><span className="eyebrow">{details.data.guard.employeeCode}</span><h2>{details.data.guard.name}</h2><p>Employee profile and access status</p></div></Link><span className="user-form-badge"><ShieldCheck size={14} /> {details.data.guard.employmentStatus}</span></div>
      <div className="form-section-heading"><span className="eyebrow">PERSONAL DETAILS</span><h3>Profile information</h3><p>These values are loaded from the current database record.</p></div>
      <div className="form-grid two">
        <label>Full name<input required value={form.name} onChange={(event) => setField('name', event.target.value)} placeholder="Enter full name" /></label>
        <label>Employee code<input value={details.data.guard.employeeCode} readOnly className="readonly-field" /></label>
        <label>Mobile number<input required inputMode="tel" value={form.mobile} onChange={(event) => setField('mobile', event.target.value)} placeholder="Enter primary mobile number" /></label>
        <label>Alternate number<input inputMode="tel" value={form.alternateMobile} onChange={(event) => setField('alternateMobile', event.target.value)} placeholder="Enter alternate mobile number" /></label>
        <label>Email address<input required type="email" value={form.email} onChange={(event) => setField('email', event.target.value)} placeholder="Enter email address" /></label>
        <label>Aadhaar number<input value={form.aadharNumber} onChange={(event) => setField('aadharNumber', event.target.value)} placeholder="Enter Aadhaar number" /></label>
      </div>
      <div className="form-section-heading edit-section-gap"><span className="eyebrow">WORKFORCE SETTINGS</span><h3>Assignment and status</h3></div>
      <div className="form-grid two">
        <label>Assigned site<Dropdown value={form.assignedSite} onChange={(value) => setField('assignedSite', value)} placeholder="Select assigned site" options={(sites.data?.sites ?? []).map((site) => ({ value: site.id, label: `${site.siteCode} · ${site.siteName}` }))} /></label>
        <label>Status<Dropdown value={form.employmentStatus} onChange={(value) => setField('employmentStatus', value)} options={[{ value: 'ACTIVE', label: 'Active' }, { value: 'INACTIVE', label: 'Inactive' }]} /></label>
        <label>Monthly salary<input required type="number" min="0" value={form.monthlySalary} onChange={(event) => setField('monthlySalary', event.target.value)} placeholder="Enter monthly salary" /></label>
      </div>
      <div className="form-section-heading edit-section-gap"><span className="eyebrow">BANK DETAILS</span><h3>Payment information</h3></div>
      <div className="form-grid two">
        <label>Bank name<Dropdown value={form.bankName} onChange={(value) => setField('bankName', value)} options={bankOptions} placeholder="Select bank" /></label>
        <label>Branch name<input value={form.branchName} onChange={(event) => setField('branchName', event.target.value)} placeholder="Enter branch name" /></label>
        <label>Bank account number<input inputMode="numeric" value={form.bankAccountNumber} onChange={(event) => setField('bankAccountNumber', event.target.value)} placeholder="Enter bank account number" /></label>
        <label>IFSC code<input value={form.ifscCode} onChange={(event) => setField('ifscCode', event.target.value.toUpperCase())} placeholder="e.g. SBIN0001234" /></label>
      </div>
      <div className="form-section-heading edit-section-gap"><span className="eyebrow">DOCUMENTS</span><h3>Replace uploaded files</h3><p>Leave a card unchanged when you do not want to replace that file.</p></div>
      <div className="upload-grid">
        <FileUploadCard inputId="edit-user-photo" label="Replace user photo" hint="JPG or PNG profile photo" existingPreviewUrl={currentPhoto} required={false} file={uploads.userPhoto} onChange={(file) => setUploads((current) => ({ ...current, userPhoto: file }))} onRemove={() => setUploads((current) => ({ ...current, userPhoto: undefined }))} />
        <FileUploadCard inputId="edit-aadhaar" label="Replace Aadhaar document" hint="PDF or image document" required={false} file={uploads.aadharDocument} onChange={(file) => setUploads((current) => ({ ...current, aadharDocument: file }))} onRemove={() => setUploads((current) => ({ ...current, aadharDocument: undefined }))} />
        <FileUploadCard inputId="edit-passbook" label="Replace bank passbook" hint="PDF or image document" required={false} file={uploads.bankPassbook} onChange={(file) => setUploads((current) => ({ ...current, bankPassbook: file }))} onRemove={() => setUploads((current) => ({ ...current, bankPassbook: undefined }))} />
      </div>
      {save.isError && <p className="form-error">Profile update nahi ho saka. Details check karke dobara try karein.</p>}
      <div className="form-actions"><button type="button" className="button secondary" onClick={() => navigate('/guards')}>Cancel</button><button type="submit" className="button primary" disabled={save.isPending}>{save.isPending ? 'Saving…' : <><Save size={16} /> Save profile</>}</button></div>
    </form>
  </div>;
}
