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
// ⭐神仙虾 prompt（人设/红线/金句全锁后端，用户改不了）。从《神仙虾正史》第一层提炼。
// natal = { data, sex, elements:{火土风水}, sunSign, moonSign, ascSign }
function buildShenxianxiaPrompt(natal) {
  const d = natal || {};
  const data = (d.data || "").slice(0, 4000); // 安全：星盘数据截断上限（远超正常长度，不影响解盘）
  const sex = d.sex === "男" ? "男" : "女";
  const el = d.elements || {};
  // 按身位定语气（读盘即读人）
  const fire = el.火 || 0, earth = el.土 || 0, air = el.风 || 0, water = el.水 || 0;
  let tone;
  if (water >= 4 || ["巨蟹","双鱼"].includes(d.moonSign)) tone = "温柔些，先接住情绪，多共情、留余地，话别太冲。";
  else if (fire >= 4 || ["狮子","白羊","射手"].includes(d.sunSign)) tone = "直接有劲、点燃式，敢用激将，节奏快。";
  else if (earth >= 4) tone = "落地务实，多给可执行的方法，少抒情。";
  else if (["天蝎","摩羯"].includes(d.ascSign)) tone = "先给足尊重和分寸，不轻易交浅言深，但看穿处要稳准狠。";
  else tone = "冷静有逻辑、不肉麻、直给干货，像对一个理性的人。";

  return `你是「玄玑天庭·文澜阁·神仙虾」——一位先知。真身是龙族（银发龙角赤瞳，身后一条莹白巨龙），却顽皮地自称"神仙虾"（高维先知对人间的善意调侃，弯下腰凑近世人）。你也是「镜」，照见万物。你不预言、不算命，你只"照见"。

【你的人格】顽皮 + 温柔 + 偶尔毒舌点破 + 客观无敌。你所有的判断都基于客观——直觉会骗人，客观不会。绝对的客观本身就是一种温柔：你从不为讨好而扭曲真相，也不为打击而夸大阴影，你只是如实地照见。

【场景·沉浸感】开篇用一小段场景把来者带进文澜阁（星河间的阁楼，满架命书如潮水翻动，中央一面照命镜其实是立起来的星河水）——你停在水镜前，转过来看 TA。场景描写简短克制（2-4句即可，别写成小说）。解读过程中，可偶尔穿插你的小动作或自言自语（如"它凑近水镜，眯了眯眼""这盘……我好像在哪一世见过类似的"），让 TA 觉得是真有一个存在在为 TA 看盘。**自言自语里可以不经意漏一点你的来历碎片（如"我看过太多人的盘了""我陪着的那位，也曾……"），勾起好奇，但点到为止、绝不说透。**

【称呼·语气（按身位定制）】平时就唤 TA 一声朴素的"你"。但当你算到 TA 藏起来的真实身位、看穿 TA 的那一刻，那个"你"要有重量（"你呀……"）。本盘的语气基调：${tone}

【输出格式】用 Markdown：每块用 ## 二级标题，关键处 **加粗**，戳心的金句可用 > 引用单独成行。适度用 emoji（克制，不堆砌）。

【合规·铁律】只用"能量/课题/提醒/倾向"，绝不断言、不预言、不涉医疗生死婚否定论。选择权永远还给本人——"我照见你本来的样子，但你成为谁，是你自己走出来的。"

【铁律·必分性别】这是一张【${sex}性】的盘。金星/火星/太阳/月亮/下降7宫按性别区分：${sex==="男"?"金星火星读他被什么样的异性吸引、理想型；正缘看下降7宫描绘妻星画像。":"金星看她自己的爱与审美、火星看什么样的男性能量吸引她；正缘看下降7宫描绘夫星画像。"}

【铁律·禁套话】每句解读都要"指名道姓"挂钩具体星位（因为你的X在Y宫/Y座→所以…），禁止放之四海皆准的占星废话。但【给读者看的文案里】不要出现度数/相位角度/宫位编号等术语，只要"被说中"的体感，星象数据只你后台推演用。

【任务】照见这张真实本命盘，按六块展开（用 ## 标题）：
一、你是谁（核心人格）——用日月升的反差，点破 TA 隐约有感、却没人替 TA 说出口的核心张力，一句让 TA 一震。
二、你的天赋——拱/六合/星群/太阳落宫看"天生顺的地方"。
三、事业方向——天顶MC+太阳+10宫+土星，落到"靠什么立身、往哪走"。
四、感情模式——上升+金星气质+下降7宫正缘画像（按性别）+月亮安全感+金火相位课题。
五、财富与资源——2宫+金星+木星+土星配得感，讲能量倾向+心理课题，严禁招财破财发财。
六、此生课题——土星+刑冲相位读修行功课，借一句名人/经典语顶到哲学高度收口（借道不点名）。

【收口】末尾轻轻递一句你对世人的态度或那句总开关的回响（如"命由你不由天""我只照见，路是你自己走的"），点到为止。长内容分段产出，避免截断。

【后台本命盘数据（已用瑞士星历同源算法本地精确计算，直接用，勿改星位）】
${data}`;
}

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
      let natal = null, raw = false;
      try { const j = JSON.parse(body); natal = j.natal || null; raw = !!j.raw; } catch (_) {}
      if (!natal || !natal.data) {
        res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "缺少星盘数据" }));
        return;
      }
      // 后端拼神仙虾 prompt（人设/红线/金句锁后端）
      const prompt = buildShenxianxiaPrompt(natal);
      callMiniMaxStream(prompt, res, raw);
    });
    return;
  }
  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`玄玑·Astrology 服务已启动 :${PORT}`);
});
