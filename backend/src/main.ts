import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureApp } from './configure-app';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');
  const configService = app.get(ConfigService);

  configureApp(app);
  app.enableShutdownHooks();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('OpsNow API')
    .setDescription('OpsNow IT Service Management platform API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = configService.get<number>('PORT', 3000);
  await app.listen(port);
  logger.log(`OpsNow backend listening on port ${port}`);
}

bootstrap().catch((error: unknown) => {
  new Logger('Bootstrap').error(
    'Failed to start the application',
    error instanceof Error ? error.stack : undefined,
  );
  process.exit(1);
});
