// ==================== AI相关前端交互逻辑 ====================

// 配置marked
marked.setOptions({
  breaks: true,
  gfm: true,
  highlight: function (code, lang) {
    // 如果hljs未加载，直接返回原代码
    if (typeof hljs === 'undefined') return code;
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(code, { language: lang }).value;
      } catch (e) {}
    }
    try {
      return hljs.highlightAuto(code).value;
    } catch (e) {
      return code;
    }
  },
});

const AI = {
  // 当前对话ID
  currentConversationId: null,
  // 当前显示的知识点ID
  currentKnowledgeId: null,
  // 当前显示的学习计划ID
  currentPlanId: null,
  // 当前显示的诊断报告ID
  currentDiagnosisId: null,
  // 艾宾浩斯复习队列与当前下标
  reviewQueue: [],
  reviewIndex: 0,

  // ==================== AI对话功能 ====================

  // 加载对话列表
  async loadConversations() {
    try {
      const data = await API.chat.getConversations();
      const listEl = document.getElementById('conversation-list');

      if (data.conversations.length === 0) {
        listEl.innerHTML = `<div class="empty-tip"><span class="empty-icon">${ICONS['messages-square']}</span><p>暂无对话，开始一次新的提问吧</p></div>`;
        return;
      }

      listEl.innerHTML = data.conversations.map(conv => `
        <div class="conversation-item ${conv.id === this.currentConversationId ? 'active' : ''}" data-id="${conv.id}">
          <span>${this.escapeHtml(conv.title)}</span>
          <button class="delete-btn" data-id="${conv.id}" title="删除">${ICONS.x}</button>
        </div>
      `).join('');

      // 绑定点击事件
      listEl.querySelectorAll('.conversation-item').forEach(item => {
        item.addEventListener('click', (e) => {
          const delBtn = e.target.closest('.delete-btn');
          if (delBtn) {
            e.stopPropagation();
            this.deleteConversation(delBtn.dataset.id);
          } else {
            this.loadConversation(item.dataset.id);
          }
        });
      });
    } catch (error) {
      console.error('加载对话列表失败:', error);
    }
  },

  // 加载单个对话
  async loadConversation(conversationId) {
    try {
      this.currentConversationId = conversationId;
      const data = await API.chat.getMessages(conversationId);

      document.getElementById('chat-title').textContent = data.conversation.title;

      const messagesEl = document.getElementById('chat-messages');
      if (data.messages.length === 0) {
        this.showWelcomeMessage();
        return;
      }

      messagesEl.innerHTML = '';
      data.messages.forEach(msg => {
        this.appendMessage(msg.role, msg.content, false);
      });

      this.scrollToBottom();
      this.loadConversations(); // 刷新列表高亮
    } catch (error) {
      showToast('加载对话失败', 'error');
    }
  },

  // 显示欢迎消息
  showWelcomeMessage() {
    const messagesEl = document.getElementById('chat-messages');
    messagesEl.innerHTML = `
      <div class="welcome-message">
        <div class="message-avatar ai">${ICONS['graduation-cap']}</div>
        <div class="message-bubble ai">
          <p>你好！我是你的AI学习辅导老师「小智」。</p>
          <p>我可以帮你：</p>
          <ul>
            <li>解答各学科的学习问题</li>
            <li>讲解解题思路和方法</li>
            <li>分享学习技巧和复习建议</li>
          </ul>
          <p>有什么问题尽管问我吧！</p>
        </div>
      </div>
    `;
  },

  // 新建对话
  newConversation() {
    this.currentConversationId = null;
    document.getElementById('chat-title').textContent = 'AI智能答疑';
    this.showWelcomeMessage();
    this.loadConversations();
  },

  // 删除对话
  async deleteConversation(conversationId) {
    if (!confirm('确定要删除这个对话吗？')) return;

    try {
      await API.chat.deleteConversation(conversationId);
      if (this.currentConversationId === conversationId) {
        this.newConversation();
      } else {
        this.loadConversations();
      }
      showToast('对话已删除', 'success');
    } catch (error) {
      showToast('删除失败', 'error');
    }
  },

  // 发送消息
  async sendMessage() {
    const inputEl = document.getElementById('chat-input');
    const content = inputEl.value.trim();

    if (!content) return;

    // 显示用户消息
    this.appendMessage('user', content);
    inputEl.value = '';
    inputEl.style.height = 'auto';

    // 显示加载状态
    const loadingId = this.showTypingIndicator();

    try {
      const data = await API.chat.sendMessage(this.currentConversationId, content);

      // 移除加载状态
      document.getElementById(loadingId)?.remove();

      // 显示AI回复
      this.appendMessage('assistant', data.reply);

      // 如果使用了RAG检索，显示"已基于你的学习数据回答"标签
      if (data.rag_used) {
        const messagesEl = document.getElementById('chat-messages');
        const lastBubble = messagesEl.querySelector('.message.assistant:last-child .message-bubble');
        if (lastBubble) {
          const ragTag = document.createElement('div');
          ragTag.className = 'rag-tag';
          ragTag.innerHTML = `${ICONS.sparkles}<span>已基于你的学习数据回答</span>`;
          lastBubble.insertBefore(ragTag, lastBubble.firstChild);
        }
      }

      // 更新当前对话ID
      if (!this.currentConversationId) {
        this.currentConversationId = data.conversation_id;
      }

      this.loadConversations();
    } catch (error) {
      document.getElementById(loadingId)?.remove();
      this.appendMessage('assistant', `抱歉，出错了：${error.message}\n\n请检查API密钥配置后重试。`);
    }
  },

  // 追加消息到聊天区域
  appendMessage(role, content, animate = true) {
    const messagesEl = document.getElementById('chat-messages');

    // 如果是欢迎消息区域，清空
    const welcome = messagesEl.querySelector('.welcome-message');
    if (welcome) welcome.remove();

    const isUser = role === 'user';
    const avatar = isUser ? '学' : ICONS['graduation-cap'];

    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;

    let htmlContent = content;
    if (!isUser) {
      // AI消息用Markdown渲染
      htmlContent = marked.parse(content);
    } else {
      htmlContent = this.escapeHtml(content).replace(/\n/g, '<br>');
    }

    messageDiv.innerHTML = `
      <div class="message-avatar ${role}">${avatar}</div>
      <div class="message-bubble ${role}">${htmlContent}</div>
    `;

    messagesEl.appendChild(messageDiv);
    this.scrollToBottom();

    // 代码高亮（如果hljs加载了才执行）
    if (!isUser && typeof hljs !== 'undefined') {
      messageDiv.querySelectorAll('pre code').forEach(block => {
        try { hljs.highlightElement(block); } catch (e) {}
      });
    }
  },

  // 显示打字指示器
  showTypingIndicator() {
    const messagesEl = document.getElementById('chat-messages');
    const id = 'typing-' + Date.now();

    const typingDiv = document.createElement('div');
    typingDiv.id = id;
    typingDiv.className = 'message ai';
    typingDiv.innerHTML = `
      <div class="message-avatar ai">${ICONS['graduation-cap']}</div>
      <div class="message-bubble ai">
        <div class="typing-indicator">
          <span></span><span></span><span></span>
        </div>
      </div>
    `;

    messagesEl.appendChild(typingDiv);
    this.scrollToBottom();
    return id;
  },

  // 滚动到底部
  scrollToBottom() {
    const messagesEl = document.getElementById('chat-messages');
    messagesEl.scrollTop = messagesEl.scrollHeight;
  },

  // ==================== 知识点拆解功能 ====================

  // 生成知识点
  async generateKnowledge() {
    const topic = document.getElementById('knowledge-topic').value.trim();
    if (!topic) {
      showToast('请输入要拆解的知识点', 'error');
      return;
    }

    showLoading('AI正在拆解知识点，请稍候...');

    try {
      const data = await API.knowledge.generate(topic);

      // 记录当前显示的知识点ID
      this.currentKnowledgeId = data.knowledge.id;

      document.getElementById('knowledge-result').style.display = 'block';
      document.getElementById('knowledge-title').textContent = data.knowledge.topic;
      document.getElementById('knowledge-content').innerHTML = marked.parse(data.knowledge.content);

      // 代码高亮（如果hljs加载了才执行）
      if (typeof hljs !== 'undefined') {
        document.querySelectorAll('#knowledge-content pre code').forEach(block => {
          try { hljs.highlightElement(block); } catch (e) {}
        });
      }

      this.loadKnowledgeHistory();

      // 更新保存按钮状态（生成时已自动保存）
      const saveBtn = document.getElementById('btn-save-knowledge');
      saveBtn.textContent = '已保存 ✓';
      saveBtn.disabled = true;
      saveBtn.style.opacity = '0.7';
      saveBtn.style.cursor = 'default';

      showToast('知识点拆解完成，已自动保存', 'success');
    } catch (error) {
      showToast('生成失败：' + error.message, 'error');
    } finally {
      hideLoading();
    }
  },

  // 加载知识点历史
  async loadKnowledgeHistory() {
    try {
      const data = await API.knowledge.getList();
      const listEl = document.getElementById('knowledge-history-list');

      if (data.knowledgeList.length === 0) {
        listEl.innerHTML = `<div class="empty-tip"><span class="empty-icon">${ICONS['book-open']}</span><p>暂无历史拆解记录，输入一个主题开始拆解</p></div>`;
        return;
      }

      listEl.innerHTML = data.knowledgeList.map(item => `
        <div class="history-item" data-id="${item.id}">
          <h4>${this.escapeHtml(item.topic)}</h4>
          <div class="meta">${item.created_at.substring(0, 10)}</div>
          <button class="delete-history" data-id="${item.id}" title="删除">${ICONS.x}</button>
        </div>
      `).join('');

      listEl.querySelectorAll('.history-item').forEach(item => {
        item.addEventListener('click', async (e) => {
          const delBtn = e.target.closest('.delete-history');
          if (delBtn) {
            e.stopPropagation();
            const deletedId = parseInt(delBtn.dataset.id);
            await API.knowledge.delete(delBtn.dataset.id);
            // 如果删除的是当前显示的知识点，隐藏详情区域
            if (this.currentKnowledgeId === deletedId) {
              document.getElementById('knowledge-result').style.display = 'none';
              this.currentKnowledgeId = null;
            }
            this.loadKnowledgeHistory();
            showToast('已删除', 'success');
          } else {
            const detail = await API.knowledge.getDetail(item.dataset.id);
            // 记录当前显示的知识点ID
            this.currentKnowledgeId = detail.knowledge.id;
            document.getElementById('knowledge-result').style.display = 'block';
            document.getElementById('knowledge-title').textContent = detail.knowledge.topic;
            document.getElementById('knowledge-content').innerHTML = marked.parse(detail.knowledge.content);
            if (typeof hljs !== 'undefined') {
              document.querySelectorAll('#knowledge-content pre code').forEach(block => { try { hljs.highlightElement(block); } catch (e) {} });
            }
            // 更新保存按钮状态
            const saveBtn = document.getElementById('btn-save-knowledge');
            saveBtn.textContent = '已保存 ✓';
            saveBtn.disabled = true;
            saveBtn.style.opacity = '0.7';
            saveBtn.style.cursor = 'default';
            document.getElementById('knowledge-result').scrollIntoView({ behavior: 'smooth' });
          }
        });
      });
    } catch (error) {
      console.error('加载历史失败:', error);
    }
  },

  // ==================== 学习计划功能 ====================

  // 生成学习计划
  async generatePlan() {
    const subject = document.getElementById('plan-subject').value.trim();
    const examDate = document.getElementById('plan-exam-date').value;
    const hours = document.getElementById('plan-hours').value;

    if (!subject || !examDate || !hours) {
      showToast('请填写完整信息', 'error');
      return;
    }

    showLoading('AI正在生成学习计划，请稍候...');

    try {
      const data = await API.plan.generate(subject, examDate, hours);

      // 记录当前显示的计划ID
      this.currentPlanId = data.plan.id;

      document.getElementById('plan-result').style.display = 'block';
      document.getElementById('plan-title').textContent = `${data.plan.subject} - 学习计划`;
      document.getElementById('plan-content').innerHTML = marked.parse(data.plan.content);

      this.loadPlanHistory();

      // 更新保存按钮状态（生成时已自动保存）
      const savePlanBtn = document.getElementById('btn-save-plan');
      savePlanBtn.textContent = '已保存 ✓';
      savePlanBtn.disabled = true;
      savePlanBtn.style.opacity = '0.7';
      savePlanBtn.style.cursor = 'default';

      showToast('学习计划生成完成，已自动保存', 'success');
    } catch (error) {
      showToast('生成失败：' + error.message, 'error');
    } finally {
      hideLoading();
    }
  },

  // 加载计划历史
  async loadPlanHistory() {
    try {
      const data = await API.plan.getList();
      const listEl = document.getElementById('plan-history-list');

      if (data.plans.length === 0) {
        listEl.innerHTML = `<div class="empty-tip"><span class="empty-icon">${ICONS['calendar-days']}</span><p>暂无学习计划，填写科目和考试日期生成一份</p></div>`;
        return;
      }

      listEl.innerHTML = data.plans.map(item => `
        <div class="history-item" data-id="${item.id}">
          <h4>${this.escapeHtml(item.subject)}</h4>
          <div class="meta">考试日期：${item.exam_date} | 每天${item.daily_hours}小时</div>
          <button class="delete-history" data-id="${item.id}" title="删除">${ICONS.x}</button>
        </div>
      `).join('');

      listEl.querySelectorAll('.history-item').forEach(item => {
        item.addEventListener('click', async (e) => {
          const delBtn = e.target.closest('.delete-history');
          if (delBtn) {
            e.stopPropagation();
            const deletedId = parseInt(delBtn.dataset.id);
            await API.plan.delete(delBtn.dataset.id);
            // 如果删除的是当前显示的计划，隐藏详情区域
            if (this.currentPlanId === deletedId) {
              document.getElementById('plan-result').style.display = 'none';
              this.currentPlanId = null;
            }
            this.loadPlanHistory();
            showToast('已删除', 'success');
          } else {
            const detail = await API.plan.getDetail(item.dataset.id);
            // 记录当前显示的计划ID
            this.currentPlanId = detail.plan.id;
            document.getElementById('plan-result').style.display = 'block';
            document.getElementById('plan-title').textContent = `${detail.plan.subject} - 学习计划`;
            document.getElementById('plan-content').innerHTML = marked.parse(detail.plan.content);
            // 更新保存按钮状态
            const savePlanBtn = document.getElementById('btn-save-plan');
            savePlanBtn.textContent = '已保存 ✓';
            savePlanBtn.disabled = true;
            savePlanBtn.style.opacity = '0.7';
            savePlanBtn.style.cursor = 'default';
            document.getElementById('plan-result').scrollIntoView({ behavior: 'smooth' });
          }
        });
      });
    } catch (error) {
      console.error('加载计划失败:', error);
    }
  },

  // ==================== 错题本功能 ====================

  // 加载错题列表
  async loadMistakes(subject = '') {
    try {
      const data = await API.mistake.getList(subject);
      const listEl = document.getElementById('mistake-list');

      if (data.mistakes.length === 0) {
        listEl.innerHTML = `<div class="empty-tip"><span class="empty-icon">${ICONS['notebook-pen']}</span><p>暂无错题，点击上方"添加错题"记录第一道</p></div>`;
        this.loadDueReviews();
        return;
      }

      const masteryLabels = ['未掌握', '部分掌握', '已掌握'];

      listEl.innerHTML = data.mistakes.map(item => {
        const rs = this.reviewStatusOf(item);
        const cardCls = item.review_completed ? 'mastered' : (item.is_due ? 'is-due' : '');
        return `
        <div class="mistake-card ${cardCls}" data-id="${item.id}">
          <button class="delete-history mistake-delete" data-id="${item.id}" title="删除">${ICONS.x}</button>
          <span class="subject-tag">${this.escapeHtml(item.subject)}</span>
          <div class="question-text">${this.escapeHtml(item.question)}</div>
          <div class="card-footer">
            <span>${item.created_at.substring(0, 10)}</span>
            <span class="card-badges">
              <span class="review-badge ${rs.cls}">${rs.text}</span>
              <span class="mastery-badge level-${item.mastery_level}">${masteryLabels[item.mastery_level]}</span>
            </span>
          </div>
        </div>
        `;
      }).join('');

      listEl.querySelectorAll('.mistake-card').forEach(card => {
        card.addEventListener('click', (e) => {
          const delBtn = e.target.closest('.mistake-delete');
          if (delBtn) {
            e.stopPropagation();
            this.deleteMistake(delBtn.dataset.id);
          } else {
            this.showMistakeDetail(card.dataset.id);
          }
        });
      });

      // 更新科目筛选
      this.updateSubjectFilter(data.mistakes);

      // 同步刷新今日复习横幅
      this.loadDueReviews();
    } catch (error) {
      console.error('加载错题失败:', error);
    }
  },

  // 更新科目筛选下拉
  updateSubjectFilter(mistakes) {
    const selectEl = document.getElementById('mistake-filter');
    const currentValue = selectEl.value;
    const subjects = [...new Set(mistakes.map(m => m.subject))];

    selectEl.innerHTML = '<option value="">全部科目</option>' +
      subjects.map(s => `<option value="${this.escapeHtml(s)}">${this.escapeHtml(s)}</option>`).join('');

    selectEl.value = currentValue;
  },

  // 显示错题详情
  async showMistakeDetail(id) {
    try {
      const data = await API.mistake.getDetail(id);
      const m = data.mistake;
      const masteryLabels = ['未掌握', '部分掌握', '已掌握'];

      document.getElementById('detail-title').textContent = `${m.subject} - 错题详情`;

      let similarHtml = '';
      if (m.similar_questions) {
        similarHtml = `<h3 style="margin-top:20px;color:var(--primary-color);">类似练习题</h3>
          <div class="markdown-body">${marked.parse(m.similar_questions)}</div>`;
      }

      document.getElementById('detail-body').innerHTML = `
        <div style="margin-bottom:16px;">
          <span class="subject-tag">${this.escapeHtml(m.subject)}</span>
          <span class="mastery-badge level-${m.mastery_level}" style="margin-left:8px;">${masteryLabels[m.mastery_level]}</span>
        </div>
        <div style="margin-bottom:16px;">
          <h4 style="margin-bottom:8px;color:var(--text-primary);">题目</h4>
          <p style="background:var(--surface);padding:12px;border-radius:8px;white-space:pre-wrap;">${this.escapeHtml(m.question)}</p>
        </div>
        <div style="display:flex;gap:16px;margin-bottom:16px;">
          <div style="flex:1;">
            <h4 style="margin-bottom:8px;color:var(--danger-color);">你的答案</h4>
            <p style="background:var(--danger-light);padding:12px;border-radius:8px;">${this.escapeHtml(m.your_answer || '未填写')}</p>
          </div>
          <div style="flex:1;">
            <h4 style="margin-bottom:8px;color:var(--success-color);">正确答案</h4>
            <p style="background:var(--success-light);padding:12px;border-radius:8px;">${this.escapeHtml(m.correct_answer || '未填写')}</p>
          </div>
        </div>
        <h4 style="margin-bottom:8px;color:var(--primary-color);">AI分析</h4>
        <div class="markdown-body" style="background:var(--surface);padding:16px;border-radius:8px;">${marked.parse(m.analysis)}</div>
        ${similarHtml}
        <div style="margin-top:24px;padding-top:16px;border-top:1px solid var(--border-color);">
          <h4 style="margin-bottom:12px;">更新掌握程度</h4>
          <div style="display:flex;gap:8px;">
            <button class="btn-secondary" onclick="AI.updateMistakeMastery(${m.id}, 0)">未掌握</button>
            <button class="btn-secondary" onclick="AI.updateMistakeMastery(${m.id}, 1)">部分掌握</button>
            <button class="btn-primary" onclick="AI.updateMistakeMastery(${m.id}, 2)">已掌握</button>
          </div>
        </div>
      `;

      document.getElementById('mistake-detail-modal').classList.remove('hidden');
    } catch (error) {
      showToast('加载详情失败', 'error');
    }
  },

  // 更新错题掌握程度
  async updateMistakeMastery(id, level) {
    try {
      await API.mistake.updateMastery(id, level);
      showToast('掌握程度已更新', 'success');
      document.getElementById('mistake-detail-modal').classList.add('hidden');
      this.loadMistakes(document.getElementById('mistake-filter').value);
    } catch (error) {
      showToast('更新失败', 'error');
    }
  },

  // 删除错题
  async deleteMistake(id) {
    if (!confirm('确定要删除这道错题吗？')) return;
    try {
      await API.mistake.delete(id);
      this.loadMistakes(document.getElementById('mistake-filter').value);
      showToast('已删除', 'success');
    } catch (error) {
      showToast('删除失败', 'error');
    }
  },

  // 提交错题
  async submitMistake() {
    const subject = document.getElementById('mistake-subject').value.trim();
    const question = document.getElementById('mistake-question').value.trim();
    const yourAnswer = document.getElementById('mistake-your-answer').value.trim();
    const correctAnswer = document.getElementById('mistake-correct-answer').value.trim();

    if (!subject || !question) {
      showToast('科目和题目不能为空', 'error');
      return;
    }

    showLoading('AI正在分析错题，请稍候...');

    try {
      await API.mistake.add({
        subject,
        question,
        your_answer: yourAnswer,
        correct_answer: correctAnswer,
      });

      // 清空表单
      document.getElementById('mistake-subject').value = '';
      document.getElementById('mistake-question').value = '';
      document.getElementById('mistake-your-answer').value = '';
      document.getElementById('mistake-correct-answer').value = '';

      document.getElementById('mistake-modal').classList.add('hidden');
      this.loadMistakes();
      showToast('错题添加成功，AI分析完成', 'success');
    } catch (error) {
      showToast('添加失败：' + error.message, 'error');
    } finally {
      hideLoading();
    }
  },

  // ==================== 艾宾浩斯错题复习功能 ====================

  // 加载今日待复习，更新顶部横幅
  async loadDueReviews() {
    const banner = document.getElementById('review-banner');
    const icon = document.getElementById('review-banner-icon');
    const title = document.getElementById('review-banner-title');
    const desc = document.getElementById('review-banner-desc');
    const btn = document.getElementById('btn-start-review');
    try {
      const data = await API.mistake.getDueReviews();
      banner.style.display = 'flex';
      if (data.count > 0) {
        banner.className = 'review-banner due';
        icon.innerHTML = ICONS.bell;
        title.textContent = `今天有 ${data.count} 道错题建议复习`;
        desc.textContent = '按艾宾浩斯遗忘曲线及时复习，能把短期记忆转化为长期记忆';
        btn.style.display = '';
        btn.textContent = `开始复习（${data.count} 题）`;
      } else {
        banner.className = 'review-banner done';
        icon.innerHTML = ICONS['circle-check'];
        title.textContent = '今日复习任务已完成';
        desc.textContent = '目前没有到期需要复习的错题，继续保持！新错题会自动安排复习计划。';
        btn.style.display = 'none';
      }
    } catch (error) {
      // 兜底：加载失败时隐藏横幅，避免一直停在“正在加载”
      console.error('加载待复习错题失败:', error);
      banner.style.display = 'none';
    }
  },

  // 计算单题复习状态
  reviewStatusOf(item) {
    if (item.review_completed) return { cls: 'review-done', text: '已巩固' };
    if (item.is_due) return { cls: 'review-due', text: '待复习' };
    const md = item.next_review_at ? item.next_review_at.substring(5) : '';
    return { cls: 'review-wait', text: `${md} 复习` };
  },

  // 开始复习
  async startReview() {
    try {
      const data = await API.mistake.getDueReviews();
      if (data.count === 0) {
        showToast('今天没有需要复习的错题', 'info');
        return;
      }
      this.reviewQueue = data.due;
      this.reviewIndex = 0;
      document.getElementById('review-modal').classList.remove('hidden');
      this.renderReviewCard();
    } catch (error) {
      showToast('加载复习失败：' + error.message, 'error');
    }
  },

  // 渲染当前复习题
  renderReviewCard() {
    const m = this.reviewQueue[this.reviewIndex];
    const total = this.reviewQueue.length;
    const roundText = (m.review_count || 0) > 0 ? `第 ${m.review_count + 1} 轮复习` : '首次复习';
    document.getElementById('review-progress').textContent = `（${this.reviewIndex + 1}/${total}）`;

    document.getElementById('review-body').innerHTML = `
      <div class="review-card-wrap">
        <div style="margin-bottom:12px;">
          <span class="subject-tag">${this.escapeHtml(m.subject)}</span>
          <span class="review-round-tag">${roundText}</span>
        </div>
        <div class="review-question">
          <h4><span class="inline-icon">${ICONS.brain}</span>先在脑中回想这道题的解法</h4>
          <p>${this.escapeHtml(m.question)}</p>
        </div>
        <div id="review-answer-area" style="display:none;">
          <div style="display:flex;gap:16px;margin:16px 0;flex-wrap:wrap;">
            <div style="flex:1;min-width:200px;">
              <h4 style="color:var(--danger-color);margin-bottom:8px;">你的答案</h4>
              <p style="background:var(--danger-light);padding:12px;border-radius:8px;white-space:pre-wrap;">${this.escapeHtml(m.your_answer || '未填写')}</p>
            </div>
            <div style="flex:1;min-width:200px;">
              <h4 style="color:var(--success-color);margin-bottom:8px;">正确答案</h4>
              <p style="background:var(--success-light);padding:12px;border-radius:8px;white-space:pre-wrap;">${this.escapeHtml(m.correct_answer || '未填写')}</p>
            </div>
          </div>
          <h4 style="color:var(--primary-color);margin-bottom:8px;">AI解析</h4>
          <div class="markdown-body" style="background:var(--surface);padding:16px;border-radius:8px;">${marked.parse(m.analysis || '暂无解析')}</div>
          ${m.similar_questions ? `<h4 style="color:var(--primary-color);margin:16px 0 8px;">类似练习题</h4><div class="markdown-body" style="background:var(--surface);padding:16px;border-radius:8px;">${marked.parse(m.similar_questions)}</div>` : ''}
          <div class="review-feedback">
            <p class="review-feedback-tip">回想得怎么样？选择你的掌握情况（将决定下次复习时间）：</p>
            <div class="review-feedback-btns">
              <button class="btn-secondary review-btn-again" onclick="AI.submitReview('again')"><span class="review-btn-label">${ICONS['rotate-ccw']} 还没掌握</span><small>明天重新开始</small></button>
              <button class="btn-secondary review-btn-hard" onclick="AI.submitReview('hard')"><span class="review-btn-label">${ICONS['circle-help']} 有点印象</span><small>近期再巩固</small></button>
              <button class="btn-primary review-btn-good" onclick="AI.submitReview('good')"><span class="review-btn-label">${ICONS.smile} 记住了</span><small>进入下一节点</small></button>
            </div>
          </div>
        </div>
        <div class="review-show-answer" id="review-show-btn-wrap">
          <button class="btn-primary" onclick="AI.showReviewAnswer()"><span class="btn-inline-icon">${ICONS.eye}</span>显示答案与解析</button>
        </div>
      </div>
    `;

    if (typeof hljs !== 'undefined') {
      document.querySelectorAll('#review-body pre code').forEach(block => {
        try { hljs.highlightElement(block); } catch (e) {}
      });
    }
  },

  // 显示答案与解析
  showReviewAnswer() {
    document.getElementById('review-answer-area').style.display = 'block';
    document.getElementById('review-show-btn-wrap').style.display = 'none';
  },

  // 提交复习结果并推进
  async submitReview(result) {
    const m = this.reviewQueue[this.reviewIndex];
    try {
      const r = await API.mistake.submitReview(m.id, result);
      m._lastResult = result;
      m._nextAt = r.next_review_at;
      m._completed = r.completed;
      this.reviewIndex++;
      if (this.reviewIndex >= this.reviewQueue.length) {
        this.renderReviewComplete();
      } else {
        this.renderReviewCard();
      }
    } catch (error) {
      showToast('提交失败：' + error.message, 'error');
    }
  },

  // 复习完成页
  renderReviewComplete() {
    const total = this.reviewQueue.length;
    const graduated = this.reviewQueue.filter(m => m._completed).length;
    document.getElementById('review-progress').textContent = '';
    document.getElementById('review-body').innerHTML = `
      <div class="review-complete">
        <div class="review-complete-icon">${ICONS.trophy}</div>
        <h3>今日复习完成！</h3>
        <p>你刚刚完成了 <strong>${total}</strong> 道错题的复习${graduated > 0 ? `，其中 <strong>${graduated}</strong> 道已形成长期记忆` : ''}</p>
        <p class="review-complete-sub">系统已按艾宾浩斯遗忘曲线安排好下次复习时间，到期会在这里提醒你。</p>
        <button class="btn-primary" onclick="AI.closeReview()">完 成</button>
      </div>
    `;
  },

  // 关闭复习弹窗并刷新
  closeReview() {
    document.getElementById('review-modal').classList.add('hidden');
    this.reviewQueue = [];
    this.reviewIndex = 0;
    this.loadDueReviews();
    this.loadMistakes(document.getElementById('mistake-filter').value);
  },

  // ==================== AI智能出题功能 ====================

  // 当前出题状态
  currentQuiz: null,
  currentQuizAnswers: {},

  // 打开出题弹窗
  openQuizModal() {
    this.currentQuiz = null;
    this.currentQuizAnswers = {};
    // 重置到配置步骤
    document.getElementById('quiz-step-config').classList.remove('hidden');
    document.getElementById('quiz-step-loading').classList.add('hidden');
    document.getElementById('quiz-step-quiz').classList.add('hidden');
    document.getElementById('quiz-step-result').classList.add('hidden');
    document.getElementById('quiz-modal').classList.remove('hidden');
  },

  // 关闭出题弹窗
  closeQuizModal() {
    document.getElementById('quiz-modal').classList.add('hidden');
  },

  // 生成练习题
  async generateQuiz() {
    const subject = document.getElementById('quiz-subject').value;
    const count = parseInt(document.getElementById('quiz-count').value);
    const basedOnMistakes = document.getElementById('quiz-based-mistakes').checked;

    // 切换到加载步骤
    document.getElementById('quiz-step-config').classList.add('hidden');
    document.getElementById('quiz-step-loading').classList.remove('hidden');

    try {
      const result = await API.quiz.generate(subject, count, basedOnMistakes);
      this.currentQuiz = result;
      this.currentQuizAnswers = {};
      this.renderQuizQuestions();

      // 切换到作答步骤
      document.getElementById('quiz-step-loading').classList.add('hidden');
      document.getElementById('quiz-step-quiz').classList.remove('hidden');

      // 更新信息栏
      document.getElementById('quiz-info-subject').textContent = `科目：${result.subject}`;
      document.getElementById('quiz-info-count').textContent = `共${result.questions.length}题`;
      const basedTag = document.getElementById('quiz-based-tag');
      if (result.based_on_mistakes) {
        basedTag.classList.remove('hidden');
      } else {
        basedTag.classList.add('hidden');
      }
    } catch (error) {
      alert('生成题目失败：' + error.message);
      // 回到配置步骤
      document.getElementById('quiz-step-loading').classList.add('hidden');
      document.getElementById('quiz-step-config').classList.remove('hidden');
    }
  },

  // 渲染题目列表
  renderQuizQuestions() {
    const container = document.getElementById('quiz-questions-list');
    const questions = this.currentQuiz.questions;

    container.innerHTML = questions.map((q, idx) => `
      <div class="quiz-question-card" data-qid="${q.id}">
        <div class="quiz-question-title">
          <span class="quiz-q-num">${idx + 1}</span>
          <span class="quiz-q-text">${this.escapeHtml(q.question)}</span>
        </div>
        <div class="quiz-options">
          ${q.options.map((opt, oi) => `
            <label class="quiz-option" data-qid="${q.id}" data-oidx="${oi}">
              <input type="radio" name="quiz-q-${q.id}" value="${oi}" class="quiz-option-input">
              <span class="quiz-option-letter">${String.fromCharCode(65 + oi)}</span>
              <span class="quiz-option-text">${this.escapeHtml(opt)}</span>
            </label>
          `).join('')}
        </div>
      </div>
    `).join('');

    // 绑定选项点击事件（事件委托）
    container.querySelectorAll('.quiz-option').forEach(label => {
      label.addEventListener('click', (e) => {
        const qid = parseInt(label.dataset.qid);
        const oidx = parseInt(label.dataset.oidx);
        this.currentQuizAnswers[qid] = oidx;
        // 更新选中样式
        container.querySelectorAll(`.quiz-option[data-qid="${qid}"]`).forEach(l => {
          l.classList.remove('selected');
        });
        label.classList.add('selected');
      });
    });
  },

  // 提交批改
  submitQuiz() {
    const questions = this.currentQuiz.questions;
    const unanswered = questions.filter(q => this.currentQuizAnswers[q.id] === undefined);

    if (unanswered.length > 0) {
      if (!confirm(`还有${unanswered.length}道题未作答，确定提交吗？`)) {
        return;
      }
    }

    // 计算得分
    let score = 0;
    questions.forEach(q => {
      if (this.currentQuizAnswers[q.id] === q.answer) {
        score++;
      }
    });

    this.showQuizResult(score, questions.length);
  },

  // 显示批改结果
  showQuizResult(score, total) {
    document.getElementById('quiz-step-quiz').classList.add('hidden');
    document.getElementById('quiz-step-result').classList.remove('hidden');

    document.getElementById('quiz-score-num').textContent = score;
    document.getElementById('quiz-total-num').textContent = total;

    // 评价语
    const percent = score / total;
    let title, desc;
    if (percent >= 0.9) {
      title = '优秀！';
      desc = '掌握得非常扎实，继续保持！';
    } else if (percent >= 0.7) {
      title = '良好！';
      desc = '大部分知识点已掌握，注意查漏补缺。';
    } else if (percent >= 0.5) {
      title = '及格';
      desc = '还有提升空间，建议复习错题本中的相关内容。';
    } else {
      title = '需要加油';
      desc = '基础还需加强，建议回到知识点拆解重新学习。';
    }
    document.getElementById('quiz-result-title').textContent = title;
    document.getElementById('quiz-result-desc').textContent = desc;

    // 渲染每题结果
    const container = document.getElementById('quiz-result-list');
    const questions = this.currentQuiz.questions;
    container.innerHTML = questions.map((q, idx) => {
      const userAnswer = this.currentQuizAnswers[q.id];
      const isCorrect = userAnswer === q.answer;
      const userAnswerText = userAnswer !== undefined ? q.options[userAnswer] : '未作答';
      return `
        <div class="quiz-result-card ${isCorrect ? 'correct' : 'wrong'}">
          <div class="quiz-result-header">
            <span class="quiz-q-num">${idx + 1}</span>
            <span class="quiz-result-status">${isCorrect ? '✓ 正确' : '✗ 错误'}</span>
          </div>
          <div class="quiz-result-question">${this.escapeHtml(q.question)}</div>
          <div class="quiz-result-answers">
            <div class="quiz-result-row">
              <span class="quiz-result-label">你的答案：</span>
              <span class="${isCorrect ? 'correct-text' : 'wrong-text'}">${userAnswer !== undefined ? String.fromCharCode(65 + userAnswer) + '. ' : ''}${this.escapeHtml(userAnswerText)}</span>
            </div>
            <div class="quiz-result-row">
              <span class="quiz-result-label">正确答案：</span>
              <span class="correct-text">${String.fromCharCode(65 + q.answer)}. ${this.escapeHtml(q.options[q.answer])}</span>
            </div>
          </div>
          <div class="quiz-result-analysis">
            <span class="quiz-result-label">解析：</span>
            <span>${this.escapeHtml(q.analysis)}</span>
          </div>
        </div>
      `;
    }).join('');
  },

  // 保存出题记录
  async saveQuizRecord() {
    if (!this.currentQuiz) return;

    const questions = this.currentQuiz.questions;
    let score = 0;
    questions.forEach(q => {
      if (this.currentQuizAnswers[q.id] === q.answer) score++;
    });

    try {
      await API.quiz.save(
        this.currentQuiz.subject,
        `${this.currentQuiz.subject}专项练习`,
        questions,
        this.currentQuizAnswers,
        score,
        questions.length
      );
      alert('练习记录已保存！');
      this.closeQuizModal();
    } catch (error) {
      alert('保存失败：' + error.message);
    }
  },

  // 再来一组（回到配置步骤）
  retryQuiz() {
    this.currentQuiz = null;
    this.currentQuizAnswers = {};
    document.getElementById('quiz-step-result').classList.add('hidden');
    document.getElementById('quiz-step-config').classList.remove('hidden');
  },

  // ==================== 数据看板功能 ====================

  // 加载看板数据
  async loadDashboard(days = 7) {
    try {
      const [summary, trend, distribution, heatmap, radar] = await Promise.all([
        API.dashboard.getSummary(),
        API.dashboard.getTrend(days),
        API.dashboard.getSubjectDistribution(),
        API.dashboard.getHeatmap(),
        API.dashboard.getRadar(),
      ]);

      // 更新统计数字
      document.getElementById('stat-chats').textContent = summary.summary.total_chats;
      document.getElementById('stat-knowledge').textContent = summary.summary.total_knowledge;
      document.getElementById('stat-mistakes').textContent = summary.summary.total_mistakes;
      document.getElementById('stat-mastery').textContent = summary.summary.mastery_rate + '%';
      document.getElementById('stat-plans').textContent = summary.summary.total_plans;
      document.getElementById('stat-days').textContent = summary.summary.study_days;

      // 渲染学习热力图
      Visualization.renderHeatmap(document.getElementById('heatmap-chart'), heatmap.heatmap);

      // 渲染知识点掌握雷达图
      Visualization.renderRadar(document.getElementById('radar-chart'), radar.radar);

      // 渲染学习时长趋势折线图
      Visualization.renderTrendLine(document.getElementById('trend-chart'), trend.trend);

      // 渲染错题分布环形饼图
      Visualization.renderPie(document.getElementById('subject-chart'), distribution.distribution);
    } catch (error) {
      console.error('加载看板数据失败:', error);
    }
  },

  // ==================== AI学习诊断功能 ====================

  // 生成诊断报告
  async generateDiagnosis() {
    const btn = document.getElementById('btn-generate-diagnosis');
    btn.disabled = true;
    showLoading('AI正在分析你的全部学习数据，生成诊断报告，请稍候...');

    try {
      const data = await API.diagnosis.generate();
      this.displayDiagnosis(data.report);
      this.loadDiagnosisHistory();

      if (data.report.has_enough_data === false) {
        showToast('报告已生成，但当前学习数据较少，建议多用几次后再诊断', 'info');
      } else {
        showToast('诊断报告生成完成，已自动保存', 'success');
      }
    } catch (error) {
      showToast('生成失败：' + error.message, 'error');
    } finally {
      hideLoading();
      btn.disabled = false;
    }
  },

  // 渲染并展示一份诊断报告（生成与查看历史共用）
  displayDiagnosis(report) {
    this.currentDiagnosisId = report.id;

    document.getElementById('diagnosis-result').style.display = 'block';
    document.getElementById('diagnosis-title').textContent = report.title;
    document.getElementById('diagnosis-summary').innerHTML = this.renderDiagnosisSummary(report.summary);
    document.getElementById('diagnosis-content').innerHTML = marked.parse(report.content);

    if (typeof hljs !== 'undefined') {
      document.querySelectorAll('#diagnosis-content pre code').forEach(block => {
        try { hljs.highlightElement(block); } catch (e) {}
      });
    }

    document.getElementById('diagnosis-result').scrollIntoView({ behavior: 'smooth' });
  },

  // 渲染报告顶部的数据快照
  renderDiagnosisSummary(summary) {
    if (!summary) return '';
    const items = [
      { num: summary.study_days, label: '学习天数' },
      { num: summary.total_chats, label: 'AI答疑' },
      { num: summary.total_knowledge, label: '知识点' },
      { num: summary.total_mistakes, label: '错题总数' },
      { num: summary.mastery_rate + '%', label: '错题掌握率' },
      { num: summary.total_plans, label: '学习计划' },
    ];
    return '<div class="diagnosis-summary-grid">' +
      items.map(it => `<div class="ds-item"><span class="ds-num">${it.num}</span><span class="ds-label">${it.label}</span></div>`).join('') +
      '</div>';
  },

  // 加载诊断报告历史
  async loadDiagnosisHistory() {
    try {
      const data = await API.diagnosis.getList();
      const listEl = document.getElementById('diagnosis-history-list');

      if (data.reports.length === 0) {
        listEl.innerHTML = `<div class="empty-tip"><span class="empty-icon">${ICONS['stethoscope']}</span><p>暂无诊断报告，积累一些错题和计划后生成一份</p></div>`;
        return;
      }

      listEl.innerHTML = data.reports.map(item => `
        <div class="history-item" data-id="${item.id}">
          <h4>${this.escapeHtml(item.title)}</h4>
          <div class="meta">${item.created_at.substring(0, 16).replace('T', ' ')}</div>
          <button class="delete-history" data-id="${item.id}" title="删除">${ICONS.x}</button>
        </div>
      `).join('');

      listEl.querySelectorAll('.history-item').forEach(item => {
        item.addEventListener('click', async (e) => {
          const delBtn = e.target.closest('.delete-history');
          if (delBtn) {
            e.stopPropagation();
            if (!confirm('确定要删除这份诊断报告吗？')) return;
            const deletedId = parseInt(delBtn.dataset.id);
            await API.diagnosis.delete(delBtn.dataset.id);
            if (this.currentDiagnosisId === deletedId) {
              document.getElementById('diagnosis-result').style.display = 'none';
              this.currentDiagnosisId = null;
            }
            this.loadDiagnosisHistory();
            showToast('已删除', 'success');
          } else {
            const detail = await API.diagnosis.getDetail(item.dataset.id);
            this.displayDiagnosis(detail.report);
          }
        });
      });
    } catch (error) {
      console.error('加载诊断报告历史失败:', error);
    }
  },

  // 打印 / 导出PDF
  printDiagnosis() {
    if (!this.currentDiagnosisId) {
      showToast('请先生成或打开一份诊断报告', 'error');
      return;
    }
    const title = document.getElementById('diagnosis-title').textContent;
    const summaryHtml = document.getElementById('diagnosis-summary').innerHTML;
    const contentHtml = document.getElementById('diagnosis-content').innerHTML;
    const now = new Date().toLocaleString('zh-CN');

    const styles = `
      body{font-family:'Microsoft YaHei',-apple-system,sans-serif;color:#1f2937;line-height:1.7;padding:32px;max-width:800px;margin:0 auto;}
      h1{font-size:22px;text-align:center;margin-bottom:4px;}
      .print-time{text-align:center;color:#9ca3af;font-size:12px;margin-bottom:20px;}
      .diagnosis-summary-grid{display:flex;flex-wrap:wrap;gap:10px;justify-content:space-between;background:#f5f7fa;padding:16px;border-radius:10px;margin:16px 0 24px;}
      .ds-item{flex:1;min-width:90px;text-align:center;}
      .ds-num{display:block;font-size:22px;font-weight:bold;color:#2563eb;}
      .ds-label{font-size:12px;color:#6b7280;}
      h2{font-size:18px;color:#2563eb;border-left:4px solid #2563eb;padding-left:10px;margin-top:24px;}
      h3{font-size:15px;margin-top:16px;}
      ul,ol{padding-left:24px;} li{margin:4px 0;}
      table{border-collapse:collapse;width:100%;margin:12px 0;} th,td{border:1px solid #d1d5db;padding:8px;font-size:13px;} th{background:#f5f7fa;}
      blockquote{border-left:4px solid #e5e7eb;padding-left:12px;color:#6b7280;margin:12px 0;}
      code{background:#f3f4f6;padding:2px 5px;border-radius:4px;font-size:13px;} pre{background:#f9fafb;padding:12px;border-radius:8px;overflow:auto;}
      .print-footer{margin-top:32px;padding-top:12px;border-top:1px solid #e5e7eb;text-align:center;color:#9ca3af;font-size:12px;}
      @media print { .print-tip{display:none;} }
    `;

    const win = window.open('', '_blank');
    if (!win) {
      showToast('浏览器拦截了打印窗口，请允许弹出窗口', 'error');
      return;
    }
    win.document.write(`<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>${title}</title><style>${styles}</style></head>
      <body>
        <h1>${title}</h1>
        <div class="print-time">由 AI智能学习助手 生成 · ${now}</div>
        ${summaryHtml}
        ${contentHtml}
        <div class="print-footer">AI智能学习助手 · 传智杯参赛作品 · 本报告由AI基于学习数据生成，仅供参考</div>
        <p class="print-tip" style="text-align:center;color:#9ca3af;font-size:12px;">在弹出的打印窗口中，目标打印机选择"另存为PDF"即可导出</p>
        <script>window.onload=function(){setTimeout(function(){window.print();},300);}</script>
      </body></html>`);
    win.document.close();
  },

  // ==================== 数据导出功能 ====================

  // 通用：下载文本文件
  downloadTextFile(filename, content) {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  // 导出错题本
  async exportMistakes() {
    try {
      const result = await API.mistake.getList();
      const mistakes = result.list || result.mistakes || result;
      if (!Array.isArray(mistakes) || mistakes.length === 0) {
        alert('错题本为空，无需导出');
        return;
      }

      const now = new Date();
      const dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;

      let content = `========== AI智能学习助手 - 错题本导出 ==========\n`;
      content += `导出时间：${dateStr}\n`;
      content += `总错题数：${mistakes.length}道\n`;
      content += `================================================\n\n`;

      const levelMap = ['未掌握', '部分掌握', '已掌握'];

      mistakes.forEach((m, i) => {
        content += `---------- 第${i + 1}题 ----------\n`;
        content += `科目：${m.subject || '未分类'}\n`;
        content += `题目：${m.question || '无'}\n`;
        content += `你的答案：${m.your_answer || '未填写'}\n`;
        content += `正确答案：${m.correct_answer || '未填写'}\n`;
        content += `掌握程度：${levelMap[m.mastery_level] || '未掌握'}\n`;
        if (m.analysis) {
          content += `错误分析：${m.analysis}\n`;
        }
        if (m.similar_questions) {
          content += `类似练习：${m.similar_questions}\n`;
        }
        content += `添加时间：${m.created_at || '未知'}\n\n`;
      });

      this.downloadTextFile(`错题本_${dateStr}.txt`, content);
    } catch (error) {
      alert('导出失败：' + error.message);
    }
  },

  // 导出学习计划（导出当前显示的计划）
  exportPlan() {
    const titleEl = document.getElementById('plan-title');
    const contentEl = document.getElementById('plan-content');
    const title = titleEl ? titleEl.textContent : '未命名计划';
    const content = contentEl ? contentEl.innerText : '';

    if (!content || content.trim() === '') {
      alert('没有可导出的学习计划');
      return;
    }

    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;

    let output = `========== AI智能学习助手 - 学习计划导出 ==========\n`;
    output += `导出时间：${dateStr}\n`;
    output += `计划名称：${title}\n`;
    output += `==================================================\n\n`;
    output += `${content}\n`;

    this.downloadTextFile(`学习计划_${dateStr}.txt`, output);
  },

  // 导出诊断报告
  async exportDiagnosis(reportId) {
    try {
      const report = await API.diagnosis.getDetail(reportId);
      if (!report) {
        alert('报告不存在');
        return;
      }

      const now = new Date();
      const dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;

      let content = `========== AI智能学习助手 - 学习诊断报告 ==========\n`;
      content += `导出时间：${dateStr}\n`;
      content += `报告标题：${report.title || '未命名'}\n`;
      content += `生成时间：${report.created_at || '未知'}\n`;
      content += `==================================================\n\n`;
      content += `${report.content || '无内容'}\n`;

      this.downloadTextFile(`诊断报告_${dateStr}.txt`, content);
    } catch (error) {
      alert('导出失败：' + error.message);
    }
  },

  // ==================== 工具函数 ====================

  // HTML转义
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },
};
