# AI智能学习助手

> 第九届传智杯全国大学生数智创新与AI应用大赛 - AI WEB网页开发赛道参赛作品
>
> 团队：智页 | 组别：本科B组

## 项目简介

AI智能学习助手是一款基于大语言模型、**RAG检索增强生成**与**多模态视觉识别**技术的一站式个性化学习辅助平台。系统深度集成AI能力，覆盖"学—练—测—复习—诊断"完整学习闭环，通过检索用户个人学习数据（错题本、学习计划、知识点拆解、AI诊断报告）作为上下文，实现真正个性化的智能答疑与学习指导。支持拍照录题、知识图谱可视化、AI智能出题、深色模式等创新功能。

## 核心功能（九大功能）

### 1. AI智能答疑
- 基于火山方舟 DeepSeek-V4-Flash 大模型的多轮对话答疑
- **RAG语义检索增强**：使用doubao-embedding向量模型，自动检索用户错题本、学习计划、知识点拆解、诊断报告，通过余弦相似度计算语义相关性，注入AI上下文，回答时引用个人学习数据，给出针对性建议
- 支持各学科问题解答、解题思路指导、学习方法咨询
- 对话历史保存，多会话管理
- LaTeX数学公式自动渲染

### 2. 知识点拆解
- 选择科目并输入知识点名称，AI自动结构化拆解
- 包含定义、核心要点、举例说明、常见误区、延伸学习五个维度
- **知识图谱可视化**：环形/树形布局展示科目—知识点—错题关联，点击节点可跳转
- 历史记录管理，支持删除

### 3. 学习计划生成
- 根据科目、考试日期、每日学习时长自动生成个性化学习计划
- 按天规划，循序渐进，覆盖知识点梳理→强化练习→模拟冲刺阶段
- 支持多科目计划管理
- 支持导出为txt文件

### 4. 错题本管理
- **拍照录题+AI视觉识别**：上传错题图片，AI自动识别科目/题目/你的答案/正确答案
- 记录错题（科目、题目、你的答案、正确答案），AI自动分析错误原因并生成类似练习题
- **AI智能出题**：基于错题生成同知识点练习题，在线作答→AI批改→保存记录
- 掌握程度三级跟踪（未掌握/部分掌握/已掌握）
- **艾宾浩斯遗忘曲线复习**：根据复习间隔自动安排复习提醒，科学抗遗忘
- 支持删除错题、导出为txt文件

### 5. 艾宾浩斯复习
- 基于遗忘曲线科学安排复习节奏
- 今日待复习错题自动提醒
- 复习后反馈掌握程度，动态调整下次复习时间

### 6. 学习数据看板
- 学习数据统计概览（总学习天数、对话次数、知识点数、错题数、学习计划数、诊断数）
- **学习热力图**：GitHub风格12周贡献图
- **能力雷达图**：按科目展示错题掌握程度
- **学习时长趋势**：支持7天/30天切换
- **错题科目分布**：环形饼图
- 纯SVG实现，支持深色模式

### 7. AI学习诊断
- 综合分析用户错题本、学习记录、知识点掌握情况
- 生成结构化诊断报告：薄弱科目识别、掌握度分析、针对性改进建议
- 历史诊断报告管理

### 8. 知识图谱
- 环形布局（中心→科目→知识点/错题）和树形布局两种视图
- 节点按科目配色，错题节点显示掌握程度指示色
- 点击错题节点→跳转错题本并展开详情；点击科目节点→筛选该科目
- 节点hover动态效果

### 9. 深色/浅色模式
- 左下角一键切换，保护视力
- 所有图表、公式、组件自动适配深色模式

## 产品落地页

未登录状态展示专业产品落地页，包含：
- Hero区域：产品定位与核心价值
- 九大功能展示区
- 学—练—测—复习—诊断学习闭环流程图
- 项目介绍与技术栈说明
- 行动号召与页脚

## 技术栈

### 后端
- Node.js + Express
- **数据库双模式**：本地开发用 SQLite（better-sqlite3，单文件零配置），生产部署用 PostgreSQL（Supabase 云端，数据持久不丢失）。通过 `DB_TYPE` 环境变量一键切换，业务代码无需改动
- **数据库适配层**：自研 `db/adapter.js`，自动完成 SQL 方言转换（占位符 `?`→`$1`、`AUTOINCREMENT`→`BIGSERIAL`、`INSERT OR IGNORE`→`ON CONFLICT` 等），89 处数据库调用统一封装
- JWT 身份认证 + bcryptjs 密码加密
- multer — 文件上传（错题图片），配合存储适配层支持本地磁盘与 Supabase Storage 双模式
- **图片存储双模式**：本地开发存磁盘，生产部署存 Supabase Storage 云端，通过 `STORAGE_TYPE` 环境变量切换
- 忘记密码（安全问题验证）

