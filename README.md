# Earthquakes · 2026 全国地震分布

Cesium 三维地球 + React 18 + TypeScript + Vite 的地震数据可视化单页应用，
自 earth（Earth Atlas）工程独立提取（2026-11-11）。

## 运行

```bash
npm install        # postinstall 自动把 Cesium 静态资源拷到 public/cesium
npm run dev        # http://127.0.0.1:5174/
npm run build      # tsc -b && vite build → dist/
npm run typecheck && npm run lint && npm test
```

## 数据管线（构建期快照，运行时不直连外网 API）

| 快照 | 生成命令 | 来源 |
| --- | --- | --- |
| `public/data/earthquakes.json` | `npm run fetch:quakes` | 中国地震台网中心 CEIC（https://www.ceic.ac.cn/data/data.json） |
| `public/data/cities.json` | `npm run fetch:cities` | 阿里云 DataV GeoAtlas 行政区划中心点 |
| `public/data/plates.json` | `npm run fetch:plates` | PB2002 板块边界模型（Bird, 2003） |

CEIC 响应无 CORS 头，浏览器不能直连，故采用构建期快照；快照缺失时城市/板块层静默降级。

## 功能

- 震中聚合：光晕直径 = 发生次数，圆心颜色 = 该簇最大震级（五档色标）；悬浮摘要、点击钉住逐次明细。
- 过滤：仅国内/含国外、最小震级、月份范围。
- 叠加图层（可开关）：地震区/地震带简化示意（中国 4 区 23 带 + 全球 4 区 8 段，随范围联动）、
  全球板块（PB2002 白细线 + 板块名）、城市名注记（省会常显，地级/县级按米/像素渐进）。
- 注记为 HTML 叠加层（不用 Cesium Label），屏幕空间碰撞裁剪、地球背面自动隐藏。

## 署名

- 影像：Esri World Imagery（署名见 src/imagery.ts，不得移除）。
- 地震数据：中国地震台网中心（CEIC）；板块边界：PB2002（Bird, 2003）。

---

## 附录：需求、架构与视觉规范（迁移自 earth 工程文档）

