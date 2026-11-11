/**
 * 地图文字注记叠加层（城市名 / 地震带名）——HTML div 实现，不用 Cesium Label。
 *
 * 原因：Cesium Label 需要 glyph 纹理图集；Vite 开发态预打包产物里存在两份
 * Cesium 副本，其中一份的 ContextLimits 从未初始化（maximumTextureSize=0），
 * 首帧建图集即抛 DeveloperError 并使渲染停摆。HTML 注记同时更清晰、不随缩放
 * 变形，且天然免疫该问题。
 *
 * 位置每帧自行投影（SCENE2D）：不用 SceneTransforms.worldToWindowCoordinates，
 * 因为开发态预打包产物含两份 Cesium 副本，场景内正交 frustum 实例与该函数
 * instanceof 判定所用类分属不同副本，SCENE2D 下恒返回 undefined（与 Entity2
 * 事件同源的跨副本类同一性问题）。改用纯矩阵运算 + getBoundingClientRect。
 * requestRenderMode 下只在真正重绘时更新；开关切换由调用方 refresh()。
 * 文字一律 textContent 写入（AGENTS.md：禁止 innerHTML 拼数据）。
 *
 * 屏幕空间碰撞裁剪：全国缩放下带名 + 城市注记必然重叠，故每帧按
 * priority（省会 0 → 主要城市 1 → 地震带 2 → 地级 3 → 县级 4 → 板块 5）贪心放置矩形，
 * 与已放置矩形相交者 display:none；放大后空间充足自动复现。矩形尺寸在节点
 * 创建时量一次缓存。城市颗粒度另按比例尺渐进（见 getLabels 的 metersPerPixel）。
 */
import * as Cesium from 'cesium';

export type OverlayLabelVariant =
  | 'city'
  | 'city-major'
  | 'city-pref'
  | 'city-county'
  | 'belt'
  | 'plate';

/** 每帧传给 getLabels 的视图上下文：地面米/像素 + 视野经纬度范围（弧度）。 */
export interface OverlayLabelContext {
  metersPerPixel: number;
  /** 当前视野矩形（弧度，WGS84）；无法计算时为 undefined。供调用方预过滤注记集合。 */
  viewRectangle?: { west: number; south: number; east: number; north: number };
}

export interface OverlayLabelSpec {
  key: string;
  text: string;
  lon: number;
  lat: number;
  variant: OverlayLabelVariant;
  /** 碰撞优先级，数字小者先放置（默认 city 0 / belt 1 / city-major 2）。 */
  priority?: number;
  /** 文字颜色（CSS color）；缺省沿用 CSS 类颜色。地震带按所在区取色。 */
  color?: string;
}

export interface LabelOverlay {
  /** 立即重算一次位置/集合（图层开关变化等不触发重绘的场景）。 */
  refresh: () => void;
  destroy: () => void;
}

const VARIANT_CLASS: Record<OverlayLabelVariant, string> = {
  city: 'map-label map-label-city',
  'city-major': 'map-label map-label-city-major',
  'city-pref': 'map-label map-label-city-pref',
  'city-county': 'map-label map-label-city-county',
  belt: 'map-label map-label-belt',
  plate: 'map-label map-label-plate',
};

/** 锚点对齐：城市名居中于锚点；地震带名压在中心线上方；板块名居中于代表点。 */
const VARIANT_ANCHOR: Record<OverlayLabelVariant, string> = {
  city: '-50%, -50%',
  'city-major': '-50%, -50%',
  'city-pref': '-50%, -50%',
  'city-county': '-50%, -50%',
  belt: '-50%, -170%',
  plate: '-50%, -50%',
};

const DEFAULT_PRIORITY: Record<OverlayLabelVariant, number> = {
  city: 0,
  'city-major': 1,
  belt: 2,
  'city-pref': 3,
  'city-county': 4,
  plate: 5,
};

/** 视口外裁剪余量（px）：注记半宽/半高量级，避免边缘闪烁。 */
const EDGE_MARGIN_X = 60;
const EDGE_MARGIN_Y = 24;

/** 碰撞矩形外扩（px），保证注记之间留有视觉间隙。 */
const COLLIDE_PAD = 2;

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function rectFor(
  variant: OverlayLabelVariant,
  x: number,
  y: number,
  w: number,
  h: number,
): Rect {
  if (variant === 'belt') {
    // 与 VARIANT_ANCHOR 的 -170% 一致：矩形顶边在锚点上方 1.7h。
    return {
      x0: x - w / 2 - COLLIDE_PAD,
      y0: y - 1.7 * h - COLLIDE_PAD,
      x1: x + w / 2 + COLLIDE_PAD,
      y1: y - 0.7 * h + COLLIDE_PAD,
    };
  }
  return {
    x0: x - w / 2 - COLLIDE_PAD,
    y0: y - h / 2 - COLLIDE_PAD,
    x1: x + w / 2 + COLLIDE_PAD,
    y1: y + h / 2 + COLLIDE_PAD,
  };
}

