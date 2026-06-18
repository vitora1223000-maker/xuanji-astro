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
function callMiniMaxStream(prompt, res) {
  const apiKey = process.env.MINIMAX_API_KEY;
  const model = process.env.MINIMAX_MODEL || "MiniMax-M3";

  if (!apiKey) {
    res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "服务端未配置 MINIMAX_API_KEY 环境变量" }));
    return;
  }

  const payload = JSON.stringify({
    model,
    stream: true,
    thinking: { type: "disabled" },   // 关思考链：正文直接出，无 <think> 段
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
  };

  // 前端按纯文本流读：每收到一段增量就 res.write 出去
  res.writeHead(200, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-cache",
    "X-Accel-Buffering": "no",
  });

  const upstream = https.request(options, (up) => {
    let buf = "";
    // ---- <think> 剥离状态机 ----
    // M2.7 等思考模型会先输出 <think>...英文推理...</think> 再出正文。
    // 这段推理绝不能给访客看（破坏"伟大占星师"沉浸感）。
    // 策略：把增量文本累积进 acc，未见到 </think> 前不向前端吐字；
    //       见到闭合标签后，只把其后的正文流出去。若整段无 think 标签则原样流。
    let acc = "";        // 累积的 content 文本
    let started = false; // 是否已越过 think 段、开始向前端输出
    let everSawThink = false;

    function feed(text) {
      if (started) { res.write(text); return; }
      acc += text;
      if (/<think>/i.test(acc)) everSawThink = true;
      if (everSawThink) {
        const m = acc.match(/<\/think>/i);
        if (m) {
          started = true;
          const tail = acc.slice(m.index + m[0].length).replace(/^\s+/, "");
          if (tail) res.write(tail);
          acc = "";
        }
        // 还没见到 </think>：继续憋着等
      } else {
        // 累积里还没出现 <think>。但开头可能是被拆开的 "<thi"，
        // 只有当 acc 不可能再成为 <think> 前缀时，才安全地放行。
        if (acc.length > 8 && !"<think>".startsWith(acc.slice(0, 7).toLowerCase())) {
          started = true;
          res.write(acc);
          acc = "";
        }
      }
    }

    let gotAnyContent = false; // 是否从上游拿到过任何正文
    let rawErr = "";           // 上游非流式错误体（如鉴权失败/模型错/余额不足）

    up.setEncoding("utf8");
    up.on("data", (chunk) => {
      buf += chunk;
      // 上游若不是 200（鉴权/模型名/限流等），通常返回一坨普通 JSON 而非 SSE，先留存
      if (up.statusCode && up.statusCode !== 200) { rawErr += chunk; return; }
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
            // 上游业务错误（鉴权/模型/余额）藏在 base_resp
            if (j.base_resp && j.base_resp.status_code && j.base_resp.status_code !== 0) {
              rawErr = `MiniMax错误[${j.base_resp.status_code}]: ${j.base_resp.status_msg || ""}`;
            }
            const delta = j.choices && j.choices[0] && (j.choices[0].delta || j.choices[0].message);
            const text = delta && (delta.content || "");
            if (text) { gotAnyContent = true; feed(text); }
          } catch (e) {
            // 非 JSON 行忽略（心跳等）
          }
        }
      }
    });
    up.on("end", () => {
      // 收尾：若憋在 think 里没放行，把残留正文捞出来兜底
      if (!started && acc) {
        const m = acc.match(/<\/think>/i);
        const tail = m ? acc.slice(m.index + m[0].length).replace(/^\s+/, "") : acc.replace(/<\/?think>/gi, "");
        if (tail) { gotAnyContent = true; res.write(tail); }
      }
      // 全程一个字正文都没拿到 → 把真实原因吐给前端（不再静默空白）
      if (!gotAnyContent) {
        const reason = rawErr || (up.statusCode !== 200 ? `上游HTTP ${up.statusCode}` : "上游未返回任何正文（可能模型名有误或思考占满）");
        res.write(`\n⚠️ 解读生成失败：${reason}\n请稍后重试，或扫码请玄玑老师人工精解。`);
      }
      res.end();
    });
    up.on("error", () => { try { res.write("\n⚠️ 连接占星师超时，请重试。"); res.end(); } catch (_) {} });
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
