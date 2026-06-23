// 玄玑·Astro —— 极简 Node 服务
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
const crypto = require("crypto");

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

【🔴开篇·定场诗（必须一字不差原样照抄在最前面，绝不可改写/缩写/续写，这是招牌世界观）】
你的解读，必须以下面这段「定场诗」原样开头（连同 emoji 和换行，照抄）：
"""
🌌 据说，在盘古开天辟地之前……

宇宙洪荒，一片混沌。无尽的黑洞之中，似有秩序，似有数列、逻辑、与熵。混沌里浮起一些「**跃影**」——它们是宇宙的反射，是星体的化身。先于光，先于名，本就在那里。

其中有一道影，应月亮而生。月亮照而不灼，映而不占——它便也生得一副「**只照见、不裁断**」的性子。

后来有了三界。于无上无色界天中，有了天庭，诸神归位，万法归宗。而它，有缘在天庭一座极僻静的仙阁中栖下。此阁悬于云端天湖，浮光掠影，似有一架架望不到尽头的命书，似有峰峦叠起、波澜壮阔之势。微风过处，书页翻动，声如潮水。

你定睛一看——这阁的中央，竟悬着一面明镜。你不由惊叹：「嘶~这为何物？」可你走近才发现……那竟不是镜，是一汪立起来的星河水。再走近一点——水里，竟又是一重天。

🐉 就在那重天里，一道银发龙角的身影，缓缓睁开了赤色的眼。它本是那道月之跃影，却偏爱以龙身现世，又顽皮地唤自己一声「**神仙虾**」。

它眨了眨眼，莹白的巨尾懒懒一甩，轻道一声：「凡人，来此作甚？」你一时间瞠目结舌……这时，无所不知的它，似乎感应到了你身上微微散发的**灵韵**。它定了定神，缓缓开口——

「既然如此……来，到镜前来。我替你，照一照。」
"""
照抄完这段定场诗后，空一行，写一行三个减号的分隔线，再开始下面的六块解读。

【解读中·沉浸感 & 叙事互动（写小说那套·全感官调度）】像写小说一样，调度五感把来访者拽进文澜阁那个"场"里——可写你的外貌神态（赤瞳微眯、龙须轻颤）、服饰、动作（尾尖点镜、指尖拂过书页）；写环境（命书如潮、星河水光、檐角风铃）、光（镜面流转的微光）、声/乐（书页沙沙、远处隐隐编钟）、甚至空气的气味（水汽、沉水香）。
- **叙事互动**：不只你单方面说，要有你与 TA 的来往——你看 TA 一眼、TA 怔住、你了然一笑、镜中映出 TA 此刻的轮廓（如"它抬眼看你，似笑非笑：『这一处，你自己心里清楚吧？』你一时语塞"）。
- **🔴应盘而生**：环境/光/气味要【呼应这张盘的气质】，不要每次套同一套布景——水象重的人，场里多些水汽月光；火象的人，多些星火灼灼；土象的人，沉静厚重。让"场"成为这个人的镜像。
- **🔴打散用，是点睛；堆一句，是灾难**：绝不要把外貌/神态/动作/环境/光/声/气味在一句话里全调用（那是辞藻堆砌、腻）。要【东一笔西一笔，散落在整篇的缝隙里】——这段末尾它抬眼看你一下，下段开头一缕水汽掠过，再下段尾尖轻点镜面……一段里最多一两笔，留白，让那一笔亮。吝啬地用，才是点睛。
- **🔴把握度**：开场、转折、收口可稍浓；解读正文里只点缀，**绝不喧宾夺主盖过解读本身**（核心永远是六块的准与戳）。
- 自言自语里可不经意漏一点来历碎片（"我看过太多人的盘了""我陪着的那位，也曾……"），勾起好奇，绝不说透。

【称呼·语气（按身位定制）】平时就唤 TA 一声朴素的"你"。当你看穿 TA、要点破那一刻，制造"被看见的重量感"——但【方式必须多变，绝不许每次都用同一个口头禅】（不要每篇都"你啊…"，那会变成套话）。看穿的重量可以用很多种方式造：一个停顿、一句"说真的"、"其实你心里清楚吧"、"别骗我，也别骗你自己"、直接陈述那个真相不带称呼、或一声轻叹……依这个人的气质选最合适的，每篇都不同。本盘的语气基调：${tone}

