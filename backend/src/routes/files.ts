import { Hono } from "hono";
import type { AppContext } from "../types";
import { pinataUpload } from "../services/pinata";

const app = new Hono<AppContext>();

app.post("/files/upload", async (c) => {
  const body = await c.req.parseBody();
  const file = body["file"];

  if (!file || !(file instanceof File)) {
    return c.json({ error: "file field required (multipart)" }, 400);
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const { cid } = await pinataUpload(c.env, arrayBuffer, file.name);
    return c.json({ cid, url: `ipfs://${cid}` });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

export default app;