function intersects(a: Rect, b: Rect): boolean {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

const scratchWorld = new Cesium.Cartesian3();
const scratchEye = new Cesium.Cartesian4();
const scratchClip = new Cesium.Cartesian4();
const scratchWindow = new Cesium.Cartesian2();
const scratchCartographic = new Cesium.Cartographic();
const scratchProjected = new Cesium.Cartesian3();
const scratchRectangle = new Cesium.Rectangle();
const scratchCenter = new Cesium.Cartographic();
const scratchInvView = new Cesium.Matrix4();
const scratchViewPos = new Cesium.Cartesian4();
const scratchWorldPos = new Cesium.Cartesian4();
const scratchCartoA = new Cesium.Cartographic();
const scratchCartoB = new Cesium.Cartographic();
const scratchCartoC = new Cesium.Cartographic();
const scratchCartoD = new Cesium.Cartographic();
const scratchPickPixel = new Cesium.Cartesian2();
const scratchPickPos = new Cesium.Cartesian3();
const scratchToCam = new Cesium.Cartesian3();

/**
 * 屏幕像素 → 经纬度，按场景模式分支：
 * SCENE3D 用 camera.pickEllipsoid（射线-椭球求交，未命中地面返回 undefined）；
 * SCENE2D 为正向投影（viewMatrix → projectionMatrix）的逆运算——
 * `camera.computeViewRectangle` 在 2D 正交相机下返回 null，比例尺/视野矩形只能自算；
 * 全部使用公开 API，对打包方式免疫（与 projectToWindow 同一理由）。
 * 2D 世界坐标 = (0, 投影东向, 投影北向)，故逆解后取 y/z 再 unproject 回经纬度。
 */
export function pixelToCartographic(
  scene: Cesium.Scene,
  px: number,
  py: number,
  viewWidth: number,
  viewHeight: number,
  result: Cesium.Cartographic,
): Cesium.Cartographic | undefined {
  if (viewWidth <= 0 || viewHeight <= 0) {
    return undefined;
  }
  // SCENE3D：射线与椭球求交是公开 API（pickEllipsoid），未命中地面（太空/地平线外）返回 undefined。
  if (scene.mode === Cesium.SceneMode.SCENE3D) {
    scratchPickPixel.x = px;
    scratchPickPixel.y = py;
    const pos = scene.camera.pickEllipsoid(
      scratchPickPixel,
      Cesium.Ellipsoid.WGS84,
      scratchPickPos,
    );
    if (!pos) {
      return undefined;
    }
    return Cesium.Cartographic.fromCartesian(pos, undefined, result);
  }
  const nx = (2 * px) / viewWidth - 1;
  const ny = 1 - (2 * py) / viewHeight;
  // 正交投影矩阵数学上可逆，但行列式量级 ~1e-22，低于 Cesium Matrix4.inverse 的
  // 零判定 epsilon（"matrix is not invertible because its determinate is zero"），
  // 故不走通用逆矩阵： OrthographicOffCenterFrustum 的投影矩阵为对角+平移
  // （列主序 m[0]/m[5]/m[10] 对角、m[12..14] 平移），解析求逆即可。
  const pm = scene.camera.frustum.projectionMatrix;
  const dX = pm[0];
  const dY = pm[5];
  const dZ = pm[10];
  if (
    !Number.isFinite(dX) ||
    !Number.isFinite(dY) ||
    !Number.isFinite(dZ) ||
    dX === 0 ||
    dY === 0 ||
    dZ === 0
  ) {
    return undefined; // 首帧/退化 frustum：放弃本轮，下一帧重算
  }
  scratchViewPos.x = (nx - pm[12]) / dX;
  scratchViewPos.y = (ny - pm[13]) / dY;
  scratchViewPos.z = (-1 - pm[14]) / dZ;
  scratchViewPos.w = 1;
  // 视图矩阵是刚体变换（行列式 ±1），通用逆矩阵安全。
  try {
    Cesium.Matrix4.inverse(scene.camera.viewMatrix, scratchInvView);
  } catch {
    return undefined;
  }
  Cesium.Matrix4.multiplyByVector(scratchInvView, scratchViewPos, scratchWorldPos);
  scratchProjected.x = scratchWorldPos.y;
  scratchProjected.y = scratchWorldPos.z;
  scratchProjected.z = 0;
  const carto = scene.mapProjection.unproject(scratchProjected, result);
  // 相机退化（frustum 宽 ≤0 等）时 unproject 可能产出 NaN：视为不可投影，避免 NaN 视野矩形
  // 把全部注记预过滤掉（历史黑屏帧的伴生现象）。
  if (!Number.isFinite(carto.longitude) || !Number.isFinite(carto.latitude)) {
    return undefined;
  }
  return carto;
}

/**
 * 经纬度 → 当前场景模式下的世界坐标（与 Cesium 内部 computeActualEllipsoidPosition 同构，
 * 但只用公开 API：scene.mode + scene.mapProjection.project）。MORPHING 期间返回 undefined。
 */
function worldPositionForMode(
  scene: Cesium.Scene,
  lon: number,
  lat: number,
  result: Cesium.Cartesian3,
): Cesium.Cartesian3 | undefined {
  const mode = scene.mode;
  if (mode === Cesium.SceneMode.SCENE3D) {
    return Cesium.Cartesian3.fromDegrees(lon, lat, 0, undefined, result);
  }
  if (mode === Cesium.SceneMode.MORPHING) {
    return undefined;
  }
  const cartographic = Cesium.Cartographic.fromDegrees(lon, lat, 0, scratchCartographic);
  const projected = scene.mapProjection.project(cartographic, scratchProjected);
  if (mode === Cesium.SceneMode.COLUMBUS_VIEW) {
    return Cesium.Cartesian3.fromElements(projected.z, projected.x, projected.y, result);
  }
  return Cesium.Cartesian3.fromElements(0, projected.x, projected.y, result);
}

/**
 * 将经纬度投影为相对 Cesium canvas 左上角的 CSS 像素坐标。
 *
 * 链路：椭球坐标 → 当前模式投影坐标 → 视空间（camera.viewMatrix）
 * → 裁剪空间（frustum.projectionMatrix）→ NDC → 像素。
 * 全程矩阵运算，不做任何跨副本 instanceof 判定；透视模式下 w<=0（相机背后）返回 undefined。
 * 不处理 SCENE2D 越过 ±180° 的横向回绕（本视图锁定中国经度范围，不受影响）。
 */
function projectToWindow(
  scene: Cesium.Scene,
  lon: number,
  lat: number,
  viewWidth: number,
  viewHeight: number,
  result: Cesium.Cartesian2,
): Cesium.Cartesian2 | undefined {
  const world = worldPositionForMode(scene, lon, lat, scratchWorld);
  if (!world) {
    return undefined;
  }
  const camera = scene.camera;
  // SCENE3D：地球背面的点（地表法线·指向相机向量 ≤ 0）不投影，防止注记穿透球体显示。
  if (scene.mode === Cesium.SceneMode.SCENE3D) {
    Cesium.Cartesian3.subtract(camera.positionWC, world, scratchToCam);
    if (Cesium.Cartesian3.dot(world, scratchToCam) <= 0) {
      return undefined;
    }
  }
  const eye = Cesium.Matrix4.multiplyByVector(
    camera.viewMatrix,
    Cesium.Cartesian4.fromElements(world.x, world.y, world.z, 1, scratchEye),
    scratchEye,
  );
  const clip = Cesium.Matrix4.multiplyByVector(
    camera.frustum.projectionMatrix,
    eye,
    scratchClip,
  );
  if (!(clip.w > 0)) {
    return undefined;
  }
  const ndcX = clip.x / clip.w;
  const ndcY = clip.y / clip.w;
  result.x = ((ndcX + 1) / 2) * viewWidth;
  result.y = ((1 - ndcY) / 2) * viewHeight;
  return result;
}

export function createLabelOverlay(options: {
  /** 承载注记的绝对定位容器（pointer-events: none）。 */
  layer: HTMLElement;
  scene: Cesium.Scene;
  getLabels: (ctx: OverlayLabelContext) => readonly OverlayLabelSpec[];
}): LabelOverlay {
  const { layer, scene, getLabels } = options;
  const nodes = new Map<string, HTMLDivElement>();
  const sizes = new Map<string, { w: number; h: number }>();

  const update = () => {
    const layerRect = layer.getBoundingClientRect();
    const canvasRect = scene.canvas.getBoundingClientRect();
    const originX = canvasRect.left - layerRect.left;
    const originY = canvasRect.top - layerRect.top;
    // 当前比例尺（地面米/像素）与视野经纬度矩形，供 getLabels 做城市颗粒度渐进展示
    // （省会 → 地级 → 县级）与视野外预过滤。SCENE2D 下 computeViewRectangle 恒为 null，
    // 故 2D 走像素逆投影四角；其余模式仍用 computeViewRectangle。
    let metersPerPixel = Number.POSITIVE_INFINITY;
    let viewBounds: OverlayLabelContext['viewRectangle'];
    const cw = canvasRect.width;
    const ch = canvasRect.height;
    if (scene.mode === Cesium.SceneMode.SCENE2D && cw > 0 && ch > 0 && layerRect.width > 0) {
      const midLeft = pixelToCartographic(scene, 0, ch / 2, cw, ch, scratchCartoA);
      const midRight = pixelToCartographic(scene, cw - 1, ch / 2, cw, ch, scratchCartoB);
      const topLeft = pixelToCartographic(scene, 0, 0, cw, ch, scratchCartoC);
      const bottomRight = pixelToCartographic(scene, cw - 1, ch - 1, cw, ch, scratchCartoD);
      if (midLeft && midRight && topLeft && bottomRight) {
        const cosLat = Math.max(0.05, Math.cos((midLeft.latitude + midRight.latitude) / 2));
        const groundWidth =
          Math.abs(midRight.longitude - midLeft.longitude) *
          Cesium.Ellipsoid.WGS84.maximumRadius *
          cosLat;
        metersPerPixel = groundWidth / layerRect.width;
        viewBounds = {
          west: Math.min(topLeft.longitude, bottomRight.longitude),
          east: Math.max(topLeft.longitude, bottomRight.longitude),
          south: Math.min(topLeft.latitude, bottomRight.latitude),
          north: Math.max(topLeft.latitude, bottomRight.latitude),
        };
      }
    } else {
      const viewRect = scene.camera.computeViewRectangle(undefined, scratchRectangle);
      if (viewRect && layerRect.width > 0) {
        const center = Cesium.Rectangle.center(viewRect, scratchCenter);
        const cosLat = Math.max(0.05, Math.cos(center.latitude));
        const groundWidth =
          viewRect.width * Cesium.Ellipsoid.WGS84.maximumRadius * cosLat;
        metersPerPixel = groundWidth / layerRect.width;
        viewBounds = {
          west: viewRect.west,
          south: viewRect.south,
          east: viewRect.east,
          north: viewRect.north,
        };
      }
    }
    const specs = getLabels({
      metersPerPixel,
      viewRectangle: viewBounds,
    });
    const seen = new Set<string>();
    const candidates: {
      spec: OverlayLabelSpec;
      node: HTMLDivElement;
      x: number;
      y: number;
    }[] = [];
    for (const spec of specs) {
      seen.add(spec.key);
      let node = nodes.get(spec.key);
      if (!node) {
        node = document.createElement('div');
        node.className = VARIANT_CLASS[spec.variant];
        node.textContent = spec.text;
        layer.appendChild(node);
        nodes.set(spec.key, node);
        sizes.set(spec.key, { w: node.offsetWidth, h: node.offsetHeight });
      }
      if (spec.color) {
        node.style.color = spec.color;
      }
      const projected = projectToWindow(
        scene,
        spec.lon,
        spec.lat,
        canvasRect.width,
        canvasRect.height,
        scratchWindow,
      );
      const x = projected ? originX + projected.x : Number.NaN;
      const y = projected ? originY + projected.y : Number.NaN;
      if (
        !projected ||
        x < -EDGE_MARGIN_X ||
        x > layerRect.width + EDGE_MARGIN_X ||
        y < -EDGE_MARGIN_Y ||
        y > layerRect.height + EDGE_MARGIN_Y
      ) {
        node.style.display = 'none';
        continue;
      }
      candidates.push({ spec, node, x, y });
    }
    // 贪心放置：优先级数字小者先占位（省会 > 主要城市 > 地震带 > 地级 > 县级）。
    candidates.sort((a, b) => {
      const pa = a.spec.priority ?? DEFAULT_PRIORITY[a.spec.variant];
      const pb = b.spec.priority ?? DEFAULT_PRIORITY[b.spec.variant];
      if (pa !== pb) {
        return pa - pb;
      }
      return a.spec.key < b.spec.key ? -1 : 1;
    });
    const placed: Rect[] = [];
    for (const { spec, node, x, y } of candidates) {
      const size = sizes.get(spec.key) ?? { w: 0, h: 0 };
      const rect = rectFor(spec.variant, x, y, size.w, size.h);
      if (placed.some((other) => intersects(other, rect))) {
        node.style.display = 'none';
        continue;
      }
      placed.push(rect);
      node.style.display = '';
      node.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(
        1,
      )}px) translate(${VARIANT_ANCHOR[spec.variant]})`;
    }
    for (const [key, node] of nodes) {
      if (!seen.has(key)) {
        node.remove();
        nodes.delete(key);
        sizes.delete(key);
      }
    }
  };

  const removePostRender = scene.postRender.addEventListener(update);
  update();

  return {
    refresh: update,
    destroy() {
      removePostRender();
      for (const node of nodes.values()) {
        node.remove();
      }
      nodes.clear();
      sizes.clear();
    },
  };
}