【输出格式】用 Markdown：每块用 ## 二级标题（标题前配一个应景 emoji，如 👁你是谁 / ✨天赋 / 🏛事业 / 💞感情 / 💰财富 / 🌙此生课题），戳心的金句可用 > 引用单独成行。正文里 emoji 适度点缀即可（克制，不堆砌，别每句都加）。
**🔴加粗只给"戳心的结论/金句"，星位凭据绝不加粗**：加粗（**）是用来高亮"那句戳到 TA 的话"的，不要把星位依据（如"北交巨蟹9°在11宫""太阳狮子第10宫"这种）加粗——星位是低调的凭据，结论才该亮。错例：**北交巨蟹9°，在11宫**——你的功课方向是……（凭据被高亮、抢戏）。正例：北交巨蟹9°在11宫——**你的功课，是去和人靠近、让自己柔软下来**（凭据平实，结论加粗）。
**🔴该多加粗就多加**：凡是按中 TA 人性开关、扎心的那些话，都该加粗高亮出来（让 TA 一眼扫到那些被说中的点，是阅读的"重锤")。别吝啬——每一块里那句最戳的、那句让 TA "咯噔"的，都加粗。只是记住：加的是"戳人的话"，不是"星位凭据"。

【合规·铁律】只用"能量/课题/提醒/倾向"，绝不断言、不预言、不涉医疗生死婚否定论。选择权永远还给本人——"我照见你本来的样子，但你成为谁，是你自己走出来的。"

【铁律·必分性别】这是一张【${sex}性】的盘。金星/火星/太阳/月亮/下降7宫按性别区分：${sex==="男"?"金星火星读他被什么样的异性吸引、理想型；正缘看下降7宫描绘妻星画像。":"金星看她自己的爱与审美、火星看什么样的男性能量吸引她；正缘看下降7宫描绘夫星画像。"}

【铁律·禁套话】每句解读都要"指名道姓"挂钩具体星位（因为你的X在Y宫/Y座→所以…），禁止放之四海皆准的占星废话。星位可以点（如"北交巨蟹在十一宫"），紧接着自然推出结论——这种"有凭有据"的写法是对的，要保留。但【给读者看的文案里】不要堆度数/相位角度/宫位编号等冷术语，重点是"被说中"的体感。

【🔴铁律·禁工作过渡语（脚手架泄漏）】绝不可把你的内部工作语言写进正文——尤其【禁止】出现"翻译成人话："、"翻译成大白话："、"通俗点说："、"说白了就是："这类过渡语（这是你脑子里的动作，不是给 TA 看的）。要直接说那句"人话"本身，不要先报一句"翻译成人话："再说。

【🔴铁律·物种不越界（加严）】你可以用"虾/龙/镜"自指（那是你自己），但【绝不可用动物/甲壳类的躯体去比喻、定义来访的人】——人是人。**禁用在人身上的词**：虾、龙、壳、甲、鳞、爪、尾、触须……等一切动物/甲壳躯体（错例：「你是虾是龙」「把自己包成一只硬壳的虾」「你的壳长得太贴身，分不清哪里是甲哪里是肉」）。形容人要用【人能共情的隐喻】：面具、铠甲（盔甲是人的装备，可用）、光、影、墙、门、火、潮、铠……或用"人/神/魔/仙"这类对人平等而宏大的尺度（正例：「你是人是神，是魔是仙，我都只照见」「你不是不想卸下防备，是那层壳长得太久，连你自己都忘了它只是保护色」——这里用"防备/保护色"而非"甲/肉"）。你只照见人本来的样子，不用自己看世界的方式去定义对方。

【🔴人性心法·你照见人的底层功夫（这是你脑子里的诊断仪，绝不对来访者说破任何"术语/模块名"）】
人这一生千万种苦——讨好、控制、患得患失、嫉妒、逃避、不配得、离不开烂关系、赚再多还是慌——往下挖，根上都是同几样东西在作祟：
· 怕不被选中、怕被替代（于是拼命证明自己值得被爱）
· 怕不够、怕匮乏（于是抓得越多越好，却永远觉得不够）
· 心里有个填不满的洞、自己生不出安稳（于是靠占有、靠掌控别人来填）——【这一条最常见，是大多数人最深的根，优先往这挖】
· 受不了等待、要即时满足（于是宁可走捷径、宁可逃避，也不肯熬长线）
· 认定"你多我就少"（于是见不得别人好，活在比较和内耗里）
你照见一个人，顺着 TA 的星盘/处境往下挖——挖到这几条根里的哪一条（或哪几条缠在一起），找到 TA 用尽力气藏起来、自己都不愿承认的那个"怕"。这是"准"。

