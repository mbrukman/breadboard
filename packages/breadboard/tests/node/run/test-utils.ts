/**
 * @license
 * Copyright 2024 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { handleRunGraphRequest } from "@breadboard-ai/runtime/legacy.js";
import type {
  GraphDescriptor,
  HarnessRunner,
  RemoteMessage,
  RemoteRunRequestBody,
  ServerRunConfig,
} from "@breadboard-ai/types";
import { fail } from "assert";
import { createDefaultDataStore, createLoader } from "../../../src/index.js";
import { makeTestGraphStore } from "../../helpers/_graph-store.js";
import { testKit } from "../test-kit.js";

export type EventLogEntry = [name: string, data: unknown];

export const eventNamesFromLog = (log: EventLogEntry[]) =>
  log.map(([name]) => name);

export const queryLog = (log: EventLogEntry[], name: string) =>
  log.find(([n]) => n == name)?.[1];

export const logEvents = (runner: HarnessRunner, events: EventLogEntry[]) => {
  const eventNames = [
    "start",
    "pause",
    "resume",
    "input",
    "output",
    "secret",
    "error",
    "skip",
    "edge",
    "graphstart",
    "graphend",
    "nodestart",
    "nodeend",
    "end",
  ];
  eventNames.forEach((name) => {
    runner.addEventListener(name, (event) => {
      const e = event as unknown as { data: unknown };
      events.push([name, e.data]);
    });
  });
};

export const mockFetch = (graph: GraphDescriptor) => {
  const result: typeof globalThis.fetch = async (request, init) => {
    const url = request as string;
    const { method, body } = init || {};
    if (method !== "POST") {
      fail("Only POST requests are supported by mockFetch.");
    }
    if (url !== "https://example.com/run") {
      fail(`Only "https://example.com/run" is supported by mockFetch.`);
    }
    if (!body) {
      fail("No body provided in request.");
    }
    const {
      $key,
      $next: next,
      $diagnostics: diagnostics,
      ...inputs
    } = JSON.parse(body as string) as RemoteRunRequestBody;

    if ($key !== "my-key") {
      fail(`Invalid key provided. Use "my-key".`);
    }

    const pipe = new TransformStream<RemoteMessage, string>({
      transform(message, controller) {
        controller.enqueue(`data: ${JSON.stringify(message)}\n\n`);
      },
    });

    const loader = createLoader();
    const config: ServerRunConfig = {
      graph,
      url: import.meta.url,
      kits: [testKit],
      writer: pipe.writable.getWriter(),
      loader,
      dataStore: createDefaultDataStore(),
      graphStore: makeTestGraphStore({ loader }),
      stateStore: {
        async load(next?: string) {
          return next ? JSON.parse(next as string) : undefined;
        },
        async save(state) {
          return JSON.stringify(state);
        },
      },
    };

    handleRunGraphRequest({ inputs: inputs, next, diagnostics }, config);

    return new Response(pipe.readable.pipeThrough(new TextEncoderStream()));
  };
  return result;
};
