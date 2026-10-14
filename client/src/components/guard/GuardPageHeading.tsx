import type { ReactNode } from 'react';

export function GuardPageHeading({ icon, title, description }: { icon: ReactNode; title: string; description?: string }) {
  return <header className="guard-page-heading"><div className="guard-heading-icon" aria-hidden="true">{icon}</div><div><span className="eyebrow">DG ENERGY</span><h1>{title}</h1>{description && <p>{description}</p>}</div></header>;
}

export function GuardMetric({ icon, label, value, detail, tone = 'brand' }: { icon: ReactNode; label: string; value: string | number; detail?: string; tone?: 'brand' | 'success' | 'warning' }) {
  return <article className={`guard-metric tone-${tone}`}><span className="guard-metric-icon" aria-hidden="true">{icon}</span><span>{label}</span><strong>{value}</strong>{detail && <small>{detail}</small>}</article>;
}
