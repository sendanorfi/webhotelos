// Synthetic worker used by the local compatibility test only.
export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path === "/seed" && request.method === "POST") {
      await env.DB.prepare(
        "CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE)"
      ).run();
      await env.DB.batch([
        env.DB.prepare("INSERT INTO items (name) VALUES (?)").bind("alpha"),
        env.DB.prepare("INSERT INTO items (name) VALUES (?)").bind("beta"),
      ]);
      return Response.json({ ok: true });
    }
    if (path === "/rollback" && request.method === "POST") {
      try {
        await env.DB.batch([
          env.DB.prepare("INSERT INTO items (name) VALUES (?)").bind("gamma"),
          env.DB.prepare("INSERT INTO items (name) VALUES (?)").bind("alpha"),
        ]);
        return Response.json({ rolledBack: false }, { status: 500 });
      } catch {
        return Response.json({ rolledBack: true });
      }
    }
    if (path === "/items" && request.method === "GET") {
      const result = await env.DB.prepare(
        "SELECT name FROM items WHERE id > ? ORDER BY id"
      ).bind(0).all();
      return Response.json(result.results);
    }
    return new Response("Not found", { status: 404 });
  },
};
