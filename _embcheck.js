require('dotenv').config();
const KEY = process.env.DOUBAO_API_KEY;
const PROXY = 'https://falling-sound-a787.adragonsr911.workers.dev';
const { ProxyAgent, setGlobalDispatcher } = require('undici');
setGlobalDispatcher(new ProxyAgent('http://127.0.0.1:7897'));

(async () => {
  // 1. 查模型列表中 embedding 类模型的状态
  console.log('=== 当前 Embedding 类模型状态 ===');
  try {
    const r = await fetch(PROXY + '/api/v3/models', { headers: { Authorization: 'Bearer ' + KEY } });
    const d = await r.json();
    const emb = (d.data || []).filter(m => (m.id || '').includes('embedding') || (m.name || '').includes('embedding'));
    if (emb.length === 0) {
      console.log('  未找到 embedding 类模型');
    }
    for (const m of emb) {
      console.log(`  ${(m.id || '').padEnd(38)} status=${(m.status || '?').padEnd(12)} task=${JSON.stringify(m.task_type || [])}`);
    }
    console.log('');
    console.log('  所有可用（非 Retiring/Shutdown）的 embedding 模型:');
    const avail = emb.filter(m => m.status !== 'Retiring' && m.status !== 'Shutdown');
    if (avail.length === 0) console.log('    无');
    else avail.forEach(m => console.log('    ' + m.id + '  status=' + m.status));
  } catch (e) {
    console.log('  查询失败: ' + e.message);
  }

  // 2. 直接测试 embedding 调用（多种模型名）
  console.log('');
  console.log('=== 直接调用 Embedding 接口测试 ===');
  const models = ['doubao-embedding', 'Doubao-embedding', 'doubao-embedding-large', 'doubao-embedding-text-240715', 'doubao-embedding-large-text-250515'];
  for (const m of models) {
    const t0 = Date.now();
    try {
      const r = await fetch(PROXY + '/api/v3/embeddings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + KEY },
        body: JSON.stringify({ model: m, input: ['测试文本'] }),
        signal: AbortSignal.timeout(30000),
      });
      const ms = Date.now() - t0;
      const text = await r.text();
      if (r.ok) {
        const d = JSON.parse(text);
        console.log(`  ${m.padEnd(34)} OK (${ms}ms) 维度=${d.data?.[0]?.embedding?.length}`);
      } else {
        let msg = text.substring(0, 100);
        try { msg = JSON.parse(text).error?.message || msg; } catch (e) {}
        console.log(`  ${m.padEnd(34)} ${r.status} ${msg.substring(0, 80)}`);
      }
    } catch (e) {
      console.log(`  ${m.padEnd(34)} ERR ${e.message.substring(0, 60)}`);
    }
  }
})();
