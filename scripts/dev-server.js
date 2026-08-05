#!/usr/bin/env node
// Minimal local dev server that mimics Vercel's Node serverless-function
// contract (module.exports = (req,res)=>{...}, req.query, req.body parsed
// as JSON, static file serving for index.html) so the /api handlers can be
// exercised locally without needing the actual `vercel dev` CLI.
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");

const ROOT = path.join(__dirname, "..");
const PORT = process.env.PORT || 3000;

function loadHandler(routePath) {
  delete require.cache[require.resolve(routePath)];
  return require(routePath);
}

function matchRoute(pathname) {
  if (pathname === "/api/properties") {
    return { handler: loadHandler("../api/properties.js"), params: {} };
  }
  let m = pathname.match(/^\/api\/properties\/([^/]+)$/);
  if (m) {
    return { handler: loadHandler("../api/properties/[id].js"), params: { id: m[1] } };
  }
  if (pathname === "/api/removed") {
    return { handler: loadHandler("../api/removed.js"), params: {} };
  }
  m = pathname.match(/^\/api\/removed\/([^/]+)$/);
  if (m) {
    return { handler: loadHandler("../api/removed/[id].js"), params: { id: m[1] } };
  }
  return null;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let chunks = "";
    req.on("data", (c) => (chunks += c));
    req.on("end", () => resolve(chunks));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;

  if (pathname.startsWith("/api/")) {
    const route = matchRoute(pathname);
    if (!route) {
      res.writeHead(404, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Not found" }));
    }
    req.query = { ...parsed.query, ...route.params };
    const raw = await readBody(req);
    if (raw) {
      try {
        req.body = JSON.parse(raw);
      } catch {
        req.body = {};
      }
    } else {
      req.body = {};
    }
    res.status = (code) => {
      res.statusCode = code;
      return res;
    };
    res.json = (obj) => {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(obj));
      return res;
    };
    try {
      await route.handler(req, res);
    } catch (err) {
      console.error(err);
      res.statusCode = 500;
      res.end(JSON.stringify({ error: "Internal server error" }));
    }
    return;
  }

  // Static file serving (just index.html for this project).
  let filePath = pathname === "/" ? "/index.html" : pathname;
  filePath = path.join(ROOT, filePath);
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end("Not found");
    }
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(data);
  });
});

server.listen(PORT, () => console.log(`Dev server listening on http://localhost:${PORT}`));
