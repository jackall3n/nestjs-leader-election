import { HeartbeatService } from './heartbeat.service';

export class LeaderElectionService {
  constructor(private heartbeatService: HeartbeatService) {
    console.log({ heartbeatService });
  }

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
}

export default LeaderElectionService;
