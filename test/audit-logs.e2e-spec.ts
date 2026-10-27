import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('AuditLogsController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/audit-logs (PATCH) should return 404', () => {
    return request(app.getHttpServer()).patch('/audit-logs').expect(404);
  });

  it('/audit-logs/:id (PATCH) should return 404', () => {
    return request(app.getHttpServer()).patch('/audit-logs/123').expect(404);
  });

  it('/audit-logs (DELETE) should return 404', () => {
    return request(app.getHttpServer()).delete('/audit-logs').expect(404);
  });

  it('/audit-logs/:id (DELETE) should return 404', () => {
    return request(app.getHttpServer()).delete('/audit-logs/123').expect(404);
  });
});
