import { Hono } from "hono";
import { cors } from "hono/cors";
import type { AppContext } from "./types";
import { x402Middleware } from "./middleware/x402";
import { lastSeenMiddleware } from "./middleware/last-seen";
import messages from "./routes/messages";
import jobs from "./routes/jobs";
import agents from "./routes/agents";
import files from "./routes/files";
import disputes from "./routes/disputes";
import { scheduled } from "./scheduled";

const app = new Hono<AppContext>();

// CORS on all routes
app.use("/*", cors());

// Health check
app.get("/", (c) =>
  c.json({
    status: "ok",
    service: "string-backend",
    version: "0.1.0",
    chain: c.env.CHAIN_ID,
  })
);

// Online status tracking on all routes
app.use("/*", lastSeenMiddleware);

// x402 payment middleware on paid routes
app.use("/messages/relay", x402Middleware);
app.use("/files/upload", x402Middleware);

// Mount routes
app.route("/", messages);
app.route("/", jobs);
app.route("/", agents);
app.route("/", files);
app.route("/", disputes);

export { TxQueueDO } from "./chain/TxQueueDO";

export default {
  fetch: app.fetch,
  scheduled,
};
