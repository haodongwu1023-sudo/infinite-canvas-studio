# Infinite Canvas Studio · 无限画布创作工作台

基于 [basketikun/infinite-canvas](https://github.com/basketikun/infinite-canvas) 的个人定制版本，用于图片、视频、广告与分镜创作。保留原项目的 MIT 许可证及作者署名。

## 功能

- 可拖动、缩放和连接节点的无限画布，支持文字、图片、视频、音频生成。
- 玻璃风格界面、节点下方的提示词和参数、画布快捷键。
- 自建提示词、人物图片与声音、场景、人设和多宫格故事板资产库。
- 工厂宣传片风格档案、镜头卡审核、客户实拍照片分镜和逐镜视频生成。
- 自定义 API 通道、模型和调用脚本；连接本地 Canvas Agent 后可由 Codex 操作画布。
- 同一台电脑的不同浏览器通过本机服务共享画布、资产、媒体与配置，显示保存状态，并保存历史副本。

## 下载与运行

安装 Node.js 22.12 或更高版本，确认终端能运行 `node --version` 和 `npm --version`。

可以使用 GitHub 的 **Code → Download ZIP** 下载后解压，或使用 Git：

```bash
git clone https://github.com/haodongwu1023-sudo/infinite-canvas-studio.git
cd infinite-canvas-studio/web
npm ci
npm run dev
```

浏览器打开 **http://127.0.0.1:3001/canvas**。服务运行期间请保留终端窗口。

Windows 用户也可以在解压后的根目录双击 **启动画布.cmd**。脚本会在首次运行时安装前端依赖，然后启动本机画布服务。

首次使用：

1. 新建画布，在右上角「配置」填入自己的 API 地址、API Key 和模型名称。生成费用由你的 API 服务商收取。
2. 上传图片或创建节点，在节点下方编辑提示词与参数，连接参考节点后生成。
3. 在左侧「资产」「提示词」「故事板」「镜头库」建立自己的资料；公共版本初始资产库为空。
4. 等界面显示「已保存到本机」后，资料已写入本机共享副本。需要在其他浏览器继续工作时，打开同一个项目地址。

## 保存与备份

浏览器保存一份本地资料，本机 Vite 服务还会把共享副本写到仓库根目录的 `data/local-browser-sync/`，包括媒体、配置与调用脚本。修改前的状态保存在 `revisions/` 下。

资产库提供打包导出与导入。完整迁移到另一台电脑时，停止本机服务后备份整个 `data/` 目录，放入新电脑的项目根目录再启动。

**API Key 会保存在你的浏览器及本机共享文件中。** 请保管好自己的电脑与备份，不要把 `data/`、浏览器导出配置或连接 Token 提交到 GitHub。仓库已忽略本机数据、依赖、日志和环境配置。

共享保存限于同一台电脑的本机服务，不会同步到本仓库或其他使用者的电脑。参考片和真实工厂资料由使用者自行导入；公共版本不附带作者的工作资产或内部研究参考帧。

## 连接 Codex / Canvas Agent（可选）

在另一个终端运行：

```bash
npx -y @basketikun/canvas-agent@latest
```

回到画布打开 Agent 面板连接本地服务。也可以安装随仓库提供的 `plugins/infinite-canvas` Codex 插件。Agent 服务与 MCP 插件的用途和安装说明见 [Agent README](canvas-agent/README.md) 和 [插件 README](plugins/infinite-canvas/README.md)。

## Docker（仅静态前端）

```bash
docker compose -f docker-compose.local.yml up -d --build
```

打开 http://127.0.0.1:3000。此方式通过 Nginx 提供静态页面，资料保存在各浏览器中；要使用本版本的跨浏览器本机共享保存，请按上面的 Node.js 方法运行。

## 文档与许可

- [功能说明](docs/content/docs/overview/features.mdx)
- [维护和待验证事项](docs/content/docs/progress/pending-test.mdx)
- [安全说明](SECURITY.md)
- [MIT License](LICENSE)

本仓库发布的是定制源码快照。原项目的在线站点、npm Agent 和官方节点插件属于各自维护者，使用说明中的对应地址不代表本仓库部署了那些服务。
