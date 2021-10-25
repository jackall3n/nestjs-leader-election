import { ModuleMetadata } from '@nestjs/common/interfaces';

export interface RedisConfig {
  host: string;
  port: number;
  db: number;
  prefix: string;
}

export type ILeaderElectionOptions = RedisConfig;

export interface LeaderElectionOptionsFactory {
  createLeaderElectionOptions():
    | Promise<ILeaderElectionOptions>
    | ILeaderElectionOptions;
}

export interface LeaderElectionAsyncOptions
  extends Pick<ModuleMetadata, 'imports'> {
  useFactory: (
    ...args: any[]
  ) => Promise<ILeaderElectionOptions> | ILeaderElectionOptions;
  inject?: any[];
}

export class LeaderElectionOptions implements ILeaderElectionOptions {
  db!: number;

  host!: string;

  port!: number;

  prefix!: string;
}
