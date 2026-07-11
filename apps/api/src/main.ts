import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import cookieParser from 'cookie-parser';
import { AppModule } from '@/app.module';
import { configureSecurity } from '@/bootstrap/configure-security';

async function bootstrap(): Promise<void> {
  // `rawBody: true` captures the untouched request body Buffer on `req.rawBody`
  // (in addition to the normal JSON parsing) — the Stripe webhook needs the exact
  // bytes to verify the signature. Every other route keeps parsed JSON as before.
  //
  // Typed as `NestExpressApplication` so we can call `useBodyParser` below to cap
  // the request body size.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    rawBody: true,
  });
  app.useLogger(app.get(Logger));

  // Cap the JSON body size (OWASP: cheap DoS hardening — reject oversized payloads
  // before they hit a handler; nothing we accept legitimately exceeds this). Nest's
  // `rawBody: true` capture is preserved across `useBodyParser`, so the Stripe
  // webhook still gets its exact bytes.
  const bodyLimit = process.env.JSON_BODY_LIMIT ?? '100kb';
  app.useBodyParser('json', { limit: bodyLimit });
  app.useBodyParser('urlencoded', { extended: true, limit: bodyLimit });

  // Parse cookies so the JWT session (httpOnly access/refresh cookies) is
  // readable server-side by the guards and the refresh endpoint (BC-7).
  app.use(cookieParser());

  // Apply the S7a security baseline: helmet headers, strict CORS allow-list, and
  // `x-powered-by` removal. Kept in one reusable function so the e2e test asserts
  // the SAME config the server runs (see `bootstrap/configure-security.ts`).
  configureSecurity(app);

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
