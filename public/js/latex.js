// 轻量级LaTeX数学公式渲染器
// 不依赖外部库，将常见LaTeX命令转换为Unicode字符和HTML标签
window.LatexRenderer = (function () {
  // LaTeX命令 -> Unicode字符 映射表
  const SYMBOL_MAP = {
    '\\times': '×', '\\cdot': '·', '\\div': '÷', '\\pm': '±', '\\mp': '∓',
    '\\le': '≤', '\\leq': '≤', '\\geq': '≥', '\\ge': '≥', '\\neq': '≠', '\\ne': '≠',
    '\\approx': '≈', '\\equiv': '≡', '\\sim': '~', '\\propto': '∝',
    '\\infty': '∞', '\\degree': '°', '\\circ': '°', '\\angle': '∠',
    '\\perp': '⊥', '\\parallel': '∥', '\\triangle': '△', '\\square': '□',
    '\\theta': 'θ', '\\alpha': 'α', '\\beta': 'β', '\\gamma': 'γ',
    '\\delta': 'δ', '\\epsilon': 'ε', '\\varepsilon': 'ε', '\\zeta': 'ζ',
    '\\eta': 'η', '\\iota': 'ι', '\\kappa': 'κ', '\\lambda': 'λ',
    '\\mu': 'μ', '\\nu': 'ν', '\\xi': 'ξ', '\\pi': 'π', '\\varpi': 'ϖ',
    '\\rho': 'ρ', '\\sigma': 'σ', '\\tau': 'τ', '\\upsilon': 'υ',
    '\\phi': 'φ', '\\varphi': 'φ', '\\chi': 'χ', '\\psi': 'ψ', '\\omega': 'ω',
    '\\Theta': 'Θ', '\\Gamma': 'Γ', '\\Delta': 'Δ', '\\Lambda': 'Λ',
    '\\Xi': 'Ξ', '\\Pi': 'Π', '\\Sigma': 'Σ', '\\Upsilon': 'Υ',
    '\\Phi': 'Φ', '\\Psi': 'Ψ', '\\Omega': 'Ω',
    '\\sin': 'sin', '\\cos': 'cos', '\\tan': 'tan', '\\cot': 'cot',
    '\\sec': 'sec', '\\csc': 'csc', '\\arcsin': 'arcsin', '\\arccos': 'arccos',
    '\\arctan': 'arctan', '\\log': 'log', '\\ln': 'ln', '\\lg': 'lg',
    '\\exp': 'exp', '\\lim': 'lim', '\\max': 'max', '\\min': 'min',
    '\\sum': '∑', '\\prod': '∏', '\\int': '∫', '\\oint': '∮',
    '\\partial': '∂', '\\nabla': '∇', '\\forall': '∀', '\\exists': '∃',
    '\\in': '∈', '\\notin': '∉', '\\subset': '⊂', '\\supset': '⊃',
    '\\subseteq': '⊆', '\\supseteq': '⊇', '\\cup': '∪', '\\cap': '∩',
    '\\emptyset': '∅', '\\rightarrow': '→', '\\leftarrow': '←',
    '\\Rightarrow': '⇒', '\\Leftarrow': '⇐', '\\leftrightarrow': '↔',
    '\\Leftrightarrow': '⇔', '\\uparrow': '↑', '\\downarrow': '↓',
    '\\to': '→', '\\gets': '←', '\\mapsto': '↦',
    '\\ldots': '…', '\\cdots': '⋯', '\\vdots': '⋮', '\\ddots': '⋱',
    '\\dots': '…', '\\quad': '　', '\\qquad': '　　',
    '\\%': '%', '\\&': '&', '\\#': '#', '\\$': '$',
    '\\{': '{', '\\}': '}',
  };

  // 上标Unicode映射
  const SUPERSCRIPT = {
    '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
    '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
    '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾',
    'n': 'ⁿ', 'i': 'ⁱ',
  };

  // 下标Unicode映射
  const SUBSCRIPT = {
    '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
    '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
    '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎',
    'a': 'ₐ', 'e': 'ₑ', 'o': 'ₒ', 'x': 'ₓ',
  };

  // 用split+join替换，避免正则转义问题
  function replaceAll(text, search, replacement) {
    return text.split(search).join(replacement);
  }

  // 处理上下标
  function processSupSub(text) {
    let result = text;
    // 处理 ^{...} 上标（花括号）
    result = result.replace(/\^\{([^}]+)\}/g, (match, content) => toSuperscript(content));
    // 处理 ^x 上标（单个字符，后面不是字母数字）
    result = result.replace(/\^(.)(?![a-zA-Z0-9])/g, (match, char) => SUPERSCRIPT[char] || match);
    // 处理 _{...} 下标（花括号）
    result = result.replace(/\_\{([^}]+)\}/g, (match, content) => toSubscript(content));
    // 处理 _x 下标（单个字符，后面不是字母数字）
    result = result.replace(/\_(.)(?![a-zA-Z0-9])/g, (match, char) => SUBSCRIPT[char] || match);
    return result;
  }

  function toSuperscript(text) {
    let result = '';
    for (let ch of text) result += SUPERSCRIPT[ch] || ch;
    return result;
  }

  function toSubscript(text) {
    let result = '';
    for (let ch of text) result += SUBSCRIPT[ch] || ch;
    return result;
  }

  // 处理 \frac{a}{b} 分数
  function processFraction(text) {
    return text.replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, (match, num, den) => `(${num})/(${den})`);
  }

  // 处理 \sqrt{x} 根号
  function processSqrt(text) {
    let result = text;
    result = result.replace(/\\sqrt\[([^\]]+)\]\{([^}]+)\}/g, (match, root, content) => `${root}√(${content})`);
    result = result.replace(/\\sqrt\{([^}]+)\}/g, (match, content) => `√(${content})`);
    result = result.replace(/\\sqrt(.)/g, (match, char) => `√${char}`);
    return result;
  }

  // 处理 \text{xxx} \mathrm{xxx} \boxed{xxx} 等
  function processTextCommands(text) {
    let result = text;
    result = result.replace(/\\text\{([^}]+)\}/g, (match, content) => content);
    result = result.replace(/\\(mathrm|mathbf|mathit|mathsf|mathtt|textbf|textit)\{([^}]+)\}/g, (match, cmd, content) => content);
    result = result.replace(/\\boxed\{([^}]+)\}/g, (match, content) => `【${content}】`);
    result = result.replace(/\\underline\{([^}]+)\}/g, (match, content) => content);
    result = result.replace(/\\overline\{([^}]+)\}/g, (match, content) => content + '̄');
    return result;
  }

  // 处理 \left( \right) 等括号
  function processDelimiters(text) {
    let result = text;
    result = replaceAll(result, '\\left(', '(');
    result = replaceAll(result, '\\right)', ')');
    result = replaceAll(result, '\\left[', '[');
    result = replaceAll(result, '\\right]', ']');
    result = replaceAll(result, '\\left{', '{');
    result = replaceAll(result, '\\right}', '}');
    result = replaceAll(result, '\\left|', '|');
    result = replaceAll(result, '\\right|', '|');
    result = replaceAll(result, '\\left.', '');
    result = replaceAll(result, '\\right.', '');
    return result;
  }

  // 替换LaTeX符号命令（用split+join，按长度降序）
  function replaceSymbols(text) {
    let result = text;
    const keys = Object.keys(SYMBOL_MAP).sort((a, b) => b.length - a.length);
    for (let key of keys) {
      result = replaceAll(result, key, SYMBOL_MAP[key]);
    }
    return result;
  }

  // 渲染公式内部内容
  function renderFormulaContent(content) {
    let result = content;
    result = processTextCommands(result);
    result = processFraction(result);
    result = processSqrt(result);
    result = processDelimiters(result);
    result = replaceSymbols(result);
    result = processSupSub(result);
    // 清理多余的花括号（简单情况：{内容} -> 内容，但只在没有嵌套时）
    result = result.replace(/\{([^{}]+)\}/g, '$1');
    return result;
  }

  // 逐行扫描处理块级公式 [ 公式 ]
  function processBlockFormulas(text) {
    const lines = text.split('\n');
    const result = [];
    let blockLines = [];
    let inBlock = false;

    for (let line of lines) {
      const trimmed = line.trim();
      if (!inBlock) {
        // 检查是否是块级公式开始：单独一行只有 [ 或 [ 后面有内容
        if (/^\[\s*$/.test(trimmed) || /^\[\s+.+/.test(trimmed)) {
          inBlock = true;
          blockLines = [];
          // 如果 [ 后面有内容，先收集
          const content = trimmed.replace(/^\[\s*/, '');
          if (content) blockLines.push(content);
          // 检查是否同一行结束
          if (/\]\s*$/.test(trimmed) && trimmed !== '[') {
            const endContent = content.replace(/\s*\]$/, '');
            blockLines = [endContent];
            inBlock = false;
            result.push(`<div class="formula-block">${renderFormulaContent(blockLines.join(' '))}</div>`);
          }
        } else {
          result.push(line);
        }
      } else {
        // 在块级公式中，检查是否结束
        if (/\]\s*$/.test(trimmed)) {
          const content = trimmed.replace(/\s*\]$/, '');
          if (content) blockLines.push(content);
          inBlock = false;
          result.push(`<div class="formula-block">${renderFormulaContent(blockLines.join(' '))}</div>`);
        } else if (trimmed === ']') {
          inBlock = false;
          result.push(`<div class="formula-block">${renderFormulaContent(blockLines.join(' '))}</div>`);
        } else {
          blockLines.push(line);
        }
      }
    }
    // 如果没闭合，把剩余行放回去
    if (inBlock) {
      result.push('[');
      result.push(...blockLines);
    }
    return result.join('\n');
  }

  /**
   * 渲染文本中的LaTeX公式
   * @param {string} text - 原始文本
   * @returns {string} 渲染后的HTML
   */
  function render(text) {
    if (!text) return text;
    let result = text;

    // 1. 处理标准块级公式 \[...\] 和 $$...$$
    result = result.replace(/\\\[([\s\S]*?)\\\]/g, (match, content) => {
      return `<div class="formula-block">${renderFormulaContent(content.trim())}</div>`;
    });
    result = result.replace(/\$\$([\s\S]*?)\$\$/g, (match, content) => {
      return `<div class="formula-block">${renderFormulaContent(content.trim())}</div>`;
    });

    // 2. 处理AI常用的 [ 公式 ] 格式（逐行扫描，支持多行）
    result = processBlockFormulas(result);

    // 3. 处理行内公式 $...$ 和 \(...\)
    result = result.replace(/\$([^$\n]+?)\$/g, (match, content) => {
      return `<span class="formula-inline">${renderFormulaContent(content.trim())}</span>`;
    });
    result = result.replace(/\\\(([\s\S]*?)\\\)/g, (match, content) => {
      return `<span class="formula-inline">${renderFormulaContent(content.trim())}</span>`;
    });

    // 4. 处理没有$包裹但混在行内的LaTeX命令
    // 按公式块分割，只处理非公式块部分
    const parts = result.split(/(<div class="formula-block">[\s\S]*?<\/div>|<span class="formula-inline">[\s\S]*?<\/span>)/);
    for (let i = 0; i < parts.length; i++) {
      if (parts[i].startsWith('<div') || parts[i].startsWith('<span')) continue;
      // 如果包含LaTeX反斜杠命令，进行处理
      if (parts[i].indexOf('\\') !== -1) {
        parts[i] = renderFormulaContent(parts[i]);
      }
    }
    result = parts.join('');

    return result;
  }

  return { render, renderFormulaContent };
})();
