// 学习数据可视化组件（纯SVG实现，不依赖第三方库）
// 包含：热力图、雷达图、趋势折线图、环形饼图

window.Visualization = (function () {
  // 浅色模式颜色
  const LIGHT_COLORS = {
    primary: '#2563eb',
    primaryLight: '#93c5fd',
    primaryDark: '#1d4ed8',
    grid: '#f1f5f9',
    gridLine: '#e2e8f0',
    axis: '#64748b',
    text: '#334155',
    heatmap: ['#ebedf0', '#bfdbfe', '#60a5fa', '#2563eb', '#1e3a8a'],
    pie: ['#2563eb', '#0891b2', '#059669', '#d97706', '#dc2626', '#7c3aed'],
  };

  // 深色模式颜色
  const DARK_COLORS = {
    primary: '#3b82f6',
    primaryLight: '#60a5fa',
    primaryDark: '#2563eb',
    grid: '#1e293b',
    gridLine: '#334155',
    axis: '#94a3b8',
    text: '#cbd5e1',
    heatmap: ['#1e293b', '#1e3a5f', '#2563eb', '#3b82f6', '#60a5fa'],
    pie: ['#3b82f6', '#22d3ee', '#4ade80', '#fbbf24', '#f87171', '#a78bfa'],
  };

  // 获取当前主题颜色
  function getColors() {
    const theme = document.documentElement.getAttribute('data-theme') || 'light';
    return theme === 'dark' ? DARK_COLORS : LIGHT_COLORS;
  }

  // 缓存当前渲染的数据，用于主题切换时重绘
  const renderCache = {};

  /**
   * 渲染学习热力图（类似GitHub贡献图）
   * @param {HTMLElement} container - 容器元素
   * @param {Array} data - [{date, activity, level, study_minutes}]
   */
  function renderHeatmap(container, data) {
    if (!data || data.length === 0) {
      container.innerHTML = '<div class="empty-tip"><p>暂无学习数据</p></div>';
      return;
    }
    // 缓存数据用于主题切换重绘
    renderCache.heatmap = { container, data };

    const colors = getColors();

    // 按周分组（7天一行，从周日开始）
    const weeks = [];
    let currentWeek = [];
    data.forEach((day, index) => {
      const date = new Date(day.date);
      const dayOfWeek = date.getDay(); // 0=周日
      if (index === 0) {
        // 第一周前面补空格
        for (let i = 0; i < dayOfWeek; i++) {
          currentWeek.push(null);
        }
      }
      currentWeek.push(day);
      if (dayOfWeek === 6 || index === data.length - 1) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    });

    const cellSize = 13;
    const cellGap = 3;
    const weekWidth = cellSize + cellGap;
    const labelWidth = 28;
    const monthLabelHeight = 18;
    const svgWidth = labelWidth + weeks.length * weekWidth + 10;
    const svgHeight = monthLabelHeight + 7 * weekWidth + 10;

    // 生成月份标签
    const monthLabels = [];
    let lastMonth = -1;
    weeks.forEach((week, wi) => {
      const firstDay = week.find(d => d !== null);
      if (firstDay) {
        const month = new Date(firstDay.date).getMonth();
        if (month !== lastMonth) {
          monthLabels.push({ week: wi, label: (month + 1) + '月' });
          lastMonth = month;
        }
      }
    });

    const dayLabels = ['一', '三', '五'];
    const dayLabelPositions = [1, 3, 5];

    let svg = `<svg width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}" xmlns="http://www.w3.org/2000/svg">`;

    // 月份标签（在该月第一周的中间位置）
    monthLabels.forEach(m => {
      const weekCenterX = labelWidth + m.week * weekWidth + weekWidth / 2;
      svg += `<text x="${weekCenterX}" y="12" font-size="10" fill="${colors.axis}" text-anchor="middle">${m.label}</text>`;
    });

    // 星期标签
    dayLabelPositions.forEach((pos, i) => {
      svg += `<text x="2" y="${monthLabelHeight + pos * weekWidth + cellSize - 2}" font-size="9" fill="${colors.axis}">${dayLabels[i]}</text>`;
    });

    // 热力格子（加边框让所有格子都可见）
    weeks.forEach((week, wi) => {
      week.forEach((day, di) => {
        if (day === null) return;
        const x = labelWidth + wi * weekWidth;
        const y = monthLabelHeight + di * weekWidth;
        const color = colors.heatmap[day.level] || colors.heatmap[0];
        const title = `${day.date}：学习${day.study_minutes}分钟，活跃度${day.activity}`;
        svg += `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" rx="2" fill="${color}" stroke="${colors.gridLine}" stroke-width="0.5" data-date="${day.date}"><title>${title}</title></rect>`;
      });
    });

    svg += '</svg>';

    // 图例
    svg += `<div style="display:flex;align-items:center;justify-content:flex-end;gap:6px;margin-top:10px;font-size:11px;color:${colors.axis};">
      <span>少</span>
      ${colors.heatmap.map(c => `<span style="display:inline-block;width:11px;height:11px;border-radius:2px;background:${c};"></span>`).join('')}
      <span>多</span>
    </div>`;

    container.innerHTML = svg;
  }

  /**
   * 渲染知识点掌握雷达图
   * @param {HTMLElement} container
   * @param {Array} data - [{subject, mastery_rate, total, mastered}]
   */
  function renderRadar(container, data) {
    if (!data || data.length === 0) {
      container.innerHTML = '<div class="empty-tip"><p>暂无错题数据，添加错题后这里会展示各科掌握情况</p></div>';
      return;
    }
    renderCache.radar = { container, data };
    const colors = getColors();

    const size = 260;
    const center = size / 2;
    const maxRadius = 90;
    const levels = 4;
    const axes = data.length;
    const angleStep = (Math.PI * 2) / axes;

    let svg = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">`;

    // 背景网格（同心圆+轴线）
    for (let l = 1; l <= levels; l++) {
      const r = (maxRadius / levels) * l;
      const points = [];
      for (let i = 0; i < axes; i++) {
        const angle = -Math.PI / 2 + i * angleStep;
        points.push(`${center + r * Math.cos(angle)},${center + r * Math.sin(angle)}`);
      }
      svg += `<polygon points="${points.join(' ')}" fill="none" stroke="${colors.gridLine}" stroke-width="1"/>`;
    }

    // 轴线
    for (let i = 0; i < axes; i++) {
      const angle = -Math.PI / 2 + i * angleStep;
      const x2 = center + maxRadius * Math.cos(angle);
      const y2 = center + maxRadius * Math.sin(angle);
      svg += `<line x1="${center}" y1="${center}" x2="${x2}" y2="${y2}" stroke="${colors.gridLine}" stroke-width="1"/>`;
    }

    // 数据多边形
    const dataPoints = [];
    data.forEach((item, i) => {
      const angle = -Math.PI / 2 + i * angleStep;
      const r = (item.mastery_rate / 100) * maxRadius;
      dataPoints.push(`${center + r * Math.cos(angle)},${center + r * Math.sin(angle)}`);
    });
    svg += `<polygon points="${dataPoints.join(' ')}" fill="${colors.primary}" fill-opacity="0.2" stroke="${colors.primary}" stroke-width="2"/>`;

    // 数据点
    data.forEach((item, i) => {
      const angle = -Math.PI / 2 + i * angleStep;
      const r = (item.mastery_rate / 100) * maxRadius;
      const x = center + r * Math.cos(angle);
      const y = center + r * Math.sin(angle);
      svg += `<circle cx="${x}" cy="${y}" r="3.5" fill="${colors.primary}" stroke="${colors.grid}" stroke-width="1.5"><title>${item.subject}：掌握率${item.mastery_rate}%（${item.mastered}/${item.total}题）</title></circle>`;
    });

    // 轴标签
    data.forEach((item, i) => {
      const angle = -Math.PI / 2 + i * angleStep;
      const labelR = maxRadius + 18;
      const x = center + labelR * Math.cos(angle);
      const y = center + labelR * Math.sin(angle);
      const anchor = Math.abs(Math.cos(angle)) < 0.3 ? 'middle' : (Math.cos(angle) > 0 ? 'start' : 'end');
      svg += `<text x="${x}" y="${y + 3}" text-anchor="${anchor}" font-size="11" fill="${colors.text}" font-weight="500">${item.subject}</text>`;
      svg += `<text x="${x}" y="${y + 16}" text-anchor="${anchor}" font-size="10" fill="${colors.primary}" font-weight="600">${item.mastery_rate}%</text>`;
    });

    svg += '</svg>';
    container.innerHTML = svg;
  }

  /**
   * 渲染学习时长趋势折线图
   * @param {HTMLElement} container
   * @param {Array} data - [{date, label, study_minutes, chat_count, ...}]
   * @param {Object} options - {showArea: true}
   */
  function renderTrendLine(container, data, options = {}) {
    if (!data || data.length === 0) {
      container.innerHTML = '<div class="empty-tip"><p>暂无学习数据</p></div>';
      return;
    }
    renderCache.trend = { container, data, options };
    const colors = getColors();

    const width = 480;
    const height = 200;
    const padding = { top: 20, right: 20, bottom: 30, left: 40 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    const values = data.map(d => d.study_minutes);
    const maxVal = Math.max(...values, 10);
    const niceMax = Math.ceil(maxVal / 10) * 10;

    // 计算折线路径
    const points = data.map((d, i) => {
      const x = padding.left + (i / (data.length - 1)) * chartW;
      const y = padding.top + chartH - (d.study_minutes / niceMax) * chartH;
      return { x, y, ...d };
    });

    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const areaPath = linePath + ` L${points[points.length - 1].x.toFixed(1)},${padding.top + chartH} L${points[0].x.toFixed(1)},${padding.top + chartH} Z`;

    // Y轴刻度
    const yTicks = 4;
    let yGrid = '';
    for (let i = 0; i <= yTicks; i++) {
      const val = (niceMax / yTicks) * i;
      const y = padding.top + chartH - (val / niceMax) * chartH;
      yGrid += `<line x1="${padding.left}" y1="${y}" x2="${padding.left + chartW}" y2="${y}" stroke="${colors.grid}" stroke-width="1"/>`;
      yGrid += `<text x="${padding.left - 8}" y="${y + 3}" text-anchor="end" font-size="10" fill="${colors.axis}">${Math.round(val)}</text>`;
    }

    // X轴标签（根据数据量决定显示密度）
    const labelStep = data.length > 14 ? Math.ceil(data.length / 7) : 1;
    let xLabels = '';
    points.forEach((p, i) => {
      if (i % labelStep === 0 || i === points.length - 1) {
        xLabels += `<text x="${p.x}" y="${height - 8}" text-anchor="middle" font-size="10" fill="${colors.axis}">${p.label}</text>`;
      }
    });

    // 数据点和悬浮提示
    let dots = '';
    points.forEach(p => {
      dots += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3" fill="${colors.grid}" stroke="${colors.primary}" stroke-width="2"><title>${p.date}：学习${p.study_minutes}分钟</title></circle>`;
    });

    const svg = `<svg width="100%" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      ${yGrid}
      <defs>
        <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${colors.primary}" stop-opacity="0.25"/>
          <stop offset="100%" stop-color="${colors.primary}" stop-opacity="0.02"/>
        </linearGradient>
      </defs>
      <path d="${areaPath}" fill="url(#trendGradient)"/>
      <path d="${linePath}" fill="none" stroke="${colors.primary}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
      ${dots}
      ${xLabels}
      <text x="${padding.left - 30}" y="${padding.top - 6}" font-size="10" fill="${colors.axis}">分钟</text>
    </svg>`;

    container.innerHTML = svg;
  }

  /**
   * 渲染环形饼图
   * @param {HTMLElement} container
   * @param {Array} data - [{subject, count}]
   */
  function renderPie(container, data) {
    if (!data || data.length === 0) {
      container.innerHTML = '<div class="empty-tip"><p>暂无错题数据</p></div>';
      return;
    }
    renderCache.pie = { container, data };
    const colors = getColors();

    const total = data.reduce((sum, item) => sum + item.count, 0);
    const size = 200;
    const center = size / 2;
    const outerR = 80;
    const innerR = 52;

    let currentAngle = -Math.PI / 2; // 从顶部开始
    let arcs = '';

    data.forEach((item, index) => {
      const percentage = item.count / total;
      const startAngle = currentAngle;
      const endAngle = currentAngle + percentage * Math.PI * 2;
      currentAngle = endAngle;

      const largeArc = percentage > 0.5 ? 1 : 0;
      const color = colors.pie[index % colors.pie.length];

      const x1 = center + outerR * Math.cos(startAngle);
      const y1 = center + outerR * Math.sin(startAngle);
      const x2 = center + outerR * Math.cos(endAngle);
      const y2 = center + outerR * Math.sin(endAngle);
      const x3 = center + innerR * Math.cos(endAngle);
      const y3 = center + innerR * Math.sin(endAngle);
      const x4 = center + innerR * Math.cos(startAngle);
      const y4 = center + innerR * Math.sin(startAngle);

      const path = `M${x1},${y1} A${outerR},${outerR} 0 ${largeArc} 1 ${x2},${y2} L${x3},${y3} A${innerR},${innerR} 0 ${largeArc} 0 ${x4},${y4} Z`;

      arcs += `<path d="${path}" fill="${color}" stroke="${colors.grid}" stroke-width="2"><title>${item.subject}：${item.count}题（${Math.round(percentage * 100)}%）</title></path>`;
    });

    const svg = `<div style="display:flex;align-items:center;gap:24px;flex-wrap:wrap;justify-content:center;">
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
        ${arcs}
        <text x="${center}" y="${center - 4}" text-anchor="middle" font-size="24" font-weight="700" fill="${colors.text}">${total}</text>
        <text x="${center}" y="${center + 16}" text-anchor="middle" font-size="11" fill="${colors.axis}">道错题</text>
      </svg>
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${data.map((item, index) => {
          const color = colors.pie[index % colors.pie.length];
          const pct = Math.round((item.count / total) * 100);
          return `<div style="display:flex;align-items:center;gap:8px;font-size:13px;">
            <span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${color};"></span>
            <span style="color:${colors.text};min-width:60px;">${item.subject}</span>
            <span style="color:${colors.axis};">${item.count}题 · ${pct}%</span>
          </div>`;
        }).join('')}
      </div>
    </div>`;

    container.innerHTML = svg;
  }

  // 主题切换时重绘所有图表
  function redrawAll() {
    if (renderCache.heatmap) renderHeatmap(renderCache.heatmap.container, renderCache.heatmap.data);
    if (renderCache.radar) renderRadar(renderCache.radar.container, renderCache.radar.data);
    if (renderCache.trend) renderTrendLine(renderCache.trend.container, renderCache.trend.data, renderCache.trend.options);
    if (renderCache.pie) renderPie(renderCache.pie.container, renderCache.pie.data);
    if (renderCache.graph) renderKnowledgeGraph(renderCache.graph.container, renderCache.graph.data, renderCache.graph.options);
  }

  /**
   * 渲染知识图谱（支持树图/环图两种布局，圆角矩形节点）
   * @param {HTMLElement} container
   * @param {Object} data - { nodes: [...], edges: [...], stats: {...} }
   * @param {Object} options - { layout: 'ring'|'tree', onNodeClick: function(node) }
   */
  function renderKnowledgeGraph(container, data, options = {}) {
    if (!data || !data.nodes || data.nodes.length === 0) {
      container.innerHTML = '<div class="empty-tip"><p>暂无知识图谱数据，先添加一些错题和知识点吧</p></div>';
      return;
    }
    renderCache.graph = { container, data, options };
    const colors = getColors();
    const layout = options.layout || 'ring';

    const width = container.clientWidth || 600;
    const height = 520;

    // 分离不同类型的节点
    const rootNode = data.nodes.find(n => n.type === 'root');
    const subjectNodes = data.nodes.filter(n => n.type === 'subject');
    const childNodes = data.nodes.filter(n => n.type === 'knowledge' || n.type === 'mistake');

    // 节点尺寸
    const nodeSizes = {
      root: { w: 96, h: 40, r: 10 },
      subject: { w: 130, h: 34, r: 8 },
      child: { w: 150, h: 30, r: 6 },
    };

    const positions = {};

    if (layout === 'tree') {
      // ===== 树形布局 =====
      const rootX = 90;
      const subjectX = width * 0.38;
      const childX = width * 0.78;

      // 中心节点
      if (rootNode) positions[rootNode.id] = { x: rootX, y: height / 2 };

      // 科目节点垂直排列
      const subjectSpacing = Math.min(80, (height - 80) / Math.max(subjectNodes.length, 1));
      const subjectStartY = height / 2 - (subjectNodes.length - 1) * subjectSpacing / 2;
      subjectNodes.forEach((node, i) => {
        positions[node.id] = { x: subjectX, y: subjectStartY + i * subjectSpacing };
      });

      // 子节点：按科目分组，在各自科目右侧垂直排列
      subjectNodes.forEach((subject) => {
        const children = childNodes.filter(n => data.edges.some(e =>
          (e.source === subject.id && e.target === n.id) ||
          (e.target === subject.id && e.source === n.id)
        ));
        if (children.length === 0) return;
        const subPos = positions[subject.id];
        const childSpacing = Math.min(38, 140 / Math.max(children.length, 1));
        const childStartY = subPos.y - (children.length - 1) * childSpacing / 2;
        children.forEach((child, ci) => {
          positions[child.id] = { x: childX, y: childStartY + ci * childSpacing };
        });
      });
    } else {
      // ===== 环形布局 =====
      const cx = width / 2;
      const cy = height / 2;
      if (rootNode) positions[rootNode.id] = { x: cx, y: cy };

      // 科目节点围绕中心均匀分布
      const subjectRadius = Math.min(width, height) * 0.26;
      subjectNodes.forEach((node, i) => {
        const angle = -Math.PI / 2 + (i / subjectNodes.length) * Math.PI * 2;
        positions[node.id] = { x: cx + subjectRadius * Math.cos(angle), y: cy + subjectRadius * Math.sin(angle), angle };
      });

      // 子节点围绕各自科目分布
      const childRadius = 120;
      subjectNodes.forEach((subject) => {
        const children = childNodes.filter(n => data.edges.some(e =>
          (e.source === subject.id && e.target === n.id) ||
          (e.target === subject.id && e.source === n.id)
        ));
        if (children.length === 0) return;
        const subPos = positions[subject.id];
        const baseAngle = subPos.angle;
        const spreadAngle = Math.max(Math.PI * 0.6, (children.length - 1) * 0.4);
        children.forEach((child, ci) => {
          const offset = children.length === 1 ? 0 : (ci / (children.length - 1) - 0.5) * spreadAngle;
          const angle = baseAngle + offset;
          positions[child.id] = { x: subPos.x + childRadius * Math.cos(angle), y: subPos.y + childRadius * Math.sin(angle) };
        });
      });
    }

    // 生成SVG
    let svg = `<svg width="100%" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" style="background:transparent;">`;

    // 背景点阵网格
    const dotSpacing = 24;
    for (let x = dotSpacing; x < width; x += dotSpacing) {
      for (let y = dotSpacing; y < height; y += dotSpacing) {
        svg += `<circle cx="${x}" cy="${y}" r="1" fill="${colors.gridLine}" opacity="0.35"/>`;
      }
    }

    // 绘制边（贝塞尔曲线，颜色与目标节点科目一致）
    data.edges.forEach(edge => {
      const p1 = positions[edge.source];
      const p2 = positions[edge.target];
      if (!p1 || !p2) return;
      const targetNode = data.nodes.find(n => n.id === edge.target) || data.nodes.find(n => n.id === edge.source);
      const strokeColor = targetNode ? targetNode.color : colors.gridLine;
      // 树形布局用水平贝塞尔，环形用普通贝塞尔
      if (layout === 'tree') {
        const mx = (p1.x + p2.x) / 2;
        svg += `<path d="M${p1.x},${p1.y} C${mx},${p1.y} ${mx},${p2.y} ${p2.x},${p2.y}" fill="none" stroke="${strokeColor}" stroke-width="1.5" opacity="0.45"/>`;
      } else {
        const mx = (p1.x + p2.x) / 2;
        const my = (p1.y + p2.y) / 2;
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const cpx = mx - dy * 0.12;
        const cpy = my + dx * 0.12;
        svg += `<path d="M${p1.x},${p1.y} Q${cpx},${cpy} ${p2.x},${p2.y}" fill="none" stroke="${strokeColor}" stroke-width="1.5" opacity="0.45"/>`;
      }
    });

    // 绘制节点（圆角矩形）
    data.nodes.forEach(node => {
      const pos = positions[node.id];
      if (!pos) return;
      const size = nodeSizes[node.type] || nodeSizes.child;
      const nodeColor = node.type === 'root' ? colors.text : node.color;
      const textColor = node.type === 'root' ? colors.grid : '#fff';
      const x = pos.x - size.w / 2;
      const y = pos.y - size.h / 2;

      svg += `<g class="kg-node" data-id="${node.id}" data-type="${node.type}" style="cursor:pointer;">`;
      // 光晕
      if (node.type !== 'child') {
        svg += `<rect x="${x - 4}" y="${y - 4}" width="${size.w + 8}" height="${size.h + 8}" rx="${size.r + 3}" fill="${nodeColor}" opacity="0.12"/>`;
      }
      // 圆角矩形
      svg += `<rect x="${x}" y="${y}" width="${size.w}" height="${size.h}" rx="${size.r}" fill="${nodeColor}" stroke="${colors.grid}" stroke-width="1.5"/>`;

      // 掌握程度指示（错题节点，右上角小圆点）
      if (node.type === 'mistake' && node.mastery !== undefined) {
        const masteryColor = node.mastery >= 2 ? '#4ade80' : (node.mastery === 1 ? '#fbbf24' : '#f87171');
        svg += `<circle cx="${x + size.w - 2}" cy="${y + 2}" r="4.5" fill="${masteryColor}" stroke="${colors.grid}" stroke-width="1"/>`;
      }

      // 节点文字（居中）
      const label = node.type === 'root' ? '知识图谱' : node.label;
      const fontSize = node.type === 'root' ? 13 : (node.type === 'subject' ? 12 : 11);
      const fontWeight = node.type === 'root' ? '700' : (node.type === 'subject' ? '600' : '500');
      svg += `<text x="${pos.x}" y="${pos.y + 4}" text-anchor="middle" font-size="${fontSize}" font-weight="${fontWeight}" fill="${textColor}">${label}</text>`;
      svg += `</g>`;
    });

    svg += '</svg>';
    container.innerHTML = svg;

    // 绑定节点点击事件
    if (options.onNodeClick) {
      container.querySelectorAll('.kg-node').forEach(el => {
        el.addEventListener('click', () => {
          const nodeId = el.getAttribute('data-id');
          const node = data.nodes.find(n => n.id === nodeId);
          if (node) options.onNodeClick(node);
        });
      });
    }
  }

  // 暴露给app.js的主题切换回调
  window.onThemeChange = function () {
    redrawAll();
  };

  return {
    renderHeatmap,
    renderRadar,
    renderTrendLine,
    renderPie,
    renderKnowledgeGraph,
    redrawAll,
  };
})();
