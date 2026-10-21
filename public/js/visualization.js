// 学习数据可视化组件（纯SVG实现，不依赖第三方库）
// 包含：热力图、雷达图、趋势折线图、环形饼图

window.Visualization = (function () {
  const PRIMARY = '#2563eb';
  const PRIMARY_LIGHT = '#93c5fd';
  const PRIMARY_DARK = '#1d4ed8';
  const GRAY_100 = '#f1f5f9';
  const GRAY_200 = '#e2e8f0';
  const GRAY_300 = '#cbd5e1';
  const GRAY_500 = '#64748b';
  const GRAY_700 = '#334155';

  // 热力图5个等级的颜色（从浅到深）
  const HEATMAP_COLORS = ['#ebedf0', '#bfdbfe', '#60a5fa', '#2563eb', '#1e3a8a'];

  // 饼图配色（协调的多色）
  const PIE_COLORS = ['#2563eb', '#0891b2', '#059669', '#d97706', '#dc2626', '#7c3aed'];

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

    // 月份标签
    monthLabels.forEach(m => {
      svg += `<text x="${labelWidth + m.week * weekWidth}" y="12" font-size="10" fill="${GRAY_500}">${m.label}</text>`;
    });

    // 星期标签
    dayLabelPositions.forEach((pos, i) => {
      svg += `<text x="2" y="${monthLabelHeight + pos * weekWidth + cellSize - 2}" font-size="9" fill="${GRAY_500}">${dayLabels[i]}</text>`;
    });

    // 热力格子
    weeks.forEach((week, wi) => {
      week.forEach((day, di) => {
        if (day === null) return;
        const x = labelWidth + wi * weekWidth;
        const y = monthLabelHeight + di * weekWidth;
        const color = HEATMAP_COLORS[day.level] || HEATMAP_COLORS[0];
        const title = `${day.date}：学习${day.study_minutes}分钟，活跃度${day.activity}`;
        svg += `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" rx="2" fill="${color}" data-date="${day.date}"><title>${title}</title></rect>`;
      });
    });

    svg += '</svg>';

    // 图例
    svg += `<div style="display:flex;align-items:center;justify-content:flex-end;gap:6px;margin-top:10px;font-size:11px;color:${GRAY_500};">
      <span>少</span>
      ${HEATMAP_COLORS.map(c => `<span style="display:inline-block;width:11px;height:11px;border-radius:2px;background:${c};"></span>`).join('')}
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
      svg += `<polygon points="${points.join(' ')}" fill="none" stroke="${GRAY_200}" stroke-width="1"/>`;
    }

    // 轴线
    for (let i = 0; i < axes; i++) {
      const angle = -Math.PI / 2 + i * angleStep;
      const x2 = center + maxRadius * Math.cos(angle);
      const y2 = center + maxRadius * Math.sin(angle);
      svg += `<line x1="${center}" y1="${center}" x2="${x2}" y2="${y2}" stroke="${GRAY_200}" stroke-width="1"/>`;
    }

    // 数据多边形
    const dataPoints = [];
    data.forEach((item, i) => {
      const angle = -Math.PI / 2 + i * angleStep;
      const r = (item.mastery_rate / 100) * maxRadius;
      dataPoints.push(`${center + r * Math.cos(angle)},${center + r * Math.sin(angle)}`);
    });
    svg += `<polygon points="${dataPoints.join(' ')}" fill="${PRIMARY}" fill-opacity="0.2" stroke="${PRIMARY}" stroke-width="2"/>`;

    // 数据点
    data.forEach((item, i) => {
      const angle = -Math.PI / 2 + i * angleStep;
      const r = (item.mastery_rate / 100) * maxRadius;
      const x = center + r * Math.cos(angle);
      const y = center + r * Math.sin(angle);
      svg += `<circle cx="${x}" cy="${y}" r="3.5" fill="${PRIMARY}" stroke="#fff" stroke-width="1.5"><title>${item.subject}：掌握率${item.mastery_rate}%（${item.mastered}/${item.total}题）</title></circle>`;
    });

    // 轴标签
    data.forEach((item, i) => {
      const angle = -Math.PI / 2 + i * angleStep;
      const labelR = maxRadius + 18;
      const x = center + labelR * Math.cos(angle);
      const y = center + labelR * Math.sin(angle);
      const anchor = Math.abs(Math.cos(angle)) < 0.3 ? 'middle' : (Math.cos(angle) > 0 ? 'start' : 'end');
      svg += `<text x="${x}" y="${y + 3}" text-anchor="${anchor}" font-size="11" fill="${GRAY_700}" font-weight="500">${item.subject}</text>`;
      svg += `<text x="${x}" y="${y + 16}" text-anchor="${anchor}" font-size="10" fill="${PRIMARY}" font-weight="600">${item.mastery_rate}%</text>`;
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
      yGrid += `<line x1="${padding.left}" y1="${y}" x2="${padding.left + chartW}" y2="${y}" stroke="${GRAY_100}" stroke-width="1"/>`;
      yGrid += `<text x="${padding.left - 8}" y="${y + 3}" text-anchor="end" font-size="10" fill="${GRAY_500}">${Math.round(val)}</text>`;
    }

    // X轴标签（根据数据量决定显示密度）
    const labelStep = data.length > 14 ? Math.ceil(data.length / 7) : 1;
    let xLabels = '';
    points.forEach((p, i) => {
      if (i % labelStep === 0 || i === points.length - 1) {
        xLabels += `<text x="${p.x}" y="${height - 8}" text-anchor="middle" font-size="10" fill="${GRAY_500}">${p.label}</text>`;
      }
    });

    // 数据点和悬浮提示
    let dots = '';
    points.forEach(p => {
      dots += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3" fill="#fff" stroke="${PRIMARY}" stroke-width="2"><title>${p.date}：学习${p.study_minutes}分钟</title></circle>`;
    });

    const svg = `<svg width="100%" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      ${yGrid}
      <defs>
        <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${PRIMARY}" stop-opacity="0.25"/>
          <stop offset="100%" stop-color="${PRIMARY}" stop-opacity="0.02"/>
        </linearGradient>
      </defs>
      <path d="${areaPath}" fill="url(#trendGradient)"/>
      <path d="${linePath}" fill="none" stroke="${PRIMARY}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
      ${dots}
      ${xLabels}
      <text x="${padding.left - 30}" y="${padding.top - 6}" font-size="10" fill="${GRAY_500}">分钟</text>
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
      const color = PIE_COLORS[index % PIE_COLORS.length];

      const x1 = center + outerR * Math.cos(startAngle);
      const y1 = center + outerR * Math.sin(startAngle);
      const x2 = center + outerR * Math.cos(endAngle);
      const y2 = center + outerR * Math.sin(endAngle);
      const x3 = center + innerR * Math.cos(endAngle);
      const y3 = center + innerR * Math.sin(endAngle);
      const x4 = center + innerR * Math.cos(startAngle);
      const y4 = center + innerR * Math.sin(startAngle);

      const path = `M${x1},${y1} A${outerR},${outerR} 0 ${largeArc} 1 ${x2},${y2} L${x3},${y3} A${innerR},${innerR} 0 ${largeArc} 0 ${x4},${y4} Z`;

      arcs += `<path d="${path}" fill="${color}" stroke="#fff" stroke-width="2"><title>${item.subject}：${item.count}题（${Math.round(percentage * 100)}%）</title></path>`;
    });

    const svg = `<div style="display:flex;align-items:center;gap:24px;flex-wrap:wrap;justify-content:center;">
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
        ${arcs}
        <text x="${center}" y="${center - 4}" text-anchor="middle" font-size="24" font-weight="700" fill="${GRAY_700}">${total}</text>
        <text x="${center}" y="${center + 16}" text-anchor="middle" font-size="11" fill="${GRAY_500}">道错题</text>
      </svg>
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${data.map((item, index) => {
          const color = PIE_COLORS[index % PIE_COLORS.length];
          const pct = Math.round((item.count / total) * 100);
          return `<div style="display:flex;align-items:center;gap:8px;font-size:13px;">
            <span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${color};"></span>
            <span style="color:${GRAY_700};min-width:60px;">${item.subject}</span>
            <span style="color:${GRAY_500};">${item.count}题 · ${pct}%</span>
          </div>`;
        }).join('')}
      </div>
    </div>`;

    container.innerHTML = svg;
  }

  return {
    renderHeatmap,
    renderRadar,
    renderTrendLine,
    renderPie,
  };
})();
