// 玄玑·Astrology —— 极简 Node 服务
// 职责：① 托管现有静态文件（index.html / *.js / *.png 原样不动）
//        ② 提供 /api/read：藏着 Key 调 MiniMax 官方 API，流式回传解读
// Key 全程只从环境变量读，绝不写进代码、绝不上 GitHub。
//
// 需要的环境变量（在 Zeabur 后台「环境变量」里填，不要写进任何文件）：
//   MINIMAX_API_KEY   —— MiniMax 接口密钥（OpenAI 兼容接口只需这一个，不需要 GroupId）
//   MINIMAX_MODEL     —— 用哪个模型，默认 MiniMax-M2.7-highspeed（可换 MiniMax-M3 / MiniMax-M2.7）
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

// ---------- MiniMax 流式调用（OpenAI 兼容接口）----------
// POST https://api.minimaxi.com/v1/chat/completions —— 只需 Authorization: Bearer KEY，不要 GroupId。
// stream:true 时返回 SSE（data: {...}\n\n），逐块把增量文本写回前端，规避长输出超时。
//
// ⭐关键：用 MiniMax-M3 + thinking:disabled —— M3 是最强模型，关掉思考链后
// 直接出干净正文（不再有 <think> 英文推理、不会被思考 token 吃掉正文）。
// ⭐非流式版：Zeabur 入口网关对流式(SSE)长连接会缓冲/卡死，
// 故改用 stream:false —— 一次性拿完整解读再整段返回。/api/diag 已验证非流式秒通。
function callMiniMaxStream(prompt, res, raw) {
  const apiKey = process.env.MINIMAX_API_KEY;
  const model = process.env.MINIMAX_MODEL || "MiniMax-M3";
  const t0 = Date.now();
  const log = (m) => console.log(`[mm +${((Date.now()-t0)/1000).toFixed(1)}s] ${m}`);

  if (!apiKey) {
    res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "服务端未配置 MINIMAX_API_KEY 环境变量" }));
    return;
  }
  log(`发起 model=${model} keyLen=${apiKey.length} promptLen=${prompt.length}`);

  const payload = JSON.stringify({
    model,
    stream: false,                    // 非流式：绕开 Zeabur 流式网关问题
    thinking: { type: "disabled" },   // 关思考链：M3 直接出正文，无 <think> 段
    max_completion_tokens: 16384,
    temperature: 1,
    top_p: 0.95,
    messages: [
      { role: "system", content: "你是一位顶级占星师，严格按用户给定的角色设定、合规铁律和六块结构作答。" },
      { role: "user", content: prompt },
    ],
  });

  const options = {
    hostname: "api.minimaxi.com",
    path: `/v1/chat/completions`,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "Content-Length": Buffer.byteLength(payload),
    },
    timeout: 110000, // M3 长解读给足时间
  };

  const upstream = https.request(options, (up) => {
    log(`上游响应头 statusCode=${up.statusCode}`);
    let body = "";
    up.setEncoding("utf8");
    up.on("data", (c) => (body += c));
    up.on("end", () => {
      log(`上游完成 ${body.length}字节`);
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" });
      try {
        const j = JSON.parse(body);
        if (j.base_resp && j.base_resp.status_code && j.base_resp.status_code !== 0) {
          res.end(`\n⚠️ 解读生成失败：MiniMax错误[${j.base_resp.status_code}] ${j.base_resp.status_msg || ""}\n请稍后重试，或扫码请玄玑老师人工精解。`);
          return;
        }
        let content = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || "";
        // 兜底：万一仍有 <think>…</think>，剥掉只留正文
        const m = content.match(/<\/think>/i);
        if (m) content = content.slice(m.index + m[0].length);
        content = content.replace(/<\/?think>/gi, "").replace(/^\s+/, "");
        if (raw) { res.end(body.slice(0, 4000)); return; }
        res.end(content || "\n⚠️ 占星师暂时没有给出解读，请重试。");
      } catch (e) {
        res.end(`\n⚠️ 解读解析失败，请重试。\n${(body || "").slice(0, 200)}`);
      }
    });
    up.on("error", () => { try { res.end("\n⚠️ 连接占星师中断，请重试。"); } catch (_) {} });
  });

  upstream.on("timeout", () => { upstream.destroy(); try { res.end("\n⚠️ 占星师推演超时，请重试。"); } catch (_) {} });
  upstream.on("error", () => { try { res.end("\n⚠️ 解读暂时连不上，请稍后再试，或扫码人工精解。"); } catch (_) {} });

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

// ---------- 诊断：线上服务自测能否连到 MiniMax ----------
function diag(res) {
  const t0 = Date.now();
  const out = (o) => { res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" }); res.end(JSON.stringify(o, null, 2)); };
  const apiKey = process.env.MINIMAX_API_KEY || "";
  const payload = JSON.stringify({
    model: process.env.MINIMAX_MODEL || "MiniMax-M3",
    stream: false, max_completion_tokens: 30,
    thinking: { type: "disabled" },
    messages: [{ role: "user", content: "说一个字" }],
  });
  const r = https.request({
    hostname: "api.minimaxi.com", path: "/v1/chat/completions", method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}`, "Content-Length": Buffer.byteLength(payload) },
    timeout: 25000,
  }, (up) => {
    let b = ""; up.setEncoding("utf8");
    up.on("data", (c) => b += c);
    up.on("end", () => out({ ok: true, ms: Date.now() - t0, status: up.statusCode, keyLen: apiKey.length, body: b.slice(0, 400) }));
  });
  r.on("timeout", () => { r.destroy(); out({ ok: false, ms: Date.now() - t0, err: "连接 MiniMax 超时(25s)——Zeabur到MiniMax网络不通", keyLen: apiKey.length }); });
  r.on("error", (e) => out({ ok: false, ms: Date.now() - t0, err: String(e.message || e), keyLen: apiKey.length }));
  r.write(payload); r.end();
}

// ---------- 路由 ----------
const server = http.createServer((req, res) => {
  if (req.url.split("?")[0] === "/api/diag") { diag(res); return; }
  if (req.url.split("?")[0] === "/api/read" && req.method === "POST") {
    let body = "";
    req.on("data", (c) => {
      body += c;
      if (body.length > 1e6) req.destroy(); // 防超大请求
    });
    req.on("end", () => {
      let prompt = "", raw = false;
      try { const j = JSON.parse(body); prompt = j.prompt || ""; raw = !!j.raw; } catch (_) {}
      if (!prompt) {
        res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "缺少 prompt" }));
        return;
      }
      callMiniMaxStream(prompt, res, raw);
    });
    return;
  }
  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`玄玑·Astrology 服务已启动 :${PORT}`);
});
