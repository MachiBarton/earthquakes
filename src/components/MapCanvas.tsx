import * as Cesium from 'cesium';
import { Minus, Plus } from 'lucide-react';
import { useEffect, useRef } from 'react';

import {
  ESRI_BASEMAP_URL,
  ESRI_CREDIT_HTML,
  ESRI_MAXIMUM_LEVEL,
} from '../imagery';
import { BELT_STYLE, beltLabelPoint, beltsForScope, zoneById, type BeltsScope } from '../belts';
import { CITIES, cityVariantOf, variantVisibleAtScale, type CityPlace } from '../cities';
import { corePixelSize, haloPixelSize, magColor, type QuakeCluster } from '../cluster';
import { PLATE_LABELS, PLATE_STYLE, type PlateLine } from '../plates';
import {
  createLabelOverlay,
  pixelToCartographic,
  type LabelOverlay,
  type OverlayLabelContext,
  type OverlayLabelSpec,
} from '../overlayLabels';

/** hover/pick 命中聚合点时上报给父组件的信息（x/y 为地图容器内 CSS 像素坐标）。 */
export interface MapPickInfo {
  cluster: QuakeCluster;
  x: number;
  y: number;
}

interface MapCanvasProps {
  clusters: readonly QuakeCluster[];
  /** 是否叠加地震带示意层（独立 DataSource，与聚合图元互不干扰）。 */
  showBelts: boolean;
  /** 过滤范围（与地震数据同口径）：'all'（含国外）时追加全球地震带。 */
  scope: BeltsScope;
  /** 是否显示城市名注记（HTML 叠加层）。 */
  showCities: boolean;
  /** 地级/县级行政中心快照（渐进展示；空数组时仅手写省会/主要城市）。 */
  cityPlaces: readonly CityPlace[];
  /** 是否显示全球板块图层（边界线 + 板块名注记）。 */
  showPlates: boolean;
  /** 板块边界快照（PB2002；空数组时图层仅无边界线，板块名注记仍可用）。 */
  plateLines: readonly PlateLine[];
  onHoverChange: (info: MapPickInfo | null) => void;
  onPinChange: (info: MapPickInfo | null) => void;
}

/** 相机初始视野：中国范围（任务契约给定 Rectangle）。 */
const CHINA_RECTANGLE_DEG = { west: 73, south: 15, east: 136, north: 54 } as const;

/** 缩放步长比例：每次放大视野宽变 0.7 倍，缩小变 1/0.7 倍。 */
const ZOOM_STEP_RATIO = 0.7;
/** 视野宽钳制（米）：极深缩放曾把 2D 正交相机距离压到 ≤0（ frustum 退化、整屏无渲染），极粗则无意义。 */
const MIN_VIEW_WIDTH_METERS = 20_000;
const MAX_VIEW_WIDTH_METERS = 25_000_000;

/** mousemove 拾取节流（任务契约：50ms 量级，避免每次移动都 pick）。 */
const PICK_THROTTLE_MS = 50;

/** hover 高亮：直径增量与描边色（常态半透明白，保证影像底图上可见）。 */
const HOVER_SIZE_GROW = 4;
const BASE_OUTLINE = Cesium.Color.fromBytes(255, 255, 255, 200);
const HOVER_OUTLINE = Cesium.Color.WHITE;

/** 光晕（次数）填充不透明度：颜色同震级色标，仅透明度降低。 */
const HALO_ALPHA = 0.22;

