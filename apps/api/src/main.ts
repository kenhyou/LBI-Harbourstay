import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import cookieParser from 'cookie-parser';
import { AppModule } from '@/app.module';

async function bootstrap(): Promise<void> {
  // `rawBody: true` captures the untouched request body Buffer on `req.rawBody`
  // (in addition to the normal JSON parsing) — the Stripe webhook needs the exact
  // bytes to verify the signature. Every other route keeps parsed JSON as before.
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    rawBody: true,
  });
  app.useLogger(app.get(Logger));

  // Parse cookies so the JWT session (httpOnly access/refresh cookies) is
  // readable server-side by the guards and the refresh endpoint (BC-7).
  app.use(cookieParser());

  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000',
    credentials: true,
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Harbourstay API')
    .setDescription('OTA short-stay booking platform')
    .setVersion('0.0.0')
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swaggerConfig));

  const port = process.env.PORT ? Number(process.env.PORT) : 3001;
  await app.listen(port);
}

void bootstrap();
