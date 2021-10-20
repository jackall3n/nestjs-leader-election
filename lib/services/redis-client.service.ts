import { Inject, Injectable, Logger } from "@nestjs/common";
import { createNodeRedisClient } from "handy-redis";

import {
  CALL_ELECTION,
  CLAIM_POWER,
  HEARTBEAT,
  LEADER_ELECTION_MODULE_OPTIONS,
  VOTE,
} from "../constants";
import { LeaderElectionOptions } from "../interfaces";

@Injectable()
export class RedisClientService {
  public readonly client;

  public readonly publisherClient;

  private readonly prefix: string;

  private readonly logger = new Logger(RedisClientService.name);

  constructor(
    @Inject(LEADER_ELECTION_MODULE_OPTIONS)
    private options: LeaderElectionOptions
  ) {
    this.client = createNodeRedisClient(options);

    this.publisherClient = createNodeRedisClient(options);

    this.prefix = `nestjs-leader-election-${options.prefix}:`;

    this.client.nodeRedis.on("connect", () => {
      this.logger.log("Redis connected");
    });

    this.client.nodeRedis.on("error", () => {
      this.logger.error("Redis error");
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

  getCallElectionChannelName(): string {
    return `${this.prefix}-${CALL_ELECTION}`;
  }

  async emitHeartbeat(nodeId: string): Promise<void> {
    await this.client.publish(this.getHeartbeatChannelName(), nodeId);
  }

  async claimPower(nodeId: string): Promise<void> {
    await this.client.publish(this.getClaimPowerChannelName(), nodeId);
  }

  async callElection(nodeId: string): Promise<void> {
    await this.client.publish(this.getCallElectionChannelName(), nodeId);
  }

  async placeVote(nodeId: string): Promise<void> {
    await this.client.publish(this.getVoteChannelName(), nodeId);
  }
}

export default RedisClientService;
