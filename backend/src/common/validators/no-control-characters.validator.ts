import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

/**
 * Every C0 control character and DEL, except the three that legitimately
 * appear in free text a user pasted in (tab, line feed, carriage
 * return).
 *
 * NUL (\u0000) is the one that matters most: Postgres rejects it outright
 * in a text value (SQLSTATE 22021), and Prisma surfaces that as a
 * PrismaClientUnknownRequestError, which no error mapper recognises — so
 * it reaches the client as a 500 instead of the 400 that malformed input
 * deserves. The remaining control characters are excluded on the same
 * principle: they carry no meaning in these fields and only make stored
 * values hard to display, diff or log safely.
 */
// This regex exists precisely to match control characters; the class is
// written with escapes so no raw control byte lives in this source file.
// eslint-disable-next-line no-control-regex
const DISALLOWED_CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

export function containsControlCharacters(value: string): boolean {
  return DISALLOWED_CONTROL_CHARACTERS.test(value);
}

/**
 * Rejects text containing NUL or other C0 control characters, so that
 * input the database cannot store is a 400 at the DTO boundary rather
 * than a 500 from the driver. Non-string values are left to the field's
 * own `@IsString()` to report.
 */
export function NoControlCharacters(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return function (target: object, propertyName: string | symbol): void {
    registerDecorator({
      name: 'noControlCharacters',
      target: target.constructor,
      propertyName: propertyName as string,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          return typeof value !== 'string' || !containsControlCharacters(value);
        },
        defaultMessage(args: ValidationArguments): string {
          return `${args.property} must not contain control characters`;
        },
      },
    });
  };
}
