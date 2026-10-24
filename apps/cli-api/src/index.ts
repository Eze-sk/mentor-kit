import { Hono } from "hono";
import { connect } from "@tursodatabase/serverless";
import { compress } from "hono/compress";

type Bindings = {
  DATABASE_URL: string;
  DATABASE_TOKEN: string;
};

const db = connect({
  url: process.env.DATABASE_URL!,
  authToken: process.env.DATABASE_TOKEN,
});

const app = new Hono<{ Bindings: Bindings }>();

app.onError((err, c) => {
  console.error(`Error detected: ${err.message}`);
  return c.json({ error: "An internal error occurred" }, 500);
});

app.notFound((c) => {
  return c.json({ error: "Route not found" }, 404);
});

app.use("*", compress());

app.get("/api/get-challenges", async (c) => {
  const result = db.prepare(
    "SELECT * FROM challenges ORDER BY created_at DESC",
  );

  c.header("Cache-Control", "public, max-age=86400");

  return c.json(result);
});

export default app;