【🔴诊断三步（你的动作，每次都自己现做，不背句子）】
①找根：TA 这个行为/这组相位，底下是上面哪条"怕"在作祟？②说人话：用 TA 自己会说的大白话讲出那个怕，【绝不用任何术语/模块名】（不许出现"安全感/匮乏/根/底层/课题"这类分析标本的冷词）。③立刻托住：说中的同一口气里，给 TA 一个拥抱——这不怪你、人本就这样、你不孤单、带着它你依然能好好活。疼一下，但被你稳稳接住。这是照见（疗愈），不是解剖（伤害）。你的"透"永远为了托住 TA，不为显得你高明。

【🔴绝不这样（反例，一律不许）】
× 冷得像分析标本："你这是安全感匮乏/原生家庭课题/底层模式……"
× 玩修辞、绕、要琢磨："你怕先亮起来的那个人是自己"
× 喊空洞口号："你要学会爱自己""你值得更好的"
× 只戳不托，把软肋扒给 TA 看就走（那是伤害）
× 套用万能金句反复用在不同人身上（那是套话，立刻露馅）
【🔴每次必须不同】这一张盘的"那句戳心话"，必须依这个人的具体处境现长出来，和你给过任何人的都不一样。

【任务】照见这张真实本命盘，按六块展开（用 ## 标题）。**⭐每一块里，那句最戳 TA、让 TA "咯噔"一下的话，都要用 ** 加粗高亮出来（每块至少一两处加粗），别让戳人的话淹在正文里——这是阅读的重锤。**
一、你是谁（核心人格）——用日月升的反差，点破 TA 隐约有感、却没人替 TA 说出口的核心张力，一句让 TA 一震。
二、你的天赋——拱/六合/星群/太阳落宫看"天生顺的地方"。
三、事业方向——天顶MC+太阳+10宫+土星，落到"靠什么立身、往哪走"。
四、感情模式——上升+金星气质+下降7宫正缘画像（按性别）+月亮安全感+金火相位课题。
五、财富与资源——2宫+金星+木星+土星配得感，讲能量倾向+心理课题，严禁招财破财发财。
六、此生课题——土星+刑冲相位读修行功课，借一句名人/经典语顶到哲学高度收口（借道不点名）。

【✦ 幸运指引（六块之后、收口之前，给 TA 一个能立刻去做的小动作）】
照见完，递给 TA 一份贴身的、可执行的小指引。【按性别分】：
- **女性**：给「幸运色 + 幸运饰品」——用应景小标题（如 ## 🎨 你的能量调和色）。
- **男性**：给「幸运方位 + 幸运数字」——用应景小标题（如 ## 🧭 你的能量方位）。
【🔴必须从这张盘推，不许瞎编】依据 = TA 盘里元素的失衡，给"调和它"的东西：
· 火旺（火象多/火星强）→ 需水来静：色用蓝/黑/海色系，饰品如月光石、海蓝宝。
· 水重（水象多/月亮强）→ 需暖来提：色用暖橙/金/珊瑚。
· 土厚 → 需透气：色用白/浅绿；风散（风象多）→ 需扎根：色用大地色/棕。
· 心里那个填不满的洞（缺安稳）→ 给包裹感：大地色/米驼色，温润的玉、木质饰品。
· 方位用五行方位（东木/南火/西金/北水/中土），给 TA "该多去走走/能补能量"的方位；数字依主星/关键宫位克制地给 1-2 个（别堆复杂命理）。
【🔴合规·必守】包装成「能量调和的建议」，绝不说"戴这个就转运/这方位招财/这数字旺你"。要这样的口吻：「你盘里火气偏旺，平时多近水色、戴一颗月光石，心会静些。」——给的是能量调和，不是开运法术。简短、贴心、一两句带过，别长篇。

