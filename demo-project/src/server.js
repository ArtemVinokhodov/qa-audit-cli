const express = require("express");
const path = require("node:path");

const app = express();
const port = Number(process.env.DEMO_PORT || 3100);

app.use((_request, response, next) => {
  response.setHeader("Access-Control-Allow-Origin", "*");
  next();
});

app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/health", (_request, response) => {
  response.json({ status: "ok", service: "qa-audit-demo" });
});

app.get("/api/users", (_request, response) => {
  response.json({
    users: [
      { id: 1, name: "Ada" },
      { id: 2, name: "Grace" }
    ]
  });
});

app.listen(port, "127.0.0.1", () => {
  console.log(`QA audit demo project listening on http://127.0.0.1:${port}`);
});
