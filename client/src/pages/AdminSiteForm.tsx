import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, Check, Loader2, MapPin } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { api, getData } from "../lib/api";
import { Dropdown, LoadingState, PageHeader } from "../components/ui";

type Site = {
  id: string;
  siteCode: string;
  siteName: string;
  siteType: string;
  farmerAddress?: string;
  district?: string;
  subDistrict?: string;
  village?: string;
  mapLink?: string;
  latitude?: number;
  longitude?: number;
  geofenceRadiusMeters?: number;
  clientName?: string;
  clientContact?: string;
  siteAddress?: string;
  reportingInstructions?: string;
  approvedGuardStrength?: number;
  requiredShiftCoverage?: number;
  region?: string;
  zone?: string;
  cluster?: string;
  sop?: string;
  postOrders?: string;
};
type SiteForm = {
  siteCode: string;
  siteName: string;
  siteType: "WIND" | "SOLAR" | "STORE" | "OTHER";
  farmerAddress: string;
  district: string;
  subDistrict: string;
  village: string;
  mapLink: string;
  latitude: string;
  longitude: string;
  geofenceRadiusMeters: string;
  clientName: string;
  clientContact: string;
  siteAddress: string;
  reportingInstructions: string;
  approvedGuardStrength: string;
  requiredShiftCoverage: string;
  region: string;
  zone: string;
  cluster: string;
  sop: string;
  postOrders: string;
};

const emptyForm: SiteForm = {
  siteCode: "",
  siteName: "",
  siteType: "WIND",
  farmerAddress: "",
  district: "Devbhumi Dwarka",
  subDistrict: "Kalyanpur",
  village: "",
  mapLink: "",
  latitude: "",
  longitude: "",
  geofenceRadiusMeters: "100",
  clientName: "",
  clientContact: "",
  siteAddress: "",
  reportingInstructions: "",
  approvedGuardStrength: "",
  requiredShiftCoverage: "",
  region: "",
  zone: "",
  cluster: "",
  sop: "",
  postOrders: "",
};

const districtOptions = [{ value: "Devbhumi Dwarka", label: "Devbhumi Dwarka" }];
const subDistrictOptions = [{ value: "Kalyanpur", label: "Kalyanpur" }];
const villageOptions = ["Mahadeveiya", "Bhatiya", "Ranjitpur", "Pindara", "Gaga", "Nandana"].map((name) => ({ value: name, label: name }));
const siteCodeOptions = Array.from({ length: 10 }, (_, index) => { const code = String(index + 1); return { value: code, label: code }; });

