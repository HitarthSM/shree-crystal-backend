import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { HttpExceptionFilter } from './common/filters/index.js';
import { ResponseInterceptor, AuditLogInterceptor } from './common/interceptors/index.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // ── Security ──────────────────────────────────────────────────────────────
  app.use(helmet());

  // ── CORS ──────────────────────────────────────────────────────────────────
  const configuredOrigin = configService.getOrThrow<string>('FRONTEND_ORIGIN').replace(/\/$/, '');
  const allowedOrigins = [
    configuredOrigin,
    'http://localhost:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174',
  ];
  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  });

  // ── Global prefix ─────────────────────────────────────────────────────────
  app.setGlobalPrefix('api', {
    exclude: ['health'], // /health stays at root
  });

  // ── Validation pipe ───────────────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip unknown fields
      forbidNonWhitelisted: true, // throw 400 if unknown fields present
      transform: true, // auto-cast primitives to their TS types
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // ── Global filter — standard error envelope, strips stack traces in prod ──
  app.useGlobalFilters(new HttpExceptionFilter(configService));

  // ── Global interceptors — response envelope + audit logging ───────────────
  // Use app.get() so interceptors participate in DI (AuditLogInterceptor needs PrismaService).
  app.useGlobalInterceptors(app.get(ResponseInterceptor), app.get(AuditLogInterceptor));

  // ── Swagger ───────────────────────────────────────────────────────────────
  const nodeEnv = configService.get<string>('NODE_ENV', 'development');
  const swaggerEnabled = configService.get<boolean>('SWAGGER_ENABLED', true);

  if (swaggerEnabled || nodeEnv !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Shree Crystal Credit Society API')
      .setDescription('Backend API for the Cooperative Credit Society Management System')
      .setVersion('1.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'Authorization',
          description: 'Enter JWT token',
          in: 'header',
        },
        'jwt-auth',
      )
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
      },
    });
  }

  // ── Start ─────────────────────────────────────────────────────────────────
  const port = configService.get<number>('PORT', 3000);
  await app.listen(port);

  console.warn(`\n🚀 Application running on: http://localhost:${port}/api`);
  if (swaggerEnabled || nodeEnv !== 'production') {
    console.warn(`📚 Swagger docs:           http://localhost:${port}/api/docs`);
  }
  console.warn(`🏥 Health check:           http://localhost:${port}/health`);
}
void bootstrap();
