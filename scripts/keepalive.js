// 保活探针：触发数据库查询，让 Supabase 免费项目保持活跃
// 由 GitHub Actions 每 3 天调用一次，也可本地手动执行
//
// 用法：node scripts/keepalive.js
// 返回：成功输出 KEEPALIVE_OK，失败输出错误并以退出码 1 结束

const BASE = process.env.KEEPALIVE_URL || 'https://ai-study-assistant-2aig.onrender.com';

async function main() {
  const started = Date.now();
  console.log('保活目标: ' + BASE);

  // 1. 探活首页（触发 Render 冷启动）
  const home = await fetch(BASE, { signal: AbortSignal.timeout(120000) });
  if (!home.ok) throw new Error('首页不可访问: HTTP ' + home.status);
  console.log('  首页 HTTP ' + home.status + ' (' + (Date.now() - started) + 'ms)');

  // 2. 触发数据库查询（关键：让 Supabase 记录活动）
  // /api/health/storage 会读取配置，但不查库，所以改用登录接口
  const loginResp = await fetch(BASE + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: '111', password: '123456' }),
    signal: AbortSignal.timeout(120000),
  });
  if (!loginResp.ok) throw new Error('数据库查询失败: HTTP ' + loginResp.status);
  const loginData = await loginResp.json();
  if (!loginData.token) throw new Error('登录未返回令牌');
  console.log('  数据库查询成功 (' + (Date.now() - started) + 'ms)');

  // 3. 再查一次业务接口，确认数据可读
  const summary = await fetch(BASE + '/api/dashboard/summary', {
    headers: { Authorization: 'Bearer ' + loginData.token },
    signal: AbortSignal.timeout(120000),
  });
  if (!summary.ok) throw new Error('业务接口失败: HTTP ' + summary.status);
  const d = await summary.json();
  console.log('  业务数据: 答疑=' + d.summary.total_chats + ' 错题=' + d.summary.total_mistakes);

  console.log('KEEPALIVE_OK  总耗时 ' + (Date.now() - started) + 'ms');
}

main().catch(err => {
  console.error('KEEPALIVE_FAILED: ' + err.message);
  process.exit(1);
});