export function AdminSiteFormPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const editing = Boolean(id);
  const sites = useQuery({ queryKey: ["sites"], queryFn: () => getData<{ sites: Site[] }>("/sites") });
  const source = sites.data?.sites.find((site) => site.id === id);
  const [form, setForm] = useState<SiteForm>(() => source
    ? {
        ...emptyForm,
        siteCode: source.siteCode,
        siteName: source.siteName,
        siteType: source.siteType as SiteForm["siteType"],
        farmerAddress: source.farmerAddress ?? "",
        district: source.district || "Devbhumi Dwarka",
        subDistrict: source.subDistrict || "Kalyanpur",
        village: source.village ?? "",
        mapLink: source.mapLink ?? "",
        latitude: source.latitude === undefined ? "" : String(source.latitude),
        longitude: source.longitude === undefined ? "" : String(source.longitude),
        geofenceRadiusMeters: source.geofenceRadiusMeters === undefined ? "100" : String(source.geofenceRadiusMeters),
        clientName: source.clientName ?? "",
        clientContact: source.clientContact ?? "",
        siteAddress: source.siteAddress ?? "",
        reportingInstructions: source.reportingInstructions ?? "",
        approvedGuardStrength: source.approvedGuardStrength === undefined ? "" : String(source.approvedGuardStrength),
        requiredShiftCoverage: source.requiredShiftCoverage === undefined ? "" : String(source.requiredShiftCoverage),
        region: source.region ?? "",
        zone: source.zone ?? "",
        cluster: source.cluster ?? "",
        sop: source.sop ?? "",
        postOrders: source.postOrders ?? "",
      }
    : emptyForm);
  const availableSiteCodes = form.siteCode && !siteCodeOptions.some((option) => option.value === form.siteCode)
    ? [{ value: form.siteCode, label: form.siteCode }, ...siteCodeOptions]
    : siteCodeOptions;

  useEffect(() => {
    if (!source) return;
    setForm({
      ...emptyForm,
      siteCode: source.siteCode,
      siteName: source.siteName,
      siteType: source.siteType as SiteForm["siteType"],
      farmerAddress: source.farmerAddress ?? "",
      district: source.district || "Devbhumi Dwarka",
      subDistrict: source.subDistrict || "Kalyanpur",
      village: source.village ?? "",
      mapLink: source.mapLink ?? "",
      latitude: source.latitude === undefined ? "" : String(source.latitude),
      longitude: source.longitude === undefined ? "" : String(source.longitude),
      geofenceRadiusMeters: source.geofenceRadiusMeters === undefined ? "100" : String(source.geofenceRadiusMeters),
      clientName: source.clientName ?? "",
      clientContact: source.clientContact ?? "",
      siteAddress: source.siteAddress ?? "",
      reportingInstructions: source.reportingInstructions ?? "",
      approvedGuardStrength: source.approvedGuardStrength === undefined ? "" : String(source.approvedGuardStrength),
      requiredShiftCoverage: source.requiredShiftCoverage === undefined ? "" : String(source.requiredShiftCoverage),
      region: source.region ?? "",
      zone: source.zone ?? "",
      cluster: source.cluster ?? "",
      sop: source.sop ?? "",
      postOrders: source.postOrders ?? "",
    });
  }, [source]);

  const save = useMutation({
    mutationFn: () => {
      const latitude = form.latitude.trim() ? Number(form.latitude) : undefined;
      const longitude = form.longitude.trim() ? Number(form.longitude) : undefined;
      const geofenceRadiusMeters = form.geofenceRadiusMeters.trim() ? Number(form.geofenceRadiusMeters) : undefined;
      const sitePayload = {
        siteCode: form.siteCode,
        siteName: form.siteName,
        siteType: form.siteType,
        ...(form.siteType === "WIND" || form.siteType === "SOLAR" ? { farmerAddress: form.farmerAddress } : {}),
        district: form.district,
        subDistrict: form.subDistrict,
        village: form.village,
        ...(form.mapLink.trim() ? { mapLink: form.mapLink.trim() } : editing ? { mapLink: null } : {}),
        ...(Number.isFinite(latitude) && Number.isFinite(longitude)
          ? { latitude, longitude }
          : editing
            ? { latitude: null, longitude: null }
            : {}),
        ...(Number.isFinite(geofenceRadiusMeters)
          ? { geofenceRadiusMeters }
          : editing
            ? { geofenceRadiusMeters: null }
            : {}),
        clientName: form.clientName.trim(),
        clientContact: form.clientContact.trim(),
        siteAddress: form.siteAddress.trim(),
        reportingInstructions: form.reportingInstructions.trim(),
        ...(form.approvedGuardStrength.trim() ? { approvedGuardStrength: Number(form.approvedGuardStrength) } : {}),
        ...(form.requiredShiftCoverage.trim() ? { requiredShiftCoverage: Number(form.requiredShiftCoverage) } : {}),
        region: form.region.trim(),
        zone: form.zone.trim(),
        cluster: form.cluster.trim(),
        sop: form.sop.trim(),
        postOrders: form.postOrders.trim(),
      };
      return editing ? api.patch(`/sites/${id}`, sitePayload) : api.post("/sites", sitePayload);
    },
    onSuccess: () => navigate("/sites"),
  });

  if (editing && sites.isLoading) return <LoadingState />;

  function setField(key: keyof SiteForm, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function setSiteType(value: string) {
    setForm((current) => ({
      ...current,
      siteType: value as SiteForm["siteType"],
    }));
  }

  function setDistrict(value: string) {
    setForm((current) => ({ ...current, district: value, subDistrict: "", village: "" }));
  }

  function setSubDistrict(value: string) {
    setForm((current) => ({ ...current, subDistrict: value, village: "" }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    save.mutate();
  }

  return (
    <div className="site-form-page">
      <PageHeader
        eyebrow="OPERATIONS SETUP"
        title={editing ? "Edit site" : "Add site"}
        description="Create the location where guards will be assigned and verified."
        action={<button className="button secondary" onClick={() => navigate("/sites")}><ArrowLeft size={16} /> Back to sites</button>}
      />
      <section className="content-form-card panel">
        <div className="form-section-heading"><span className="eyebrow">SITE PROFILE</span><h2>{editing ? "Update site details" : "Create a new site"}</h2><p>Keep the site code and location details consistent with field records.</p></div>
        <form className="content-form" onSubmit={submit}>
          <div className="form-section-heading"><span className="eyebrow">OPERATIONS PROFILE</span><h3>Client and post instructions</h3><p>Keep field reporting and site coverage information available to supervisors.</p></div>
          <div className="form-grid two">
            <label>Client name<input value={form.clientName} onChange={(event) => setField("clientName", event.target.value)} /></label>
            <label>Client contact<input value={form.clientContact} onChange={(event) => setField("clientContact", event.target.value)} /></label>
            <label>Site address<input value={form.siteAddress} onChange={(event) => setField("siteAddress", event.target.value)} /></label>
            <label>Reporting instructions<textarea value={form.reportingInstructions} onChange={(event) => setField("reportingInstructions", event.target.value)} /></label>
            <label>Approved guard strength<input type="number" min="0" value={form.approvedGuardStrength} onChange={(event) => setField("approvedGuardStrength", event.target.value)} /></label>
            <label>Required shift coverage<input type="number" min="0" value={form.requiredShiftCoverage} onChange={(event) => setField("requiredShiftCoverage", event.target.value)} /></label>
            <label>Region<input value={form.region} onChange={(event) => setField("region", event.target.value)} /></label>
            <label>Zone<input value={form.zone} onChange={(event) => setField("zone", event.target.value)} /></label>
            <label>Cluster<input value={form.cluster} onChange={(event) => setField("cluster", event.target.value)} /></label>
            <label>SOP<textarea value={form.sop} onChange={(event) => setField("sop", event.target.value)} /></label>
            <label>Post orders<textarea value={form.postOrders} onChange={(event) => setField("postOrders", event.target.value)} /></label>
          </div>
          <div className="form-grid two site-details-grid">
            <label>Site type<Dropdown value={form.siteType} onChange={setSiteType} options={[{ value: "WIND", label: "Wind site", description: "Farmer land location" }, { value: "SOLAR", label: "Solar site", description: "Farmer land location" }, { value: "STORE", label: "Store", description: "Equipment and inventory location" }, { value: "OTHER", label: "Other", description: "Another managed location" }]} required /></label>
            {(form.siteType === "WIND" || form.siteType === "SOLAR") ? <>
              <label>Site code<Dropdown value={form.siteCode} onChange={(value) => setField("siteCode", value)} options={availableSiteCodes} placeholder="Select site code" required /></label>
              <label>Farmer name<input required value={form.siteName} onChange={(event) => setField("siteName", event.target.value)} placeholder="Enter farmer name" /></label>
              <label>Farmer address<input value={form.farmerAddress} onChange={(event) => setField("farmerAddress", event.target.value)} placeholder="Enter farmer address" /></label>
            </> : <>
              <label>Store code<Dropdown value={form.siteCode} onChange={(value) => setField("siteCode", value)} options={availableSiteCodes} placeholder="Select store code" required /></label>
              <label>Store name<input required value={form.siteName} onChange={(event) => setField("siteName", event.target.value)} placeholder="Enter store name" /></label>
            </>}
          </div>

          <div className="site-location-fields">
            <div className="form-grid two">
              <label>District<Dropdown value={form.district} onChange={setDistrict} options={districtOptions} placeholder="Select district" /></label>
              <label>Sub District<Dropdown value={form.subDistrict} onChange={setSubDistrict} options={subDistrictOptions} placeholder="Select sub-district" disabled={!form.district} /></label>
              <label>Village<Dropdown value={form.village} onChange={(value) => setField("village", value)} options={villageOptions} placeholder="Select village" disabled={!form.subDistrict} /></label>
            </div>
            <label className="location-link-field"><span className="location-field-label"><MapPin size={15} /> Google Maps Link (Optional)</span><input type="url" value={form.mapLink} onChange={(event) => setField("mapLink", event.target.value)} placeholder="Paste Google Maps location link" inputMode="url" /><span className="location-field-hint">Paste a link to open this site in Google Maps.</span></label>
            <div className="form-grid three site-geofence-fields">
              <label>Site latitude<input type="number" min="-90" max="90" step="any" value={form.latitude} onChange={(event) => setField("latitude", event.target.value)} placeholder="e.g. 22.3072" inputMode="decimal" /></label>
              <label>Site longitude<input type="number" min="-180" max="180" step="any" value={form.longitude} onChange={(event) => setField("longitude", event.target.value)} placeholder="e.g. 70.8022" inputMode="decimal" /></label>
              <label>Geofence radius (m)<input type="number" min="1" max="100000" step="1" value={form.geofenceRadiusMeters} onChange={(event) => setField("geofenceRadiusMeters", event.target.value)} placeholder="100" inputMode="numeric" /></label>
            </div>
            <span className="location-field-hint">Coordinates and radius are used to flag inaccurate or outside-site attendance. Leave coordinates blank when a site is not configured for GPS validation.</span>
          </div>

          <div className="form-actions"><button type="button" className="button secondary" onClick={() => navigate("/sites")}>Cancel</button><button className="button primary" disabled={save.isPending}>{save.isPending ? "Saving…" : editing ? "Save changes" : "Create site"} <Check size={16} /></button></div>
          {save.isError && <div className="error-callout">Site could not be saved. Check the details and try again.</div>}
        </form>
      </section>
    </div>
  );
}
