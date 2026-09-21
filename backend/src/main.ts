import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureApp } from './configure-app';
import { resolveLogLevels, resolveSwaggerEnabled } from './main.policy';

async function bootstrap(): Promise<void> {
  // NODE_ENV is read straight from the environment rather than through
  // ConfigService, because the logger must be configured in the
  // NestFactory.create call itself — before the application, and therefore
  // before ConfigService, exists.
  const app = await NestFactory.create(AppModule, {
    logger: resolveLogLevels(process.env.NODE_ENV),
  });
  const logger = new Logger('Bootstrap');
  const configService = app.get(ConfigService);

  configureApp(app);
  app.enableShutdownHooks();

  const nodeEnv = configService.get<string>('NODE_ENV');
  const swaggerEnabled = resolveSwaggerEnabled(
    nodeEnv,
    configService.get<boolean>('SWAGGER_ENABLED'),
  );

  if (swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('OpsNow API')
      .setDescription('OpsNow IT Service Management platform API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
    logger.log('API documentation available at /api/docs');

    if (nodeEnv === 'production') {
      // Loud on purpose. Publishing the full API surface in production is a
      // legitimate choice for an internal deployment, but it is an exposure,
      // and this log is the only place an operator will see it happened.
      logger.warn(
        'SWAGGER_ENABLED is set in production — the complete API surface is publicly readable at /api/docs',
      );
    }
  }

  const port = configService.get<number>('PORT', 3000);
  await app.listen(port);
  logger.log(`OpsNow backend listening on port ${port} (env: ${nodeEnv})`);
}

bootstrap().catch((error: unknown) => {
  new Logger('Bootstrap').error(
    'Failed to start the application',
    error instanceof Error ? error.stack : undefined,
  );
  process.exit(1);
});
