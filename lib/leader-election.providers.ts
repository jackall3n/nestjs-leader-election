import { DynamicModule, Module } from '@nestjs/common';

import {
  LeaderElectionAsyncOptions,
  LeaderElectionOptions,
} from './interfaces';
import LeaderElectionCoreModule from './leader-election-core.module';

@Module({})
export class LeaderElectionModule {
  static forRoot(options: LeaderElectionOptions): DynamicModule {
    return {
      module: LeaderElectionModule,
      imports: [LeaderElectionCoreModule.forRoot(options)],
    };
  }

  static forRootAsync(options: LeaderElectionAsyncOptions): DynamicModule {
    return {
      module: LeaderElectionModule,
      imports: [LeaderElectionCoreModule.forRootAsync(options)],
    };
  }
}

export default LeaderElectionModule;
