import { Badge } from '../../../components/ui/Badge';
import type { BadgeTone } from '../../../components/ui/Badge';
import type { KnowledgeArticleStatus } from '../../../types/api';
import { articleStatusLabel } from '../articleStatus';

/**
 * Tone is decoration only — the badge always renders the status as text, so
 * nothing is conveyed by colour alone (WCAG 1.4.1).
 */
const STATUS_TONES: Record<KnowledgeArticleStatus, BadgeTone> = {
  Draft: 'warning',
  Published: 'success',
  Archived: 'neutral',
};

export function ArticleStatusBadge({
  status,
}: {
  status: KnowledgeArticleStatus;
}) {
  return (
    <Badge tone={STATUS_TONES[status]} srPrefix="Status:">
      {articleStatusLabel(status)}
    </Badge>
  );
}
