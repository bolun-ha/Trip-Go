/**
 * 高德 POI 搜索服务
 * 通过高德地图 POI 搜索获取景点图片和详细信息
 */

// 内存缓存
const imageCache = new Map<string, string>();
const detailsCache = new Map<string, PlaceDetails>();
const pendingRequests = new Map<string, Promise<string | null>>();
const pendingDetailsRequests = new Map<string, Promise<PlaceDetails | null>>();

const API_KEY = 'ea8a3819398b2b0bf019713046d0e222';

/** 景点详细信息 */
export interface PlaceDetails {
  name: string;
  address: string;
  category: string;
  rating: number;
  coordinates?: { lat: number; lng: number };
  imageUrl?: string;
  openingHours?: string;
}

/**
 * 搜索景点详细信息（地址、坐标、类别、评分、图片）
 * 结果会被缓存，重复调用同一景点直接返回缓存
 */
export async function searchPlaceDetails(
  placeName: string,
  city: string = '',
  signal?: AbortSignal
): Promise<PlaceDetails | null> {
  const cacheKey = `${city}:${placeName}`;

  const cached = detailsCache.get(cacheKey);
  if (cached) return cached;

  const pending = pendingDetailsRequests.get(cacheKey);
  if (pending) return pending;

  const request = searchPOIDetails(placeName, city, signal);
  pendingDetailsRequests.set(cacheKey, request);

  try {
    const result = await request;
    if (result) {
      detailsCache.set(cacheKey, result);
    }
    return result;
  } finally {
    pendingDetailsRequests.delete(cacheKey);
  }
}

/**
 * 搜索 POI 并提取详细信息
 */
async function searchPOIDetails(
  placeName: string,
  city: string,
  signal?: AbortSignal
): Promise<PlaceDetails | null> {
  try {
    const keywords = encodeURIComponent(placeName);
    const cityParam = city ? `&city=${encodeURIComponent(city)}` : '';

    const response = await fetch(
      `https://restapi.amap.com/v3/place/text?keywords=${keywords}${cityParam}&key=${API_KEY}&offset=1&extensions=all`,
      { signal }
    );

    if (!response.ok) return null;

    const data = await response.json();
    if (data.status !== '1' || !data.pois?.length) return null;

    const poi = data.pois[0];

    // 提取坐标
    let coordinates: { lat: number; lng: number } | undefined;
    if (poi.location) {
      const [lng, lat] = poi.location.split(',').map(Number);
      if (!isNaN(lat) && !isNaN(lng)) {
        coordinates = { lat, lng };
      }
    }

    // 提取图片
    let imageUrl: string | undefined;
    if (poi.photos?.length) {
      imageUrl = poi.photos[0].url?.replace('http://', 'https://');
    }

    // 提取营业时间
    let openingHours: string | undefined;
    if (poi.biz_ext?.opentime) {
      openingHours = poi.biz_ext.opentime.replace(';', ', ');
    }

    // 将高德 type 转成我们的 category
    const category = mapGaodeType(poi.type || '');

    return {
      name: poi.name || placeName,
      address: poi.address || '',
      category,
      rating: poi.biz_ext?.rating ? parseFloat(poi.biz_ext.rating) || 0 : 0,
      coordinates,
      imageUrl,
      openingHours,
    };
  } catch (e: any) {
    if (e.name === 'AbortError') return null;
    console.error('POI detail search failed:', placeName, e);
    return null;
  }
}

/**
 * 将高德 POI type 映射到我们的分类
 */
function mapGaodeType(gaodeType: string): string {
  const type = gaodeType.toLowerCase();
  if (type.includes('风景') || type.includes('公园') || type.includes('自然') || type.includes('山') || type.includes('湖') || type.includes('海滩')) return 'Scenic';
  if (type.includes('博物馆') || type.includes('历史') || type.includes('古迹') || type.includes('纪念馆') || type.includes('教堂') || type.includes('寺庙')) return 'Culture';
  if (type.includes('餐饮') || type.includes('餐厅') || type.includes('美食') || type.includes('咖啡') || type.includes('茶馆')) return 'Food';
  if (type.includes('购物') || type.includes('商场') || type.includes('商业街') || type.includes('市场')) return 'Shopping';
  if (type.includes('娱乐') || type.includes('游乐') || type.includes('电影院') || type.includes('剧场') || type.includes('演出')) return 'Entertainment';
  if (type.includes('休闲') || type.includes('度假') || type.includes('酒店') || type.includes('住宿') || type.includes('民宿')) return 'Relaxation';
  return 'Scenic';
}

/**
 * 获取景点图片 URL
 */
export async function getPlaceImage(
  placeName: string,
  city: string = '',
  signal?: AbortSignal
): Promise<string | null> {
  const cacheKey = `${city}:${placeName}`;

  const cached = imageCache.get(cacheKey);
  if (cached) return cached;

  const pending = pendingRequests.get(cacheKey);
  if (pending) return pending;

  const request = searchPOIForImage(placeName, city, signal);
  pendingRequests.set(cacheKey, request);

  try {
    const url = await request;
    if (url) {
      imageCache.set(cacheKey, url);
    }
    return url;
  } finally {
    pendingRequests.delete(cacheKey);
  }
}

/**
 * 搜索 POI 并取第一张照片
 */
async function searchPOIForImage(
  placeName: string,
  city: string,
  signal?: AbortSignal
): Promise<string | null> {
  try {
    const keywords = encodeURIComponent(placeName);
    const cityParam = city ? `&city=${encodeURIComponent(city)}` : '';

    const response = await fetch(
      `https://restapi.amap.com/v3/place/text?keywords=${keywords}${cityParam}&key=${API_KEY}&offset=1&extensions=all`,
      { signal }
    );

    if (!response.ok) return null;

    const data = await response.json();
    if (data.status !== '1' || !data.pois?.length) return null;

    const photos = data.pois[0].photos;
    if (!photos?.length) return null;

    let photoUrl = photos[0].url;
    if (photoUrl) {
      photoUrl = photoUrl.replace('http://', 'https://');
    }
    return photoUrl || null;
  } catch (e: any) {
    if (e.name === 'AbortError') return null;
    console.error('POI image search failed:', placeName, e);
    return null;
  }
}

/**
 * 批量预加载图片
 */
export function prefetchPlaceImages(
  places: { name: string; address?: string }[],
  city: string
): void {
  places.forEach(p => {
    getPlaceImage(p.name, city).catch(() => {});
  });
}