> 本节内容原为 earth 工程 PRD.md §4.8、ARCHITECTURE.md §9、DESIGN.md §9，随项目独立迁移至此。
> 路径对照：原入口 earthquakes.html → 本工程 index.html；原 src/quake/** → 本工程 src/**；
> Esri 底图常量原共享自 earth 的 src/layers/imagery → 本工程 src/imagery.ts。

### 需求与验收（原 PRD §4.8）

- 数据：构建期快照 `public/data/earthquakes.json`，由 `npm run fetch:quakes`（scripts/fetch-earthquakes.mjs）从中国地震台网中心 https://www.ceic.ac.cn/data/data.json 抓取；范围为当年 1 月 1 日至今；页面不直连 CEIC（该端点无 CORS 头）。
- 地图：Cesium SCENE3D 三维地球 + Esri World Imagery（保留署名）；同一地点（location 全串）聚合为一个点簇。
- 编码：圆心颜色 = 该簇最大震级（五档色标）；半透明光晕直径 = 发生次数（sqrt 缩放，不再使用文字计数）；悬浮显示该簇摘要，点击钉住后逐条列出每次地震的时间、震级、深度、经纬度；空白处点击或关闭按钮取消钉住。
- 过滤：仅国内/含国外、最小震级（1.0–6.0）、月份范围；统计面板给出总次数、最大震级及地点、覆盖时间段、省份 Top10、震级分布。
- 叠加图层（「图层」开关）：地震区/地震带简化示意（中国 4 地震区 · 23 地震带 + 全球主要地震带 4 区 · 8 段人工简化中心线，按区着色的半透明带 + 虚线 + 带名注记；全球带——环太平洋、地中海—喜马拉雅西段、大洋中脊、东非裂谷——仅当范围选「含国外」时显示）、全球板块（PB2002 边界白细线 + 灰白板块名注记）与城市名注记；注记为 HTML 叠加层，随相机同步，屏幕空间重叠时按优先级（城市 > 主要城市 > 地震带 > 地级 > 县级 > 板块）自动隐藏、放大复现。
- 城市注记渐进展示：省会/主要城市常显；地级（含自治州）与县级（含县/旗/自治县）注记来自构建期快照 `public/data/cities.json`（`npm run fetch:cities`，scripts/fetch-cities.mjs 抓阿里云 DataV GeoAtlas 行政区划中心点，3163 点），按视野米/像素阈值渐进显示（地级 ≤2000、县级 ≤500），快照缺失时该层静默降级。
- 全球板块图层：边界几何来自构建期快照 `public/data/plates.json`（`npm run fetch:plates`，scripts/fetch-plates.mjs 抓 PB2002 板块边界模型，Bird 2003，241 条），板块名为手写代表点；快照缺失时边界线静默降级、板块名仍可用；页脚保留 PB2002（Bird, 2003）归属。
- 缩放：自制 +/− 按钮按当前视野宽 0.7 倍步进并钳制（20 km – 25 000 km），避免加性步长把相机压入退化态（三维下视野宽由地面拾取距离自算）。
- 验收：typecheck/lint/test/build 全绿；浏览器实测悬浮、钉住、过滤、缩放、图层开关与注记跟随；数据更新仅需重跑 fetch:quakes。

### 架构（原 ARCHITECTURE §9）

- 入口 index.html → src/main.tsx；Esri 常量在 src/imagery.ts（署名不可移除）。
- 数据管线：scripts/fetch-earthquakes.mjs（Node，UA + 30s 超时）→ 校验/去重/省份归类 → public/data/earthquakes.json；页面 src/data.ts 以 10s AbortController 加载并逐条校验，失败给出中文提示。CEIC 端点无 Access-Control-Allow-Origin，故不做浏览器直连。城市注记另有 scripts/fetch-cities.mjs → public/data/cities.json（阿里云 DataV GeoAtlas 中心点，地级/县级两级），loadCityPlaces 失败时城市渐进层静默降级（不占主错误通道）。
- 纯函数域 src/cluster.ts：震级分档与色标、月份归属（按北京时间 timeText）、过滤、按 location 聚合（质心/次数/最大震级/事件倒序）、corePixelSize（震级档 6/7/8/10/12 px）与 haloPixelSize（min(46, max(10, 8+sqrt(count)*3.4))）、省份统计与震级分布；全部有单测。
- 地图适配 src/components/MapCanvas.tsx：Viewer SCENE3D（三维地球，用户要求；注记/缩放按 scene.mode 分支兼容 2D）、requestRenderMode；每簇两个 PointGraphics（halo 半透明 + core 实心），实体 id 为 cluster key（halo 前缀 `halo:`）；拾取用 scene.drillPick 循环 + 字符串 id duck-type 匹配（开发态预打包存在两份 Cesium 副本，instanceof Cesium.Entity 不可靠，曾致拾取失效）。
- 文字注记 src/overlayLabels.ts：HTML div 叠加层（textContent 写入），postRender 内以公开 API 自算投影（scene.mode + scene.mapProjection.project → viewMatrix → projectionMatrix → NDC → getBoundingClientRect 像素），不使用 SceneTransforms.worldToWindowCoordinates（跨副本 instanceof 正交 frustum 判定失败，SCENE2D 恒返回 undefined），也不使用 Cesium Label（dev 双副本致 glyph 图集 maximumTextureSize=0 崩溃）；视口外注记 display:none；SCENE3D 下对地球背面的点做遮挡剔除（地表法线·指向相机向量 ≤ 0 不投影）。SCENE2D 下 camera.computeViewRectangle 恒 null，故米/像素与视野矩形由 pixelToCartographic 逆投影自算；正交投影矩阵行列式 ~1e-22 低于 Matrix4.inverse 的零判定 epsilon 会抛错，逆投影按对角+平移解析求逆（viewMatrix 为刚体变换仍走通用逆）；SCENE3D 逆投影走 camera.pickEllipsoid（未命中地面返回 undefined），米/像素与视野矩形用 computeViewRectangle。注记变体五级（city/city-major/belt/city-pref/city-county），地级/县级按米/像素阈值（2000/500）渐进显示，快照点先按视野矩形预过滤再进碰撞裁剪。
- 缩放 src/components/MapCanvas.tsx zoomBy：视野宽按模式分支——3D 用画布左中/右中 camera.pickEllipsoid 两点地面距离，2D 读正交 frustum right-left；0.7 倍步进、钳制 20 km–25 000 km，中心取画布中心像素逆投影，camera.setView 重建矩形（3D 经度跨度含 cos 纬度因子，2D 等距圆柱投影东向米 = 经度弧度 × R 无 cos）；不用加性 zoomIn（曾把 2D 相机距离压到 ≤0 致正交 frustum 退化全黑），也不设 screenSpaceCameraController 的 zoomDistance 钳制（会钳住首帧家乡视野）。
- 地震区/地震带 src/belts.ts：中国 4 地震区（华北/西北/西南/华南，各带配色）· 23 条简化中心线（WGS84，[lon,lat]；口径见文件头：维基 21 带 + 台湾东/西 2 带）+ 全球带 4 区（环太平洋/地中海—喜马拉雅西段/大洋中脊/东非裂谷）· 8 段，beltsForScope('domestic'|'all') 按过滤范围联动（「含国外」才显示国外带）；labelAt 控制带名注记锚点比例以避免压盖；渲染为按区着色的半透明带 + 虚线中心线（CustomDataSource，卸载清理）；跨 180° 经线的带依赖 3D 相邻折线点在椭球面天然相邻，不做经度展开。
- 全球板块 src/plates.ts + scripts/fetch-plates.mjs：边界几何为构建期快照 `public/data/plates.json`（PB2002 板块边界模型，Bird 2003，241 条 LineString；坐标 3 位小数、去连续重复点、<200 条拒绝覆盖），loadPlateLines 与城市快照同款 10s 超时/可选图层语义，失败降级空列表不占主错误通道；板块名 PLATE_LABELS 为手写代表点（大洋/板块内部开阔处），恒显、碰撞优先级最低（5）；边界线渲染在独立 CustomDataSource('plates')，细白实线与彩色地震带区分；跨 180° 同地震带处理（3D 椭球面相邻，不做经度展开）。
- 生命周期：卸载时销毁 handler、overlay、DataSource 与 Viewer；图层开关经 ref + refresh() 同步，不重建场景。

### 视觉规范（原 DESIGN §9）

- 界面 chrome 保持黑白灰；数据色例外：震级五档色标 M<3 #3ba55d、3≤M<4 #f2c94c、4≤M<5 #f2994a、5≤M<6 #eb5757、M≥6 #9b51e0，与图例、统计、tooltip 徽章共用。
- 地图视图为三维地球（Cesium SCENE3D + Esri World Imagery），首帧家乡视野对准中国范围矩形；原生手势可旋转/倾斜/缩放；地球背面的注记自动隐藏（法线遮挡剔除），不穿透球体显示。
- 次数编码不用文字：半透明光晕（alpha 0.22，直径随 sqrt(次数)）+ 实心圆心（直径随震级档）；图例以 10/50/100 次参考圆说明大小含义。
- 图例为地图右下玻璃浮层，整块可收起：折叠后仅余「图例」标题行按钮（aria-expanded + chevron 方向图标），与左侧面板收起语义一致；展开态内容顺序为震级色标 → 光晕参考圆 → 地震区色标 → 全球板块 → 注记说明。
- 文字注记为 HTML 叠加层：城市名灰字 + 3px 白点锚（主要城市字号略小、锚点更淡）；地级注记 10px 更淡灰 + 2px 锚点，县级注记 10px 最淡灰 + 2px 锚点；地震带名为暗底 chip、文字色随所在地震区，压在中心线上方；板块名 11px 灰白字（alpha 0.55）+ 0.08em 字距，无锚点；注记层 pointer-events:none，不拦截地图交互；视口外自动隐藏；屏幕空间碰撞裁剪按优先级（城市 0 → 主要城市 1 → 地震带 2 → 地级 3 → 县级 4 → 板块 5）贪心放置，重叠者隐藏、放大复现。
- 城市注记渐进展示：省会/主要城市常显；地级 ≤2000 米/像素、县级 ≤500 米/像素时显示（缩放按钮 0.7 倍步进，约 4 次点击到地级、8 次到县级）；图例注明「省会/主要城市常显，地级/县级随放大渐进显示」。
- 地震带叠加：中国 4 地震区配色（华北橙 / 西北紫 / 西南红 / 华南蓝）+ 全球带 4 区配色（环太平洋绯红 / 地中海—喜马拉雅金 / 大洋中脊青 / 东非裂谷绿），各 alpha≈0.1 半透明带 + 同色 0.9 虚线中心线；图例按当前范围列国内区或追加全球区色标，图例与「图层」开关均标注「简化示意」；全球带仅「含国外」时显示。
- 全球板块叠加：1.2px 白细实线（alpha 0.5）绘 PB2002 板块边界，与彩色地震带明确区分；图例一行白色实线 swatch + 「板块边界（PB2002）」，注记说明标注 Bird 2003 归属；页脚保留 PB2002 署名与 fetch:plates 更新提示；「图层」内「全球板块」复选框独立开关边界线与板块名。
- 悬浮 tooltip 跟随光标并 clamp 在地图容器内；钉住态为带关闭按钮的 dialog 样式，逐条列出时间/震级徽章/深度/经纬度，max-height 内滚动。
- 窄屏（<760px）面板折叠为顶栏按钮收展；地图区始终占满剩余空间。

## 部署（GitHub Pages）

- 仓库：https://github.com/MachiBarton/earthquakes ；线上地址：https://machibarton.github.io/earthquakes/
- `.github/workflows/deploy.yml`：每天北京时间 06:17（UTC 22:17，GitHub 高峰期可能延迟）自动执行 `npm run update:data` 收集三份数据快照 → 有变化则由 github-actions[bot] 提交 `public/data/` → lint/test → 构建 → 发布 `dist/` 到 GitHub Pages；也可在 Actions 页手动触发（workflow_dispatch），push 到 main 同样触发。
- `npm run update:data`：一条命令依次运行 fetch-earthquakes / fetch-cities / fetch-plates，任一失败即中止（CI 不会带着旧数据部署失败的构建）。
- 所有资源与数据均走相对路径（vite `base: './'`、快照 fetch `./data/*.json`、Cesium 基址按 `document.baseURI` 解析），根路径与子路径部署通用。
- 首次运行前若 Pages 未开启，workflow 内 `configure-pages(enablement: true)` 会尝试自动开启（Source = GitHub Actions）；若权限不足需到 Settings → Pages 手动选择。
