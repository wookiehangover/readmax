import { DurableObject } from "cloudflare:workers";
import { runWithEnv, type Env } from "~/lib/env.server";

type ConsoleWithCreateTask = Console & { createTask?: unknown };
type RequestHandler = import("react-router").RequestHandler;

declare module "react-router" {
  interface AppLoadContext {
    cloudflare: {
      env: Env;
      ctx: ExecutionContext;
    };
  }
}

let requestHandlerPromise: Promise<RequestHandler> | undefined;

disableUnsupportedConsoleCreateTask();

function disableUnsupportedConsoleCreateTask() {
  const consoleWithTask = console as ConsoleWithCreateTask;
  const noopCreateTask = () => null;

  try {
    Object.defineProperty(consoleWithTask, "createTask", {
      configurable: true,
      value: noopCreateTask,
    });
  } catch {
    consoleWithTask.createTask = noopCreateTask;
  }
}

function getRequestHandler() {
  requestHandlerPromise ??= import("react-router").then(({ createRequestHandler }) =>
    createRequestHandler(() => import("virtual:react-router/server-build"), import.meta.env.MODE),
  );

  return requestHandlerPromise;
}

function withRuntimeDefaults(env: Env): Env {
  if (env.NODE_ENV) return env;

  return Object.assign(Object.create(env) as Env, {
    NODE_ENV: import.meta.env.MODE,
  });
}

export class Agents extends DurableObject<Env> {
  override fetch() {
    return new Response("Agents Durable Object placeholder", { status: 501 });
  }
}

export default {
  async fetch(request, env, ctx) {
    disableUnsupportedConsoleCreateTask();

    const runtimeEnv = withRuntimeDefaults(env);
    const requestHandler = await getRequestHandler();

    return runWithEnv(runtimeEnv, ctx, () =>
      requestHandler(request, {
        cloudflare: { env: runtimeEnv, ctx },
      }),
    );
  },
} satisfies ExportedHandler<Env>;
