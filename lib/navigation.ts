import { httpUrl } from './feed';

export interface NavItem {
  url: string;
  label: string;
}
const MAX_ANCESTORS = 24;

export function documentLabel(url: string): string {
  try {
    const parsed = httpUrl(url);
    return parsed.pathname.split('/').filter(Boolean).pop() || parsed.hostname;
  } catch {
    return 'Document';
  }
}

export function readTrail(raw: string | null): NavItem[] {
  if (!raw || raw.length > 14000) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.slice(0, MAX_ANCESTORS).flatMap((entry): NavItem[] => {
      if (!entry || typeof entry !== 'object' || !('url' in entry)) return [];
      const url = (entry as {url: unknown}).url;
      const label = (entry as {label?: unknown}).label;
      if (typeof url !== 'string') return [];
      try {
        return [{url: httpUrl(url).href, label: typeof label === 'string' && label.trim()
          ? label.slice(0, 120) : documentLabel(url)}];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}

export function viewerHref(viewerPage: string, url: string, trail: NavItem[] = [], label?: string): string {
  const target = httpUrl(url);
  const page = new URL(viewerPage);
  page.searchParams.set('url', target.href);
  if (trail.length) page.searchParams.set('trail', JSON.stringify(trail.slice(-MAX_ANCESTORS)));
  if (label) page.searchParams.set('label', label.slice(0, 120));
  return page.href;
}

export function childTrail(trail: NavItem[], current: NavItem): NavItem[] {
  return [...trail, current].slice(-MAX_ANCESTORS);
}
