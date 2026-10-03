import { describe, it, expect } from 'vitest';
import {
  REG_PUBLISHER, REG_CONTRIBUTOR, REG_STATUSES, normalizeRegStatus, isPublisherStatus,
} from './registrationStatus.js';
import * as web from '../../src/constants/app.js';

describe('profile categories', () => {
  it('has exactly the two categories', () => {
    expect(REG_STATUSES).toEqual(['verified_research_publisher', 'independent_market_contributor']);
  });

  it('maps every retired code like the data migration does', () => {
    expect(normalizeRegStatus('sebi_ra')).toBe(REG_PUBLISHER);
    for (const legacy of ['self_directed', 'enthusiast', 'sebi_ria']) {
      expect(normalizeRegStatus(legacy)).toBe(REG_CONTRIBUTOR);
    }
  });

  it('passes current codes through and rejects unknown ones', () => {
    expect(normalizeRegStatus(REG_PUBLISHER)).toBe(REG_PUBLISHER);
    expect(normalizeRegStatus(REG_CONTRIBUTOR)).toBe(REG_CONTRIBUTOR);
    for (const bad of ['admin', '', null, undefined, 'SEBI_RA']) expect(normalizeRegStatus(bad)).toBeNull();
  });

  it('only the publisher category carries SEBI fields', () => {
    expect(isPublisherStatus(REG_PUBLISHER)).toBe(true);
    expect(isPublisherStatus('sebi_ra')).toBe(true);
    expect(isPublisherStatus(REG_CONTRIBUTOR)).toBe(false);
    expect(isPublisherStatus('sebi_ria')).toBe(false);
  });

  // The server and web copies are independent files; they must not drift.
  it('agrees with the web constants', () => {
    expect([web.REG_PUBLISHER, web.REG_CONTRIBUTOR]).toEqual(REG_STATUSES);
    expect(web.REGISTRATION_OPTIONS.map((o) => o.code)).toEqual(REG_STATUSES);
    for (const v of ['sebi_ra', 'self_directed', 'enthusiast', 'sebi_ria', REG_PUBLISHER, REG_CONTRIBUTOR]) {
      expect(web.normalizeRegStatus(v)).toBe(normalizeRegStatus(v));
    }
    expect(web.normalizeRegStatus(null)).toBe(REG_CONTRIBUTOR);
  });

  it('web selector options carry the specified labels and descriptions', () => {
    expect(web.REGISTRATION_OPTIONS).toEqual([
      expect.objectContaining({ label: 'Verified Research Publisher', requires_sebi_fields: true,
        description: 'SEBI-registered Research Analysts and Research Entities who publish professional investment research.' }),
      expect.objectContaining({ label: 'Independent Market Contributor', requires_sebi_fields: false,
        description: 'Investors and market participants who share independent views, analysis and commentary on companies and markets.' }),
    ]);
  });
});
