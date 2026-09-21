import { MAX_DRAFT_CHARS, MAX_RATIONALE_CHARS, MAX_SUMMARY_CHARS } from './ai.constants';
import {
  buildDraftResponsePrompt,
  buildResolutionSummaryPrompt,
  buildTriagePrompt,
} from './ai.prompts';
import {
  parseJsonObject,
  validateDraftOutput,
  validateSummaryOutput,
  validateTriageOutput,
} from './ai.output';
import { AiProviderError } from './ai.types';
import { MockAiProvider } from './providers/mock-ai.provider';

const CAT = '11111111-1111-4111-8111-111111111111';
const ART = '22222222-2222-4222-8222-222222222222';
const cats = new Set([CAT]);
const arts = new Set([ART]);

function reason(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return (error as AiProviderError).reason;
  }
  return undefined;
}

describe('parseJsonObject', () => {
  it.each([
    ['plain text', 'sorry, I cannot help'],
    ['empty', ''],
    ['truncated json', '{"categoryId": "x"'],
    ['a json array', '[1,2]'],
    ['a json scalar with braces around prose', 'nope {broken'],
  ])('rejects %s as invalid_output', (_name, text) => {
    expect(reason(() => parseJsonObject(text))).toBe('invalid_output');
  });

  it('accepts a fenced block and surrounding prose', () => {
    expect(parseJsonObject('Here you go:\n```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });
});

describe('validateTriageOutput', () => {
  const ok = { categoryId: CAT, priority: 'High', rationale: 'because', articleIds: [ART] };

  it('accepts a fully valid answer', () => {
    expect(validateTriageOutput(JSON.stringify(ok), cats, arts)).toEqual({
      categoryId: CAT,
      priority: 'High',
      rationale: 'because',
      articleIds: [ART],
    });
  });

  it.each([
    ['unknown category id', { ...ok, categoryId: '99999999-9999-4999-8999-999999999999' }, 'categoryId'],
    ['non-string category id', { ...ok, categoryId: 7 }, 'categoryId'],
    ['category id from the wrong list', { ...ok, categoryId: ART }, 'categoryId'],
    ['invalid priority', { ...ok, priority: 'Urgent' }, 'priority'],
    ['lower-case priority', { ...ok, priority: 'high' }, 'priority'],
    ['oversized rationale', { ...ok, rationale: 'r'.repeat(MAX_RATIONALE_CHARS + 1) }, 'rationale'],
    ['empty rationale', { ...ok, rationale: '   ' }, 'rationale'],
  ])('degrades %s to null and keeps the rest', (_name, body, field) => {
    const out = validateTriageOutput(JSON.stringify(body), cats, arts) as unknown as Record<
      string,
      unknown
    >;
    expect(out[field]).toBeNull();
    const others = ['categoryId', 'priority', 'rationale'].filter((f) => f !== field);
    for (const f of others) {
      expect(out[f]).not.toBeNull();
    }
  });

  it('drops article ids outside the candidate set, duplicates and non-strings', () => {
    const out = validateTriageOutput(
      JSON.stringify({
        ...ok,
        articleIds: [ART, ART, '33333333-3333-4333-8333-333333333333', 5, null],
      }),
      cats,
      arts,
    );
    expect(out.articleIds).toEqual([ART]);
  });

  it('treats non-array articleIds as none', () => {
    expect(validateTriageOutput(JSON.stringify({ ...ok, articleIds: ART }), cats, arts).articleIds).toEqual(
      [],
    );
  });

  it('strips control characters from the rationale', () => {
    const out = validateTriageOutput(
      JSON.stringify({ ...ok, rationale: `fine${String.fromCharCode(0)}${String.fromCharCode(7)} text` }),
      cats,
      arts,
    );
    expect(out.rationale).toBe('fine text');
  });

  it('is invalid_output when the text is not a JSON object at all', () => {
    expect(reason(() => validateTriageOutput('nope', cats, arts))).toBe('invalid_output');
  });
});

describe('validateDraftOutput', () => {
  it('accepts a draft and grounds its articles', () => {
    expect(
      validateDraftOutput(JSON.stringify({ draft: ' Hello ', articleIds: [ART, 'x'] }), arts),
    ).toEqual({ draft: 'Hello', articleIds: [ART] });
  });

  it.each([
    ['missing', {}],
    ['empty', { draft: '' }],
    ['whitespace only', { draft: '  \n ' }],
    ['not a string', { draft: 42 }],
    ['oversized', { draft: 'd'.repeat(MAX_DRAFT_CHARS + 1) }],
    ['only control characters', { draft: String.fromCharCode(0, 1, 2) }],
  ])('rejects a %s draft as invalid_output', (_name, body) => {
    expect(reason(() => validateDraftOutput(JSON.stringify(body), arts))).toBe('invalid_output');
  });

  it('strips control characters and keeps newlines', () => {
    const out = validateDraftOutput(
      JSON.stringify({ draft: `line1\nli${String.fromCharCode(0)}ne2` }),
      arts,
    );
    expect(out.draft).toBe('line1\nline2');
  });
});

describe('validateSummaryOutput', () => {
  it('accepts a summary', () => {
    expect(validateSummaryOutput('{"summary":"Fixed."}')).toEqual({ summary: 'Fixed.' });
  });

  it.each([
    ['empty', { summary: '' }],
    ['oversized', { summary: 's'.repeat(MAX_SUMMARY_CHARS + 1) }],
    ['missing', {}],
  ])('rejects a %s summary', (_name, body) => {
    expect(reason(() => validateSummaryOutput(JSON.stringify(body)))).toBe('invalid_output');
  });
});

describe('MockAiProvider output', () => {
  const provider = new MockAiProvider();
  const ticket = { subject: 's', description: 'd', priority: 'Low', status: 'New' };
  const categories = [{ id: CAT, name: 'Network' }];
  const articles = [{ id: ART, title: 'T', excerpt: 'E' }];

  it('passes the same triage validator a real model would', async () => {
    const result = await provider.generate(buildTriagePrompt({ ticket, categories, articles }));
    const out = validateTriageOutput(result.text, cats, arts);
    expect(out.categoryId).toBe(CAT);
    expect(out.priority).toBe('Medium');
    expect(out.articleIds).toEqual([ART]);
    expect(out.rationale).toContain('MOCK');
  });

  it('passes the draft and summary validators and is clearly marked', async () => {
    const draft = await provider.generate(
      buildDraftResponsePrompt({ ticket, articles, publicComments: [] }),
    );
    expect(validateDraftOutput(draft.text, arts).draft).toContain('MOCK AI OUTPUT');

    const summary = await provider.generate(
      buildResolutionSummaryPrompt({ ticket, publicComments: [] }),
    );
    expect(validateSummaryOutput(summary.text).summary).toContain('MOCK AI OUTPUT');
  });
});