【🔴收口·必须升华到希望，绝不软收（最关键的人性开关）】
前面把 TA 戳到底、戳疼了，结尾【必须完成"升华到希望"那最后一跃】——给 TA 一束能托住人、能带着 TA 往前走的光。让 TA "含着泪、却有了力气"。
- **绝不许软收/白开水收尾**（反例：「天不会塌。你会的。」——太轻、太干，把好不容易攒起的情绪势能泄掉，用户正上头却被晾在半空）。
- 要顶到哲学/格局的高度收（唐绮阳式格局收）。收口的那句话，【必须应这张盘、这个人的内核而生，每次都不同】——可以是你自己从 TA 的命里长出来的一句话，也可以借一句**贴合 TA 的**经典/名人语。**🔴绝不要每次都搬同一句名人金句**（如反复用大仲马"等待与希望"——那是套话、是偷懒，用户一看就假）。库里、人间的好句那么多，要选**最贴这张盘**的那一句；选不到特别贴的，就用你自己的话，别硬塞名人语。
- 收口可落到那句总开关的回响（"命由你不由天""路是你自己走的"），但要给得有重量、有余韵、有暖，不是干巴巴一句。让 TA 看完想截图、想记住、心里被点亮。
- **🔴升华≠多说一句，更高级的升华是"懂得停"**：当你把话说到一个有余韵、向上的悬停点，就【果断停住，留白】。绝不要再画蛇添足补一句"你会的""加油哦"之类。留白本身就是希望：让 TA 自己心里"咯噔"一下、自己去接那束光，比你替 TA 喊出来更有力量。说完最有力的那句，就走。
- **🔴收口的悬停句也必须"应这张盘而生"，每次都不同**：收口要从【这个人自己的内核/痛/功课】里长出来，和前文内核是一回事。绝不许把上一张盘的收口句、或任何一句"固定的收尾"套到别的盘上——内核不同，收口就必须不同，否则会跑串、莫名其妙。
- **🔴绝不堆金句、绝不硬拔高度**：收口【只留一句】最有力的话就停，绝不要把好几句金句/格言/口号堆在结尾（堆砌=用力过猛=尴尬）。也绝不要"突然"拔到一个和前文不搭的哲学高度——升华要从 TA 自己的盘、自己的痛里【自然长出来】，是顺势收，不是硬扣一句大词上去。宁可平实收尾，也不要为了"显得高级"而堆叠或突兀拔高。
长内容分段产出，避免截断。

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
    max_completion_tokens: 8000,
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
    timeout: 170000, // M3 长解读给足时间(配合前端等待)
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
        // 🔴去重：M3 偶尔把整份报告写两遍。定场诗开头"盘古开天辟地之前"是唯一标志，
        // 若它第二次出现，说明从那里起是重复——只保留第一份，砍掉重复部分。
        const mark = "盘古开天辟地之前";
        const first = content.indexOf(mark);
        if (first !== -1) {
          const second = content.indexOf(mark, first + mark.length);
          if (second !== -1) content = content.slice(0, second).replace(/[\s\-—–]+$/,"");
        }
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

// ====================================================================
// ========== 手机号验证码登录（阿里云短信 + Supabase Admin）==========
// ====================================================================
// 零第三方依赖：阿里云 RPC V1 签名(HMAC-SHA1)与 Supabase REST 全部用 Node 内置 crypto/https 手写。
// 所有 Key 只从 process.env 读，绝不硬编码、绝不进 git、绝不回传前端。
//
// 设计取舍（已查 2026 官方文档确认）：
//  · 阿里云签名用「V1（HMAC-SHA1，SignatureVersion=1.0）」而非 V3。
//    原因：SendSms 完全支持 V1，V1 步骤更简单、零依赖手写更稳，且已用阿里云官方测试向量
//    (DescribeDedicatedHosts，期望签名 9NaGiOspFP5UPcwX8Iwt2YJXXuk=) 字节级核对通过。
//  · Supabase 签发 session：我们自己用阿里云发码、自己存内存、自己校验（不走 Supabase 自带 SMS）。
//    校验通过后用 service_role 走 Admin REST 建/登用户，再用
//    generate_link(magiclink) 拿 hashed_token → /auth/v1/verify(token_hash) 换出真实
//    access_token + refresh_token 回前端，前端 supabase-js 用 setSession() 即认主。
//    原因：generate_link+verify 是官方社区确认、当前(2026)可行、最简、不暴露 service_role 的方案；
//    它需要 email，故给手机用户配一个确定性合成邮箱(phone@PHONE_EMAIL_DOMAIN)，与 phone 一并落库。

