// 全接口回归测试
// 用法：node scripts/regression-test.js [baseUrl] [username] [password]
// 默认测试本地 http://localhost:3500，使用张三账号（有完整示例数据）

const BASE = process.argv[2] || 'http://localhost:3500';
const LOGIN_USER = process.argv[3] || '111';
const LOGIN_PASS = process.argv[4] || '123456';

let pass = 0, fail = 0;
const failures = [];

function ok(name, extra = '') {
  pass++;
  console.log('  ✓ ' + name + (extra ? '  ' + extra : ''));
}

function bad(name, err) {
  fail++;
  failures.push(name + ' :: ' + err);
  console.log('  ✗ ' + name + '  ' + err);
}

async function api(path, options = {}) {
  const resp = await fetch(BASE + path, options);
  const text = await resp.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) { /* 非 JSON */ }
  return { status: resp.status, json, text };
}

function jsonHeaders(token) {
  const h = { 'Content-Type': 'application/json' };
  if (token) h.Authorization = 'Bearer ' + token;
  return h;
}

(async () => {
  console.log('回归测试目标: ' + BASE);
  console.log('');

  // ============ 1. 认证模块 ============
  console.log('【认证模块】');
  let token = null;
  let userId = null;

  const uname = 'reg' + Date.now().toString().slice(-8);
  {
    const r = await api('/api/auth/register', {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({
        username: uname,
        password: '123456',
        nickname: '回归测试',
        security_question: '你的母校是？',
        security_answer: '岭南师范学院',
      }),
    });
    if (r.status === 201 && r.json && r.json.token) {
      ok('注册', '用户ID=' + r.json.user.id + ' 类型=' + typeof r.json.user.id);
      token = r.json.token;
      userId = r.json.user.id;
      if (typeof r.json.user.id !== 'number') bad('注册返回的ID类型', '应为 number，实际 ' + typeof r.json.user.id);
    } else {
      bad('注册', r.status + ' ' + r.text.slice(0, 100));
    }
  }

  {
    const r = await api('/api/auth/register', {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({
        username: uname, password: '123456',
        security_question: 'a', security_answer: 'b',
      }),
    });
    if (r.status === 400) ok('重复用户名被拒绝'); else bad('重复用户名', '期望400，实际' + r.status);
  }

  {
    const r = await api('/api/auth/login', {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ username: uname, password: '123456' }),
    });
    if (r.status === 200 && r.json.token) ok('登录'); else bad('登录', r.status + ' ' + r.text.slice(0, 80));
  }

  {
    const r = await api('/api/auth/login', {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ username: uname, password: 'wrong' }),
    });
    if (r.status === 401) ok('错误密码被拒绝'); else bad('错误密码', '期望401，实际' + r.status);
  }

  {
    const r = await api('/api/auth/me', { headers: jsonHeaders(token) });
    if (r.status === 200 && r.json.user) ok('获取当前用户'); else bad('获取当前用户', r.status);
  }

  {
    const r = await api('/api/auth/me');
    if (r.status === 401) ok('未认证被拒绝'); else bad('未认证', '期望401，实际' + r.status);
  }

  // ============ 2. 看板模块（重点：数据类型） ============
  console.log('');
  console.log('【看板模块 - 数据类型重点】');

  // 用有完整示例数据的账号测，比空账号更能暴露问题
  let dataToken = null;
  {
    const r = await api('/api/auth/login', {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ username: LOGIN_USER, password: LOGIN_PASS }),
    });
    if (r.status === 200 && r.json.token) {
      dataToken = r.json.token;
      ok('数据账号登录（' + LOGIN_USER + '）', '昵称=' + r.json.user.nickname);
    } else {
      bad('数据账号登录', r.status + ' ' + r.text.slice(0, 80));
      dataToken = token; // 降级用新注册账号
    }
  }

  {
    const r = await api('/api/dashboard/summary', { headers: jsonHeaders(dataToken) });
    if (r.status === 200 && r.json.summary) {
      const s = r.json.summary;
      const keys = ['total_chats', 'total_knowledge', 'total_mistakes', 'total_plans', 'study_days'];
      const wrongTypes = keys.filter(k => typeof s[k] !== 'number');
      if (wrongTypes.length === 0) {
        ok('summary 所有计数字段均为数字类型',
          '答疑=' + s.total_chats + ' 错题=' + s.total_mistakes + ' 计划=' + s.total_plans);
      } else {
        bad('summary 数据类型', '以下字段不是数字: ' + wrongTypes.map(k => k + '=' + typeof s[k]).join(', '));
      }
    } else bad('summary', r.status);
  }

  {
    const r = await api('/api/dashboard/heatmap', { headers: jsonHeaders(dataToken) });
    if (r.status === 200 && Array.isArray(r.json.heatmap)) {
      ok('热力图', '数据点=' + r.json.heatmap.length);
      const badType = r.json.heatmap.filter(d =>
        typeof d.activity !== 'number' ||
        typeof d.level !== 'number' ||
        typeof d.study_minutes !== 'number'
      );
      if (badType.length > 0) bad('热力图数值类型', badType.length + ' 个点含非数字字段');
      else ok('热力图 activity/level/study_minutes 均为数字');
    } else bad('热力图', r.status);
  }

  {
    const r = await api('/api/dashboard/radar', { headers: jsonHeaders(dataToken) });
    if (r.status === 200 && Array.isArray(r.json.radar)) {
      ok('雷达图', '科目数=' + r.json.radar.length);
      const badType = r.json.radar.filter(d => typeof d.mastery_rate !== 'number' || typeof d.total !== 'number');
      if (badType.length > 0) bad('雷达图数值类型', badType.length + ' 项不是数字');
      else ok('雷达图数值均为数字');
    } else bad('雷达图', r.status);
  }

  {
    const r = await api('/api/dashboard/trend?days=7', { headers: jsonHeaders(dataToken) });
    if (r.status === 200) ok('趋势图'); else bad('趋势图', r.status);
  }

  {
    const r = await api('/api/dashboard/subject-distribution', { headers: jsonHeaders(dataToken) });
    if (r.status === 200 && Array.isArray(r.json.distribution)) {
      ok('科目分布', '科目数=' + r.json.distribution.length);
      const badType = r.json.distribution.filter(d => typeof d.count !== 'number');
      if (badType.length > 0) {
        bad('科目分布 count 类型', '期望 number，实际: ' + badType.map(d => d.subject + '=' + typeof d.count).join(', '));
      } else {
        const total = r.json.distribution.reduce((s, d) => s + d.count, 0);
        ok('科目分布 count 均为数字类型', '合计=' + total + '（应为数字而非 "0211"）');
      }
    } else bad('科目分布', r.status);
  }

  // ============ 3. 错题本 ============
  console.log('');
  console.log('【错题本模块】');
  let mistakeId = null;

  {
    const r = await api('/api/mistake/add', {
      method: 'POST',
      headers: jsonHeaders(token),
      body: JSON.stringify({
        subject: '数学',
        question: '回归测试：1+1=?',
        your_answer: '3',
        correct_answer: '2',
      }),
    });
    if (r.status === 200 || r.status === 201) {
      mistakeId = r.json.mistake ? r.json.mistake.id : null;
      ok('添加错题', 'ID=' + mistakeId + ' 类型=' + typeof mistakeId);
      if (typeof mistakeId !== 'number') bad('错题ID类型', '应为 number，实际 ' + typeof mistakeId);
    } else bad('添加错题', r.status + ' ' + r.text.slice(0, 100));
  }

  {
    const r = await api('/api/mistake', { headers: jsonHeaders(token) });
    if (r.status === 200 && Array.isArray(r.json.mistakes)) ok('错题列表', '数量=' + r.json.mistakes.length);
    else bad('错题列表', r.status);
  }

  {
    const r = await api('/api/mistake/' + mistakeId, { headers: jsonHeaders(token) });
    if (r.status === 200 && r.json.mistake) ok('错题详情'); else bad('错题详情', r.status);
  }

  {
    const r = await api('/api/mistake/reviews/due', { headers: jsonHeaders(token) });
    if (r.status === 200) ok('艾宾浩斯待复习'); else bad('待复习', r.status);
  }

  // ============ 4. 知识点 ============
  console.log('');
  console.log('【知识点模块】');

  {
    const r = await api('/api/knowledge', { headers: jsonHeaders(token) });
    if (r.status === 200) ok('知识点列表'); else bad('知识点列表', r.status);
  }

  {
    const r = await api('/api/knowledge/graph', { headers: jsonHeaders(token) });
    if (r.status === 200 && Array.isArray(r.json.nodes)) {
      ok('知识图谱', '节点=' + r.json.nodes.length + ' 边=' + (r.json.edges ? r.json.edges.length : 0));
    } else bad('知识图谱', r.status);
  }

  // ============ 5. 学习计划 ============
  console.log('');
  console.log('【学习计划模块】');

  {
    const r = await api('/api/plan', { headers: jsonHeaders(token) });
    if (r.status === 200 && Array.isArray(r.json.plans)) ok('计划列表', '数量=' + r.json.plans.length);
    else bad('计划列表', r.status);
  }

  // ============ 6. 诊断 ============
  console.log('');
  console.log('【诊断模块】');

  {
    const r = await api('/api/diagnosis', { headers: jsonHeaders(token) });
    if (r.status === 200) ok('诊断列表'); else bad('诊断列表', r.status);
  }

  // ============ 7. 对话 ============
  console.log('');
  console.log('【对话模块】');
  let convId = null;

  {
    const r = await api('/api/chat/conversations', {
      method: 'POST',
      headers: jsonHeaders(token),
      body: JSON.stringify({ title: '回归测试会话' }),
    });
    if (r.status === 200 || r.status === 201) {
      convId = r.json.conversation ? r.json.conversation.id : r.json.id;
      ok('新建会话', 'ID=' + convId + ' 类型=' + typeof convId);
      if (typeof convId !== 'number') bad('会话ID类型', '应为 number，实际 ' + typeof convId);
    } else bad('新建会话', r.status + ' ' + r.text.slice(0, 100));
  }

  {
    const r = await api('/api/chat/conversations', { headers: jsonHeaders(token) });
    if (r.status === 200 && Array.isArray(r.json.conversations)) ok('会话列表', '数量=' + r.json.conversations.length);
    else bad('会话列表', r.status);
  }

  {
    const r = await api('/api/chat/conversations/' + convId + '/messages', { headers: jsonHeaders(token) });
    if (r.status === 200) ok('消息列表'); else bad('消息列表', r.status);
  }

  // ============ 8. 存储健康检查 ============
  console.log('');
  console.log('【存储配置】');
  {
    const r = await api('/api/health/storage');
    if (r.status === 200) {
      ok('存储健康检查', '类型=' + r.json.storageType + ' 数据库=' + r.json.dbType);
    } else bad('存储健康检查', r.status);
  }

  // ============ 9. 清理测试数据 ============
  console.log('');
  console.log('【清理】');
  if (mistakeId) {
    const r = await api('/api/mistake/' + mistakeId, { method: 'DELETE', headers: jsonHeaders(token) });
    if (r.status === 200) ok('删除测试错题'); else bad('删除测试错题', r.status);
  }
  if (convId) {
    const r = await api('/api/chat/conversations/' + convId, { method: 'DELETE', headers: jsonHeaders(token) });
    if (r.status === 200) ok('删除测试会话'); else bad('删除测试会话', r.status);
  }

  // ============ 汇总 ============
  console.log('');
  console.log('========================================');
  console.log('  通过: ' + pass + ' 项');
  console.log('  失败: ' + fail + ' 项');
  console.log('========================================');
  if (fail > 0) {
    console.log('');
    console.log('失败明细：');
    failures.forEach(f => console.log('  - ' + f));
    process.exit(1);
  }
})();
