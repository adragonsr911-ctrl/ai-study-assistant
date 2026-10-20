// ==================== API调用封装 ====================

const API = {
  // 获取token
  getToken() {
    return localStorage.getItem('token');
  },

  // 保存登录信息
  setAuth(token, user) {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
  },

  // 获取用户信息
  getUser() {
    const userStr = localStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
  },

  // 清除登录信息
  clearAuth() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  },

  // 检查是否已登录
  isLoggedIn() {
    return !!this.getToken();
  },

  // 通用请求方法
  async request(url, options = {}) {
    const token = this.getToken();
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    const data = await response.json();

    if (!response.ok) {
      // 如果是401，清除登录状态
      if (response.status === 401) {
        this.clearAuth();
        window.location.reload();
      }
      throw new Error(data.error || '请求失败');
    }

    return data;
  },

  // ==================== 认证相关 ====================
  auth: {
    // 注册
    async register(username, password, nickname, security_question, security_answer) {
      return API.request('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ username, password, nickname, security_question, security_answer }),
      });
    },

    // 登录
    async login(username, password) {
      return API.request('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
    },

    // 获取安全问题（忘记密码第一步）
    async getSecurityQuestion(username) {
      return API.request(`/api/auth/security-question?username=${encodeURIComponent(username)}`);
    },

    // 重置密码（忘记密码第二步）
    async resetPassword(username, security_answer, new_password) {
      return API.request('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ username, security_answer, new_password }),
      });
    },

    // 获取当前用户信息
    async getMe() {
      return API.request('/api/auth/me');
    },
  },

  // ==================== AI对话相关 ====================
  chat: {
    // 获取对话列表
    async getConversations() {
      return API.request('/api/chat/conversations');
    },

    // 创建新对话
    async createConversation(title) {
      return API.request('/api/chat/conversations', {
        method: 'POST',
        body: JSON.stringify({ title }),
      });
    },

    // 获取对话消息
    async getMessages(conversationId) {
      return API.request(`/api/chat/conversations/${conversationId}/messages`);
    },

    // 发送消息
    async sendMessage(conversationId, content) {
      return API.request('/api/chat/send', {
        method: 'POST',
        body: JSON.stringify({ conversation_id: conversationId, content }),
      });
    },

    // 删除对话
    async deleteConversation(conversationId) {
      return API.request(`/api/chat/conversations/${conversationId}`, {
        method: 'DELETE',
      });
    },
  },

  // ==================== 知识点相关 ====================
  knowledge: {
    // 获取知识点列表
    async getList() {
      return API.request('/api/knowledge');
    },

    // 获取知识点详情
    async getDetail(id) {
      return API.request(`/api/knowledge/${id}`);
    },

    // 生成知识点拆解
    async generate(topic) {
      return API.request('/api/knowledge/generate', {
        method: 'POST',
        body: JSON.stringify({ topic }),
      });
    },

    // 删除知识点
    async delete(id) {
      return API.request(`/api/knowledge/${id}`, {
        method: 'DELETE',
      });
    },
  },

  // ==================== 学习计划相关 ====================
  plan: {
    // 获取计划列表
    async getList() {
      return API.request('/api/plan');
    },

    // 获取计划详情
    async getDetail(id) {
      return API.request(`/api/plan/${id}`);
    },

    // 生成学习计划
    async generate(subject, examDate, dailyHours) {
      return API.request('/api/plan/generate', {
        method: 'POST',
        body: JSON.stringify({
          subject,
          exam_date: examDate,
          daily_hours: dailyHours,
        }),
      });
    },

    // 删除计划
    async delete(id) {
      return API.request(`/api/plan/${id}`, {
        method: 'DELETE',
      });
    },
  },

  // ==================== 错题本相关 ====================
  mistake: {
    // 获取错题列表
    async getList(subject) {
      const url = subject ? `/api/mistake?subject=${encodeURIComponent(subject)}` : '/api/mistake';
      return API.request(url);
    },

    // 获取错题详情
    async getDetail(id) {
      return API.request(`/api/mistake/${id}`);
    },

    // 添加错题
    async add(data) {
      return API.request('/api/mistake/add', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    // 更新掌握程度
    async updateMastery(id, level) {
      return API.request(`/api/mistake/${id}/mastery`, {
        method: 'PUT',
        body: JSON.stringify({ level }),
      });
    },

    // 获取今日待复习错题
    async getDueReviews() {
      return API.request('/api/mistake/reviews/due');
    },

    // 提交复习结果 result: again | hard | good
    async submitReview(id, result) {
      return API.request(`/api/mistake/${id}/review`, {
        method: 'POST',
        body: JSON.stringify({ result }),
      });
    },

    // 删除错题
    async delete(id) {
      return API.request(`/api/mistake/${id}`, {
        method: 'DELETE',
      });
    },
  },

  // ==================== 数据看板相关 ====================
  dashboard: {
    // 获取数据概览
    async getSummary() {
      return API.request('/api/dashboard/summary');
    },

    // 获取学习趋势
    async getTrend() {
      return API.request('/api/dashboard/trend');
    },

    // 获取科目分布
    async getSubjectDistribution() {
      return API.request('/api/dashboard/subject-distribution');
    },
  },

  // ==================== AI学习诊断相关 ====================
  diagnosis: {
    // 获取诊断报告列表
    async getList() {
      return API.request('/api/diagnosis');
    },

    // 获取诊断报告详情
    async getDetail(id) {
      return API.request(`/api/diagnosis/${id}`);
    },

    // 生成诊断报告
    async generate() {
      return API.request('/api/diagnosis/generate', {
        method: 'POST',
      });
    },

    // 删除诊断报告
    async delete(id) {
      return API.request(`/api/diagnosis/${id}` , {
        method: 'DELETE',
      });
    },
  },
};
