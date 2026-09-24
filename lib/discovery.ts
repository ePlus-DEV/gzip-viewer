import { httpUrl } from './feed';

export interface ResourceLink {
  label: string;
  url: string;
  placeholders: string[];
}
export interface ResourceGroup {
  heading: string;
  links: ResourceLink[];
}
export interface LlmsDocument {
  title: string;
  groups: ResourceGroup[];
  languages: string[];
  links: number;
}

// Extract linkable URLs and URL templates without interpreting Markdown as HTML.
export function parseLlms(text: string, source: string): LlmsDocument {
  const groups: ResourceGroup[] = [];
  const languages = new Set<string>();
  let title = 'llms.txt';
  let current: ResourceGroup = {heading: 'Overview', links: []};
  groups.push(current);
  const seenByGroup = new Map<ResourceGroup, Set<string>>();
  seenByGroup.set(current, new Set<string>());

  function add(label: string, raw: string): void {
    const clean = raw.trim().replace(/[.,;]+$/, '');
    const placeholders = [...new Set(
      Array.from(clean.matchAll(/\{([a-z][a-z0-9_]*)\}/gi), match => match[1]!.toLowerCase())
    )];
    try {
      httpUrl(clean.replace(/\{[a-z][a-z0-9_]*\}/gi, 'placeholder'), source);
      const seen = seenByGroup.get(current)!;
      if (seen.has(clean)) return;
      seen.add(clean);
      current.links.push({label: label.trim() || clean, url: clean, placeholders});
    } catch {
      // Ignore invalid destinations; raw text remains accessible in the text fallback.
    }
  }

  for (const line of text.split(/\r?\n/)) {
    const heading = line.match(/^\s*#{1,4}\s+(.+?)\s*$/);
    if (heading) {
      if (heading[0].trimStart().startsWith('# ') && title === 'llms.txt') title = heading[1]!;
      else {
        current = {heading: heading[1]!, links: []};
        groups.push(current);
        seenByGroup.set(current, new Set<string>());
      }
      continue;
    }
    const lang = line.match(/^\s*-\s+[A-Za-zÀ-ỹ ]+\s+\(\s*\x60?([a-z]{2})\x60?\s*\)/i);
    if (lang?.[1]) languages.add(lang[1].toLowerCase());

    const markdown = /\[([^\]]+)\]\((https?:\/\/[^)\s]+|\/[^)\s]+)\)/g;
    let match: RegExpExecArray | null;
    while ((match = markdown.exec(line)) !== null) add(match[1]!, match[2]!);
    let remainder = line.replace(markdown, '');

    const code = /\x60((?:https?:\/\/|\/)[^\x60]+)\x60/g;
    while ((match = code.exec(remainder)) !== null) {
      const prefix = remainder.slice(0, match.index).replace(/^[\s>*\-]+/, '').replace(/:\s*$/, '');
      add(prefix || 'Endpoint', match[1]!);
    }
    remainder = remainder.replace(code, '');

    const raw = /https?:\/\/[^\s<>)\]]+/g;
    while ((match = raw.exec(remainder)) !== null) {
      const prefix = remainder.slice(0, match.index).replace(/^[\s>*\-]+/, '').replace(/:\s*$/, '');
      add(prefix || 'Website', match[0]!);
    }
  }
  const actual = groups.filter(group => group.links.length);
  return {
    title, groups: actual, languages: [...languages],
    links: actual.reduce((count, group) => count + group.links.length, 0),
  };
}

export function resolveLink(link: ResourceLink, source: string, values: Record<string, string> = {}): string | null {
  let raw = link.url;
  for (const name of link.placeholders) {
    const value = values[name]?.trim();
    if (!value || value.length > 180 || /[\/?#]/.test(value)) return null;
    raw = raw.replace(new RegExp('\\{' + name + '\\}', 'gi'), encodeURIComponent(value));
  }
  try {
    return httpUrl(raw, source).href;
  } catch {
    return null;
  }
}
