import {describe, expect, it} from 'vitest';
import {dashboardHref} from '../lib/dashboard-navigation';

const dashboard = 'chrome-extension://abcdefghijklmnop/test-runner.html';
describe('resource explorer dashboard navigation', () => {
  it('opens the main audit dashboard, not a second popup, without auto-running', () => {
    const href = new URL(dashboardHref(dashboard,
      'https://example.com/sitemap/upload/products.xml.gz', [],
      {auditMode:'seo',auditScope:'full',lastUrl:'https://other.example/llms.txt'}));
    expect(href.pathname).toBe('/test-runner.html');
    expect(href.searchParams.get('url')).toBe('https://example.com/robots.txt');
    expect(href.searchParams.get('mode')).toBe('seo');
    expect(href.searchParams.get('scope')).toBe('full');
    expect(href.searchParams.has('autorun')).toBe(false);
  });
  it('returns to the original audit site when an explored link crosses domains', () => {
    const href = new URL(dashboardHref(dashboard,
      'https://production.example/sitemap/child.xml.gz',
      [{url:'https://staging.example/llms.txt', label:'LLMS'}],
      {auditMode:'aeo',auditScope:'quick'},false));
    expect(href.searchParams.get('url')).toBe('https://staging.example/llms.txt');
    expect(href.searchParams.get('mode')).toBe('aeo');
  });
  it('Run Tests from a resource is a one-click action and preserves the chosen suite', () => {
    const href = new URL(dashboardHref(dashboard,'http://example.com/sitemap.xml',[],
      {auditMode:'seo'},true));
    expect(href.searchParams.get('autorun')).toBe('1');
    expect(href.searchParams.get('mode')).toBe('seo');
    expect(href.searchParams.get('url')).toBe('http://example.com/robots.txt');
  });
  it('handles missing or invalid resource origins without inventing one', () => {
    const empty = new URL(dashboardHref(dashboard,null,[],{}));
    expect(empty.searchParams.has('url')).toBe(false);
    expect(empty.searchParams.has('autorun')).toBe(false);
    const saved = new URL(dashboardHref(dashboard,'javascript:bad',[],
      {lastUrl:'https://saved.example/index.json'}));
    expect(saved.searchParams.get('url')).toBe('https://saved.example/llms.txt');
  });
});
