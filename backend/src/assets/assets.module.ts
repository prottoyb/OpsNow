import { Module } from '@nestjs/common';
import { AssetTypesModule } from '../asset-types/asset-types.module';
import { UsersModule } from '../users/users.module';
import { AssetsController } from './assets.controller';
import { AssetsService } from './assets.service';

/**
 * Exports AssetsService so TicketsModule can serve the ticket <-> asset
 * link routes from the existing TicketsController. The dependency runs
 * one way only (tickets -> assets); AssetsService never imports
 * TicketsService, so no forwardRef is needed.
 */
@Module({
  imports: [UsersModule, AssetTypesModule],
  controllers: [AssetsController],
  providers: [AssetsService],
  exports: [AssetsService],
})
export class AssetsModule {}
