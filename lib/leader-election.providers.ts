import { Provider } from '@nestjs/common';

import {
  LeaderElectionAsyncOptions,
  LeaderElectionOptions,
} from './interfaces';
import { LEADER_ELECTION_MODULE_OPTIONS } from './constants';

export function createOptionsProvider(
  options: LeaderElectionOptions,
): Provider {
  return {
    provide: LEADER_ELECTION_MODULE_OPTIONS,
    useValue: options,
  };
}

export function createAsyncOptionsProvider(
  options: LeaderElectionAsyncOptions,
): Provider {
  return {
    provide: LEADER_ELECTION_MODULE_OPTIONS,
    useFactory: options.useFactory,
    inject: options.inject,
  };
}
