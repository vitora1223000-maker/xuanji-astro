// 玄玑·Astrology —— 极简 Node 服务
// 职责：① 托管现有静态文件（index.html / *.js / *.png 原样不动）
//        ② 提供 /api/read：藏着 Key 调 MiniMax 官方 API，流式回传解读
// Key 全程只从环境变量读，绝不写进代码、绝不上 GitHub。
//
// 需要的环境变量（在 Zeabur 后台「环境变量」里填，不要写进任何文件）：
//   MINIMAX_API_KEY   —— MiniMax 接口密钥（全模型通用）
//   MINIMAX_GROUP_ID  —— MiniMax GroupId
//   MINIMAX_MODEL     —— 用哪个模型，如 MiniMax-Text-01（控制台确认可用档后填）
//
// 零第三方依赖：只用 Node 内置 http / fs / https。

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 8080;
const ROOT = __dirname;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
};

// ---------- MiniMax 流式调用 ----------
// 官方 ChatCompletion v2 接口：POST https://api.minimaxi.com/v1/text/chatcompletion_v2?GroupId=xxx
// stream:true 时返回 SSE（data: {...}\n\n），逐块把增量文本写回前端，规避长输出超时。
function callMiniMaxStream(prompt, res) {
  const apiKey = process.env.MINIMAX_API_KEY;
  const groupId = process.env.MINIMAX_GROUP_ID;
  const model = process.env.MINIMAX_MODEL || "MiniMax-Text-01";

  if (!apiKey || !groupId) {
    res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "服务端未配置 MINIMAX_API_KEY / MINIMAX_GROUP_ID 环境变量" }));
    return;
  }

  const payload = JSON.stringify({
    model,
    stream: true,
    max_tokens: 8192,
    temperature: 0.9,
    messages: [
      { role: "system", name: "MM Assistant", content: "你是一位顶级占星师，严格按用户给定的角色设定、合规铁律和六块结构作答。" },
      { role: "user", name: "用户", content: prompt },
    ],
  });

  const options = {
    hostname: "api.minimaxi.com",
    path: `/v1/text/chatcompletion_v2?GroupId=${encodeURIComponent(groupId)}`,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "Content-Length": Buffer.byteLength(payload),
    },
  };

  // 前端按纯文本流读：每收到一段增量就 res.write 出去
  res.writeHead(200, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-cache",
    "X-Accel-Buffering": "no",
  });

  const upstream = https.request(options, (up) => {
    let buf = "";
    up.setEncoding("utf8");
    up.on("data", (chunk) => {
      buf += chunk;
      // SSE 以 \n\n 分隔事件
      let idx;
      while ((idx = buf.indexOf("\n\n")) !== -1) {
        const evt = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        for (const line of evt.split("\n")) {
          const s = line.trim();
          if (!s.startsWith("data:")) continue;
          const data = s.slice(5).trim();
          if (!data || data === "[DONE]") continue;
          try {
            const j = JSON.parse(data);
            const delta = j.choices && j.choices[0] && (j.choices[0].delta || j.choices[0].message);
            const text = delta && (delta.content || "");
            if (text) res.write(text);
          } catch (e) {
            // 非 JSON 行忽略（心跳等）
          }
        }
      }
    });
    up.on("end", () => res.end());
    up.on("error", () => { try { res.end(); } catch (_) {} });
  });

  upstream.on("error", (err) => {
    try {
      res.write("\n\n[解读暂时连不上，请稍后再试，或扫码人工精解]");
      res.end();
    } catch (_) {}
  });

  upstream.write(payload);
  upstream.end();
}

// ---------- 静态文件 ----------
function serveStatic(req, res) {
  let urlPath = decodeURIComponent(req.url.split("?")[0]);
  if (urlPath === "/") urlPath = "/index.html";
  // 防目录穿越
  const filePath = path.join(ROOT, path.normalize(urlPath).replace(/^(\.\.[/\\])+/, ""));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403); res.end("forbidden"); return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("404");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  });
}

// ---------- 路由 ----------
const server = http.createServer((req, res) => {
  if (req.url.split("?")[0] === "/api/read" && req.method === "POST") {
    let body = "";
    req.on("data", (c) => {
      body += c;
      if (body.length > 1e6) req.destroy(); // 防超大请求
    });
    req.on("end", () => {
      let prompt = "";
      try { prompt = JSON.parse(body).prompt || ""; } catch (_) {}
      if (!prompt) {
        res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "缺少 prompt" }));
        return;
      }
      callMiniMaxStream(prompt, res);
    });
    return;
  }
  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`玄玑·Astrology 服务已启动 :${PORT}`);
});
