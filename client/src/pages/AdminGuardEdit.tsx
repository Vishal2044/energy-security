import { t } from '../locales/runtime';
import { ErrorState } from '../components/ui';
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
    dutyShift: string;
    photoRate: string;
    employmentStatus: 'ACTIVE' | 'INACTIVE';
};
type GuardDetails = {
    guard: {
        id: string;
        employeeCode: string;
        name: string;
        mobile: string;
        alternateMobile?: string;
        assignedSite?: string;
        monthlySalary: number;
        dutyShift?: string;
        photoRate?: number;
        employmentStatus: 'ACTIVE' | 'INACTIVE';
        profilePhotoUrl?: string;
        bank?: {
            bankName?: string;
            branchName?: string;
            accountNumber?: string;
            ifscCode?: string;
        };
    };
    profile?: {
        email?: string;
        alternateMobile?: string;
        aadharNumber?: string;
        bank?: {
            bankName?: string;
            branchName?: string;
            accountNumber?: string;
            ifscCode?: string;
        };
    };
};
type SiteOption = {
    id: string;
    siteCode: string;
    siteName: string;
};
type Uploads = {
    userPhoto?: File;
    aadharDocument?: File;
    bankPassbook?: File;
};
const emptyForm: EditForm = { name: '', mobile: '', alternateMobile: '', email: '', aadharNumber: '', bankName: '', branchName: '', bankAccountNumber: '', ifscCode: '', assignedSite: '', dutyShift: 'DAY', photoRate: '100', employmentStatus: 'ACTIVE' };
export function AdminGuardEditPage() {
    const { id = '' } = useParams();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [form, setForm] = useState<EditForm>(emptyForm);
    const [uploads, setUploads] = useState<Uploads>({});
    const details = useQuery({ queryKey: ['guard', id], queryFn: () => getData<GuardDetails>(`/guards/${id}`), enabled: Boolean(id) });
    const sites = useQuery({ queryKey: ['sites'], queryFn: () => getData<{
            sites: SiteOption[];
        }>('/sites') });
    const save = useMutation({
        mutationFn: () => {
            const body = new FormData();
            Object.entries(form).forEach(([key, value]) => body.append(key, value));
            Object.entries(uploads).forEach(([key, file]) => { if (file)
                body.append(key, file); });
            return api.patch(`/guards/${id}`, body);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['guards'] });
            queryClient.invalidateQueries({ queryKey: ['guard', id] });
            navigate('/guards');
        },
    });
    useEffect(() => {
        const data = details.data;
        const guard = data?.guard;
        if (!data || !guard)
            return;
        const bank = data.profile?.bank ?? guard.bank ?? {};
        setForm({
            name: guard.name,
            mobile: guard.mobile,
            alternateMobile: data.profile?.alternateMobile ?? guard.alternateMobile ?? '',
            email: data.profile?.email ?? '',
            aadharNumber: data.profile?.aadharNumber ?? '',
            bankName: bank.bankName ?? '',
            branchName: bank.branchName ?? '',
            bankAccountNumber: bank.accountNumber ?? '',
            ifscCode: bank.ifscCode ?? '',
            assignedSite: guard.assignedSite ?? '',
            dutyShift: guard.dutyShift ?? 'DAY',
            photoRate: String(guard.photoRate ?? 100),
            employmentStatus: guard.employmentStatus,
        });
    }, [details.data]);
    const setField = (key: keyof EditForm, value: string) => setForm((current) => ({ ...current, [key]: value }));
    const currentPhoto = details.data?.guard.profilePhotoUrl;
    if (details.isError)
        return <ErrorState onRetry={() => void details.refetch()}/>;
    if (details.isLoading)
        return <div className="loading-state">{t("Loading guard profile\u2026")}</div>;
    if (!details.data)
        return <div className="empty-state"><h3>{t("Guard profile not found")}</h3><button className="button secondary" onClick={() => navigate('/guards')}>{t("Back to guards")}</button></div>;
    return <div className="user-form-page guard-edit-page">
    <PageHeader eyebrow="GUARD PROFILE" title={`Edit ${details.data.guard.name}`} description={t("Update the guard record stored in the database.")} action={<button className="button secondary" onClick={() => navigate('/guards')}><ArrowLeft size={16}/>{t(" Back")}</button>}/>
    <form className="content-form-card panel content-form" onSubmit={(event) => { event.preventDefault(); if (event.currentTarget.reportValidity())
        save.mutate(); }}>
      <div className="edit-profile-banner"><Link className="edit-profile-identity" to={`/profile/${id}`}><UserAvatar name={details.data.guard.name} src={currentPhoto} className="edit-profile-avatar"/><div><span className="eyebrow">{details.data.guard.employeeCode}</span><h2>{details.data.guard.name}</h2><p>Employee profile and access status</p></div></Link><span className="user-form-badge"><ShieldCheck size={14}/> {details.data.guard.employmentStatus}</span></div>
      <div className="form-section-heading"><span className="eyebrow">{t("PERSONAL DETAILS")}</span><h3>{t("Profile information")}</h3><p>{t("These values are loaded from the current database record.")}</p></div>
      <div className="form-grid two">
        <label>{t("Full name")}<input required value={form.name} onChange={(event) => setField('name', event.target.value)} placeholder={t("Enter full name")}/></label>
        <label>Employee code<input value={details.data.guard.employeeCode} readOnly className="readonly-field"/></label>
        <label>{t("Mobile number")}<input required inputMode="tel" value={form.mobile} onChange={(event) => setField('mobile', event.target.value)} placeholder={t("Enter primary mobile number")}/></label>
        <label>{t("Alternate number")}<input inputMode="tel" value={form.alternateMobile} onChange={(event) => setField('alternateMobile', event.target.value)} placeholder={t("Enter alternate mobile number")}/></label>
        <label>Email address<input required type="email" value={form.email} onChange={(event) => setField('email', event.target.value)} placeholder={t("Enter email address")}/></label>
        <label>{t("Aadhaar number")}<input value={form.aadharNumber} onChange={(event) => setField('aadharNumber', event.target.value)} placeholder={t("Enter Aadhaar number")}/></label>
      </div>
      <div className="form-section-heading edit-section-gap"><span className="eyebrow">{t("WORKFORCE SETTINGS")}</span><h3>{t("Assignment and status")}</h3></div>
      <div className="form-grid two">
        <label>{t("Assigned site")}<Dropdown value={form.assignedSite} onChange={(value) => setField('assignedSite', value)} placeholder={t("Select assigned site")} options={(sites.data?.sites ?? []).map((site) => ({ value: site.id, label: `${site.siteCode} · ${site.siteName}` }))}/></label>
        <label>{t("Status")}<Dropdown value={form.employmentStatus} onChange={(value) => setField('employmentStatus', value)} options={[{ value: 'ACTIVE', label: 'Active' }, { value: 'INACTIVE', label: 'Inactive' }]}/></label>
        <label>{t("Duty shift")}<select value={form.dutyShift} onChange={(e) => setField('dutyShift', e.target.value)}><option value="DAY">{t("Day: 8 AM – 8 PM")}</option><option value="NIGHT">{t("Night: 8 PM – 8 AM")}</option></select></label>
        <label>{t("Rate per photo (₹)")}<input required type="number" min="0" max="100000" step="0.01" value={form.photoRate} onChange={(e) => setField('photoRate', e.target.value)}/></label>
        <p>{t("Shift and rate changes take effect from the next duty date. Previously earned salary stays unchanged.")}</p>
      </div>
      <div className="form-section-heading edit-section-gap"><span className="eyebrow">{t("BANK DETAILS")}</span><h3>{t("Payment information")}</h3></div>
      <div className="form-grid two">
        <label>{t("Bank name")}<Dropdown value={form.bankName} onChange={(value) => setField('bankName', value)} options={bankOptions} placeholder={t("Select bank")}/></label>
        <label>{t("Branch name")}<input value={form.branchName} onChange={(event) => setField('branchName', event.target.value)} placeholder={t("Enter branch name")}/></label>
        <label>{t("Bank account number")}<input inputMode="numeric" value={form.bankAccountNumber} onChange={(event) => setField('bankAccountNumber', event.target.value)} placeholder={t("Enter bank account number")}/></label>
        <label>{t("IFSC code")}<input value={form.ifscCode} onChange={(event) => setField('ifscCode', event.target.value.toUpperCase())} placeholder={t("e.g. SBIN0001234")}/></label>
      </div>
      <div className="form-section-heading edit-section-gap"><span className="eyebrow">{t("DOCUMENTS")}</span><h3>{t("Replace uploaded files")}</h3><p>{t("Leave a card unchanged when you do not want to replace that file.")}</p></div>
      <div className="upload-grid">
        <FileUploadCard inputId="edit-user-photo" label="Replace user photo" hint="JPG or PNG profile photo" existingPreviewUrl={currentPhoto} required={false} file={uploads.userPhoto} onChange={(file) => setUploads((current) => ({ ...current, userPhoto: file }))} onRemove={() => setUploads((current) => ({ ...current, userPhoto: undefined }))}/>
        <FileUploadCard inputId="edit-aadhaar" label="Replace Aadhaar document" hint="PDF or image document" required={false} file={uploads.aadharDocument} onChange={(file) => setUploads((current) => ({ ...current, aadharDocument: file }))} onRemove={() => setUploads((current) => ({ ...current, aadharDocument: undefined }))}/>
        <FileUploadCard inputId="edit-passbook" label="Replace bank passbook" hint="PDF or image document" required={false} file={uploads.bankPassbook} onChange={(file) => setUploads((current) => ({ ...current, bankPassbook: file }))} onRemove={() => setUploads((current) => ({ ...current, bankPassbook: undefined }))}/>
      </div>
      {save.isError && <p className="form-error">{t("Profile update nahi ho saka. Details check karke dobara try karein.")}</p>}
      <div className="form-actions"><button type="button" className="button secondary" onClick={() => navigate('/guards')}>{t("Cancel")}</button><button type="submit" className="button primary" disabled={save.isPending}>{save.isPending ? 'Saving…' : <><Save size={16}/>{t(" Save profile")}</>}</button></div>
    </form>
  </div>;
}