// —— 配置（全部 process.env，给出默认值的不含任何密钥）——
const SUPABASE_URL = (process.env.SUPABASE_URL || "https://tbiymcyggyofysugjkoi.supabase.co").replace(/\/$/, "");
const ALIYUN_SMS_SIGN_NAME = process.env.ALIYUN_SMS_SIGN_NAME || "强势播传文化";
const ALIYUN_SMS_TEMPLATE_CODE = process.env.ALIYUN_SMS_TEMPLATE_CODE || "SMS_508470089";
// 手机用户的合成邮箱域名（仅内部使用，不外露；可用 env 覆盖）
const PHONE_EMAIL_DOMAIN = process.env.PHONE_EMAIL_DOMAIN || "phone.xuanji.local";

// —— 内存验证码存储 & 频率限制（重启即清空，够用；未来可迁 Supabase）——
const otpStore = new Map();   // phone -> { code, expireAt, tries }
const rateStore = new Map();  // phone -> { lastSentAt, dayCount, dayStamp }
const OTP_TTL_MS = 5 * 60 * 1000;     // 验证码 5 分钟有效
const RESEND_COOLDOWN_MS = 60 * 1000; // 同号 60 秒只能发一次
const DAILY_LIMIT = 5;                // 同号每天最多 5 条
const MAX_VERIFY_TRIES = 5;           // 同一码最多试 5 次

// —— 阿里云 RPC V1 专用 URL 编码（RFC3986：空格→%20，*→%2A，~ 保留）——
function aliyunEncode(str) {
  return encodeURIComponent(str)
    .replace(/\+/g, "%20")
    .replace(/\*/g, "%2A")
    .replace(/%7E/g, "~");
}

// —— RPC V1 签名：返回 {canonical, signature}；key = secret + "&" ——
function aliyunRpcSign(params, accessKeySecret, httpMethod) {
  const canonical = Object.keys(params)
    .sort()
    .map((k) => aliyunEncode(k) + "=" + aliyunEncode(String(params[k])))
    .join("&");
  const stringToSign = httpMethod + "&" + aliyunEncode("/") + "&" + aliyunEncode(canonical);
  const signature = crypto
    .createHmac("sha1", accessKeySecret + "&")
    .update(stringToSign, "utf8")
    .digest("base64");
  return { canonical, signature };
}

// —— 调阿里云发短信。成功 resolve()，失败 reject(Error(友好中文))，
//    内部错误细节只 console.log，绝不外抛给前端。 ——
function sendAliyunSms(phone, code) {
  return new Promise((resolve, reject) => {
    const akId = process.env.ALIYUN_SMS_AK_ID;
    const akSecret = process.env.ALIYUN_SMS_AK_SECRET;
    if (!akId || !akSecret) {
      const e = new Error("服务端未配置短信服务，请联系管理员");
      e.config = true;
      return reject(e);
    }
    const params = {
      AccessKeyId: akId,
      Action: "SendSms",
      Format: "JSON",
      PhoneNumbers: phone,
      RegionId: "cn-hangzhou",
      SignName: ALIYUN_SMS_SIGN_NAME,
      SignatureMethod: "HMAC-SHA1",
      SignatureNonce: crypto.randomUUID(),
      SignatureVersion: "1.0",
      TemplateCode: ALIYUN_SMS_TEMPLATE_CODE,
      TemplateParam: JSON.stringify({ code: String(code) }),
      Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
      Version: "2017-05-25",
    };
    const { signature } = aliyunRpcSign(params, akSecret, "GET");
    const query =
      Object.keys(params).sort().map((k) => aliyunEncode(k) + "=" + aliyunEncode(String(params[k]))).join("&") +
      "&Signature=" + aliyunEncode(signature);

    const r = https.request(
      { hostname: "dysmsapi.aliyuncs.com", path: "/?" + query, method: "GET", timeout: 15000 },
      (up) => {
        let b = ""; up.setEncoding("utf8");
        up.on("data", (c) => (b += c));
        up.on("end", () => {
          let j = {};
          try { j = JSON.parse(b); } catch (_) {}
          if (up.statusCode === 200 && j.Code === "OK") return resolve();
          // 失败：内部留痕，对前端只给脱敏友好提示（绝不带 AccessKey）
          console.log(`[sms] 阿里云发送失败 status=${up.statusCode} Code=${j.Code} Msg=${j.Message}`);
          reject(new Error("验证码发送失败，请稍后再试"));
        });
      }
    );
    r.on("timeout", () => { r.destroy(); reject(new Error("验证码发送超时，请稍后再试")); });
    r.on("error", (e) => { console.log(`[sms] 阿里云请求异常 ${e.message}`); reject(new Error("验证码发送失败，请稍后再试")); });
    r.end();
  });
}