### 前端
- 原生 HTML5 + CSS3 + JavaScript（零框架依赖，轻量高效）
- Marked.js（Markdown渲染）+ Highlight.js（代码高亮）
- 自研LaTeX数学公式渲染器（零依赖，100+符号）
- 自研SVG可视化库（热力图/雷达图/趋势图/饼图/知识图谱）
- Lucide 线性图标（44个，本地化，离线可用）
- Inter 字体（本地化）
- 响应式设计，支持桌面/平板/手机
- 深色/浅色模式切换

### AI能力（核心）
- **火山方舟 DeepSeek-V4-Flash** 大模型 API（支持文本生成+多模态视觉理解）
- **火山方舟 doubao-embedding** 向量嵌入 API（语义检索）
- **RAG检索增强生成**：语义检索（Embedding+余弦相似度）+关键词降级兜底，检索用户个人学习数据作为上下文注入大模型prompt
- **多模态视觉识别**：拍照上传错题图片，AI自动识别科目/题目/答案

## 快速开始

### 环境要求
- Node.js >= 18.0.0
- npm >= 8.0.0

### 安装步骤

1. **安装依赖**
```bash
npm install
```

2. **配置环境变量**
```bash
# Windows
copy .env.example .env
# 编辑 .env，填入你的火山方舟API密钥和推理接入点ID
```

3. **初始化数据库**（首次运行时server.js会自动建表，也可手动执行）
```bash
node db/init.js
```

4. **启动服务**
```bash
npm start
# 或双击 start.bat（Windows）
```

5. **访问应用**
本地访问：http://localhost:3000
线上演示：https://ai-study-assistant-2aig.onrender.com

> 线上为 Render 免费实例，15 分钟无访问会休眠，首次打开需等 30-60 秒冷启动。

### 测试账号
- 用户名：`testuser`，密码：`123456`
- 用户名：`111`，密码：`123456`（张三，含完整示例数据：6道错题、7个会话、诊断报告等）
- 或自行注册新账号

## 数据库配置（两种模式）

项目支持两种数据库，通过 `DB_TYPE` 环境变量切换，**业务代码无需任何改动**。

### 模式一：SQLite（本地开发，默认）

```bash
DB_TYPE=sqlite
# 数据存在 db/study.db 文件里，零配置
```

适合本地开发和调试，不需要网络，速度最快。

### 模式二：PostgreSQL（生产部署，数据持久）

```bash
DB_TYPE=postgres
DATABASE_URL=postgresql://postgres.项目标识:密码@aws-0-区域.pooler.supabase.com:5432/postgres
```

适合线上部署。以 Supabase 为例：
1. 注册 https://supabase.com 并创建项目（区域建议选 Singapore）
2. 项目后台 → 连接 → **会话池化器**（Session pooler），复制连接串
3. 初始化表结构：`npm run init-db`
4. 如需导入本地数据：`npm run migrate-data`

### 为什么要支持 PostgreSQL

Render 免费层使用**临时文件系统**，服务每次重新部署、重启或休眠（15分钟无访问）时，本地 SQLite 数据库文件都会被清空，用户数据全部丢失。接入云端 PostgreSQL 后，数据存在 Supabase 上，与 Render 实例生命周期无关，彻底解决数据丢失问题。

### 数据库适配层原理

`db/adapter.js` 让业务代码继续使用 `db.prepare(sql).get()/.all()/.run()` 的写法，内部自动处理：

| SQLite 写法 | 自动转换为 PostgreSQL |
|---|---|
| `?` 占位符 | `$1, $2, ...` |
| `@name` 具名参数 | `$n` + 参数重排 |
| `INTEGER PRIMARY KEY AUTOINCREMENT` | `BIGSERIAL PRIMARY KEY` |
| `INSERT OR IGNORE` | `INSERT ... ON CONFLICT DO NOTHING` |
| `DATETIME` / `REAL` | `TIMESTAMP` / `DOUBLE PRECISION` |
| `.run()` 返回的 `lastInsertRowid` | 自动追加 `RETURNING id` 后映射 |

## 图片存储配置（两种模式）

错题图片同样支持两种存储，通过 `STORAGE_TYPE` 环境变量切换。

### 模式一：本地磁盘（本地开发，默认）

```bash
STORAGE_TYPE=local
# 图片存在 uploads/ 目录
```

### 模式二：Supabase Storage（生产部署，图片持久）

```bash
STORAGE_TYPE=supabase
SUPABASE_URL=https://项目标识.supabase.co
SUPABASE_SERVICE_KEY=服务端密钥
SUPABASE_BUCKET=mistake-images
```

