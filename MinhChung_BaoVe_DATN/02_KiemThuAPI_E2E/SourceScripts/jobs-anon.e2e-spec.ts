import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { JobsController } from '@/modules/jobs/jobs.controller';
import { JobsService } from '@/modules/jobs/jobs.service';
import { StackAuthGuard } from '@/common/guards/auth-stack.guard';
import { AuthService } from '@/modules/auth/auth.service';

/**
 * Reproduces the REAL guard chain (global APP_GUARD StackAuthGuard + method
 * OptionalAuthGuard) to prove that the public job board still serves anonymous
 * requests after the guard swap. No DB — the anon path throws before any
 * account lookup.
 */
describe('GET /jobs (anonymous, full guard chain)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [JobsController],
      providers: [
        {
          provide: JobsService,
          useValue: { getJobs: jest.fn().mockResolvedValue({ data: { jobs: [] }, meta: {} }) },
        },
        { provide: APP_GUARD, useClass: StackAuthGuard },
        { provide: ConfigService, useValue: { get: () => 'test-secret' } },
        { provide: AuthService, useValue: {} },
        { provide: CACHE_MANAGER, useValue: { get: jest.fn(), set: jest.fn() } },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('returns 200 (not 401) for an anonymous request', async () => {
    await request(app.getHttpServer()).get('/jobs').expect(200);
  });
});
