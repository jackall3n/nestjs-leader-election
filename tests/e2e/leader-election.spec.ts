import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Server } from 'http';
import { AppModule } from '../src/app.module';
import { LeaderElectionService } from '../../lib';

describe('LeaderElection', () => {
  let server: Server;
  let app: INestApplication;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication();
    server = app.getHttpServer();
    await app.init();
  });

  it(`should start an election`, async () => {
    const leaderElectionService = app.get<LeaderElectionService>(
      LeaderElectionService,
    );

    const actual = await leaderElectionService.status();

    expect(actual.election.active).toBe(true);
  });

  it(`should try to lead`, async () => {
    const leaderElectionService = app.get<LeaderElectionService>(
      LeaderElectionService,
    );

    const actual = await leaderElectionService.status();

    await waitUntil(() => actual.leader.exists);

    expect(actual).toBe(true);
  });

  afterEach(async () => {
    await app.close();
  });
});

async function waitUntil(fn: () => Promise<boolean> | boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    let checkTimeout: NodeJS.Timeout;

    const timeout = setTimeout(() => {
      clearTimeout(checkTimeout);
      throw new Error('Timeout exceeded waiting');
    }, 5000);

    function check() {
      const result = fn();

      console.log('result', result);

      if (result === true) {
        resolve();
        clearTimeout(timeout);
        clearTimeout(checkTimeout);
        return;
      }

      checkTimeout = setTimeout(check, 500);
    }

    checkTimeout = setTimeout(check, 500);
  });
}