配置步骤：
1. Supabase 后台 → 存储 → 新建存储桶，名称 `mistake-images`，**勾选公开存储桶**
2. 项目设置 → API 密钥 → 复制**秘密密钥**（新版以 `sb_secret_` 开头）
3. 填入 Render 环境变量

> **密钥格式说明**：Supabase 2026 年起推行新版密钥体系（`sb_publishable_` / `sb_secret_`），新项目不再接受旧版 JWT 密钥（`eyJ...`）访问 Storage API。本项目代码同时兼容两种格式，会同时发送 `apikey` 和 `Authorization` 请求头。

### 为什么图片也要上云

与数据库同理：Render 免费层的本地磁盘是临时的，图片存在 `uploads/` 目录同样会在休眠/重启时丢失。改用 Supabase Storage 后，图片地址变为云端 URL，与 Render 实例生命周期无关。

### 存储层原理

`utils/storage.js` 封装了上传、读取、存在检查、删除四个操作，业务代码无需关心底层是本地磁盘还是云端：

- 上传路由使用**内存缓冲**接收文件，再由存储层决定落盘或上传云端
- `vision.js` 通过存储层读取图片内容，因此 AI 识别在两种模式下都能工作
- 数据库统一存**纯文件名**，前端 `resolveImageUrl()` 按存储模式解析为完整地址

## 环境变量说明

| 变量名 | 说明 | 示例 |
|---|---|---|
| PORT | 服务端口 | 3000 |
| DB_TYPE | 数据库类型，`sqlite` 或 `postgres` | postgres |
| DATABASE_URL | PostgreSQL 连接串（仅 postgres 模式需要） | postgresql://postgres.xxx:密码@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres |
| DB_PATH | SQLite 文件路径（仅 sqlite 模式，可选） | /data/study.db |
| STORAGE_TYPE | 图片存储类型，`local` 或 `supabase` | supabase |
| SUPABASE_URL | Supabase 项目地址（仅 supabase 模式） | https://项目标识.supabase.co |
| SUPABASE_SERVICE_KEY | Supabase 秘密密钥（服务端专用，仅 supabase 模式） | sb_secret_xxxxxxxx |
| SUPABASE_BUCKET | 存储桶名称，默认 mistake-images | mistake-images |
| DOUBAO_API_KEY | 火山方舟API密钥 | ark-xxxxxxxx |
| DOUBAO_MODEL | 推理接入点ID（DeepSeek-V4-Flash） | ep-xxxxxxxx |
| DOUBAO_BASE_URL | API请求地址 | https://ark.cn-beijing.volces.com/api/v3/chat/completions |
| EMBEDDING_MODEL | 向量嵌入模型名 | doubao-embedding |
| EMBEDDING_BASE_URL | 嵌入API地址 | https://ark.cn-beijing.volces.com/api/v3/embeddings |
| VISION_MODEL | 视觉识别模型（可选，默认回退到DOUBAO_MODEL） | ep-xxxxxxxx |
| JWT_SECRET | JWT签名密钥（可自行修改） | 自定义字符串 |

## 获取火山方舟API密钥

