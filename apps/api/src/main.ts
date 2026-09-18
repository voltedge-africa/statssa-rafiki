import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.ts";
import { IS_PRODUCTION, list, numberOrDefault } from "./env.ts";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const origins = list("API_ALLOWED_ORIGINS");
  app.enableCors({
    origin: origins.length > 0 ? origins : !IS_PRODUCTION,
    credentials: false,
  });

  const port = numberOrDefault("API_PORT", 3001);
  await app.listen(port);
  Logger.log(`API listening on http://localhost:${port}`, "Bootstrap");
}

await bootstrap();
