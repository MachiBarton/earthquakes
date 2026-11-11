import { createRoot } from 'react-dom/client';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import './quake.css';
import QuakeApp from './QuakeApp';

// Cesium worker/静态资源基址：按文档基址解析为绝对 URL，
// dev（根路径）与 GitHub Pages（/earthquakes/ 子路径）部署通用。
(window as unknown as { CESIUM_BASE_URL: string }).CESIUM_BASE_URL = new URL(
  'cesium/',
  document.baseURI,
).href;

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root container #root is missing');
}

// StrictMode 有意不启用：Cesium Viewer 生命周期是命令式单实例，
// effect 双调用只会带来重复创建 canvas 的风险。
createRoot(container).render(<QuakeApp />);
