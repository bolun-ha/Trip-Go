/**
 * 地理位置服务
 * 提供浏览器定位、地址解析等功能
 */

export interface LocationInfo {
  latitude: number;
  longitude: number;
  accuracy?: number;
  address?: string;
  city?: string;
  district?: string;
  province?: string;
}

// 存储 key
const LOCATION_STORAGE_KEY = 'user_current_location';

/**
 * 获取当前位置
 */
export async function getCurrentLocation(): Promise<LocationInfo> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('浏览器不支持地理位置'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        
        // 尝试通过高德地图 API 反向地理编码
        let address = '';
        let city = '';
        let district = '';
        let province = '';
        
        try {
          const apiKey = (import.meta as any).env.VITE_AMAP_API_KEY || 'ea8a3819398b2b0bf019713046d0e222';
          const response = await fetch(
            `https://restapi.amap.com/v3/geocode/regeo?location=${longitude},${latitude}&key=${apiKey}`
          );
          const data = await response.json();
          
          if (data.status === '1' && data.regeocode) {
            address = data.regeocode.formatted_address || '';
            const addressComponent = data.regeocode.addressComponent;
            if (addressComponent) {
              city = addressComponent.city || addressComponent.province || '';
              district = addressComponent.district || '';
              province = addressComponent.province || '';
            }
          }
        } catch (err) {
          console.error('Geocoding failed:', err);
        }

        resolve({
          latitude,
          longitude,
          accuracy,
          address,
          city,
          district,
          province
        });
      },
      (error) => {
        reject(new Error(error.message));
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000 // 5 分钟缓存
      }
    );
  });
}

/**
 * 获取缓存的位置
 */
export function getCachedLocation(): LocationInfo | null {
  try {
    const cached = localStorage.getItem(LOCATION_STORAGE_KEY);
    if (cached) {
      const data = JSON.parse(cached);
      // 检查缓存是否过期（5 分钟）
      const now = Date.now();
      if (data.timestamp && now - data.timestamp < 300000) {
        return data;
      }
    }
  } catch (err) {
    console.error('Failed to get cached location:', err);
  }
  return null;
}

/**
 * 缓存位置信息
 */
export function cacheLocation(location: LocationInfo): void {
  try {
    const data = {
      ...location,
      timestamp: Date.now()
    };
    localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(data));
  } catch (err) {
    console.error('Failed to cache location:', err);
  }
}

/**
 * 清除缓存的位置
 */
export function clearCachedLocation(): void {
  localStorage.removeItem(LOCATION_STORAGE_KEY);
}

/**
 * 检查位置权限
 */
export async function checkPermission(): Promise<'granted' | 'denied' | 'prompt'> {
  if (!navigator.permissions) {
    return 'prompt';
  }
  
  try {
    const result = await navigator.permissions.query({ name: 'geolocation' });
    return result.state as 'granted' | 'denied' | 'prompt';
  } catch (err) {
    return 'prompt';
  }
}
