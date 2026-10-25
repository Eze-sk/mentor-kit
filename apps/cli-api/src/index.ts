import { Hono } from "hono";
import { connect } from "@tursodatabase/serverless";
import { compress } from "hono/compress";

type Bindings = {
  DATABASE_URL: string;
  DATABASE_TOKEN: string;
  RATE_LIMITER: any;
};

const app = new Hono<{ Bindings: Bindings }>();

app.onError((err, c) => {
  console.error(`Error detected: ${err.message}`);
  return c.json({ error: "An internal error occurred" }, 500);
});

app.notFound((c) => {
  return c.json({ error: "Route not found" }, 404);
});

app.use("*", async (c, next) => {
  const ip = c.req.header("cf-connecting-ip") || "127.0.0.1";
  const { success } = await c.env.RATE_LIMITER.limit({ key: ip });

  if (!success) {
    return c.json({ error: "Too many requests. Please try again later." }, 429);
  }

  await next();
});

app.use("*", compress());

app.get("/api/get-challenges", async (c) => {
  const db = connect({
    url: c.env.DATABASE_URL,
    authToken: c.env.DATABASE_TOKEN,
  });

  const result = db.prepare(
    "SELECT * FROM challenges ORDER BY created_at DESC",
  );

  c.header("Cache-Control", "public, max-age=86400");

  return c.json(result);
});

export default app;
