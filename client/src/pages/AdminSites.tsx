import { ExternalLink, MapPinned, Plus, Users } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, getData } from '../lib/api';
import { useNavigate } from 'react-router-dom';
import { EmptyState, LoadingState, PageHeader, StatusBadge } from '../components/ui';

type Site = { id: string; siteCode: string; siteName: string; siteType: string; farmerAddress?: string; district?: string; subDistrict?: string; village?: string; mapLink?: string; latitude?: number; longitude?: number; geofenceRadiusMeters?: number; assignedGuards: string[]; status: string };
export function AdminSitesPage({ canManage = true }: { canManage?: boolean }) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const sites = useQuery({ queryKey: ['sites'], queryFn: () => getData<{ sites: Site[] }>('/sites') });
  const toggle = useMutation({ mutationFn: (site: Site) => api.patch(`/sites/${site.id}`, { status: site.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' }), onSuccess: () => { client.invalidateQueries({ queryKey: ['sites'] }); client.invalidateQueries({ queryKey: ['dashboard'] }); } });

  return <>
    <PageHeader eyebrow="OPERATIONS SETUP" title="Sites" description="Create the locations where guards will be assigned and verified." action={canManage ? <button className="button primary" onClick={() => navigate('/sites/new')}><Plus size={17} /> Add site</button> : undefined} />
    {sites.isLoading ? <LoadingState /> : sites.data?.sites.length ? <div className="site-card-grid">{sites.data.sites.map((site) => { const farmSite = site.siteType === 'WIND' || site.siteType === 'SOLAR'; return <article className="site-card panel" key={site.id}><div className="site-card-top"><span className="site-type">{site.siteType}</span><StatusBadge value={site.status} /></div><div className="site-card-title-row"><div className="site-symbol"><MapPinned size={21} /></div><div><span className="site-card-name-label">{farmSite ? 'Farmer name' : 'Store name'}</span><h2>{site.siteName || 'Name not added'}</h2><code>{site.siteCode || 'Code not added'}</code></div></div><div className="site-card-details">{farmSite && <div><span>Farmer address</span><strong>{site.farmerAddress || 'Not added'}</strong></div>}<div><span>District</span><strong>{site.district || 'Not added'}</strong></div><div><span>Sub District</span><strong>{site.subDistrict || 'Not added'}</strong></div><div><span>Village</span><strong>{site.village || 'Not added'}</strong></div></div>{site.mapLink && <a className="site-map-link" href={site.mapLink} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Open Google Maps link</a>}<div className="site-card-meta"><span><Users size={15} /> {site.assignedGuards.length} guards</span>{canManage && <><button className="link-button" onClick={() => navigate(`/sites/${site.id}/edit`)}>Edit</button><button className="link-button" onClick={() => toggle.mutate(site)}>{site.status === 'ACTIVE' ? 'Disable' : 'Enable'}</button></>}</div></article>; })}</div> : <section className="panel"><EmptyState title="No sites configured" description={canManage ? 'Add a site to start assigning guards.' : 'No sites have been configured yet.'} icon={<MapPinned />} /></section>}
  </>;
}
