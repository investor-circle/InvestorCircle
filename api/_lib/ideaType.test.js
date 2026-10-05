import { describe, it, expect } from 'vitest';
import {
  RECOMMENDATION_TYPES, MARKET_VIEW_TYPES, MARKET_VIEW_MIN_COMMENTARY, DISCLOSURE_MAX_CHARS,
  DEFAULT_MARKET_VIEW_DISCLOSURE, publishingPersona, commentaryText, applyPublishingRules,
} from './ideaType.js';
import * as web from '../../src/utils/ideaType.js';
import * as mobile from '../../mobile/src/utils/ideaType.js';
import * as pub from '../../web-public/lib/ideaType.js';

const COMMENTARY = 'Order inflow is accelerating and margins have room to expand from here.';

describe('publishingPersona', () => {
  it('is verified_publisher only for a publisher whose SEBI verification is approved', () => {
    expect(publishingPersona('verified_research_publisher', 'approved')).toBe('verified_publisher');
    expect(publishingPersona('sebi_ra', 'approved')).toBe('verified_publisher'); // legacy code, pre-migration row
  });
  it('is contributor for everyone else', () => {
    for (const ap of ['pending', 'not_applied', 'rejected', null, undefined]) {
      expect(publishingPersona('verified_research_publisher', ap), String(ap)).toBe('contributor');
    }
    expect(publishingPersona('independent_market_contributor', 'approved')).toBe('contributor');
    expect(publishingPersona('sebi_ria', 'approved')).toBe('contributor');
    expect(publishingPersona(null, null)).toBe('contributor');
  });
});

describe('applyPublishingRules — Verified Research Publisher', () => {
  it('accepts Buy / Hold / Sell and keeps the professional fields', () => {
    for (const recType of RECOMMENDATION_TYPES) {
      const r = applyPublishingRules({ recType, priceAt: 10, targetPrice: 12, stopLoss: 9, horizon: '6m', conviction: 'Low' }, 'verified_publisher');
      expect(r.ok).toBe(true);
      expect(r.reco).toMatchObject({ recType, priceAt: 10, targetPrice: 12, stopLoss: 9, horizon: '6m', conviction: 'Low' });
      expect(r.disclosure).toBeNull();
    }
  });
  it('defaults a missing type to Buy (unchanged legacy behaviour)', () => {
    expect(applyPublishingRules({}, 'verified_publisher').reco.recType).toBe('Buy');
  });
  it('rejects Market View types and unknown types', () => {
    for (const recType of [...MARKET_VIEW_TYPES, 'Accumulate', 'buy']) {
      expect(applyPublishingRules({ recType }, 'verified_publisher').ok, recType).toBe(false);
    }
  });
  it('ignores a disclosure — existing disclaimer behaviour is unchanged', () => {
    expect(applyPublishingRules({ recType: 'Buy', disclosure: 'x' }, 'verified_publisher').disclosure).toBeNull();
  });
});

describe('applyPublishingRules — Independent Market Contributor', () => {
  const view = (o = {}) => ({ recType: 'Positive', thesis: COMMENTARY, disclosure: 'Personal view.', ...o });

  it('accepts Positive / Neutral / Negative', () => {
    for (const recType of MARKET_VIEW_TYPES) expect(applyPublishingRules(view({ recType }), 'contributor').ok, recType).toBe(true);
  });
  it('rejects Buy / Hold / Sell, a missing type and anything else', () => {
    for (const recType of [...RECOMMENDATION_TYPES, undefined, '', 'Bullish', 'Bearish', 'positive']) {
      const r = applyPublishingRules(view({ recType }), 'contributor');
      expect(r.ok, String(recType)).toBe(false);
      expect(r.error).toBe('invalid_idea_type');
    }
  });
  it('nulls every recommendation-performance field instead of trusting the client', () => {
    const r = applyPublishingRules(view({
      priceAt: 1, price: 1, priceSource: 'nse', targetPrice: 2, stopLoss: 0.5, horizon: '12m', targetDate: '2030-01-01', conviction: 'High',
    }), 'contributor');
    for (const f of ['priceAt', 'price', 'priceSource', 'targetPrice', 'stopLoss', 'horizon', 'targetDate', 'conviction']) {
      expect(r.reco[f], f).toBeNull();
    }
  });
  it('requires meaningful commentary, ignoring link URLs', () => {
    expect(applyPublishingRules(view({ thesis: 'short' }), 'contributor').error).toBe('commentary_required');
    expect(applyPublishingRules(view({ thesis: undefined }), 'contributor').error).toBe('commentary_required');
    expect(applyPublishingRules(view({ thesis: '—' }), 'contributor').error).toBe('commentary_required');
    expect(applyPublishingRules(view({ thesis: '[x](https://example.com/' + 'a'.repeat(80) + ')' }), 'contributor').error).toBe('commentary_required');
    const json = JSON.stringify({ __v: '1', text: COMMENTARY, images: [] });
    expect(applyPublishingRules(view({ thesis: json }), 'contributor').ok).toBe(true);
  });
  it('requires an editable disclosure, trimmed and length-limited', () => {
    expect(applyPublishingRules(view({ disclosure: '   ' }), 'contributor').error).toBe('disclosure_required');
    expect(applyPublishingRules(view({ disclosure: undefined }), 'contributor').error).toBe('disclosure_required');
    expect(applyPublishingRules(view({ disclosure: 'x'.repeat(DISCLOSURE_MAX_CHARS + 1) }), 'contributor').error).toBe('disclosure_too_long');
    expect(applyPublishingRules(view({ disclosure: '  mine  ' }), 'contributor').disclosure).toBe('mine');
  });
  it('the default disclosure itself satisfies the rules', () => {
    expect(DEFAULT_MARKET_VIEW_DISCLOSURE.length).toBeLessThanOrEqual(DISCLOSURE_MAX_CHARS);
    expect(applyPublishingRules(view({ disclosure: DEFAULT_MARKET_VIEW_DISCLOSURE }), 'contributor').ok).toBe(true);
  });
});

