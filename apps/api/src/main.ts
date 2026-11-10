import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger } from "@nestjs/common";
import { AppModule } from "./app.module";
import { configureApp } from "./common/http";

try { process.loadEnvFile(); } catch { /* env provided by the platform */ }

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  configureApp(app);
  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
  new Logger("Bootstrap").log(`API listening on :${port}/v1`);
}
bootstrap();
