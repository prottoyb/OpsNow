/** class-transformer @Transform value function: trims string input,
 * passes anything else through unchanged. Shared so DTOs needing a
 * trimmed, non-empty text field don't each redeclare the same function. */
export function trim({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}
