import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

/**
 * Applies the application-wide HTTP configuration (prefix, versioning,
 * validation, error handling). Shared between `main.ts` and the e2e test
 * bootstrap so the two can never drift apart.
 */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api');
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());
}