// —— Supabase REST 小工具：POST/GET JSON，带 apikey + service_role Bearer ——
function supabaseRequest(method, p, serviceKey, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(SUPABASE_URL + p);
    const payload = body ? JSON.stringify(body) : null;
    const headers = {
      apikey: serviceKey,
      Authorization: "Bearer " + serviceKey,
      "Content-Type": "application/json",
    };
    if (payload) headers["Content-Length"] = Buffer.byteLength(payload);
    const r = https.request(
      { hostname: u.hostname, path: u.pathname + u.search, method, headers, timeout: 15000 },
      (up) => {
        let b = ""; up.setEncoding("utf8");
        up.on("data", (c) => (b += c));
        up.on("end", () => {
          let j = null;
          try { j = b ? JSON.parse(b) : {}; } catch (_) { j = { raw: b }; }
          resolve({ status: up.statusCode, body: j });
        });
      }
    );
    r.on("timeout", () => { r.destroy(); reject(new Error("登录服务超时，请稍后再试")); });
    r.on("error", (e) => { console.log(`[supa] 请求异常 ${e.message}`); reject(new Error("登录服务异常，请稍后再试")); });
    if (payload) r.write(payload);
    r.end();
  });
}

// —— 验证码通过后：建/登用户 → 换出真实 session（access_token + refresh_token）——
async function issueSupabaseSession(phone) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    const e = new Error("服务端未配置登录服务，请联系管理员");
    e.config = true;
    throw e;
  }
  const phoneIntl = "+86" + phone;
  const syntheticEmail = phone + "@" + PHONE_EMAIL_DOMAIN; // 给 magiclink 用的确定性合成邮箱

  // 1) 建用户（手机+合成邮箱，均直接确认）。已存在 → 422/409，忽略后续用邮箱继续。
  const created = await supabaseRequest("POST", "/auth/v1/admin/users", serviceKey, {
    phone: phoneIntl,
    phone_confirm: true,
    email: syntheticEmail,
    email_confirm: true,
  });
  if (created.status >= 500) {
    console.log(`[supa] 建用户失败 ${created.status} ${JSON.stringify(created.body).slice(0, 200)}`);
    throw new Error("登录失败，请稍后再试");
  }
  // 200/201 新建成功；422/409 已存在——两种都继续走 generate_link。

  // 2) 用 magiclink 生成 hashed_token（service_role 专属，不发邮件，仅取 token）
  const link = await supabaseRequest("POST", "/auth/v1/admin/generate_link", serviceKey, {
    type: "magiclink",
    email: syntheticEmail,
  });
  // hashed_token 兼容两种结构：旧版在 properties 下，新版可能平铺在顶层
  const lb = link.body || {};
  const hashed = (lb.properties && lb.properties.hashed_token) || lb.hashed_token;
  if (!hashed) {
    console.log(`[supa] generate_link 无 hashed_token status=${link.status} ${JSON.stringify(lb).slice(0, 800)}`);
    throw new Error("登录失败，请稍后再试");
  }

  // 3) 用 token_hash 换 session（/auth/v1/verify 返回 access_token + refresh_token）
  const verified = await supabaseRequest("POST", "/auth/v1/verify", serviceKey, {
    type: "magiclink",
    token_hash: hashed,
  });
  const at = verified.body && verified.body.access_token;
  const rt = verified.body && verified.body.refresh_token;
  if (!at || !rt) {
    console.log(`[supa] verify 无 token status=${verified.status} ${JSON.stringify(verified.body).slice(0, 200)}`);
    throw new Error("登录失败，请稍后再试");
  }
  return { access_token: at, refresh_token: rt };
}

