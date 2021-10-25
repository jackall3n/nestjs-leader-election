import { DynamicModule, Global, Inject, Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';

import {
  LeaderElectionAsyncOptions,
  LeaderElectionOptions,
} from './interfaces';
import { LEADER_ELECTION_MODULE_OPTIONS } from './constants';

import { HeartbeatService } from './services/heartbeat.service';
import { RedisClientService } from './services/redis-client.service';
import { LeaderElectionService } from './services/leader-election.service';
import {
  createAsyncOptionsProvider,
  createOptionsProvider,
} from './leader-election.providers';

@Global()
@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [RedisClientService, LeaderElectionService, HeartbeatService],
  exports: [LeaderElectionService],
})
export class LeaderElectionCoreModule {
  constructor(
    @Inject(LEADER_ELECTION_MODULE_OPTIONS)
    private readonly options: LeaderElectionOptions,
  ) {}

  static forRoot(options: LeaderElectionOptions): DynamicModule {
    return {
      module: LeaderElectionCoreModule,
      providers: [createOptionsProvider(options)],
      exports: [LeaderElectionService],
    };
  }

  static forRootAsync(options: LeaderElectionAsyncOptions): DynamicModule {
    return {
      module: LeaderElectionCoreModule,
      imports: options.imports,
      providers: [createAsyncOptionsProvider(options)],
      exports: [LeaderElectionService],
    };
  }
}

export default LeaderElectionCoreModule;
