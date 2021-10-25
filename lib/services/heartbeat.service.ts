import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { v4, validate, version } from 'uuid';

import { RedisClientService } from './redis-client.service';
import {
  HEARTBEAT_INTERVAL,
  MAX_NODE_AGE,
  TERM_MAXIMUM_FACTOR,
  TERM_MINIMUM_FACTOR,
} from '../constants';
import { randomNumber } from '../utils';

@Injectable()
export class HeartbeatService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HeartbeatService.name);

  private leaderId?: string;
  private readonly nodeId: Readonly<string> = Object.freeze(v4());
  private readonly nodes: Record<string, Date> = {};

  private isInElection = false;
  private votesForMe = 0;

  private readonly HEARTBEAT_CHANNEL: string;
  private readonly CLAIM_POWER_CHANNEL: string;
  private readonly CALL_ELECTION_CHANNEL: string;
  private readonly VOTE_CHANNEL: string;
  private readonly TERMINATION_CHANNEL: string;

  private onDestroy?: () => Promise<void>;

  constructor(private redis: RedisClientService) {
    this.HEARTBEAT_CHANNEL = this.redis.getHeartbeatChannelName();
    this.CLAIM_POWER_CHANNEL = this.redis.getClaimPowerChannelName();
    this.CALL_ELECTION_CHANNEL = this.redis.getCallElectionChannelName();
    this.VOTE_CHANNEL = this.redis.getVoteChannelName();
    this.TERMINATION_CHANNEL = this.redis.getTerminationChannelName();
  }

  async onModuleInit() {
    this.logger.log(`Module initialised [${this.nodeId}]`);

    const onMessage = this.onMessage.bind(this);

    this.redis.subscriber.on('message', onMessage);

    await this.redis.subscribe(this.HEARTBEAT_CHANNEL);
    await this.redis.subscribe(this.CLAIM_POWER_CHANNEL);
    await this.redis.subscribe(this.CALL_ELECTION_CHANNEL);
    await this.redis.subscribe(this.VOTE_CHANNEL);
    await this.redis.subscribe(this.TERMINATION_CHANNEL);

    this.onDestroy = async () => {
      await this.redis.unsubscribe(this.HEARTBEAT_CHANNEL);
      await this.redis.unsubscribe(this.CLAIM_POWER_CHANNEL);
      await this.redis.unsubscribe(this.CALL_ELECTION_CHANNEL);
      await this.redis.unsubscribe(this.VOTE_CHANNEL);
      await this.redis.unsubscribe(this.TERMINATION_CHANNEL);

      this.redis.subscriber.off('message', onMessage);
    };

    await this.callElection();
  }

  async onModuleDestroy() {
    await this.redis.emitTermination(this.nodeId);
    await this.onDestroy?.();
  }

  async onMessage(channel: string, id: string) {
    const valid = validate(id) && version(id) === 4;

    if (!valid) {
      return;
    }

    switch (channel) {
      case this.HEARTBEAT_CHANNEL: {
        const timestamp = this.nodes[id];

        if (!timestamp) {
          this.logger.log(`Found new node [${id}]`);
        }

        this.nodes[id] = new Date();

        break;
      }

      case this.CLAIM_POWER_CHANNEL: {
        this.leaderId = id;
        this.isInElection = false;
        this.votesForMe = 0;

        this.logger.log(`Leader elected to node [${id}]`);

        if (id === this.nodeId) {
          this.logger.log(`I am the LEADER.`);
        } else {
          this.logger.log(`I am a FOLLOWER.`);
        }

        break;
      }

      case this.VOTE_CHANNEL: {
        if (this.nodeId !== id) {
          this.logger.debug('A vote for a different node.');
          return;
        }

        this.logger.debug('A node voted for me.');

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

        await this.voteInElection(id);

        break;
      }

      case this.TERMINATION_CHANNEL: {
        this.logger.debug(`Node [${id}] has been terminated.`);

        this.removeNodeFromList(id);
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
    await this.redis.emitHeartbeat(this.nodeId);
  }

  removeNodeFromList(id: string): void {
    delete this.nodes[id];

    this.logger.log(`Removed node [${id}] from network cache.`);
  }

  @Interval(HEARTBEAT_INTERVAL)
  async clearNonActiveNodes(): Promise<void> {
    const now = new Date();

    for (const id of Object.keys(this.nodes)) {
      // If node id is invalid
      if (!this.isValidNodeId(id)) {
        this.removeNodeFromList(id);
        continue;
      }

      const timestamp = this.nodes[id];

      // If the timestamp is invalid
      if (!timestamp) {
        this.removeNodeFromList(id);
        continue;
      }

      const age = now.valueOf() - timestamp.valueOf();

      // If the timestamp has expired
      if (age > MAX_NODE_AGE) {
        this.removeNodeFromList(id);
      }
    }
  }

  async claimPower(): Promise<void> {
    this.logger.log('Attempting to claim power');

    this.isInElection = false;

    await this.redis.claimPower(this.nodeId);
  }

  async callElection(): Promise<void> {
    if (this.isInElection) {
      return;
    }

    this.logger.log('Calling an election');

    this.isInElection = true;

    await this.redis.callElection(this.nodeId);
  }

  async voteInElection(nodeIdThatCalledElection: string): Promise<void> {
    await this.postHeartbeat();
    await this.clearNonActiveNodes();

    if (!this.isInElection) {
      return;
    }

    this.logger.debug(`Voting for node [${nodeIdThatCalledElection}]`);

    await this.redis.placeVote(nodeIdThatCalledElection);
  }

  async leaderIsConnected(): Promise<boolean> {
    await this.clearNonActiveNodes();

    if (!this.leaderId) {
      return false;
    }

    return this.nodes[this.leaderId] !== undefined;
  }

  @Interval(
    randomNumber(
      HEARTBEAT_INTERVAL * TERM_MINIMUM_FACTOR,
      HEARTBEAT_INTERVAL * TERM_MAXIMUM_FACTOR,
    ),
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
    return Object.values(this.nodes).length;
  }

  /**
   * Retrieve the number of active nodes in the network.
   */
  getNetwork(): Record<string, Date> {
    return this.nodes;
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

  isValidNodeId(id: string) {
    return validate(id) && version(id) === 4;
  }
}

export default HeartbeatService;
