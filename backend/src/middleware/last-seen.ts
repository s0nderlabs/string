import { createMiddleware } from "hono/factory";
import type { AppContext } from "../types";

export const lastSeenMiddleware = createMiddleware<AppContext>(
  async (c, next) => {
    await next();

    const address =
      c.get("agentAddress") || c.req.header("x-agent-address");

    if (address && /^0x[0-9a-fA-F]{40}$/.test(address)) {
      const ctx = c.executionCtx as any;
      ctx?.waitUntil?.(
        c.env.DB.prepare(
          "UPDATE agents SET last_seen = ?1 WHERE address = ?2"
        )
          .bind(Math.floor(Date.now() / 1000), address.toLowerCase())
          .run()
          .catch(() => {})
      );
    }
  }
);
