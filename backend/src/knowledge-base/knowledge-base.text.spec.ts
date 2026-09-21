import {
  EXCERPT_LENGTH,
  FALLBACK_SLUG,
  MAX_SLUG_LENGTH,
  slugForAttempt,
  toExcerpt,
  toSlug,
} from './knowledge-base.text';

describe('toSlug', () => {
  it.each([
    ['How to Reset Your Password', 'how-to-reset-your-password'],
    ['  Leading and trailing  ', 'leading-and-trailing'],
    ['VPN / Wi-Fi: troubleshooting (2026)', 'vpn-wi-fi-troubleshooting-2026'],
    ['Multiple   spaces___and---dashes', 'multiple-spaces-and-dashes'],
  ])('slugifies %j', (title, expected) => {
    expect(toSlug(title)).toBe(expected);
  });

  it('folds accented Latin letters to ASCII rather than dissolving them into dashes', () => {
    expect(toSlug('Passwort zurücksetzen')).toBe('passwort-zurucksetzen');
    expect(toSlug('Réinitialiser le mot de passe')).toBe(
      'reinitialiser-le-mot-de-passe',
    );
  });

  it('never emits a leading or trailing dash', () => {
    expect(toSlug('--- !!! Hello !!! ---')).toBe('hello');
  });

  it('caps the slug and does not leave a trailing dash behind after the cut', () => {
    // Words of 4 chars + a dash tile evenly, so the naive slice lands on a
    // dash — the regression this assertion pins.
    const slug = toSlug('word '.repeat(100));
    expect(slug.length).toBeLessThanOrEqual(MAX_SLUG_LENGTH);
    expect(slug.endsWith('-')).toBe(false);
  });

  it.each([['   '], ['!!!'], ['你好']])(
    'falls back for a title with nothing sluggable (%j)',
    (title) => {
      expect(toSlug(title)).toBe(FALLBACK_SLUG);
    },
  );
});

describe('slugForAttempt', () => {
  it('uses the bare slug on the first attempt', () => {
    expect(slugForAttempt('vpn-issues', 1)).toBe('vpn-issues');
  });

  it.each([
    [2, 'vpn-issues-2'],
    [3, 'vpn-issues-3'],
    [5, 'vpn-issues-5'],
  ])('appends -%s on attempt %s', (attempt, expected) => {
    expect(slugForAttempt('vpn-issues', attempt)).toBe(expected);
  });

  it('stays within the schema column width even at the length cap', () => {
    const base = toSlug('x'.repeat(400));
    // knowledge_base_articles.slug is VarChar(220).
    expect(slugForAttempt(base, 99).length).toBeLessThanOrEqual(220);
  });
});

describe('toExcerpt', () => {
  it('returns short content unchanged', () => {
    expect(toExcerpt('A short answer.')).toBe('A short answer.');
  });

  it('flattens newlines and runs of whitespace to single spaces', () => {
    expect(toExcerpt('Line one\n\nLine two\tindented')).toBe(
      'Line one Line two indented',
    );
  });

  it('truncates long content with an ellipsis', () => {
    const excerpt = toExcerpt('word '.repeat(500));
    expect(excerpt.length).toBeLessThanOrEqual(EXCERPT_LENGTH + 3);
    expect(excerpt.endsWith('...')).toBe(true);
  });

  it('never returns the whole body — this is what keeps list payloads bounded', () => {
    const content = 'x'.repeat(50000);
    expect(toExcerpt(content).length).toBeLessThan(content.length);
  });
});
