import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DEFAULT_AI_MODEL, DEFAULT_AI_TIMEOUT_MS } from '../config/env.validation';
import { KnowledgeBaseModule } from '../knowledge-base/knowledge-base.module';
import { AiAssistantService } from './ai-assistant.service';
import { ConcurrencyLimiter } from './ai.concurrency';
import { AI_MAX_IN_FLIGHT } from './ai.constants';
import { AiController } from './ai.controller';
import { createAiProvider } from './ai.provider.factory';
import { AI_PROVIDER } from './ai.types';

/**
 * Phase 12 — AI ticket assistant (ADR-023). A read-only side car: it imports
 * KnowledgeBaseModule (PrismaModule and ConfigModule are global) and nothing
 * from tickets, and no ticket route calls it. The provider is resolved once
 * from configuration; the key is read only through ConfigService and never
 * logged.
 */
@Module({
  imports: [KnowledgeBaseModule],
  controllers: [AiController],
  providers: [
    AiAssistantService,
    { provide: ConcurrencyLimiter, useFactory: () => new ConcurrencyLimiter(AI_MAX_IN_FLIGHT) },
    {
      provide: AI_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const provider = createAiProvider({
          provider: config.get<string>('AI_PROVIDER'),
          apiKey: config.get<string>('AI_API_KEY'),
          model: config.get<string>('AI_MODEL', DEFAULT_AI_MODEL),
          timeoutMs: config.get<number>('AI_TIMEOUT_MS', DEFAULT_AI_TIMEOUT_MS),
        });
        new Logger('AiModule').log(`AI assistant mode: ${provider.mode}`);
        return provider;
      },
    },
  ],
})
export class AiModule {}
