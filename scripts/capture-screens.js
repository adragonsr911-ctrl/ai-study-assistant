// 批量截图：为提交文档准备项目图片
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.argv[2] || 'https://ai-study-assistant-2aig.onrender.com';
const OUTDIR = process.argv[3] || 'D:\\Projects\\_shots';
const PORT = 9226;

if (!fs.existsSync(OUTDIR)) fs.mkdirSync(OUTDIR, { recursive: true });
const profileDir = path.join(require('os').tmpdir(), 'dsh-shot-' + Date.now());
fs.mkdirSync(profileDir, { recursive: true });

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars',
  '--remote-debugging-port=' + PORT, '--user-data-dir=' + profileDir,
  '--window-size=1440,900', 'about:blank',
], { stdio: 'ignore' });

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  let targets = null;
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json/list`); targets = await r.json(); if (targets.length) break; } catch (e) {}
    await sleep(500);
  }
  const page = targets.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id); pending.delete(m.id);
      m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result);
    }
  };
  const send = (method, params = {}) => new Promise((res, rej) => {
    const i = ++id; pending.set(i, { resolve: res, reject: rej });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  const evaluate = async (expr, awaitPromise = false) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise, returnByValue: true });
    return r.result && r.result.value;
  };
  const shot = async (name) => {
    await sleep(1200);
    const s = await send('Page.captureScreenshot', { format: 'png' });
    const p = path.join(OUTDIR, name + '.png');
    fs.writeFileSync(p, Buffer.from(s.data, 'base64'));
    console.log('  ✓ ' + name + '.png');
  };

  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false });

  console.log('打开落地页（等待冷启动）');
  await send('Page.navigate', { url: BASE });
  await sleep(15000);

  console.log('截图：落地页');
  await shot('01-落地页');

  // 登录
  console.log('登录');
  await evaluate(`(async () => {
    const r = await fetch('/api/auth/login', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({username:'111',password:'123456'}) });
    const d = await r.json();
    if (d.token) { localStorage.setItem('token', d.token); localStorage.setItem('user', JSON.stringify(d.user)); return 'OK'; }
    return 'FAIL';
  })()`, true);
  await send('Page.navigate', { url: BASE });
  await sleep(8000);

  const views = [
    ['chat', '02-AI答疑', 'AI答疑'],
    ['knowledge', '03-知识点拆解', '知识点拆解'],
    ['plan', '04-学习计划', '学习计划'],
    ['mistake', '05-错题本', '错题本'],
    ['dashboard', '06-学习看板', '学习看板'],
    ['diagnosis', '07-AI诊断', 'AI诊断'],
  ];

  for (const [view, file] of views) {
    console.log('切换视图: ' + view);
    await evaluate(`switchView('${view}')`);
    await sleep(2500);
    await shot(file);
  }

  // 知识图谱
  console.log('切换：知识图谱');
  await evaluate(`switchView('knowledge')`);
  await sleep(1500);
  await evaluate(`(() => {
    const tab = document.querySelector('.view-tab[data-view="graph"]');
    if (tab) tab.click();
  })()`);
  await sleep(3000);
  await shot('08-知识图谱');

  // 深色模式 + 看板
  console.log('切换深色模式');
  await evaluate(`(() => {
    const btn = document.getElementById('btn-theme-toggle');
    if (btn) btn.click();
  })()`);
  await sleep(1500);
  await evaluate(`switchView('dashboard')`);
  await sleep(2500);
  await shot('09-深色模式-看板');

  // 切回浅色
  await evaluate(`(() => { const b = document.getElementById('btn-theme-toggle'); if (b) b.click(); })()`);

  ws.close(); chrome.kill();
  try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch (e) {}
  console.log('');
  console.log('截图完成，输出目录: ' + OUTDIR);
})().catch(e => { console.error('失败:', e.message); chrome.kill(); process.exit(1); });
