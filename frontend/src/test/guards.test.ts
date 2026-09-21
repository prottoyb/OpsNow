import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = join(HERE, '..');

/** This guard file necessarily contains the forbidden strings it looks for. */
const SELF = join(HERE, 'guards.test.ts');

const SOURCE_EXTENSIONS = ['.ts', '.tsx'];

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...listSourceFiles(full));
      continue;
    }
    if (SOURCE_EXTENSIONS.some((ext) => entry.endsWith(ext))) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Strips comments so the guards scan CODE, not prose: a module that
 * documents *why* it never touches web storage must not be reported as
 * using it. String and template literals are preserved, so a forbidden
 * call hidden inside a string is still caught.
 */
function stripComments(source: string): string {
  let out = '';
  let index = 0;
  let quote: string | null = null;

  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];

    if (quote) {
      out += char;
      if (char === '\\') {
        out += next ?? '';
        index += 2;
        continue;
      }
      if (char === quote) {
        quote = null;
      }
      index += 1;
      continue;
    }

    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      out += char;
      index += 1;
      continue;
    }

    if (char === '/' && next === '/') {
      while (index < source.length && source[index] !== '\n') {
        index += 1;
      }
      continue;
    }

    if (char === '/' && next === '*') {
      index += 2;
      while (
        index < source.length &&
        !(source[index] === '*' && source[index + 1] === '/')
      ) {
        index += 1;
      }
      index += 2;
      continue;
    }

    out += char;
    index += 1;
  }

  return out;
}

function readCode(file: string): string {
  return stripComments(readFileSync(file, 'utf8'));
}

function isTestFile(file: string): boolean {
  const segments = relative(SRC_ROOT, file).split(sep);
  const name = segments[segments.length - 1];
  return (
    /\.(test|spec)\.tsx?$/.test(name) ||
    segments.includes('test') ||
    segments.includes('mocks')
  );
}

const ALL_SOURCE_FILES = listSourceFiles(SRC_ROOT).filter(
  (file) => file !== SELF,
);
const PRODUCTION_FILES = ALL_SOURCE_FILES.filter((file) => !isTestFile(file));

function offendersFor(files: string[], pattern: RegExp): string[] {
  return files
    .filter((file) => pattern.test(readCode(file)))
    .map((file) => relative(SRC_ROOT, file));
}

describe('comment stripper', () => {
  it('removes comments but keeps string contents', () => {
    const source = [
      '// uses localStorage',
      '/* also mentions localStorage */',
      'const url = "http://example.test/a//b";',
      'const kept = "localStorage";',
    ].join('\n');

    const code = stripComments(source);

    expect(code).not.toContain('uses localStorage');
    expect(code).not.toContain('also mentions');
    expect(code).toContain('http://example.test/a//b');
    expect(code).toContain('const kept = "localStorage";');
  });
});

describe('XSS guard', () => {
  /**
   * All user-generated content (ticket subjects, descriptions, comment
   * bodies, category names, knowledge article bodies and feedback comments)
   * is rendered as React text nodes, which escape by construction. The APIs
   * below are the only realistic way to lose that guarantee, so their absence
   * is asserted rather than assumed.
   *
   * `dangerouslySetInnerHTML` is the load-bearing one for the knowledge base:
   * an article body is author-written text that every Employee reads, so
   * rendering it as HTML or Markdown would let any staff author plant script
   * that runs in an Administrator's session. See `ArticleBody` in
   * `features/knowledge-base/pages/ArticleDetailPage.tsx`.
   */
  const FORBIDDEN_PATTERNS: ReadonlyArray<{ label: string; pattern: RegExp }> = [
    { label: 'dangerouslySetInnerHTML', pattern: /dangerouslySetInnerHTML/ },
    { label: 'innerHTML', pattern: /\binnerHTML\b/ },
    { label: 'outerHTML', pattern: /\bouterHTML\b/ },
    { label: 'insertAdjacentHTML', pattern: /\binsertAdjacentHTML\b/ },
    { label: 'document.write', pattern: /document\s*\.\s*write\b/ },
    { label: 'eval(', pattern: /(^|[^.\w])eval\s*\(/ },
    { label: 'new Function(', pattern: /new\s+Function\s*\(/ },
  ];

  it('finds source files to scan', () => {
    expect(ALL_SOURCE_FILES.length).toBeGreaterThan(0);
  });

  it.each(FORBIDDEN_PATTERNS)('no source file uses $label', ({ pattern, label }) => {
    expect(
      offendersFor(ALL_SOURCE_FILES, pattern),
      `${label} must not appear in src/; render user content as React text nodes instead`,
    ).toEqual([]);
  });

  /**
   * A non-literal `href` can smuggle a `javascript:` URL in from server data.
   * Internal navigation goes through react-router's <Link to=...> and the app
   * renders no external links, so every `href` in src/ must be a literal.
   */
  it('has no non-literal href attribute', () => {
    expect(
      offendersFor(ALL_SOURCE_FILES, /href\s*=\s*\{/),
      'href must be a string literal; use <Link to=...> for navigation',
    ).toEqual([]);
  });

  /**
   * The complement of the `dangerouslySetInnerHTML` ban: a Markdown or HTML
   * renderer would reintroduce exactly the surface that ban exists to close,
   * whether or not it happened to be wired up through `innerHTML`. Rich
   * formatting is not a requirement anywhere in this app, so pulling one in
   * is a decision that must be taken deliberately — and not by an import.
   */
  it('renders no user content through a markdown or HTML renderer', () => {
    expect(
      offendersFor(
        ALL_SOURCE_FILES,
        /from\s+['"](react-)?(markdown|marked|remark|rehype|showdown|snarkdown|micromark|html-react-parser|dompurify)[^'"]*['"]/i,
      ),
      'article bodies and comments are plain text; adding a markdown/HTML renderer reopens the stored-XSS surface',
    ).toEqual([]);
  });
});

describe('bundle hygiene guard', () => {
  /**
   * MSW is a test-only dependency used through `msw/node` + `setupServer`. If
   * a production module ever imported the handlers, the mock API could be
   * bundled into — and intercept requests in — the real application.
   */
  it('finds production source files to scan', () => {
    expect(PRODUCTION_FILES.length).toBeGreaterThan(0);
  });

  it('no production module imports the MSW handlers', () => {
    expect(
      offendersFor(PRODUCTION_FILES, /from\s+['"][^'"]*mocks\/handlers['"]/),
    ).toEqual([]);
  });

  it('no production module imports msw', () => {
    expect(
      offendersFor(PRODUCTION_FILES, /from\s+['"]msw(\/[^'"]*)?['"]/),
    ).toEqual([]);
  });

  it('never uses the MSW browser worker', () => {
    expect(
      offendersFor(ALL_SOURCE_FILES, /msw\/browser|\bsetupWorker\b/),
      'MSW must be used through msw/node and setupServer only',
    ).toEqual([]);
  });

  /**
   * The access token lives in a module-level variable and must never reach a
   * persistent, XSS-readable store.
   */
  it('never persists auth state to web storage', () => {
    expect(
      offendersFor(
        ALL_SOURCE_FILES,
        /\b(localStorage|sessionStorage)\b|document\s*\.\s*cookie/,
      ),
      'the access token is held in memory only; no web storage',
    ).toEqual([]);
  });
});
