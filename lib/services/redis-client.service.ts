import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';

import {
  CALL_ELECTION,
  CLAIM_POWER,
  HEARTBEAT,
  LEADER_ELECTION_MODULE_OPTIONS,
  TERMINATION,
  VOTE,
} from '../constants';
import { LeaderElectionOptions } from '../interfaces';
import { createNodeRedisClient, WrappedNodeRedisClient } from 'handy-redis';
import { RedisClient } from 'redis';

@Injectable()
export class RedisClientService implements OnModuleInit, OnModuleDestroy, OnBeforeApplicationShutdown {
  public readonly publisherClient: WrappedNodeRedisClient;
  public readonly subscriberClient: WrappedNodeRedisClient;

  private readonly name: string;

  private readonly logger = new Logger(RedisClientService.name);

  private onDestroy?: () => Promise<void>;

  constructor(
    @Inject(LEADER_ELECTION_MODULE_OPTIONS)
    private options: LeaderElectionOptions,
  ) {
    this.publisherClient = createNodeRedisClient(options);
    this.subscriberClient = createNodeRedisClient(options);

    this.name = `nestjs-leader-election-${options.prefix}`;
  }

  async onModuleInit() {
    const onEvent = (name: string, event: string) => () => {
      this.logger.log(`[${name}]: ${event}`);
    };

    const subscriberConnect = onEvent('SUBSCRIBER', 'Connected');
    const subscriberError = onEvent('SUBSCRIBER', 'Error');
    const publisherConnect = onEvent('PUBLISHER', 'Connected');
    const publisherError = onEvent('PUBLISHER', 'Error');

    this.subscriber.on('connect', subscriberConnect);
    this.subscriber.on('error', subscriberError);

    this.publisher.on('connect', publisherConnect);
    this.publisher.on('error', publisherError);

    this.onDestroy = async () => {
      this.subscriber.off('connect', subscriberConnect);
      this.subscriber.off('error', subscriberError);

      this.publisher.off('connect', publisherConnect);
      this.publisher.off('error', publisherError);
    };
  }

  async onModuleDestroy() {
    await this.onDestroy?.();

    await this.publisherClient.quit();
    await this.subscriberClient.quit();
  }

  getHeartbeatChannelName(): string {
    return this.createChannel(HEARTBEAT);
  }

  getClaimPowerChannelName(): string {
    return this.createChannel(CLAIM_POWER);
  }

  getVoteChannelName(): string {
    return this.createChannel(VOTE);
  }

  getTerminationChannelName(): string {
    return this.createChannel(TERMINATION);
  }

  getCallElectionChannelName(): string {
    return this.createChannel(CALL_ELECTION);
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

  public async subscribe(channel: string) {
    return new Promise<void>((resolve, reject) => {
      this.subscriber.subscribe(channel, (error) => {
        if (error) {
          this.logger.error(
            `Subscribed to channel [${channel}] error: ${error}`,
          );
          return reject(error);
        }

        this.logger.debug(`Subscribed to channel [${channel}]`);
        resolve();
      });
    });
  }

  public async unsubscribe(channel: string) {
    return new Promise<void>((resolve, reject) => {
      this.subscriber.subscribe(channel, (error) => {
        if (error) {
          this.logger.error(
            `Unsubscribed from channel [${channel}] error: ${error}`,
          );
          return reject(error);
        }

        this.logger.debug(`Unsubscribed from channel [${channel}]`);
        resolve();
      });
    });
  }

  public get publisher(): RedisClient {
    return this.publisherClient.nodeRedis;
  }

  public get subscriber(): RedisClient {
    return this.subscriberClient.nodeRedis;
  }

  private createChannel(channel: string) {
    return [this.name, channel].join(':');
  }
}
