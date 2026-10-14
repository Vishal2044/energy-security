import { t } from '../locales/runtime';
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, FileImage, FileText, LockKeyhole, RefreshCw, ShieldCheck, Trash2, Upload, UserRound, } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api, getData } from "../lib/api";
import { Dropdown, PageHeader, PasswordInput } from "../components/ui";
type UserRole = "GUARD" | "MAIN_SECURITY";
type FormState = {
    role: UserRole;
    fullName: string;
    mobile: string;
    alternateMobile: string;
    email: string;
    aadharNumber: string;
    bankName: string;
    branchName: string;
    bankAccountNumber: string;
    ifscCode: string;
    password: string;
    confirmPassword: string;
    assignedSite: string;
    dutyShift: string;
    photoRate: string;
};
type UploadState = {
    userPhoto?: File;
    aadharDocument?: File;
    bankPassbook?: File;
};
const initialForm: FormState = {
    role: "GUARD",
    fullName: "",
    mobile: "",
    alternateMobile: "",
    email: "",
    aadharNumber: "",
    bankName: "",
    branchName: "",
    bankAccountNumber: "",
    ifscCode: "",
    password: "",
    confirmPassword: "",
    assignedSite: "",
    dutyShift: "DAY",
    photoRate: "100",
};
const steps = [
    { label: "Basic details", eyebrow: "01", icon: UserRound },
    { label: "Identity & bank", eyebrow: "02", icon: FileImage },
    { label: "Password", eyebrow: "03", icon: LockKeyhole },
    { label: "Uploads", eyebrow: "04", icon: Upload },
];
export const bankOptions = [
    { value: "State Bank of India (SBI)", label: "State Bank of India", description: "SBI" },
    { value: "Bank of Baroda (BOB)", label: "Bank of Baroda", description: "BOB" },
    { value: "Bank of India (BOI)", label: "Bank of India", description: "BOI" },
    { value: "Central Bank of India", label: "Central Bank of India" },
    { value: "Canara Bank", label: "Canara Bank" },
    { value: "Union Bank of India", label: "Union Bank of India" },
    { value: "Indian Bank", label: "Indian Bank" },
    { value: "Indian Overseas Bank (IOB)", label: "Indian Overseas Bank", description: "IOB" },
    { value: "UCO Bank", label: "UCO Bank" },
    { value: "Bank of Maharashtra", label: "Bank of Maharashtra" },
    { value: "IDBI Bank", label: "IDBI Bank" },
    { value: "HDFC Bank", label: "HDFC Bank" },
    { value: "ICICI Bank", label: "ICICI Bank" },
    { value: "Axis Bank", label: "Axis Bank" },
    { value: "Yes Bank", label: "Yes Bank" },
    { value: "Bandhan Bank", label: "Bandhan Bank" },
    { value: "Gujarat Gramin Bank", label: "Gujarat Gramin Bank", description: "Erstwhile Saurashtra Gramin Bank" },
    { value: "The Gujarat State Co-operative Bank / Jamnagar District Co-operative Bank", label: "Gujarat State Co-operative Bank", description: "Jamnagar District Co-operative Bank" },
];
function formatFileSize(bytes: number) {
    if (bytes < 1024)
        return `${bytes} B`;
    if (bytes < 1024 * 1024)
        return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
export function FileUploadCard({ inputId, label, hint, file, existingPreviewUrl, required = true, onChange, onRemove, }: {
    inputId: string;
    label: string;
    hint: string;
    file?: File;
    existingPreviewUrl?: string;
    required?: boolean;
    onChange: (file?: File) => void;
    onRemove: () => void;
}) {
    const [previewUrl, setPreviewUrl] = useState<string>();
    const isPdf = file?.type === "application/pdf" || file?.name.toLowerCase().endsWith(".pdf");
    const imagePreview = previewUrl ?? existingPreviewUrl;
    useEffect(() => {
        if (!file) {
            setPreviewUrl(undefined);
            return undefined;
        }
        const url = URL.createObjectURL(file);
        setPreviewUrl(url);
        return () => URL.revokeObjectURL(url);
    }, [file]);
    return (<div className={`file-drop ${file ? "has-file" : ""}`}>
      <input id={inputId} className="file-drop-input" type="file" accept="image/*,application/pdf,.pdf" required={required && !file} onChange={(event) => onChange(event.target.files?.[0])}/>
      <label className="file-preview" htmlFor={inputId}>
        {imagePreview && !isPdf && (<img src={imagePreview} alt={`${t(label)} preview`}/>)}
        {file && previewUrl && isPdf && (<iframe src={previewUrl} title={`${label} preview`}/>)}
        {!file && !existingPreviewUrl && (<span className="file-drop-icon">
            <Upload size={18}/>
          </span>)}
      </label>
      <div className="file-drop-info">
        <div className="file-drop-heading">
          <strong>{file?.name ?? label}</strong>
          <span className={file ? "file-ready-pill" : "file-type-pill"}>
            {file ? (isPdf ? "PDF" : "IMAGE") : "PDF / IMAGE"}
          </span>
        </div>
        <small>
          {file ? `${formatFileSize(file.size)} · Ready to upload` : hint}
        </small>
      </div>
      <div className="file-drop-footer">
        <label className="file-drop-action" htmlFor={inputId} onClick={() => {
            const input = document.getElementById(inputId) as HTMLInputElement | null;
            if (input)
                input.value = "";
        }}>
          {file ? <><RefreshCw size={13}/>{t(" Replace")}</> : <>{t("Browse files ")}<Upload size={13}/></>}
        </label>
        {file && (<button type="button" className="file-remove-action" onClick={() => {
                const input = document.getElementById(inputId) as HTMLInputElement | null;
                if (input)
                    input.value = "";
                onRemove();
            }}>
            <Trash2 size={13}/>{t(" Remove ")}</button>)}
      </div>
      {file && isPdf && <div className="file-pdf-badge"><FileText size={13}/>{t(" PDF preview")}</div>}
    </div>);
}
export function AdminUserFormPage({ supervisor = false }: { supervisor?: boolean }) {
    const navigate = useNavigate();
    const formRef = useRef<HTMLFormElement>(null);
    const [step, setStep] = useState(0);
    const [form, setForm] = useState<FormState>(initialForm);
    const [uploads, setUploads] = useState<UploadState>({});
    const sites = useQuery({ queryKey: ["guard-form-sites"], queryFn: () => getData<{ sites: { id: string; siteName: string; siteCode: string; status: string }[] }>("/sites") });
    const nextCode = useQuery({
        queryKey: ["next-employee-code"],
        queryFn: () => getData<{
            employeeCode: string;
        }>("/users/next-employee-code"),
        enabled: form.role === "GUARD",
    });
    const create = useMutation({
        mutationFn: () => {
            const body = new FormData();
            Object.entries(form).forEach(([key, value]) => { if (form.role === "GUARD" || !["assignedSite", "dutyShift", "photoRate"].includes(key)) body.append(key, value); });
            Object.entries(uploads).forEach(([key, file]) => {
                if (file)
                    body.append(key, file);
            });
            return api.post("/users", body);
        },
        onSuccess: () => navigate(form.role === "GUARD" ? "/guards" : "/team"),
    });
    const setField = (key: keyof FormState, value: string) => setForm((current) => ({ ...current, [key]: value }));
    function next() {
        if (!formRef.current?.reportValidity())
            return;
        setStep((current) => Math.min(current + 1, steps.length - 1));
    }
    function previous() {
        setStep((current) => Math.max(current - 1, 0));
    }
    function submit(event: React.FormEvent) {
        event.preventDefault();
        if (!formRef.current?.reportValidity())
            return;
        if (form.password !== form.confirmPassword) {
            setStep(2);
            return;
        }
        create.mutate();
    }
    function fileInput(name: keyof UploadState, label: string, hint: string, required = true) {
        const file = uploads[name];
        return (<FileUploadCard inputId={`upload-${name}`} label={label} hint={t(hint)} file={file} required={required} onChange={(nextFile) => setUploads((current) => ({ ...current, [name]: nextFile }))} onRemove={() => setUploads((current) => ({ ...current, [name]: undefined }))}/>);
    }
    return (<div className="user-form-page">
      <div className="form-back-row">
        <button className="button secondary" onClick={() => navigate(-1)}>
          <ArrowLeft size={16}/>{t(" Back ")}</button>
      </div>
      <section className="user-form-card panel">
        <div className="form-stepper">
          {steps.map((item, index) => {
            const Icon = item.icon;
            return (<div className={`form-step ${index === step ? "active" : ""} ${index < step ? "complete" : ""}`} key={item.label}>
                <span>
                  <Icon size={16}/>
                </span>
                <div>
                  <small>{item.eyebrow}</small>
                  <strong>{item.label}</strong>
                </div>
              </div>);
        })}
        </div>
        <form ref={formRef} className="content-form" onSubmit={submit}>
          {step === 0 && (<div className="form-step-content">
              <div className="form-grid two">
                <label>{t(" Role ")}<Dropdown value={form.role} onChange={(value) => setField("role", value as UserRole)} options={supervisor ? [{ value: "GUARD", label: "Guard" }] : [{ value: "GUARD", label: "Guard", description: "Live photo attendance" }, { value: "MAIN_SECURITY", label: "Security manager", description: "Operations and workforce oversight" }]}/>
                </label>
                {form.role === "GUARD" && <>
                  <label>{t("Assigned site")}<select required value={form.assignedSite} onChange={(e) => setField("assignedSite", e.target.value)}><option value="">{t("Select site")}</option>{sites.data?.sites.filter((site) => site.status === 'ACTIVE').map((site) => <option key={site.id} value={site.id}>{site.siteCode} · {site.siteName}</option>)}</select></label>
                  <label>{t("Duty shift")}<select value={form.dutyShift} onChange={(e) => setField("dutyShift", e.target.value)}><option value="DAY">{t("Day: 8 AM – 8 PM")}</option><option value="NIGHT">{t("Night: 8 PM – 8 AM")}</option></select></label>
                  <label>{t("Rate per photo (₹)")}<input required type="number" min="0" max="100000" step="0.01" value={form.photoRate} onChange={(e) => setField("photoRate", e.target.value)}/></label>
                  <p>{t("Four photos per duty. Each photo has a two-hour submission window. Missing photos are unpaid.")}</p>
                </>}
                <label>
                  Employee code
                  {form.role === "GUARD" ? (<input value={nextCode.data?.employeeCode ?? "Generating…"} readOnly className="readonly-field"/>) : (<input value="Not required for security manager" readOnly className="readonly-field"/>)}
                </label>
                <label>{t(" Full name ")}<input required value={form.fullName} onChange={(event) => setField("fullName", event.target.value)} placeholder={t("e.g. Rakesh Kumar")} autoComplete="name"/>
                </label>
                <label>{t(" Mobile number ")}<input required type="tel" inputMode="numeric" value={form.mobile} onChange={(event) => setField("mobile", event.target.value)} placeholder={t("e.g. 98765 43210")} autoComplete="tel"/>
                </label>
                <label>{t(" Alternate number ")}<input required type="tel" inputMode="numeric" value={form.alternateMobile} onChange={(event) => setField("alternateMobile", event.target.value)} placeholder={t("e.g. 91234 56789")}/>
                </label>
                <label>
                  Email
                  <input required type="email" value={form.email} onChange={(event) => setField("email", event.target.value)} placeholder={t("name@example.com")} autoComplete="email"/>
                </label>
              </div>
            </div>)}
          {step === 1 && (<div className="form-step-content">
              <div className="form-section-heading">
                <span className="eyebrow">{t("IDENTITY & BANKING")}</span>
                <h3>{t("Identity and bank details")}</h3>
                <p>{t(" Use the exact details shown on the user\u2019s official documents. ")}</p>
              </div>
              <div className="form-grid two">
                <label>{t(" Aadhaar number ")}<input required inputMode="numeric" value={form.aadharNumber} onChange={(event) => setField("aadharNumber", event.target.value)} placeholder={t("Enter 12-digit Aadhaar number")} maxLength={12}/>
                </label>
                <label>{t(" Bank name ")}<Dropdown value={form.bankName} onChange={(value) => setField("bankName", value)} options={bankOptions} placeholder={t("Select bank")} required/>
                </label>
                <label>{t(" Branch name ")}<input required value={form.branchName} onChange={(event) => setField("branchName", event.target.value)} placeholder={t("e.g. Dwarka branch")}/>
                </label>
                <label>{t(" Bank account number ")}<input required inputMode="numeric" value={form.bankAccountNumber} onChange={(event) => setField("bankAccountNumber", event.target.value)} placeholder={t("Enter account number")}/>
                </label>
                <label>{t(" IFSC code ")}<input required value={form.ifscCode} onChange={(event) => setField("ifscCode", event.target.value.toUpperCase())} placeholder={t("e.g. SBIN0001234")}/>
                </label>
              </div>
            </div>)}
          {step === 2 && (<div className="form-step-content">
              <div className="form-section-heading">
                <span className="eyebrow">{t("ACCOUNT SECURITY")}</span>
                <h3>{t("Create login password")}</h3>
                <p>{t(" Use at least 6 characters. Keep this password private and share it securely. ")}</p>
              </div>
              <div className="form-grid two">
                <label>{t(" Password ")}<PasswordInput required minLength={6} value={form.password} onChange={(event) => setField("password", event.target.value)} placeholder={t("Create a secure password")} autoComplete="new-password"/>
                </label>
                <label>{t(" Confirm password ")}<PasswordInput required minLength={6} value={form.confirmPassword} onChange={(event) => setField("confirmPassword", event.target.value)} placeholder={t("Re-enter the password")} autoComplete="new-password"/>
                </label>
              </div>
              {form.confirmPassword &&
                form.password !== form.confirmPassword && (<p className="form-error">{t("Passwords do not match.")}</p>)}
            </div>)}
          {step === 3 && (<div className="form-step-content">
              <div className="form-section-heading">
                <span className="eyebrow">{t("DOCUMENT UPLOADS")}</span>
                <h3>{t("Attach verification files")}</h3>
                <p>{t(" Supported formats: PDF, JPG and PNG. Maximum file size is 8 MB per file. ")}</p>
              </div>
              <div className="upload-grid">
                {fileInput("userPhoto", "Upload user photo", "Clear profile photo · JPG or PNG")}
                {fileInput("aadharDocument", "Upload Aadhaar document", "Aadhaar scan · PDF or image")}
                {fileInput("bankPassbook", "Upload bank passbook", "Passbook scan · PDF or image")}
              </div>
            </div>)}
          <div className="form-actions">
            <button type="button" className="button secondary" onClick={step === 0 ? () => navigate(-1) : previous}>
              <ArrowLeft size={16}/> {step === 0 ? "Cancel" : "Previous"}
            </button>
            {step < steps.length - 1 ? (<button type="button" className="button primary" onClick={next}>{t(" Continue ")}<ArrowRight size={16}/>
              </button>) : (<button type="submit" className="button primary" disabled={create.isPending}>
                {create.isPending ? "Creating profile…" : "Create user"}{" "}
                <Check size={16}/>
              </button>)}
          </div>
          {create.isError && (<div className="error-callout">{t(" Could not create this user. Check the details, email and uploaded files, then try again. ")}</div>)}
        </form>
      </section>
    </div>);
}
