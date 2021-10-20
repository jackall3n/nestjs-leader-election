import { DynamicModule, Global, Module, Provider, Type } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';

import {
  LeaderElectionAsyncOptions,
  LeaderElectionOptions,
  LeaderElectionOptionsFactory,
} from './interfaces';
import { LEADER_ELECTION_MODULE_OPTIONS } from './constants';

import { HeartbeatService } from './services/heartbeat.service';
import { RedisClientService } from './services/redis-client.service';
import { LeaderElectionService } from './services/leader-election.service';

@Global()
@Module({
  imports: [ScheduleModule.forRoot()],
})
export class LeaderElectionModule {
  static forRoot(options: LeaderElectionOptions): DynamicModule {
    return {
      module: LeaderElectionModule,
      providers: [
        {
          provide: LEADER_ELECTION_MODULE_OPTIONS,
          useValue: options,
        },
        RedisClientService,
        ...this.createProviders(),
      ],
      exports: [LeaderElectionService],
    };
  }

  static forRootAsync(options: LeaderElectionAsyncOptions): DynamicModule {
    const asyncProviders = this.createAsyncProviders(options);

    const redisServiceProvider: Provider = {
      provide: RedisClientService,
      async useFactory(leaderElectionOptions: LeaderElectionOptions) {
        return new RedisClientService(leaderElectionOptions);
      },
      inject: [LEADER_ELECTION_MODULE_OPTIONS],
    };

    return {
      module: LeaderElectionModule,
      imports: options.imports,
      providers: [
        ...asyncProviders,
        redisServiceProvider,
        ...this.createProviders(),
      ],
    };
  }

  static createProviders(): Provider[] {
    return [
      {
        provide: HeartbeatService,
        inject: [RedisClientService],
        useClass: HeartbeatService,
      },
      {
        provide: LeaderElectionService,
        inject: [HeartbeatService],
        useClass: LeaderElectionService,
      },
    ];
  }

  static createAsyncProviders(options: LeaderElectionAsyncOptions): Provider[] {
    if (options.useFactory || options.useExisting) {
      return [this.createAsyncOptionsProviders(options)];
    }

    const useClass = options.useClass as Type<LeaderElectionOptionsFactory>;

    return [
      this.createAsyncOptionsProviders(options),
      {
        provide: useClass,
        useClass,
      },
    ];
  }

  static createAsyncOptionsProviders(
    options: LeaderElectionAsyncOptions,
  ): Provider {
    if (options.useFactory) {
      return {
        provide: LEADER_ELECTION_MODULE_OPTIONS,
        useFactory: options.useFactory,
        inject: options.inject || [],
      };
    }

    const inject = [
      (options.useClass ||
        options.useExisting) as Type<LeaderElectionOptionsFactory>,
    ];

    return {
      provide: LEADER_ELECTION_MODULE_OPTIONS,
      useFactory: async (optionsFactory: LeaderElectionOptionsFactory) =>
        optionsFactory.createLeaderElectionOptions(),
      inject,
    };
  }
}

export default LeaderElectionModule;