1. 访问 [火山引擎控制台](https://console.volcengine.com/ark)
2. 注册并登录账号（新用户赠送50万tokens免费额度）
3. 开通「开源LLM模型」服务（如DeepSeek系列）
4. 创建推理接入点（Endpoint），选择DeepSeek-V4-Flash模型，获取接入点ID（ep-开头）
5. 创建 API Key
6. 开通向量模型（doubao-embedding），无需创建推理接入点
7. 将 API Key 和接入点ID 填入 .env 文件

## 项目结构

```
ai-study-assistant/
├── public/                  # 前端静态文件
│   ├── index.html          # 主页面（落地页/登录/主应用/九大功能视图）
│   ├── css/style.css       # 全局样式（设计令牌+组件+落地页+深色模式+响应式）
│   ├── js/
│   │   ├── icons.js        # Lucide线性图标（44个，本地化）
│   │   ├── api.js          # API调用封装
│   │   ├── visualization.js # SVG可视化库（热力图/雷达图/趋势图/饼图/知识图谱）
│   │   ├── latex.js        # LaTeX数学公式渲染器（零依赖）
│   │   ├── ai.js           # AI功能交互逻辑（九大功能）
│   │   └── app.js          # 主应用逻辑（路由/状态/事件/主题切换）
│   └── vendor/             # 第三方库本地化（字体/marked/highlight）
├── db/
│   ├── adapter.js          # 数据库适配层（SQLite/PostgreSQL 双模式 + SQL 方言自动转换）
│   ├── index.js            # 数据库入口（统一暴露 prepare/exec 接口）
│   ├── init.js             # 数据库初始化脚本（10张表，支持两种数据库）
│   ├── schema.js           # 自动建表（服务器启动时执行）
│   └── study.db            # SQLite数据库文件（仅本地开发用，已gitignore）
├── scripts/
│   └── migrate-data.js     # 数据迁移脚本（SQLite -> PostgreSQL）
├── routes/
│   ├── auth.js             # 用户认证接口（注册/登录/忘记密码）
│   ├── chat.js             # AI对话接口（含RAG语义检索）
│   ├── knowledge.js        # 知识点拆解接口（含知识图谱数据）
│   ├── plan.js             # 学习计划接口
│   ├── mistake.js          # 错题本接口（含AI识别/AI出题）
│   ├── quiz.js             # AI出题接口
│   ├── upload.js           # 文件上传接口（错题图片）
│   ├── dashboard.js        # 数据看板接口
│   └── diagnosis.js        # AI诊断接口
├── middleware/auth.js      # JWT认证中间件
├── utils/
│   ├── doubao.js           # 火山方舟文本API封装
│   ├── vision.js           # 多模态视觉识别封装
│   ├── embedding.js        # 向量嵌入封装
│   ├── rag.js              # RAG检索增强生成（语义检索+关键词降级）
│   ├── storage.js          # 图片存储适配层（本地磁盘 / Supabase Storage 双模式）
│   └── studyRecord.js      # 学习记录工具
├── uploads/                # 用户上传的错题图片（仅 local 模式，已gitignore）
├── .env.example            # 环境变量模板（脱敏）
├── .gitignore              # Git忽略配置
├── server.js               # 服务器入口
├── start.bat               # Windows一键启动脚本
├── package.json            # 项目配置
├── README.md               # 项目说明
├── 技术文档.md             # 技术文档
└── 演示视频脚本.md         # 演示视频脚本
```

## 数据库设计（10张表）

| 表名 | 说明 |
|---|---|
| users | 用户信息（含安全问题/答案，用于找回密码） |
| conversations | AI对话会话 |
| messages | 对话消息 |
| knowledge_points | 知识点拆解记录（含科目标签） |
| study_plans | 学习计划 |
| mistakes | 错题本（含图片路径+艾宾浩斯复习字段） |
| diagnosis_reports | AI诊断报告 |
| study_records | 每日学习记录 |
| quiz_sets | AI出题答题记录 |
| knowledge_embeddings | 知识点向量缓存（语义检索用） |

## 创新点

1. **RAG个性化智能答疑 + 语义检索升级**：区别于普通AI问答，系统使用doubao-embedding向量模型进行语义检索，自动检索用户个人数据注入大模型上下文，实现"懂你学情"的个性化回答。Embedding失败时自动降级为关键词匹配，保证稳定性。

2. **多模态视觉识别：拍照录题**：上传错题图片，AI自动识别科目/题目/你的答案/正确答案，大幅降低录题成本。

3. **知识图谱可视化**：环形/树形布局可视化科目—知识点—错题关联结构，点击节点可跳转对应内容，学习结构一目了然。

4. **AI智能出题**：基于错题自动生成同知识点练习题，在线作答→AI批改→保存记录，形成"错题→出题→练习→掌握"闭环。

5. **学练测复习诊断完整闭环**：九大功能形成完整学习闭环，数据互通。

6. **学习数据可视化大屏**：热力图/雷达图/趋势图/饼图，纯SVG实现，零依赖。

7. **LaTeX数学公式自动渲染**：自研轻量级渲染器，零依赖，100+符号自动转换。

8. **艾宾浩斯遗忘曲线科学复习**：基于遗忘曲线算法自动安排复习间隔，复习后根据掌握程度动态调整下次复习时间。

9. **轻量化零依赖部署**：原生HTML/CSS/JS前端，无需构建工具；本地开发用 SQLite 单文件数据库，`npm install` 后一键启动。生产部署可切换 PostgreSQL + 对象存储，数据持久不丢失。

10. **无状态应用架构**：数据库与图片存储都抽象为适配层，通过环境变量切换。应用服务器变成无状态节点，可随时重启、重新部署或迁移平台，数据不受影响。

## 安全与隐私

- 用户密码使用 bcryptjs 加密存储
- JWT Token 身份认证
- API密钥通过环境变量配置，不硬编码在代码中
- 忘记密码采用安全问题验证方式，无需外部邮箱服务
- .gitignore排除.env和数据库文件，提交代码自动脱敏

## 使用说明

本项目允许使用AI辅助编程工具协助代码编写与优化，核心架构设计、业务逻辑、功能创意和RAG检索策略由团队自主设计完成。

## 许可证

MIT License
