import "reflect-metadata";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.ts";

if (existsSync(".env")) {
  loadEnvFile(".env");
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const origins = (process.env.API_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({
    origin: origins.length > 0 ? origins : process.env.NODE_ENV !== "production",
    credentials: false,
  });

  const port = Number(process.env.API_PORT ?? 3002);
  await app.listen(port);
  Logger.log(`API listening on http://localhost:${port}`, "Bootstrap");
}

await bootstrap();
