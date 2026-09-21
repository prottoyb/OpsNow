import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { trim } from '../../common/transforms/trim.transform';
import { NoControlCharacters } from '../../common/validators/no-control-characters.validator';

/**
 * A vote, optionally with a note for the support team.
 *
 * `isHelpful` is required rather than defaulted: "was this useful?" has
 * no safe default, and a missing value is far more likely to be a client
 * bug than an intent to vote yes.
 *
 * The comment permits newlines (@NoControlCharacters allows tab/LF/CR)
 * and is capped at 1000 — this is a one-paragraph note, not an article.
 */
export class CreateArticleFeedbackDto {
  @ApiProperty()
  @IsBoolean()
  isHelpful!: boolean;

  @ApiPropertyOptional({
    maxLength: 1000,
    description:
      'Visible to staff only. Omitting it on a re-vote clears any comment left previously.',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  @NoControlCharacters()
  comment?: string;
}
