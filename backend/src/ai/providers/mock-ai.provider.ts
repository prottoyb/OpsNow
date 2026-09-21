import { MOCK_MARKER } from '../ai.constants';
import { AiGenerateResult, AiMode, AiPrompt, AiProvider } from '../ai.types';

const UUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
const CATEGORY_LINE = new RegExp(`^CATEGORY (${UUID}) `, 'm');
const ARTICLE_LINE = new RegExp(`^ARTICLE (${UUID}) `, 'm');

/**
 * Canned, clearly-marked output for demos and the e2e suite. Selected ONLY by
 * an explicit AI_PROVIDER=mock, which Joi rejects in production (ADR-023
 * Decision 3) — never as a fallback for a missing key.
 *
 * It answers with ids it finds in the prompt's closed lists, so its output
 * passes the same validators as a real model's; it does not get a back door.
 */
export class MockAiProvider implements AiProvider {
  readonly mode: AiMode = 'mock';

  generate(prompt: AiPrompt): Promise<AiGenerateResult> {
    const categoryId = CATEGORY_LINE.exec(prompt.user)?.[1] ?? null;
    const articleId = ARTICLE_LINE.exec(prompt.user)?.[1];

    let payload: unknown;
    switch (prompt.task) {
      case 'triage':
        payload = {
          categoryId,
          priority: 'Medium',
          rationale: `${MOCK_MARKER} Canned triage suggestion.`,
          articleIds: articleId ? [articleId] : [],
        };
        break;
      case 'draft_response':
        payload = {
          draft: `${MOCK_MARKER}\n\nHello,\n\nThank you for contacting IT support. We are looking into this and will update you shortly.\n\nKind regards,\nIT Support`,
          articleIds: articleId ? [articleId] : [],
        };
        break;
      case 'resolution_summary':
        payload = {
          summary: `${MOCK_MARKER} Canned resolution summary.`,
        };
        break;
    }

    return Promise.resolve({
      text: JSON.stringify(payload),
      model: 'mock',
    });
  }
}
