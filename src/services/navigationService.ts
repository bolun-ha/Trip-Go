/**
 * 高德地图导航服务
 * 统一处理跨平台唤起逻辑
 *
 * 关键约束：iOS Safari 需要在用户手势同步上下文中触发自定义协议跳转，
 * 不能等异步操作（如 getCurrentPosition）回调后再跳转，否则会被拦截。
 */

interface NavParams {
  dname: string;
  dlat?: number;
  dlon?: number;
  sname?: string;
  slat?: number;
  slon?: number;
}

/**
 * 检测 iOS
 */
const isIOS = (): boolean => {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
};

/**
 * 构建 amapuri 协议参数（dev=1 = WGS84 坐标，高德自动转 GCJ-02）
 */
const buildAmapuriUrl = (params: NavParams): string => {
  const parts: string[] = ['amapuri://route/plan/?sourceApplication=tripplanner'];

  if (params.slat !== undefined && params.slon !== undefined && params.sname) {
    parts.push(`&slat=${params.slat}&slon=${params.slon}&sname=${params.sname}`);
  }

  parts.push(`&dlat=${params.dlat || 0}&dlon=${params.dlon || 0}`);
  parts.push(`&dname=${params.dname}`);
  parts.push('&dev=1&t=0');

  return parts.join('');
};

/**
 * 构建 Android Intent URL
 */
const buildAndroidIntentUrl = (params: NavParams): string => {
  const amapuri = buildAmapuriUrl(params);
  const intentPath = amapuri.replace('amapuri://', '');
  return `intent://${intentPath}#Intent;scheme=amapuri;action=android.intent.action.VIEW;end`;
};

/**
 * 唤起高德地图导航
 *
 * 规则：
 * - 立即同步跳转（满足 iOS Safari 手势上下文要求）
 * - 不等待定位：高德 App 打开后自带定位能力
 * - 定位作为可选项，仅用于丰富起点信息，不阻塞跳转
 * - Android Chrome 使用 Intent URL 绕过自定义协议拦截
 * - dev=1：坐标视为 WGS84，高德自动转 GCJ-02
 *
 * @param place 目的地（Place 对象或名称字符串）
 * @param coords 目的地坐标（可选）
 */
export const openGaodeNavigation = (
  place: { name: string; coordinates?: { lat: number; lng: number } } | string,
  coords?: { lat: number; lng: number }
): void => {
  const dname = encodeURIComponent(typeof place === 'string' ? place : place.name);
  const dlat = typeof place === 'string' ? (coords?.lat || 0) : (place.coordinates?.lat || 0);
  const dlon = typeof place === 'string' ? (coords?.lng || 0) : (place.coordinates?.lng || 0);

  const params: NavParams = { dname, dlat, dlon };

  // Android（含 Chrome、三星浏览器等）→ Intent URL（系统级机制）
  // iOS/其他 → amapuri://
  const isAndroid = /android/i.test(navigator.userAgent);
  const url = isAndroid ? buildAndroidIntentUrl(params) : buildAmapuriUrl(params);

  // 同步跳转：立即触发，不等待任何异步操作
  window.location.href = url;

  // 尝试获取位置作为补充（不阻塞，失败不影响跳转）
  // 注意：iOS 上定位回调触发时页面已跳转，此部分主要服务 Android
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const enhancedUrl = isAndroid
          ? buildAndroidIntentUrl({ ...params, slat: pos.coords.latitude, slon: pos.coords.longitude, sname: encodeURIComponent('我的位置') })
          : buildAmapuriUrl({ ...params, slat: pos.coords.latitude, slon: pos.coords.longitude, sname: encodeURIComponent('我的位置') });
        window.location.href = enhancedUrl;
      },
      () => {},
      { enableHighAccuracy: false, timeout: 3000 }
    );
  }
};
