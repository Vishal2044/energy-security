import { PaginationControls } from '../components/ui';
import { usePageQuery } from '../lib/pagination';
import { t } from '../locales/runtime';
import { ErrorState } from '../components/ui';
import { useState } from 'react';
import { ArrowLeft, BriefcaseBusiness, Building2, CalendarDays, ExternalLink, FileText, Landmark, Mail, MapPin, Phone, ShieldCheck, UserRound, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { ApiRequestError, getData } from '../lib/api';
import { PreviewImage, Dialog, EmptyState, LoadingState, PageHeader, StatusBadge, UserAvatar } from '../components/ui';
type ProfileDetails = {
    role: string;
    active: boolean;
    mobile?: string;
    alternateMobile?: string;
    aadharNumber?: string;
    bank?: {
        bankName?: string;
        branchName?: string;
        accountNumber?: string;
        ifscCode?: string;
    };
    address?: string;
    nameGujarati?: string;
    village?: string;
    taluka?: string;
    district?: string;
    employeeCode?: string;
    assignedSite?: string;
    assignedSiteId?: string;
    assignedSiteCode?: string;
    assignedSiteName?: string;
    joiningDate?: string;
    monthlySalary?: number;
    dutyShift?: string;
    photoRate?: number;
    preferredLanguage?: string;
    employmentStatus?: string;
};
type ProfileDocument = {
    id: string;
    type: string;
    originalName?: string;
    uploadedAt?: string;
    mimeType?: string;
    size?: number;
    previewUrl?: string;
};
type ProfileData = {
    scope?: 'OPERATIONS_ONLY';
    user: {
        id: string;
        name: string;
        email: string;
        role: string;
        active: boolean;
        profilePhotoUrl?: string;
    };
    guard?: {
        profilePhotoUrl?: string;
        employeeCode?: string;
        monthlySalary?: number;
        documentCount?: number;
    };
    profile: ProfileDetails;
    documents: ProfileDocument[];
};
function roleLabel(role: string) { return role === 'ADMIN' ? 'Administrator' : role === 'GUARD' ? 'Security guard' : 'Security manager'; }
function display(value?: string | number) { return value === undefined || value === null || value === '' ? 'Not available' : String(value); }
function dateLabel(value?: string) { return value ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Not available'; }
function DetailCard({ eyebrow, title, icon, children }: {
    eyebrow: string;
    title: string;
    icon: React.ReactNode;
    children: React.ReactNode;
}) { return <section className="panel profile-detail-card"><div className="panel-heading"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div>{icon}</div><div className="profile-detail-list">{children}</div></section>; }
function DetailRow({ label, value, icon }: {
    label: string;
    value: React.ReactNode;
    icon?: React.ReactNode;
}) { return <div><span>{icon}{label}</span><strong>{value}</strong></div>; }
function DocumentPreview({ document, onClose }: {
    document: ProfileDocument;
    onClose: () => void;
}) {
    const previewUrl = document.previewUrl ?? `/api/documents/${document.id}/preview`;
    const isImage = document.mimeType?.startsWith('image/');
    const isPdf = document.mimeType === 'application/pdf' || document.originalName?.toLowerCase().endsWith('.pdf');
    return <Dialog className="document-preview-modal" backdropClassName="document-preview-backdrop" label={`Preview ${document.originalName ?? document.type}`} onClose={onClose}><div className="document-preview-header"><div><span className="eyebrow">{t("DOCUMENT PREVIEW")}</span><h2>{document.originalName || document.type.replaceAll('_', ' ')}</h2><p>{document.type.replaceAll('_', ' ')}{t(" \u00B7 Uploaded document")}</p></div><button type="button" className="document-preview-close" onClick={onClose} aria-label={t("Close preview")}><X size={18}/></button></div><div className="document-preview-body">{isImage && <PreviewImage src={previewUrl} alt={document.originalName ?? 'Document preview'}/>}{isPdf && <iframe src={previewUrl} title={document.originalName ?? 'PDF preview'}/>}{!isImage && !isPdf && <div className="document-preview-fallback"><FileText size={42}/><h3>{t("Preview unavailable for this file type")}</h3><p>{t("Open the original file in a new tab to view it.")}</p></div>}</div><div className="document-preview-footer"><span>{document.size ? `${Math.ceil(document.size / 1024)} KB` : 'Secure file'}</span><a className="button primary" href={previewUrl} target="_blank" rel="noreferrer">{t("Open file ")}<ExternalLink size={15}/></a></div></Dialog>;
}
export function UserProfilePage() {
    const { id = '' } = useParams();
    const navigate = useNavigate();
    const [selectedDocument, setSelectedDocument] = useState<ProfileDocument>();
    const profile = usePageQuery<ProfileData>(['profile', id], `/profiles/${id}`, {}, Boolean(id));
    if (profile.isLoading)
        return <LoadingState />;
    if (profile.error instanceof ApiRequestError && profile.error.status === 403)
        return <div className="error-callout">{t("You do not have access to this profile. / \u0A86 \u0AAA\u0ACD\u0AB0\u0ACB\u0AAB\u0ABE\u0A87\u0AB2 \u0A9C\u0ACB\u0AB5\u0ABE\u0AA8\u0AC0 \u0AAA\u0AB0\u0AB5\u0ABE\u0AA8\u0A97\u0AC0 \u0AA8\u0AA5\u0AC0.")}<button className="button secondary" onClick={() => navigate(-1)}>{t("Go back")}</button></div>;
    if (profile.isError)
        return <ErrorState onRetry={() => void profile.refetch()}/>;
    if (!profile.data)
        return <div className="empty-state"><div className="empty-icon"><UserRound size={22}/></div><h3>{t("Profile not found")}</h3><p>{t("This user profile is no longer available.")}</p><button className="button secondary" onClick={() => navigate(-1)}>{t("Go back")}</button></div>;
    const { user, guard, profile: details, documents } = profile.data;
    const privateView = profile.data.scope !== 'OPERATIONS_ONLY';
    const photoUrl = user.profilePhotoUrl ?? guard?.profilePhotoUrl;
    return <div className="profile-page"><PageHeader eyebrow="USER PROFILE" title={user.name} description={t("Complete identity, access, workforce and document details.")} action={<button className="button secondary" onClick={() => navigate(-1)}><ArrowLeft size={16}/>{t(" Back")}</button>}/><section className="panel profile-hero"><div className="profile-hero-main"><UserAvatar name={user.name} src={photoUrl} className="profile-avatar"/><div><span className="eyebrow">{roleLabel(user.role)}</span><h2>{user.name}</h2><p>{user.email}</p><div className="profile-tags"><StatusBadge value={user.active ? 'ACTIVE' : 'INACTIVE'}/>{details.employeeCode && <code>{details.employeeCode}</code>}</div></div></div><div className="profile-hero-mark"><ShieldCheck size={22}/><span>{t("Account details")}</span></div></section><div className="profile-detail-grid"><DetailCard eyebrow="CONTACT" title={t("Contact details")} icon={<Mail size={19} className="muted-icon"/>}><DetailRow label="Email" value={display(user.email)} icon={<Mail size={14}/>}/><DetailRow label="Mobile" value={display(details.mobile)} icon={<Phone size={14}/>}/><DetailRow label="Alternate" value={display(details.alternateMobile)} icon={<Phone size={14}/>}/><DetailRow label="Language" value={display(details.preferredLanguage)}/></DetailCard><DetailCard eyebrow="ACCESS" title={t("Role & account")} icon={<ShieldCheck size={19} className="muted-icon"/>}><DetailRow label="Role" value={roleLabel(details.role)}/><DetailRow label="Account status" value={<StatusBadge value={details.active ? 'ACTIVE' : 'INACTIVE'}/>}/><DetailRow label="Employment" value={<StatusBadge value={details.employmentStatus ?? 'ACTIVE'}/>}/><DetailRow label="User ID" value={<code>{user.id}</code>}/></DetailCard>{privateView && <DetailCard eyebrow="PERSONAL" title={t("Personal details")} icon={<MapPin size={19} className="muted-icon"/>}><DetailRow label="Aadhaar" value={display(details.aadharNumber)}/><DetailRow label="Gujarati name" value={display(details.nameGujarati)}/><DetailRow label="Address" value={display(details.address)}/><DetailRow label="Village" value={display(details.village)}/><DetailRow label="Taluka" value={display(details.taluka)}/><DetailRow label="District" value={display(details.district)}/><DetailRow label="Joining date" value={dateLabel(details.joiningDate)} icon={<CalendarDays size={14}/>}/></DetailCard>}<DetailCard eyebrow="WORKFORCE" title={t("Assignment & payroll")} icon={<BriefcaseBusiness size={19} className="muted-icon"/>}><DetailRow label="Employee code" value={display(details.employeeCode)}/><DetailRow label="Assigned site" value={display(details.assignedSiteName || details.assignedSiteCode || details.assignedSite)} icon={<Building2 size={14}/>}/><DetailRow label="Site ID" value={display(details.assignedSiteId)}/>{privateView && details.photoRate !== undefined && <><DetailRow label="Duty shift" value={details.dutyShift === "NIGHT" ? t("Night: 8 PM – 8 AM") : t("Day: 8 AM – 8 PM")}/><DetailRow label="Photo rate" value={`₹${details.photoRate.toLocaleString("en-IN")}`}/></>}{privateView && details.photoRate === undefined && <DetailRow label="Monthly salary" value={details.monthlySalary === undefined ? 'Not available' : `₹${details.monthlySalary.toLocaleString('en-IN')}`}/>}{privateView && <DetailRow label="Documents" value={`${documents.length || guard?.documentCount || 0} uploaded`} icon={<FileText size={14}/>}/>}</DetailCard>{privateView && <DetailCard eyebrow="BANKING" title={t("Bank details")} icon={<Landmark size={19} className="muted-icon"/>}><DetailRow label="Bank" value={display(details.bank?.bankName)}/><DetailRow label="Branch" value={display(details.bank?.branchName)}/><DetailRow label="Account" value={display(details.bank?.accountNumber)}/><DetailRow label="IFSC" value={display(details.bank?.ifscCode)}/></DetailCard>}</div>{privateView && <section className="panel profile-documents-card"><div className="panel-heading"><div><span className="eyebrow">{t("UPLOADED RECORDS")}</span><h2>{t("Documents")}</h2></div><FileText size={19} className="muted-icon"/></div>{documents.length ? <div className="profile-document-list">{documents.map((document, index) => <button type="button" className="profile-document-row" key={document.id} onClick={() => setSelectedDocument(document)}><div className="profile-document-icon"><FileText size={17}/></div><div><strong><span className="inline-record-index">{profile.startIndex + index + 1}</span>{document.originalName || document.type.replaceAll('_', ' ')}</strong><span>{document.type.replaceAll('_', ' ')} · {dateLabel(document.uploadedAt)}</span></div></button>)}</div> : <EmptyState title={t("No documents uploaded")} description={t("Required user documents will appear here after upload.")} icon={<FileText />}/>}<PaginationControls pagination={profile.pagination} page={profile.page} onPageChange={profile.setPage} busy={profile.isFetching} /></section>}{selectedDocument && <DocumentPreview document={selectedDocument} onClose={() => setSelectedDocument(undefined)}/>}</div>;
}
