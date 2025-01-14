/**
 * Copyright (c) 2022 NurMarvin (Marvin Witt)
 * Licensed under the Open Software License version 3.0
 */
import fastify from "fastify";

import fastifyCors from "@fastify/cors";
import fastifyHttpProxy from "@fastify/http-proxy";

import fs from "fs/promises";

import type { Build } from "./types";

const app = fastify();

app.register(fastifyCors, {
  origin: "*",
});

app.all("/api/*", async (request, reply) => {
  const url = new URL(request.url, "https://canary.discord.com");

  const headers = Object.fromEntries(
    Object.entries(request.headers)
      .filter(([key]) => key !== "referer" && key !== "connection")
      .map(([key, value]) => [
        key,
        key === "host" ? url.host : key === "origin" ? url.origin : value,
      ])
  ) as Record<string, string>;

  const response = await fetch(url, {
    method: request.method,
    headers,
    body: request.body ? JSON.stringify(request.body) : undefined,
  });

  reply
    .status(response.status)
    .headers(response.headers)
    .type(response.headers.get("content-type")!)
    .send(await response.text());
});

const host = process.env.HOST || "0.0.0.0";
const port = process.env.PORT || 3333;

const canonicalUrl = new URL(
  process.env.CANONICAL_URL || `https://prox.bone.lol`
);

const buildHash =
  process.env.BUILD_HASH || "c9b910ee3d886b03f2f3166e091bf9a8acfdee2d";

app.get("*", async (_request, reply) => {
  const response = await fetch(`https://api.discord.sale/builds/${buildHash}`);
  const build = (await response.json()) as Build;

  const { rootScripts, css } = build.files;

  let body = await fs.readFile(__dirname + "/../assets/index.html", "utf-8");

  const globalEnv = {
    ...build.GLOBAL_ENV,
    API_ENDPOINT: `//${canonicalUrl.host}/api`,
    HTML_TIMESTAMP: "Date.now()",
    SENTRY_TAGS: {
      buildId: buildHash,
      buildType: build.GLOBAL_ENV.SENTRY_TAGS.buildType,
    },
  };

  body = body
    .replace(/\$LOADER/, rootScripts[0])
    .replace(/\$CLASSES/, rootScripts[1])
    .replace(/\$WEBPACK/, rootScripts[2])
    .replace(/\$APP/, rootScripts[3])
    .replace(/\$STYLE/, css[0])
    .replace(/\$GLOBAL_ENV/, JSON.stringify(globalEnv));

  reply.type("text/html").send(body);
});

app.register(fastifyHttpProxy, {
  upstream: "https://discord.com",
  prefix: "/assets",
  rewritePrefix: "/assets",
});

app.listen({ port, host }, (err) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }

  console.log(`Server listening at ${canonicalUrl}`);
});