/** 城市 / 地震带 / 板块名称注记集合（HTML 叠加层，随图层开关、过滤范围与比例尺变化）。 */
function buildLabelSpecs(
  showBelts: boolean,
  showCities: boolean,
  showPlates: boolean,
  scope: BeltsScope,
  cityPlaces: readonly CityPlace[],
  ctx: OverlayLabelContext,
): OverlayLabelSpec[] {
  const specs: OverlayLabelSpec[] = [];
  if (showCities) {
    for (const city of CITIES) {
      specs.push({
        key: `city:${city.name}`,
        text: city.name,
        lon: city.lon,
        lat: city.lat,
        variant: city.kind === 'capital' ? 'city' : 'city-major',
      });
    }
    // 地级/县级注记按比例尺渐进：全国视图只留省会/主要城市，放大后逐级加入。
    // 视野外预过滤：县级约 2800 点，逐帧全量建 DOM 节点再隐藏过于浪费；
    // 视野矩形未知（首帧/相机退化）时不加入快照点，等下一帧有界后再算。
    const bounds = ctx.viewRectangle;
    if (bounds) {
      const marginDeg = 1;
      const westDeg = Cesium.Math.toDegrees(bounds.west) - marginDeg;
      const eastDeg = Cesium.Math.toDegrees(bounds.east) + marginDeg;
      const southDeg = Cesium.Math.toDegrees(bounds.south) - marginDeg;
      const northDeg = Cesium.Math.toDegrees(bounds.north) + marginDeg;
      for (const place of cityPlaces) {
        const variant = cityVariantOf(place.name, place.level);
        if (variant === 'city' || variant === 'city-major') {
          continue; // 手写名单已覆盖（快照脚本亦按名去重，双保险）
        }
        if (!variantVisibleAtScale(variant, ctx.metersPerPixel)) {
          continue;
        }
        if (
          place.lon < westDeg ||
          place.lon > eastDeg ||
          place.lat < southDeg ||
          place.lat > northDeg
        ) {
          continue;
        }
        specs.push({
          key: `city:${place.adcode}`,
          text: place.name,
          lon: place.lon,
          lat: place.lat,
          variant,
        });
      }
    }
  }
  if (showBelts) {
    for (const belt of beltsForScope(scope)) {
      const [lon, lat] = beltLabelPoint(belt);
      specs.push({
        key: `belt:${belt.id}`,
        text: belt.name,
        lon,
        lat,
        variant: 'belt',
        // 带名注记按所在地震区取色；优先级介于省会城市与主要城市之间。
        priority: 1,
        color: zoneById(belt.zone).labelColor,
      });
    }
  }
  if (showPlates) {
    // 板块名放手写代表点（大洋/板块内部开阔处），恒显不随比例尺；
    // 优先级最低（variant 默认 5），与城市/带名重叠时让位。
    for (const plate of PLATE_LABELS) {
      specs.push({
        key: `plate:${plate.name}`,
        text: plate.name,
        lon: plate.lon,
        lat: plate.lat,
        variant: 'plate',
        color: PLATE_STYLE.labelColor,
      });
    }
  }
  return specs;
}

function pickCluster(
  picked: unknown,
  byKey: ReadonlyMap<string, QuakeCluster>,
): { cluster: QuakeCluster; entity: Cesium.Entity } | null {
  const entity = (picked as { id?: Cesium.Entity } | undefined)?.id;
  // 不用 instanceof Cesium.Entity：Vite 开发态预打包会把 Cesium 内部 Entity 类重命名
  // （Entity2），与导出命名空间里的类不是同一引用；场景内仅本组件创建实体，
  // 故以「字符串 id 且存在于聚合表」做归属判定，等价且对打包方式免疫。
  if (!entity || typeof entity.id !== 'string') {
    return null;
  }
  const cluster = byKey.get(entity.id);
  return cluster ? { cluster, entity } : null;
}

/**
 * 地图适配层：Cesium Viewer（SCENE3D 地球 + Esri World Imagery，注记/缩放按场景模式分支）
 * 与聚合点图元的生命周期，
 * 组件卸载时销毁 ScreenSpaceEventHandler 与 viewer。React 状态不进本组件
 * （拾取结果经回调上抛，tooltip/钉住面板由父组件渲染）。
 */