describe('commentaryText', () => {
  it('reads plain and serialised theses', () => {
    expect(commentaryText('hello')).toBe('hello');
    expect(commentaryText(JSON.stringify({ __v: '1', text: 'hi there', images: ['data:x'] }))).toBe('hi there');
    expect(commentaryText(null)).toBe('');
  });
});

// The server (authoritative) and web copies are separate files; they must not drift.
describe('web / server parity', () => {
  it('shares types, limits, default disclosure and persona rules', () => {
    expect(web.RECOMMENDATION_TYPES).toEqual(RECOMMENDATION_TYPES);
    expect(web.MARKET_VIEW_TYPES).toEqual(MARKET_VIEW_TYPES);
    expect(web.MARKET_VIEW_MIN_COMMENTARY).toBe(MARKET_VIEW_MIN_COMMENTARY);
    expect(web.DISCLOSURE_MAX_CHARS).toBe(DISCLOSURE_MAX_CHARS);
    expect(web.DEFAULT_MARKET_VIEW_DISCLOSURE).toBe(DEFAULT_MARKET_VIEW_DISCLOSURE);
    for (const st of ['verified_research_publisher', 'independent_market_contributor', 'sebi_ra', 'sebi_ria', null]) {
      for (const ap of ['approved', 'pending', 'rejected', 'not_applied', null]) {
        expect(web.publishingPersona(st, ap), `${st}/${ap}`).toBe(publishingPersona(st, ap));
      }
    }
    const t = JSON.stringify({ __v: '1', text: 'abc [l](http://u) def', images: [] });
    expect(web.commentaryText(t)).toBe(commentaryText(t));
  });
});

describe('mobile / web-public parity', () => {
  it('mobile shares types, limits, default disclosure and persona rules', () => {
    expect(mobile.RECOMMENDATION_TYPES).toEqual(RECOMMENDATION_TYPES);
    expect(mobile.MARKET_VIEW_TYPES).toEqual(MARKET_VIEW_TYPES);
    expect(mobile.MARKET_VIEW_MIN_COMMENTARY).toBe(MARKET_VIEW_MIN_COMMENTARY);
    expect(mobile.DISCLOSURE_MAX_CHARS).toBe(DISCLOSURE_MAX_CHARS);
    expect(mobile.DEFAULT_MARKET_VIEW_DISCLOSURE).toBe(DEFAULT_MARKET_VIEW_DISCLOSURE);
    for (const st of ['verified_research_publisher', 'independent_market_contributor', 'sebi_ra', 'sebi_ria', null]) {
      for (const ap of ['approved', 'pending', 'rejected', 'not_applied', null]) {
        expect(mobile.publishingPersona(st, ap), `${st}/${ap}`).toBe(publishingPersona(st, ap));
      }
    }
    for (const t of [...RECOMMENDATION_TYPES, ...MARKET_VIEW_TYPES, undefined]) {
      expect(mobile.ideaTypeMeta(t)).toEqual(web.ideaTypeMeta(t));
    }
  });
  it('web-public recognises the same Market View types', () => {
    expect(pub.MARKET_VIEW_TYPES).toEqual(MARKET_VIEW_TYPES);
    for (const t of MARKET_VIEW_TYPES) expect(pub.ideaTypeMeta(t).label).toBe(t);
    expect(pub.ideaTypeMeta('Hold').label).toBe('Hold');
    expect(pub.ideaTypeMeta(undefined).label).toBe('Buy');
  });
});

describe('web display helpers', () => {
  it('labels and tones every type; unknown/missing falls back to Buy (legacy)', () => {
    expect(web.ideaTypeMeta('Buy')).toEqual({ label: 'Buy', tone: 'gain' });
    expect(web.ideaTypeMeta('Hold')).toEqual({ label: 'Hold', tone: 'muted' });
    expect(web.ideaTypeMeta('Sell')).toEqual({ label: 'Sell', tone: 'loss' });
    expect(web.ideaTypeMeta('Positive')).toEqual({ label: 'Positive', tone: 'gain' });
    expect(web.ideaTypeMeta('Neutral')).toEqual({ label: 'Neutral', tone: 'muted' });
    expect(web.ideaTypeMeta('Negative')).toEqual({ label: 'Negative', tone: 'loss' });
    expect(web.ideaTypeMeta(undefined).label).toBe('Buy');
  });
  it('recognises Market Views from either row shape', () => {
    expect(web.isMarketViewIdea({ recommendation_type: 'Negative' })).toBe(true);
    expect(web.isMarketViewIdea({ recType: 'Neutral' })).toBe(true);
    expect(web.isMarketViewIdea({ recType: 'Hold' })).toBe(false);
    expect(web.isMarketViewIdea({})).toBe(false);
    expect(web.onlyRecommendations([{ recType: 'Buy' }, { recType: 'Positive' }, { recommendation_type: 'Hold' }])).toHaveLength(2);
  });
});
