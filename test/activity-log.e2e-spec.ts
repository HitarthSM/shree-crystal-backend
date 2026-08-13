import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('ActivityLogController (e2e)', () => {
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

  it('/activity-log (PATCH) should return 404', () => {
    return request(app.getHttpServer()).patch('/activity-log').expect(404);
  });

  it('/activity-log/:id (PATCH) should return 404', () => {
    return request(app.getHttpServer()).patch('/activity-log/123').expect(404);
  });

  it('/activity-log (DELETE) should return 404', () => {
    return request(app.getHttpServer()).delete('/activity-log').expect(404);
  });

  it('/activity-log/:id (DELETE) should return 404', () => {
    return request(app.getHttpServer()).delete('/activity-log/123').expect(404);
  });
});