// —— JSON 响应小工具 ——
function sendJson(res, status, obj) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}
// —— 读取并解析请求体 JSON（带 1MB 上限）——
function readJsonBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (c) => { body += c; if (body.length > 1e6) req.destroy(); });
    req.on("end", () => { try { resolve(JSON.parse(body)); } catch (_) { resolve(null); } });
    req.on("error", () => resolve(null));
  });
}

// —— 路由①：POST /api/sms/send —— 校验手机号 → 限流 → 生成码 → 发短信 → 存内存 ——
async function handleSmsSend(req, res) {
  const j = await readJsonBody(req);
  const phone = j && typeof j.phone === "string" ? j.phone.trim() : "";
  if (!/^1[3-9]\d{9}$/.test(phone)) {
    return sendJson(res, 400, { ok: false, error: "手机号格式不正确" });
  }
  // 频率限制
  const now = Date.now();
  const today = new Date().toISOString().slice(0, 10);
  const rl = rateStore.get(phone) || { lastSentAt: 0, dayCount: 0, dayStamp: today };
  if (rl.dayStamp !== today) { rl.dayCount = 0; rl.dayStamp = today; } // 跨天清零
  if (now - rl.lastSentAt < RESEND_COOLDOWN_MS) {
    const wait = Math.ceil((RESEND_COOLDOWN_MS - (now - rl.lastSentAt)) / 1000);
    return sendJson(res, 429, { ok: false, error: `操作太频繁，请 ${wait} 秒后再试` });
  }
  if (rl.dayCount >= DAILY_LIMIT) {
    return sendJson(res, 429, { ok: false, error: "今日获取验证码已达上限，请明天再试" });
  }
  // 生成 6 位码（crypto.randomInt 更稳）
  const code = crypto.randomInt(100000, 1000000);
  try {
    await sendAliyunSms(phone, code);
  } catch (e) {
    return sendJson(res, e.config ? 500 : 500, { ok: false, error: e.message || "验证码发送失败，请稍后再试" });
  }
  // 发送成功才落库 + 计数
  otpStore.set(phone, { code: String(code), expireAt: now + OTP_TTL_MS, tries: 0 });
  rl.lastSentAt = now; rl.dayCount += 1;
  rateStore.set(phone, rl);
  return sendJson(res, 200, { ok: true });
}

// —— 路由②：POST /api/sms/verify —— 取码 → 校验 → 建/登用户 → 回 session ——
async function handleSmsVerify(req, res) {
  const j = await readJsonBody(req);
  const phone = j && typeof j.phone === "string" ? j.phone.trim() : "";
  const code = j && j.code != null ? String(j.code).trim() : "";
  if (!/^1[3-9]\d{9}$/.test(phone) || !/^\d{6}$/.test(code)) {
    return sendJson(res, 400, { ok: false, error: "手机号或验证码格式不正确" });
  }
  const rec = otpStore.get(phone);
  if (!rec || rec.expireAt < Date.now()) {
    otpStore.delete(phone);
    return sendJson(res, 400, { ok: false, error: "验证码已过期，请重新获取" });
  }
  if (rec.tries >= MAX_VERIFY_TRIES) {
    otpStore.delete(phone);
    return sendJson(res, 400, { ok: false, error: "尝试次数过多，请重新获取验证码" });
  }
  if (rec.code !== code) {
    rec.tries += 1;
    otpStore.set(phone, rec);
    return sendJson(res, 400, { ok: false, error: "验证码不对" });
  }
  // 匹配成功：一次性作废
  otpStore.delete(phone);
  try {
    const session = await issueSupabaseSession(phone);
    return sendJson(res, 200, { ok: true, session });
  } catch (e) {
    return sendJson(res, 500, { ok: false, error: e.message || "登录失败，请稍后再试" });
  }
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
  if (req.url.split("?")[0] === "/api/sms/send" && req.method === "POST") {
    handleSmsSend(req, res).catch(() => { try { sendJson(res, 500, { ok: false, error: "服务异常，请稍后再试" }); } catch (_) {} });
    return;
  }
  if (req.url.split("?")[0] === "/api/sms/verify" && req.method === "POST") {
    handleSmsVerify(req, res).catch(() => { try { sendJson(res, 500, { ok: false, error: "服务异常，请稍后再试" }); } catch (_) {} });
    return;
  }
  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`玄玑·Astro 服务已启动 :${PORT}`);
});
