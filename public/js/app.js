// ==================== 主题切换（深色/浅色模式） ====================

function initTheme() {
  // 优先读取用户保存的设置，其次跟随系统偏好
  const saved = localStorage.getItem('theme');
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = saved || (prefersDark ? 'dark' : 'light');
  applyTheme(theme);
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
  // 更新切换按钮图标
  const btn = document.getElementById('btn-theme-toggle');
  if (btn) {
    const iconEl = btn.querySelector('.theme-icon');
    if (iconEl) {
      iconEl.setAttribute('data-icon', theme === 'dark' ? 'sun' : 'moon');
      if (window.ICONS) {
        iconEl.innerHTML = ICONS[theme === 'dark' ? 'sun' : 'moon'] || '';
      }
    }
    btn.title = theme === 'dark' ? '切换到浅色模式' : '切换到深色模式';
  }
  // 通知图表重绘（如果在看板页面）
  if (window.Visualization && typeof window.onThemeChange === 'function') {
    window.onThemeChange(theme);
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  applyTheme(current === 'dark' ? 'light' : 'dark');
}

// ==================== 主应用逻辑 ====================

// 将所有 [data-icon] 占位替换为统一的 Lucide SVG 图标
function renderIcons(root = document) {
  if (!window.ICONS) return;
  root.querySelectorAll('[data-icon]').forEach(el => {
    const name = el.dataset.icon;
    if (ICONS[name]) el.innerHTML = ICONS[name];
  });
}
window.renderIcons = renderIcons;

// Toast提示
function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast ${type}`;
  toast.classList.remove('hidden');

  setTimeout(() => {
    toast.classList.add('hidden');
  }, 2500);
}

// 加载遮罩
function showLoading(text = '加载中...') {
  document.getElementById('loading-text').textContent = text;
  document.getElementById('loading-overlay').classList.remove('hidden');
}

function hideLoading() {
  document.getElementById('loading-overlay').classList.add('hidden');
}

// 页面切换
function switchView(viewName) {
  // 切换导航高亮
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.view === viewName);
  });

  // 切换视图
  document.querySelectorAll('.view').forEach(view => {
    view.classList.toggle('active', view.id === `view-${viewName}`);
  });

  // 切换到对应视图时加载数据
  if (viewName === 'chat') {
    AI.loadConversations();
  } else if (viewName === 'knowledge') {
    AI.loadKnowledgeHistory();
  } else if (viewName === 'plan') {
    AI.loadPlanHistory();
  } else if (viewName === 'mistake') {
    AI.loadMistakes();
  } else if (viewName === 'dashboard') {
    AI.loadDashboard();
  } else if (viewName === 'diagnosis') {
    AI.loadDiagnosisHistory();
  }
}

// 显示登录页面
function showAuthPage() {
  document.getElementById('auth-page').classList.remove('hidden');
  document.getElementById('main-app').classList.add('hidden');
  document.getElementById('landing-page').classList.add('hidden');
}

// 显示产品落地页
function showLandingPage() {
  document.getElementById('landing-page').classList.remove('hidden');
  document.getElementById('auth-page').classList.add('hidden');
  document.getElementById('main-app').classList.add('hidden');
  window.scrollTo(0, 0);
}

// 显示主应用
function showMainApp() {
  document.getElementById('auth-page').classList.add('hidden');
  document.getElementById('main-app').classList.remove('hidden');
  document.getElementById('landing-page').classList.add('hidden');

  // 更新用户信息
  const user = API.getUser();
  if (user) {
    document.getElementById('user-name').textContent = user.nickname || user.username;
    document.getElementById('user-avatar').textContent = (user.nickname || user.username).charAt(0).toUpperCase();
  }

  // 默认加载对话页面
  switchView('chat');
}

// 切换登录/注册标签
function switchAuthTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  document.querySelectorAll('.auth-form').forEach(form => {
    form.classList.toggle('active', form.id === `${tab}-form`);
  });
}

// ==================== 事件绑定 ====================

document.addEventListener('DOMContentLoaded', () => {
  // 先渲染静态图标
  renderIcons();

  // 初始化主题（深色/浅色）
  initTheme();

  // 落地页区块滚动入场动效
  if ('IntersectionObserver' in window) {
    const landingObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          landingObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    document.querySelectorAll('.landing-section, .landing-cta, .landing-footer').forEach(el => landingObserver.observe(el));
  } else {
    document.querySelectorAll('.landing-section, .landing-cta, .landing-footer').forEach(el => el.classList.add('visible'));
  }

  // 检查登录状态
  if (API.isLoggedIn()) {
    showMainApp();
  } else {
    showLandingPage();
  }

  // ---------- 登录注册相关 ----------

  // 标签切换
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchAuthTab(btn.dataset.tab));
  });

  // 登录注册页面的切换链接
  document.querySelectorAll('[data-switch]').forEach(link => {
    link.addEventListener('click', () => switchAuthTab(link.dataset.switch));
  });

  // 登录表单提交
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;

    if (!username || !password) {
      showToast('请输入用户名和密码', 'error');
      return;
    }

    showLoading('登录中...');
    try {
      const data = await API.auth.login(username, password);
      API.setAuth(data.token, data.user);
      showToast('登录成功', 'success');
      setTimeout(() => showMainApp(), 500);
    } catch (error) {
      showToast('登录失败：' + error.message, 'error');
    } finally {
      hideLoading();
    }
  });

  // 注册表单提交
  document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('register-username').value.trim();
    const nickname = document.getElementById('register-nickname').value.trim();
    const password = document.getElementById('register-password').value;
    const security_question = document.getElementById('register-security-question').value;
    const security_answer = document.getElementById('register-security-answer').value.trim();

    if (!username || !password) {
      showToast('请填写用户名和密码', 'error');
      return;
    }
    if (!security_question || !security_answer) {
      showToast('请设置安全问题和答案，用于找回密码', 'error');
      return;
    }

    showLoading('注册中...');
    try {
      const data = await API.auth.register(username, password, nickname, security_question, security_answer);
      API.setAuth(data.token, data.user);
      showToast('注册成功', 'success');
      setTimeout(() => showMainApp(), 500);
    } catch (error) {
      showToast('注册失败：' + error.message, 'error');
    } finally {
      hideLoading();
    }
  });

  // 主题切换
  document.getElementById('btn-theme-toggle').addEventListener('click', toggleTheme);

  // 退出登录
  document.getElementById('btn-logout').addEventListener('click', () => {
    if (confirm('确定要退出登录吗？')) {
      API.clearAuth();
      showToast('已退出登录', 'success');
      showLandingPage();
    }
  });

  // ---------- 忘记密码 ----------
  const showForgotPassword = () => {
    document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
    document.getElementById('forgot-password-form').classList.add('active');
    document.getElementById('forgot-step-1').style.display = '';
    document.getElementById('forgot-step-2').style.display = 'none';
    document.getElementById('forgot-username').value = '';
    document.getElementById('forgot-answer').value = '';
    document.getElementById('forgot-new-password').value = '';
  };

  document.getElementById('forgot-password-link').addEventListener('click', showForgotPassword);
  document.getElementById('forgot-back-login').addEventListener('click', () => switchAuthTab('login'));

  document.getElementById('forgot-next-btn').addEventListener('click', async () => {
    const username = document.getElementById('forgot-username').value.trim();
    if (!username) { showToast('请输入用户名', 'error'); return; }
    showLoading('验证中...');
    try {
      const data = await API.auth.getSecurityQuestion(username);
      document.getElementById('forgot-question').value = data.security_question;
      document.getElementById('forgot-step-1').style.display = 'none';
      document.getElementById('forgot-step-2').style.display = '';
    } catch (error) {
      showToast('获取安全问题失败：' + error.message, 'error');
    } finally {
      hideLoading();
    }
  });

  document.getElementById('forgot-back-step1').addEventListener('click', () => {
    document.getElementById('forgot-step-2').style.display = 'none';
    document.getElementById('forgot-step-1').style.display = '';
  });

  document.getElementById('forgot-reset-btn').addEventListener('click', async () => {
    const username = document.getElementById('forgot-username').value.trim();
    const security_answer = document.getElementById('forgot-answer').value.trim();
    const new_password = document.getElementById('forgot-new-password').value;
    if (!security_answer || !new_password) { showToast('请填写安全答案和新密码', 'error'); return; }
    if (new_password.length < 6) { showToast('新密码至少6位', 'error'); return; }
    showLoading('重置中...');
    try {
      await API.auth.resetPassword(username, security_answer, new_password);
      showToast('密码重置成功，请使用新密码登录', 'success');
      setTimeout(() => switchAuthTab('login'), 800);
    } catch (error) {
      showToast('重置失败：' + error.message, 'error');
    } finally {
      hideLoading();
    }
  });

  // ---------- 导航切换 ----------
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => switchView(item.dataset.view));
  });

  // ---------- AI对话相关 ----------

  // 新建对话
  document.getElementById('btn-new-chat').addEventListener('click', () => AI.newConversation());

  // 发送消息按钮
  document.getElementById('btn-send').addEventListener('click', () => AI.sendMessage());

  // 输入框回车发送
  const chatInput = document.getElementById('chat-input');
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      AI.sendMessage();
    }
  });

  // 输入框自动高度
  chatInput.addEventListener('input', () => {
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
  });

  // ---------- 知识点拆解相关 ----------
  document.getElementById('btn-generate-knowledge').addEventListener('click', () => AI.generateKnowledge());
  document.getElementById('knowledge-topic').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') AI.generateKnowledge();
  });

  // ---------- 学习计划相关 ----------
  document.getElementById('btn-generate-plan').addEventListener('click', () => AI.generatePlan());

  // 设置默认考试日期为30天后
  const defaultDate = new Date();
  defaultDate.setDate(defaultDate.getDate() + 30);
  document.getElementById('plan-exam-date').value = defaultDate.toISOString().split('T')[0];

  // ---------- 错题本相关 ----------

  // 打开添加错题弹窗
  document.getElementById('btn-add-mistake').addEventListener('click', () => {
    document.getElementById('mistake-modal').classList.remove('hidden');
  });

  // 关闭弹窗
  document.getElementById('modal-close').addEventListener('click', () => {
    document.getElementById('mistake-modal').classList.add('hidden');
  });
  document.getElementById('modal-cancel').addEventListener('click', () => {
    document.getElementById('mistake-modal').classList.add('hidden');
  });

  // 提交错题
  document.getElementById('modal-submit').addEventListener('click', () => AI.submitMistake());

  // 关闭详情弹窗
  document.getElementById('detail-close').addEventListener('click', () => {
    document.getElementById('mistake-detail-modal').classList.add('hidden');
  });

  // ---------- 艾宾浩斯错题复习相关 ----------
  document.getElementById('btn-start-review').addEventListener('click', () => AI.startReview());
  document.getElementById('review-close').addEventListener('click', () => AI.closeReview());

  // ---------- AI智能出题相关 ----------
  document.getElementById('btn-ai-quiz').addEventListener('click', () => AI.openQuizModal());
  document.getElementById('quiz-close').addEventListener('click', () => AI.closeQuizModal());
  document.getElementById('btn-quiz-generate').addEventListener('click', () => AI.generateQuiz());
  document.getElementById('btn-quiz-submit').addEventListener('click', () => AI.submitQuiz());
  document.getElementById('btn-quiz-save').addEventListener('click', () => AI.saveQuizRecord());
  document.getElementById('btn-quiz-retry').addEventListener('click', () => AI.retryQuiz());

  // ---------- 数据导出相关 ----------
  document.getElementById('btn-export-mistakes').addEventListener('click', () => AI.exportMistakes());
  document.getElementById('btn-export-plan').addEventListener('click', () => AI.exportPlan());

  // ---------- 学习看板趋势图切换 ----------
  document.querySelectorAll('#trend-tabs .chart-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('#trend-tabs .chart-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      AI.loadDashboard(parseInt(tab.dataset.days));
    });
  });

  // 科目筛选
  document.getElementById('mistake-filter').addEventListener('change', (e) => {
    AI.loadMistakes(e.target.value);
  });

  // ---------- AI学习诊断相关 ----------
  document.getElementById('btn-generate-diagnosis').addEventListener('click', () => AI.generateDiagnosis());
  document.getElementById('btn-print-diagnosis').addEventListener('click', () => AI.printDiagnosis());

  // 点击弹窗外部关闭
  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.add('hidden');
      }
    });
  });
});
