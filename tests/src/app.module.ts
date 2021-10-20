import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from "@nestjs/config";
import { LeaderElectionModule } from '../../lib';

@Module({
  imports: [
    LeaderElectionModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory(configService: ConfigService) {
        const host = configService.get('REDIS_HOST');
        const port = Number(configService.get('REDIS_HOST'));
        const db = Number(configService.get('REDIS_DB'));

        return {
          host,
          port,
          db,
          prefix: 'some-prefix',
        };
      },
    }),
  ],
})
export class AppModule {}
