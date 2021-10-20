import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import { v4, validate, version } from "uuid";

import { RedisClientService } from "./redis-client.service";
import { HEARTBEAT_INTERVAL, TERM_MAXIMUM_FACTOR, TERM_MINIMUM_FACTOR } from "../constants";
import { randomNumber } from "../utils";

@Injectable()
export class HeartbeatService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HeartbeatService.name);

  private nodeId: Readonly<string> = Object.freeze(v4());

  private leaderId?: string;

  private activeNodeTimestamps: Record<string, Date> = {};

  private isInElection = false;

  private votesForMe = 0;

  private readonly HEARTBEAT_CHANNEL: string;
  private readonly CLAIM_POWER_CHANNEL: string;
  private readonly CALL_ELECTION_CHANNEL: string;
  private readonly VOTE_CHANNEL: string;
  private readonly TERMINATION_CHANNEL: string;

  constructor(private redisService: RedisClientService) {
    this.HEARTBEAT_CHANNEL = this.redisService.getHeartbeatChannelName();
    this.CLAIM_POWER_CHANNEL = this.redisService.getClaimPowerChannelName();
    this.CALL_ELECTION_CHANNEL = this.redisService.getCallElectionChannelName();
    this.VOTE_CHANNEL = this.redisService.getVoteChannelName();
    this.TERMINATION_CHANNEL = this.redisService.getTerminationChannelName();
  }

  async onModuleInit() {
    this.logger.log(`This Node ID: ${this.nodeId}`);

    this.redisService.publisherClient.nodeRedis.on(
      "message",
      (channel, message) => this.onMessage(channel, message)
    );

    // Finally subscribe to the heartbeat channel to receive heartbeats from the other nodes.
    this.redisService.publisherClient.nodeRedis.subscribe(
      this.HEARTBEAT_CHANNEL
    );
    this.redisService.publisherClient.nodeRedis.subscribe(
      this.CLAIM_POWER_CHANNEL
    );
    this.redisService.publisherClient.nodeRedis.subscribe(
      this.CALL_ELECTION_CHANNEL
    );
    this.redisService.publisherClient.nodeRedis.subscribe(this.VOTE_CHANNEL);
    this.redisService.publisherClient.nodeRedis.subscribe(
      this.TERMINATION_CHANNEL
    );

    await this.callElection();
  }

  async onModuleDestroy() {
    await this.redisService.emitTermination(this.nodeId);
  }

  async onMessage(channel: string, message: string) {
    const valid = validate(message) && version(message) === 4;

    if (!valid) {
      return;
    }

    switch (channel) {
      case this.HEARTBEAT_CHANNEL: {
        const nodeTimestamp = this.activeNodeTimestamps[message];

        if (!nodeTimestamp) {
          this.logger.log(`Found new Node: ${message}`);
        }

        this.activeNodeTimestamps[message] = new Date();

        break;
      }

      case this.CLAIM_POWER_CHANNEL: {
        this.leaderId = message;
        this.isInElection = false;
        this.votesForMe = 0;

        this.logger.log(`The leader is now [${message}]`);

        if (message === this.nodeId) {
          this.logger.log(`I am the LEADER.`);
        } else {
          this.logger.log(`I am a FOLLOWER.`);
        }

        break;
      }

      case this.VOTE_CHANNEL: {
        if (this.nodeId !== message) {
          this.logger.debug("A vote for a different node.");
          return;
        }

        this.logger.debug("A node voted for me.");

        this.votesForMe += 1;

        if (
          this.inElection() &&
          this.votesForMe >= this.getMajorityRequiredSize()
        ) {
          await this.claimPower();
        }

        break;
      }

      case this.CALL_ELECTION_CHANNEL: {
        this.isInElection = true;

        await this.voteInElection(message);

        break;
      }

      case this.TERMINATION_CHANNEL: {
        this.logger.debug(
          `Node [${message}] has been terminated, Unimplemented handler`
        );

        break;
      }

      default: {
        this.logger.warn(`Invalid channel name: ${channel}`);

        return;
      }
    }
  }

  /**
   * At the agreed intervals, emit a heartbeat to the channel.
   */
  @Interval(HEARTBEAT_INTERVAL)
  async postHeartbeat(): Promise<void> {
    await this.redisService.emitHeartbeat(this.nodeId);
  }

  removeNodeFromList(nodeId: string): void {
    delete this.activeNodeTimestamps[nodeId];
    this.logger.log(`Removed node [${nodeId}] from the list.`);
  }

  @Interval(HEARTBEAT_INTERVAL)
  async clearNonActiveNodes(): Promise<void> {
    const nodeIds = Object.keys(this.activeNodeTimestamps);
    const now = new Date();

    nodeIds.forEach((nodeId) => {
      let remove = false;
      if (validate(nodeId) && version(nodeId) === 4) {
        if (typeof this.activeNodeTimestamps[nodeId] !== "undefined") {
          if (this.activeNodeTimestamps[nodeId] instanceof Date) {
            const diff =
              now.valueOf() - this.activeNodeTimestamps[nodeId].valueOf();
            // Remove the node if the heartbeat was too far away :(
            if (diff > HEARTBEAT_INTERVAL * 2) {
              remove = true;
            }
          } else {
            remove = true;
          }
        } else {
          remove = true;
        }
      } else {
        remove = true;
      }

      if (remove) {
        this.removeNodeFromList(nodeId);
      }
    });
  }

  async claimPower(): Promise<void> {
    this.logger.log("Claiming Power");
    this.isInElection = false;

    await this.redisService.claimPower(this.nodeId);
  }

  async callElection(): Promise<void> {
    if (this.isInElection) {
      return;
    }

    this.logger.log("Calling an election");
    this.isInElection = true;

    await this.redisService.callElection(this.nodeId);
  }

  async voteInElection(nodeIdThatCalledElection: string): Promise<void> {
    await this.postHeartbeat();
    await this.clearNonActiveNodes();

    if (!this.isInElection) {
      return;
    }

    await this.redisService.placeVote(nodeIdThatCalledElection);
  }

  async leaderIsConnected(): Promise<boolean> {
    await this.clearNonActiveNodes();

    if (!this.leaderId) {
      return false;
    }

    return this.activeNodeTimestamps[this.leaderId] !== undefined;
  }

  @Interval(
    randomNumber(
      HEARTBEAT_INTERVAL * TERM_MINIMUM_FACTOR,
      HEARTBEAT_INTERVAL * TERM_MAXIMUM_FACTOR
    )
  )
  async checkTheLeader(): Promise<void> {
    if (!this.leaderId) {
      await this.callElection();

      return;
    }

    if (await this.leaderIsConnected()) {
      // safe, existing leader exists no cap
      return undefined;
    }

    // heck oh no the leader aint there no more
    await this.callElection();
  }

  /**
   * Retrieve the number of active nodes in the network.
   */
  getActiveNetworkSize(): number {
    return Object.values(this.activeNodeTimestamps).length;
  }

  /**
   * Retrieve the number of active nodes in the network.
   */
  getNetwork(): Record<string, Date> {
    return this.activeNodeTimestamps;
  }

  /**
   * Retrieve the number of votes needed for a candidate to become the leader.
   */
  getMajorityRequiredSize(): number {
    return Math.floor(this.getActiveNetworkSize() / 2) + 1;
  }

  /**
   * Determine if this node is the cluster leader.
   */
  thisNodeIsLeader(): boolean {
    return this.leaderId === this.nodeId;
  }

  /**
   * Determines if there is currently an election happening.
   */
  inElection(): boolean {
    return this.isInElection;
  }

  /**
   * Determines leader id
   */
  getLeaderId(): string | undefined {
    return this.leaderId;
  }

  /**
   * Determines node id
   */
  getNodeId(): string {
    return this.nodeId;
  }
}

export default HeartbeatService;