export default function MapCanvas({
  clusters,
  showBelts,
  scope,
  showCities,
  cityPlaces,
  showPlates,
  plateLines,
  onHoverChange,
  onPinChange,
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const labelLayerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const overlayRef = useRef<LabelOverlay | null>(null);
  const beltsSourceRef = useRef<Cesium.CustomDataSource | null>(null);
  const platesSourceRef = useRef<Cesium.CustomDataSource | null>(null);
  const clustersByKeyRef = useRef<ReadonlyMap<string, QuakeCluster>>(new Map());
  const hoveredEntityRef = useRef<Cesium.Entity | null>(null);
  const hoverCallbackRef = useRef(onHoverChange);
  const pinCallbackRef = useRef(onPinChange);
  const showBeltsRef = useRef(showBelts);
  const scopeRef = useRef(scope);
  const showCitiesRef = useRef(showCities);
  const cityPlacesRef = useRef(cityPlaces);
  const showPlatesRef = useRef(showPlates);

  useEffect(() => {
    hoverCallbackRef.current = onHoverChange;
    pinCallbackRef.current = onPinChange;
  }, [onHoverChange, onPinChange]);

  // 挂载一次：创建 Viewer + 底图 + 拾取 handler；卸载时全部销毁。
  useEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return;
    }
    const viewer = new Cesium.Viewer(element, {
      baseLayer: false,
      // 3D 地球（用户要求 m02079「地图改为地球」）；注记/逆投影按 scene.mode 分支兼容其余模式。
      sceneMode: Cesium.SceneMode.SCENE3D,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      baseLayerPicker: false,
      navigationHelpButton: false,
      animation: false,
      timeline: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
      // 空闲不重绘；hover 高亮与图元重建后需手动 scene.requestRender()。
      requestRenderMode: true,
      maximumRenderTimeChange: Infinity,
    });
    viewerRef.current = viewer;
    // 地震带叠加层用独立 DataSource：聚合 effect 的 entities.removeAll() 只清主集合，
    // 两层图元生命周期互不干扰。
    const beltsSource = new Cesium.CustomDataSource('belts');
    beltsSourceRef.current = beltsSource;
    viewer.dataSources.add(beltsSource);
    // 全球板块边界（PB2002）同样独立 DataSource，与地震带/聚合图元互不干扰。
    const platesSource = new Cesium.CustomDataSource('plates');
    platesSourceRef.current = platesSource;
    viewer.dataSources.add(platesSource);
    // 城市/地震带名称注记：HTML 叠加层（不用 Cesium Label，见 overlayLabels.ts 头部说明）。
    const layerElement = labelLayerRef.current;
    if (layerElement) {
      overlayRef.current = createLabelOverlay({
        layer: layerElement,
        scene: viewer.scene,
        getLabels: (ctx) =>
          buildLabelSpecs(
            showBeltsRef.current,
            showCitiesRef.current,
            showPlatesRef.current,
            scopeRef.current,
            cityPlacesRef.current,
            ctx,
          ),
      });
    }
    viewer.resolutionScale = Math.min(window.devicePixelRatio, 1.5) / window.devicePixelRatio;
    viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#0a0a0a');
    viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#262626');
    // 双击默认 zoomTo 选中实体，会与「点击钉住」冲突，移除（与 src/map/viewer.ts 同款处理）。
    viewer.cesiumWidget.screenSpaceEventHandler.removeInputAction(
      Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK,
    );
    viewer.camera.setView({
      destination: Cesium.Rectangle.fromDegrees(
        CHINA_RECTANGLE_DEG.west,
        CHINA_RECTANGLE_DEG.south,
        CHINA_RECTANGLE_DEG.east,
        CHINA_RECTANGLE_DEG.north,
      ),
    });
    // 注：不设置 screenSpaceCameraController 的 min/maxZoomDistance——2D 下控制器对
    // 「距离」的解释与正交 frustum 宽耦合，设置后首帧会把视野钳到全球宽度（实测）；
    // 缩放越界防护改由 zoomBy 的比例钳制承担（滚轮极端深缩放下注记会自动隐藏，不崩溃）。

    // Esri World Imagery 底图（只 import 常量，不 import loadBasemap；署名不得移除）。
    let disposed = false;
    Cesium.ArcGisMapServerImageryProvider.fromUrl(ESRI_BASEMAP_URL, {
      enablePickFeatures: false,
      maximumLevel: ESRI_MAXIMUM_LEVEL,
      credit: new Cesium.Credit(ESRI_CREDIT_HTML, true),
    })
      .then((provider) => {
        if (disposed || viewer.isDestroyed()) {
          return;
        }
        viewer.imageryLayers.addImageryProvider(provider, 0);
        viewer.scene.requestRender();
      })
      .catch(() => {
        if (!disposed) {
          console.warn('影像底图加载失败，请检查网络后刷新（Esri World Imagery）');
        }
      });

    const restoreHovered = () => {
      const entity = hoveredEntityRef.current;
      hoveredEntityRef.current = null;
      if (!entity || !entity.point) {
        return;
      }
      const cluster = clustersByKeyRef.current.get(entity.id);
      entity.point.pixelSize = new Cesium.ConstantProperty(
        cluster ? corePixelSize(cluster.maxMag) : 6,
      );
      entity.point.outlineColor = new Cesium.ConstantProperty(BASE_OUTLINE);
    };
    const applyHover = (entity: Cesium.Entity | null) => {
      if (entity === hoveredEntityRef.current) {
        return;
      }
      restoreHovered();
      if (entity && entity.point) {
        const cluster = clustersByKeyRef.current.get(entity.id);
        entity.point.pixelSize = new Cesium.ConstantProperty(
          (cluster ? corePixelSize(cluster.maxMag) : 6) + HOVER_SIZE_GROW,
        );
        entity.point.outlineColor = new Cesium.ConstantProperty(HOVER_OUTLINE);
        hoveredEntityRef.current = entity;
      }
      viewer.canvas.style.cursor = entity ? 'pointer' : '';
      viewer.scene.requestRender();
    };

    const handler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);
    let lastPickAt = 0;
    // 地震带的宽带/标签也是可拾取图元，会盖在震中点之上；drillPick 逐层取，
    // 第一个命中聚合表的层才算命中（带宽 12px 内的点仍可 hover/点击）。
    const pickClusterAt = (position: Cesium.Cartesian2) => {
      const pickedList = viewer.scene.drillPick(position, 6);
      for (const picked of pickedList) {
        const hit = pickCluster(picked, clustersByKeyRef.current);
        if (hit) {
          return hit;
        }
      }
      return null;
    };
    handler.setInputAction((motion: { endPosition: Cesium.Cartesian2 }) => {
      const now = performance.now();
      if (now - lastPickAt < PICK_THROTTLE_MS) {
        return;
      }
      lastPickAt = now;
      const hit = pickClusterAt(motion.endPosition);
      applyHover(hit?.entity ?? null);
      hoverCallbackRef.current(
        hit ? { cluster: hit.cluster, x: motion.endPosition.x, y: motion.endPosition.y } : null,
      );
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    // 点击聚合点「钉住」详情；点击空白取消（触屏 tap 同样触发 LEFT_CLICK）。
    handler.setInputAction((motion: { position: Cesium.Cartesian2 }) => {
      const hit = pickClusterAt(motion.position);
      pinCallbackRef.current(
        hit ? { cluster: hit.cluster, x: motion.position.x, y: motion.position.y } : null,
      );
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    // 指针离开 canvas（移到面板/钉住面板/图例上）时清除 hover，避免高亮与悬浮框残留。
    const handleLeave = () => {
      applyHover(null);
      hoverCallbackRef.current(null);
    };
    viewer.canvas.addEventListener('mouseleave', handleLeave);

    return () => {
      disposed = true;
      hoveredEntityRef.current = null;
      viewer.canvas.removeEventListener('mouseleave', handleLeave);
      if (!handler.isDestroyed()) {
        handler.destroy();
      }
      overlayRef.current?.destroy();
      overlayRef.current = null;
      if (!viewer.isDestroyed()) {
        viewer.destroy();
      }
      viewerRef.current = null;
      beltsSourceRef.current = null;
      platesSourceRef.current = null;
      clustersByKeyRef.current = new Map();
    };
  }, []);

  // clusters 变化：重建全部聚合图元（光晕 + 核心点，无文字标签）并请求重绘。
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) {
      return;
    }
    // 旧实体已被 removeAll 销毁，hover 高亮状态直接作废。
    hoveredEntityRef.current = null;
    viewer.canvas.style.cursor = '';
    const byKey = new Map<string, QuakeCluster>();
    viewer.entities.removeAll();
    // 深度测试按场景模式分支：3D 保留深度测试（0），椭球体会遮挡地球背面的震中点，
    // 修复「含国外」时背面标记透过球体显示的问题；2D/CV 关闭深度测试（Infinity），
    // 避免与地面共面的点被深度缓冲裁掉。本组件不做模式 morph，effect 内取一次即可。
    const pointDepthTestDistance =
      viewer.scene.mode === Cesium.SceneMode.SCENE3D ? 0 : Number.POSITIVE_INFINITY;
    for (const cluster of clusters) {
      byKey.set(cluster.key, cluster);
      const position = Cesium.Cartesian3.fromDegrees(cluster.lon, cluster.lat);
      const color = Cesium.Color.fromCssColorString(magColor(cluster.maxMag));
      // 光晕（半透明外圈）：直径编码发生次数，取代旧版「N 次」文字标注；
      // id 带 halo: 前缀、不在聚合表内，drillPick 逐层拾取时自然跳过。
      viewer.entities.add({
        id: `halo:${cluster.key}`,
        position,
        point: {
          pixelSize: haloPixelSize(cluster.count),
          color: color.withAlpha(HALO_ALPHA),
          disableDepthTestDistance: pointDepthTestDistance,
        },
      });
      // 核心点：颜色 = 震级档、直径随档轻度同步；Entity id = location 完整字符串，
      // pick 后经 id 关联回聚合数据。
      viewer.entities.add({
        id: cluster.key,
        position,
        point: {
          pixelSize: corePixelSize(cluster.maxMag),
          // PointGraphics 的填充色选项名是 color（fillColor 属于 Label/Polygon）。
          color,
          outlineColor: BASE_OUTLINE,
          outlineWidth: 1.5,
          disableDepthTestDistance: pointDepthTestDistance,
        },
      });
    }
    clustersByKeyRef.current = byKey;
    viewer.scene.requestRender();
  }, [clusters]);

  // 图层开关 / 过滤范围：同步给注记层的 getLabels 读取，并立即重算一次注记（不依赖重绘）。
  useEffect(() => {
    showBeltsRef.current = showBelts;
    scopeRef.current = scope;
    showCitiesRef.current = showCities;
    showPlatesRef.current = showPlates;
    overlayRef.current?.refresh();
  }, [showBelts, showCities, showPlates, scope]);

  // 城市快照异步到达：同步 ref 并重算注记（比例尺渐进的地级/县级集合随之可用）。
  useEffect(() => {
    cityPlacesRef.current = cityPlaces;
    overlayRef.current?.refresh();
  }, [cityPlaces]);

  // 地震带示意层：半透明宽带 + 虚线中心线（名称走 HTML 注记层）；开关/范围变化时整体重建。
  useEffect(() => {
    const viewer = viewerRef.current;
    const source = beltsSourceRef.current;
    if (!viewer || viewer.isDestroyed() || !source) {
      return;
    }
    source.entities.removeAll();
    if (showBelts) {
      for (const belt of beltsForScope(scope)) {
        const zone = zoneById(belt.zone);
        const flat: number[] = [];
        for (const [lon, lat] of belt.points) {
          flat.push(lon, lat);
        }
        const positions = Cesium.Cartesian3.fromDegreesArray(flat);
        source.entities.add({
          id: `belt:${belt.id}:band`,
          polyline: {
            positions,
            width: BELT_STYLE.bandWidthPx,
            material: new Cesium.ColorMaterialProperty(
              Cesium.Color.fromCssColorString(zone.bandColor),
            ),
          },
        });
        source.entities.add({
          id: `belt:${belt.id}:dash`,
          polyline: {
            positions,
            width: BELT_STYLE.dashWidthPx,
            material: new Cesium.PolylineDashMaterialProperty({
              color: Cesium.Color.fromCssColorString(zone.dashColor),
              dashLength: BELT_STYLE.dashLengthPx,
            }),
          },
        });
      }
    }
    viewer.scene.requestRender();
  }, [showBelts, scope]);

  // 全球板块边界层（PB2002 快照）：细白线，与彩色地震带视觉区分；开关/数据变化时整体重建。
  // 折线跨 180° 时相邻点在椭球面本就相邻，3D 下无需经度展开（与全球地震带同理）。
  useEffect(() => {
    const viewer = viewerRef.current;
    const source = platesSourceRef.current;
    if (!viewer || viewer.isDestroyed() || !source) {
      return;
    }
    source.entities.removeAll();
    if (showPlates) {
      plateLines.forEach((line, index) => {
        const flat: number[] = [];
        for (const [lon, lat] of line.points) {
          flat.push(lon, lat);
        }
        source.entities.add({
          // id 前缀 plate: 不在聚合表内，drillPick 逐层拾取时自然跳过（同 halo/belt）。
          id: `plate:${index}:${line.name}`,
          polyline: {
            positions: Cesium.Cartesian3.fromDegreesArray(flat),
            width: PLATE_STYLE.lineWidthPx,
            material: new Cesium.ColorMaterialProperty(
              Cesium.Color.fromCssColorString(PLATE_STYLE.lineColor),
            ),
          },
        });
      });
    }
    viewer.scene.requestRender();
  }, [showPlates, plateLines]);

  // 自制缩放（触屏也可用）：按当前视野宽的比例步进并钳制。
  // 钳制式比例缩放：读当前视野地面宽 → 0.7 倍步进 → 画布中心逆投影 → setView 重建矩形。
  // 不用加性 zoomIn：2D 下曾把相机到投影面距离压到 ≤0 致正交 frustum 退化全黑（历史 bug）。
  // 视野宽来源按模式分支：3D 用画布左中/右中 pickEllipsoid 两点地面距离；
  // 2D 用正交 frustum 的 right-left（投影面米宽）。
  const zoomBy = (direction: 1 | -1) => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) {
      return;
    }
    const scene = viewer.scene;
    const camera = viewer.camera;
    const restoreHome = () => {
      camera.setView({
        destination: Cesium.Rectangle.fromDegrees(
          CHINA_RECTANGLE_DEG.west,
          CHINA_RECTANGLE_DEG.south,
          CHINA_RECTANGLE_DEG.east,
          CHINA_RECTANGLE_DEG.north,
        ),
      });
      scene.requestRender();
    };
    const canvasWidth = Math.max(1, viewer.canvas.clientWidth);
    const canvasHeight = Math.max(1, viewer.canvas.clientHeight);
    const scene3D = scene.mode === Cesium.SceneMode.SCENE3D;
    let widthMeters: number;
    if (scene3D) {
      const leftPos = camera.pickEllipsoid(
        new Cesium.Cartesian2(0, canvasHeight / 2),
        Cesium.Ellipsoid.WGS84,
        new Cesium.Cartesian3(),
      );
      const rightPos = camera.pickEllipsoid(
        new Cesium.Cartesian2(canvasWidth, canvasHeight / 2),
        Cesium.Ellipsoid.WGS84,
        new Cesium.Cartesian3(),
      );
      if (!leftPos || !rightPos) {
        restoreHome(); // 地平线/太空视图逆投影不可用：先恢复家乡视野
        return;
      }
      widthMeters = Cesium.Cartesian3.distance(leftPos, rightPos);
    } else {
      const frustum = camera.frustum as Cesium.OrthographicOffCenterFrustum;
      const right = frustum.right;
      const left = frustum.left;
      if (
        typeof right !== 'number' ||
        typeof left !== 'number' ||
        !Number.isFinite(right - left) ||
        right - left <= 0
      ) {
        restoreHome(); // frustum 退化：任何缩放先恢复家乡视野
        return;
      }
      widthMeters = right - left;
    }
    if (!Number.isFinite(widthMeters) || widthMeters <= 0) {
      restoreHome();
      return;
    }
    const targetWidth = Cesium.Math.clamp(
      widthMeters * (direction > 0 ? ZOOM_STEP_RATIO : 1 / ZOOM_STEP_RATIO),
      MIN_VIEW_WIDTH_METERS,
      MAX_VIEW_WIDTH_METERS,
    );
    if (Math.abs(targetWidth - widthMeters) < 1) {
      return; // 已在钳制边界
    }
    // 视野中心取画布中心像素的逆投影（2D 下 camera.position 分量不是投影坐标，
    // 直接 unproject 会得到垃圾纬度，曾把视野矩形放大到全球）。
    const center = pixelToCartographic(
      scene,
      canvasWidth / 2,
      canvasHeight / 2,
      canvasWidth,
      canvasHeight,
      new Cesium.Cartographic(),
    );
    if (!center) {
      restoreHome();
      return;
    }
    const radius = Cesium.Ellipsoid.WGS84.maximumRadius;
    // 3D 矩形跨度按地面米换算（经度跨度含 cos 纬度因子）；2D 等距圆柱投影面东向米 =
    // 经度弧度 × R，无 cos 因子。纵横比跟画布走。
    const cosLat = scene3D ? Math.max(0.05, Math.cos(center.latitude)) : 1;
    const widthRad = targetWidth / (radius * cosLat);
    const heightRad = (targetWidth * (canvasHeight / canvasWidth)) / radius;
    camera.setView({
      destination: new Cesium.Rectangle(
        center.longitude - widthRad / 2,
        center.latitude - heightRad / 2,
        center.longitude + widthRad / 2,
        center.latitude + heightRad / 2,
      ),
    });
    scene.requestRender();
  };

  return (
    <div className="map-canvas">
      <div className="map-canvas-cesium" ref={containerRef} />
      <div className="map-label-layer" ref={labelLayerRef} aria-hidden="true" />
      <div className="map-zoom" role="group" aria-label="地图缩放">
        <button type="button" aria-label="放大地图" title="放大" onClick={() => zoomBy(1)}>
          <Plus size={16} aria-hidden="true" />
        </button>
        <button type="button" aria-label="缩小地图" title="缩小" onClick={() => zoomBy(-1)}>
          <Minus size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
