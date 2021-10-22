import { Inject, Injectable, Logger } from '@nestjs/common';

import {
  CALL_ELECTION,
  CLAIM_POWER,
  HEARTBEAT,
  LEADER_ELECTION_MODULE_OPTIONS,
  TERMINATION,
  VOTE,
} from '../constants';
import { LeaderElectionOptions } from '../interfaces';
import { createNodeRedisClient } from 'handy-redis';
import { RedisClient } from 'redis';

@Injectable()
export class RedisClientService {
  public readonly publisher: RedisClient;
  public readonly subscriber: RedisClient;

  private readonly prefix: string;

  private readonly logger = new Logger(RedisClientService.name);

  constructor(
    @Inject(LEADER_ELECTION_MODULE_OPTIONS)
    private options: LeaderElectionOptions,
  ) {
    this.publisher = createNodeRedisClient(options).nodeRedis;
    this.subscriber = createNodeRedisClient(options).nodeRedis;

    this.prefix = `nestjs-leader-election-${options.prefix}:`;

    this.subscriber.on('connect', () => {
      this.logger.log('[SUBSCRIBER]: Connected');
    });

    this.subscriber.on('error', () => {
      this.logger.log('[SUBSCRIBER]: Error');
    });

    this.publisher.on('connect', () => {
      this.logger.log('[PUBLISHER]: Connected');
    });

    this.publisher.on('error', () => {
      this.logger.log('[PUBLISHER]: Error');
    });
  }

  getHeartbeatChannelName(): string {
    return `${this.prefix}-${HEARTBEAT}`;
  }

  getClaimPowerChannelName(): string {
    return `${this.prefix}-${CLAIM_POWER}`;
  }

  getVoteChannelName(): string {
    return `${this.prefix}-${VOTE}`;
  }

  getTerminationChannelName(): string {
    return `${this.prefix}-${TERMINATION}`;
  }

  getCallElectionChannelName(): string {
    return `${this.prefix}-${CALL_ELECTION}`;
  }

  async emitHeartbeat(nodeId: string): Promise<void> {
    await this.publisher.publish(this.getHeartbeatChannelName(), nodeId);
  }

  async claimPower(nodeId: string): Promise<void> {
    await this.publisher.publish(this.getClaimPowerChannelName(), nodeId);
  }

  async callElection(nodeId: string): Promise<void> {
    await this.publisher.publish(this.getCallElectionChannelName(), nodeId);
  }

  async emitTermination(nodeId: string): Promise<void> {
    await this.publisher.publish(this.getTerminationChannelName(), nodeId);
  }

  async placeVote(nodeId: string): Promise<void> {
    await this.publisher.publish(this.getVoteChannelName(), nodeId);
  }
}

export default RedisClientService;
