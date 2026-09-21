import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

/**
 * Rejects a window whose end is before its start.
 *
 * Declared on `to` rather than `from` so the error names the field the caller
 * most likely mistyped, and skipped entirely unless BOTH ends are present and
 * are real Dates — otherwise a caller who sent only a malformed `from` would
 * get two errors for one mistake, the second of them misleading.
 */
export function IsNotBeforeFrom(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return function (target: object, propertyName: string | symbol): void {
    registerDecorator({
      name: 'isNotBeforeFrom',
      target: target.constructor,
      propertyName: propertyName as string,
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments): boolean {
          const { from } = args.object as { from?: unknown };
          if (!(value instanceof Date) || !(from instanceof Date)) {
            return true;
          }
          return from.getTime() <= value.getTime();
        },
        defaultMessage(): string {
          return 'to must be the same as or later than from';
        },
      },
    });
  };
}
