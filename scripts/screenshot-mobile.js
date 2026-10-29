// 用 Chrome DevTools Protocol 截图移动端登录后界面
// 用法：node scripts/screenshot-mobile.js [url] [output]
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = process.argv[2] || 'http://localhost:3500/';
const OUT = process.argv[3] || 'D:\\Projects\\_mobile_cdp.png';
const PORT = 9222;

const profileDir = path.join(require('os').tmpdir(), 'dsh-chrome-' + Date.now());
fs.mkdirSync(profileDir, { recursive: true });

const chrome = spawn(CHROME, [
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + profileDir,
  '--window-size=375,812',
  'about:blank',
], { stdio: 'ignore' });

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  // 等待 Chrome 启动
  let targets = null;
  for (let i = 0; i < 30; i++) {
    try {
      const resp = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      targets = await resp.json();
      if (targets && targets.length) break;
    } catch (e) { /* 还没起来 */ }
    await sleep(500);
  }
  if (!targets) throw new Error('Chrome 未启动');

  const page = targets.find(t => t.type === 'page');
  if (!page) throw new Error('未找到页面目标');

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let msgId = 0;
  const pending = new Map();

  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  };

  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });

  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  // 启用必要的域
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 375,
    height: 812,
    deviceScaleFactor: 2,
    mobile: true,
  });

  // 导航
  await send('Page.navigate', { url: URL });
  await sleep(4000);

  // 登录并进入主应用
  const loginResult = await send('Runtime.evaluate', {
    expression: `(async () => {
      const resp = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: '111', password: '123456' })
      });
      const data = await resp.json();
      if (!data.token) return 'LOGIN_FAILED: ' + JSON.stringify(data);
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      return 'OK';
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  console.log('登录结果:', JSON.stringify(loginResult.result.value));

  // 重新加载页面，进入登录后状态
  await send('Page.navigate', { url: URL });
  await sleep(5000);

  // 确认已进入主应用
  const state = await send('Runtime.evaluate', {
    expression: `(() => {
      const main = document.getElementById('main-app');
      const landing = document.getElementById('landing-page');
      const btn = document.getElementById('btn-theme-toggle');
      const rect = btn ? btn.getBoundingClientRect() : null;
      const sidebar = document.querySelector('.sidebar');
      const sbRect = sidebar ? sidebar.getBoundingClientRect() : null;
      return JSON.stringify({
        mainVisible: main && !main.classList.contains('hidden'),
        landingVisible: landing && !landing.classList.contains('hidden'),
        btnRect: rect ? { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) } : null,
        sidebarRect: sbRect ? { x: Math.round(sbRect.x), w: Math.round(sbRect.width) } : null,
        viewportW: window.innerWidth,
      });
    })()`,
    returnByValue: true,
  });
  console.log('页面状态:', state.result.value);

  // 截图
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(OUT, Buffer.from(shot.data, 'base64'));
  console.log('截图已保存:', OUT);

  ws.close();
  chrome.kill();
  try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch (e) {}
}

main().catch(err => {
  console.error('失败:', err.message);
  chrome.kill();
  process.exit(1);
});
