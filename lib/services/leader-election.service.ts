import { HeartbeatService } from './heartbeat.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class LeaderElectionService {
  constructor(private heartbeatService: HeartbeatService) {}

  /**
   * Determine if this node is the leader node for the cluster.
   */
  async isLeader(): Promise<boolean> {
    return this.heartbeatService.thisNodeIsLeader();
  }

  /**
   * Determine if this node is part of an election to elect a new leader.
   */
  async isInElection(): Promise<boolean> {
    return this.heartbeatService.inElection();
  }

  /**
   * Determine if this network has a leader.
   */
  async hasLeader(): Promise<boolean> {
    return this.heartbeatService.leaderIsConnected();
  }

  /**
   * Determine the state of this network
   */
  async status() {
    return {
      id: this.heartbeatService.getNodeId(),
      election: {
        active: this.heartbeatService.inElection(),
      },
      leader: {
        id: this.heartbeatService.getLeaderId(),
        exists: await this.hasLeader(),
      },
      network: {
        size: this.heartbeatService.getActiveNetworkSize(),
        nodes: this.heartbeatService.getNetwork(),
      },
    };
  }
}

export default LeaderElectionService;
