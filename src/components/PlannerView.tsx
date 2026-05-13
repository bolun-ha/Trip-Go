import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Clock, 
  MapPin, 
  Star, 
  RefreshCcw, 
  ChevronRight,
  Navigation,
  X,
  Edit2,
  Train,
  Car,
  Footprints,
  Share2,
  Copy,
  Check,
  QrCode,
  Image as ImageIcon,
  Download,
  Loader2,
  GripVertical,
  Save
} from 'lucide-react';
import { toPng } from 'html-to-image';

// 高德静态地图组件
const AMapStatic = ({ name, address, coordinates }: { 
  name: string; 
  address: string; 
  coordinates?: { lat: number; lng: number };
}) => {
  const apiKey = (import.meta as any).env.VITE_AMAP_REST_API_KEY || (import.meta as any).env.VITE_AMAP_API_KEY || 'c307f0eba5e63f4c4dfba0b9c4838655';
  
  // 如果有坐标，直接使用；否则使用默认坐标（北京）
  const lng = coordinates?.lng || 116.4074;
  const lat = coordinates?.lat || 39.9042;
  
  return (
    <div className="w-full h-full relative" style={{ height: '100%', minHeight: '256px' }}>
      <img
        src={`https://restapi.amap.com/v3/staticmap?location=${lng},${lat}&zoom=15&size=750*300&markers=mid,,A:${lng},${lat}&key=${apiKey}`}
        alt={`${name} 地图`}
        className="w-full h-full object-cover"
        onError={(e) => {
          const target = e.target as HTMLImageElement;
          target.style.display = 'none';
          const parent = target.parentElement;
          if (parent) {
            parent.innerHTML = `
              <div class="w-full h-full flex flex-col items-center justify-center text-gray-400 bg-gray-100">
                <svg class="w-10 h-10 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0121 18.382V7.618a1 1 0 01-.553-.894L15 7m0 13V7"></path>
                </svg>
                <span class="text-sm">地图加载失败</span>
              </div>
            `;
          }
        }}
      />
    </div>
  );
};

/** 天级路线地图：使用高德 JS API 交互地图连点成线 */
const AMapRouteStatic = ({ places }: { places: Place[] }) => {
  const apiKey = (import.meta as any).env.VITE_AMAP_API_KEY || 'c307f0eba5e63f4c4dfba0b9c4838655';
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  // 只取有坐标的景点
  const validPlaces = React.useMemo(
    () => places.filter((p): p is Place & { coordinates: NonNullable<Place['coordinates']> } =>
      p.coordinates?.lat !== undefined && p.coordinates?.lng !== undefined
    ),
    [places]
  );

  // 加载 AMap JS API
  useEffect(() => {
    if (typeof window !== 'undefined' && !(window as any).AMap && !error) {
      // 设置安全密钥（2021年12月后申请 key 必须）
      (window as any)._AMapSecurityConfig = {
        securityJsCode: (import.meta as any).env.VITE_AMAP_SECURITY_CODE || '0be85c12000dea13aec1b74282135003',
      };
      const script = document.createElement('script');
      script.src = `https://webapi.amap.com/maps?v=2.0&key=${apiKey}`;
      script.async = true;
      script.onload = () => setLoaded(true);
      script.onerror = () => setError(true);
      document.head.appendChild(script);
      return () => {
        // 清理 script 标签（如果还没加载完成）
        if (!(window as any).AMap) {
          document.head.removeChild(script);
        }
      };
    } else if ((window as any).AMap) {
      setLoaded(true);
    }
  }, [apiKey, error]);

  // 渲染地图
  useEffect(() => {
    if (!loaded || !mapRef.current || validPlaces.length === 0) return;

    const AMap = (window as any).AMap;

    // 清理旧地图实例
    if (mapInstanceRef.current) {
      mapInstanceRef.current.destroy();
      mapInstanceRef.current = null;
    }

    // 贝塞尔曲线中间点生成
    const getBezierSegments = (pts: number[][]): number[][] => {
      const result: number[][] = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const mx = (p1[0] + p2[0]) / 2;
        const my = (p1[1] + p2[1]) / 2;
        const dx = p2[0] - p1[0];
        const dy = p2[1] - p1[1];
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.001;
        // 控制点：沿垂直方向偏移距离的 12%
        const offset = dist * 0.12;
        const nx = -dy / dist; // 垂直单位向量
        const ny = dx / dist;
        const cx = mx + nx * offset;
        const cy = my + ny * offset;
        const steps = 12;
        for (let t = 0; t <= steps; t++) {
          // 跳过每个分段的首个点（与上一个段的最后一个点重合），第一段保留
          if (i > 0 && t === 0) continue;
          const tt = t / steps;
          const t1 = 1 - tt;
          const x = t1 * t1 * p1[0] + 2 * tt * t1 * cx + tt * tt * p2[0];
          const y = t1 * t1 * p1[1] + 2 * tt * t1 * cy + tt * tt * p2[1];
          result.push([x, y]);
        }
      }
      return result;
    };

    // 构建坐标点数组
    const coords = validPlaces.map(p => [p.coordinates.lng, p.coordinates.lat]);

    // 创建地图
    const map = new AMap.Map(mapRef.current, {
      center: coords[0],
      zoom: 13,
      viewMode: '2D',
      resizeEnable: true,
    });
    mapInstanceRef.current = map;

    // ── 1. 贝塞尔曲线折线 ──
    const curvePoints = getBezierSegments(coords);

    // 发光底层：粗 + 半透明
    const glowPolyline = new AMap.Polyline({
      path: curvePoints,
      strokeColor: '#3B82F6',
      strokeWeight: 6,
      strokeOpacity: 0.12,
      lineJoin: 'round',
      lineCap: 'round',
    });
    map.add(glowPolyline);

    // 主线：细 + 实色
    const mainPolyline = new AMap.Polyline({
      path: curvePoints,
      strokeColor: '#3B82F6',
      strokeWeight: 2,
      strokeOpacity: 0.85,
      lineJoin: 'round',
      lineCap: 'round',
      showDir: true,
    });
    map.add(mainPolyline);

    // ── 2. 自定义徽章标记（默认只显示字母圆点，点击展开名称） ──
    const markers = validPlaces.map((p, i) => {
      const label = String.fromCharCode(65 + i);
      var isExpanded = false;

      // 折叠态：带字母的圆点
      const dot = document.createElement('div');
      dot.style.cssText =
        'width:22px;height:22px;border-radius:50%;background:#3B82F6;' +
        'color:#fff;display:flex;align-items:center;justify-content:center;' +
        'font-weight:700;font-size:11px;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,0.2);' +
        'line-height:22px;user-select:none;';
      dot.textContent = label;

      // 展开态：圆点 + 名称
      const badge = document.createElement('div');
      badge.style.cssText =
        'display:flex;align-items:center;gap:5px;background:#fff;border-radius:8px;' +
        'padding:3px 10px 3px 3px;box-shadow:0 2px 8px rgba(0,0,0,0.15);' +
        'font-size:12px;white-space:nowrap;cursor:pointer;user-select:none;';
      badge.innerHTML =
        `<div style="width:22px;height:22px;border-radius:50%;background:#3B82F6;` +
        `color:#fff;display:flex;align-items:center;justify-content:center;` +
        `font-weight:700;font-size:11px;flex-shrink:0;line-height:22px;">${label}</div>` +
        `<span style="color:#374151;font-weight:500;">${p.name}</span>`;

      const marker = new AMap.Marker({
        position: [p.coordinates.lng, p.coordinates.lat],
        content: dot,
        offset: new AMap.Pixel(0, -11),
        zIndex: 100,
      });

      // 直接在内容元素上绑定点击，更可靠
      const toggle = function () {
        isExpanded = !isExpanded;
        marker.setContent(isExpanded ? badge : dot);
        marker.setzIndex(isExpanded ? 200 : 100);
      };
      dot.onclick = toggle;
      badge.onclick = toggle;

      map.add(marker);
      return marker;
    });

    // ── 3. 起点 / 终点小圆点 ──
    if (validPlaces.length >= 2) {
      const startDot = new AMap.CircleMarker({
        center: coords[0],
        radius: 5,
        strokeColor: '#10B981',
        strokeWeight: 1,
        strokeOpacity: 0.4,
        fillColor: '#10B981',
        fillOpacity: 1,
        zIndex: 101,
      });
      map.add(startDot);

      const endDot = new AMap.CircleMarker({
        center: coords[coords.length - 1],
        radius: 5,
        strokeColor: '#EF4444',
        strokeWeight: 1,
        strokeOpacity: 0.4,
        fillColor: '#EF4444',
        fillOpacity: 1,
        zIndex: 101,
      });
      map.add(endDot);
    }

    // 自适应显示所有标记
    map.setFitView(
      validPlaces.length > 5 ? markers.slice(0, 10) : markers,
      false,
      [40, 40, 40, 40]
    );

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.destroy();
        mapInstanceRef.current = null;
      }
    };
  }, [loaded, validPlaces]);

  if (validPlaces.length < 2) {
    if (validPlaces.length === 1) {
      return <AMapStatic name={validPlaces[0].name} address="" coordinates={validPlaces[0].coordinates} />;
    }
    return null;
  }

  return (
    <div className="w-full overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
      <div className="relative" style={{ height: '220px' }}>
        {/* 地图容器 */}
        <div ref={mapRef} className="w-full h-full" />
        <style>{`.amap-logo, .amap-copyright { display: none !important; }`}</style>

        {/* 加载中 */}
        {!loaded && !error && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
            <div className="flex flex-col items-center gap-2">
              <Loader2 size={24} className="animate-spin text-blue-600" />
              <span className="text-xs text-gray-400">加载地图中...</span>
            </div>
          </div>
        )}

        {/* 加载失败 */}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-50 rounded-2xl">
            <div className="text-center text-gray-400">
              <div className="text-lg mb-1">🗺️</div>
              <div className="text-xs">地图加载失败</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
import { Trip, DayPlan, Place, TransportSuggestion } from '../types';
import { getAlternatives, getAreaRecommendations, generatePlaceDescription, generateTransportSuggestion } from '../services/deepSeekService';
import { rescheduleDay } from '../services/rescheduleService';
import { openGaodeNavigation } from '../services/navigationService';
import { PlaceImage } from './PlaceImage';
import { searchPlaceDetails } from '../services/placeImageService';

const ShareModal = ({ trip, onClose }: { trip: Trip; onClose: () => void }) => {
  const [copied, setCopied] = useState(false);
  const [generatingPoster, setGeneratingPoster] = useState(false);
  const posterRef = useRef<HTMLDivElement>(null);
  const shareUrl = window.location.href;

  const handleCopy = () => {
    navigator.clipboard.writeText(`我的 ${trip.destination} 旅行计划：\n${shareUrl}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `我的 ${trip.destination} 旅行计划`,
          text: `快来看看我用 Goni AI 生成的 ${trip.destination} 行程！`,
          url: shareUrl,
        });
      } catch (err) {
        console.error('Share failed:', err);
      }
    }
  };

  const handleDownloadPoster = async () => {
    if (!posterRef.current || generatingPoster) return;
    setGeneratingPoster(true);
    try {
      // Small delay to ensure any images/styles are ready
      await new Promise(r => setTimeout(r, 600));
      
      const dataUrl = await toPng(posterRef.current, {
        quality: 0.95,
        backgroundColor: '#F4F4F7',
        pixelRatio: 2,
      });

      const link = document.createElement('a');
      link.download = `${trip.destination}_旅行计划.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Poster generation failed:', err);
      alert('图片生成失败，请重试');
    } finally {
      setGeneratingPoster(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-6">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
      />
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="w-full max-w-sm bg-white rounded-3xl shadow-2xl relative z-20 p-8"
      >
        <div className="flex justify-between items-center mb-6 text-[#1A1A1A]">
          <h3 className="text-xl font-bold">分享行程</h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-50 rounded-full text-gray-400">
            <X size={20} />
          </button>
        </div>

        <div className="flex flex-col items-center mb-8">
          <div className="w-40 h-40 bg-[#F9FAFB] rounded-2xl flex flex-col items-center justify-center border border-[#F3F4F6] mb-4">
            <QrCode size={64} className="text-[#E5E7EB] mb-2" />
            <span className="text-[10px] text-[#9CA3AF] font-bold uppercase tracking-widest">扫码查看</span>
          </div>
          <p className="text-sm font-bold text-[#1A1A1A]">{trip.destination} {trip.duration}日游</p>
          <p className="text-xs text-[#9CA3AF] mt-1">生成的唯一分享链接</p>
        </div>

        <div className="space-y-3">
          <button 
            onClick={handleDownloadPoster}
            disabled={generatingPoster}
            className="w-full flex items-center justify-between p-4 bg-[#F9FAFB] rounded-xl hover:bg-[#F3F4F6] transition-colors text-[#1A1A1A]"
          >
            <div className="flex items-center gap-3">
              <ImageIcon size={18} className="text-[#2563EB]" />
              <span className="text-sm font-bold">生成分享长图</span>
            </div>
            {generatingPoster ? <Loader2 size={18} className="animate-spin text-[#2563EB]" /> : <Download size={18} className="text-[#D1D5DB]" />}
          </button>

          <button 
            onClick={handleCopy}
            className="w-full flex items-center justify-between p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Copy size={18} className="text-blue-600" />
              <span className="text-sm font-bold">复制分享文字</span>
            </div>
            {copied ? <Check size={18} className="text-green-500" /> : <ChevronRight size={18} className="text-gray-300" />}
          </button>

          {navigator.share && (
            <button 
              onClick={handleNativeShare}
              className="w-full flex items-center justify-between p-4 bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-100 active:scale-95 transition-transform"
            >
              <div className="flex items-center gap-3">
                <Share2 size={18} />
                <span className="text-sm font-bold">系统原生分享</span>
              </div>
              <ChevronRight size={18} className="text-white/50" />
            </button>
          )}
        </div>
      </motion.div>

      {/* Hidden Poster Template - using explicit colors to avoid oklch issues */}
      <div className="fixed left-[-9999px] top-0">
        <div 
          ref={posterRef}
          className="w-[400px] bg-[#F4F4F7] p-8"
          style={{ fontFamily: 'Inter, sans-serif' }}
        >
          <div className="bg-white rounded-[24px] p-8 mb-6 shadow-sm border border-[#F3F4F6]">
            <div className="flex items-center gap-2 text-[#2563EB] font-black tracking-tight mb-4">
               Goni <span className="text-[#D1D5DB] font-light ml-1">/ TRIP AI</span>
            </div>
            <h1 className="text-4xl font-black text-[#1A1A1A] mb-2 leading-tight">{trip.destination}</h1>
            <p className="text-sm text-[#9CA3AF] font-bold uppercase tracking-widest">{trip.duration}天深度探索之旅</p>
          </div>

          <div className="space-y-6">
            {trip.days.map((day, dIdx) => (
              <div key={dIdx} className="bg-white rounded-[24px] p-6 shadow-sm border border-[#F3F4F6]">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 bg-[#1A1A1A] text-white rounded-full flex items-center justify-center font-black text-sm">D{day.day}</div>
                  <h2 className="text-lg font-black text-[#1A1A1A]">Day {day.day} 行程计划</h2>
                </div>
                <div className="space-y-6">
                  {day.places.map((place, pIdx) => (
                    <div key={pIdx} className="relative pl-6 border-l-2 border-[#F9FAFB] pb-2">
                      <div className="absolute left-[-5px] top-1.5 w-2.5 h-2.5 bg-[#2563EB] rounded-full"></div>
                      <div className="text-[10px] font-bold text-[#2563EB] uppercase tracking-widest mb-1">{place.timeSlot}</div>
                      <div className="text-[16px] font-bold text-[#1A1A1A]">{place.name}</div>
                      <div className="text-[11px] text-[#6B7280] mt-1 leading-relaxed">{place.description}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 pt-8 border-t border-[#E5E7EB] flex items-center justify-between">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest">扫描二维码查看实时行程</span>
              <span className="text-[10px] text-[#2563EB] font-bold">ais-trip-ai.app</span>
            </div>
            <div className="w-16 h-16 bg-white p-1 rounded-[12px] border border-[#F3F4F6]">
               <QrCode size={56} className="text-[#1A1A1A]" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/** 跨天排序编辑弹窗 */
const ReorderModal = ({ 
  trip, 
  onSave, 
  onClose 
}: { 
  trip: Trip; 
  onSave: (updatedDays: DayPlan[]) => void; 
  onClose: () => void;
}) => {
  // 将所有 day 的 places 扁平化为一个数组, 带上所属 day 信息
  const buildFlatItems = () => {
    const items: { place: Place; dayIndex: number }[] = [];
    trip.days.forEach((day, dIdx) => {
      day.places.forEach((place) => {
        items.push({ place, dayIndex: dIdx });
      });
    });
    return items;
  };

  const [flatItems, setFlatItems] = useState(buildFlatItems);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const dragIdxRef = useRef<number | null>(null);

  // Keep ref in sync with state for touch handlers
  const updateDragIdx = (idx: number | null) => {
    setDragIdx(idx);
    dragIdxRef.current = idx;
  };

  const handleDragStart = (idx: number) => {
    updateDragIdx(idx);
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdxRef.current === null || dragIdxRef.current === idx) return;

    const newItems = [...flatItems];
    const [moved] = newItems.splice(dragIdxRef.current, 1);
    newItems.splice(idx, 0, moved);
    setFlatItems(newItems);
    updateDragIdx(idx);
  };

  const handleDragEnd = () => {
    updateDragIdx(null);
  };

  // Touch event handlers for mobile
  const listRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = (e: React.TouchEvent, idx: number) => {
    updateDragIdx(idx);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    e.preventDefault();
    if (dragIdxRef.current === null) return;

    const touch = e.touches[0];
    const element = document.elementFromPoint(touch.clientX, touch.clientY);
    if (!element) return;

    const itemEl = (element as HTMLElement).closest('[data-reorder-idx]');
    if (!itemEl) return;

    const targetIdx = parseInt(itemEl.getAttribute('data-reorder-idx') || '', 10);
    if (isNaN(targetIdx) || targetIdx === dragIdxRef.current) return;

    const newItems = [...flatItems];
    const [moved] = newItems.splice(dragIdxRef.current, 1);
    newItems.splice(targetIdx, 0, moved);
    setFlatItems(newItems);
    updateDragIdx(targetIdx);
  };

  const handleTouchEnd = () => {
    updateDragIdx(null);
  };

  const handleSave = () => {
    // 保持原有天数不变，将景点重新均分到各天
    const dayCount = trip.days.length;
    const itemsPerDay = Math.ceil(flatItems.length / dayCount);
    const newDays: DayPlan[] = [];

    for (let d = 0; d < dayCount; d++) {
      const dayPlaces = flatItems
        .slice(d * itemsPerDay, (d + 1) * itemsPerDay)
        .map((item, pIdx) => {
          // 重新生成 timeSlot 和 id
          const hour = 9 + pIdx * 2;
          const nextHour = hour + 2;
          const timeSlot = `${hour.toString().padStart(2, '0')}:00 - ${nextHour.toString().padStart(2, '0')}:00`;
          return {
            ...item.place,
            id: `day${d + 1}-spot${pIdx + 1}`,
            timeSlot,
            // 清除跨天交通（天内最后一个没有交通，每天第一个无前置交通）
            transportToNext: pIdx < itemsPerDay - 1 ? {
              mode: (['subway', 'taxi', 'walk', 'bus'] as const)[Math.floor(Math.random() * 4)],
              duration: `${15 + Math.floor(Math.random() * 30)} 分钟`,
              description: '乘坐公共交通或步行前往'
            } : undefined,
          } as Place;
        });

      newDays.push({
        day: d + 1,
        date: trip.days[d]?.date || '',
        places: dayPlaces,
      });
    }

    onSave(newDays);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
      />
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="w-full max-w-md bg-white rounded-3xl shadow-2xl relative z-20 max-h-[85vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div>
            <h3 className="text-xl font-bold text-[#1A1A1A]">编辑行程顺序</h3>
            <p className="text-xs text-gray-400 mt-1">拖动景点调整跨天排列顺序</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-50 rounded-full text-gray-400">
            <X size={20} />
          </button>
        </div>

        {/* List */}
        <div
          ref={listRef}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className={`flex-1 overflow-y-auto p-4 space-y-2 ${dragIdx !== null ? 'touch-none' : ''}`}
        >
          {flatItems.map((item, idx) => {
            const isDragOver = dragIdx === idx;
            return (
              <div key={`${item.place.id}-${idx}`}>
                {/* Day separator */}
                {(idx === 0 || flatItems[idx - 1].dayIndex !== item.dayIndex) && (
                  <div className="flex items-center gap-3 py-2 mt-2 mb-1">
                    <div className="h-px flex-1 bg-gray-100" />
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                      Day {item.dayIndex + 1}
                    </span>
                    <div className="h-px flex-1 bg-gray-100" />
                  </div>
                )}
                <div
                  draggable
                  data-reorder-idx={idx}
                  onDragStart={() => handleDragStart(idx)}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDragEnd={handleDragEnd}
                  onTouchStart={(e) => handleTouchStart(e, idx)}
                  className={`flex items-center gap-3 p-4 rounded-xl border transition-all cursor-grab active:cursor-grabbing select-none ${
                    isDragOver
                      ? 'border-blue-400 bg-blue-50 shadow-md scale-[1.02]'
                      : 'border-gray-100 bg-white hover:border-gray-200 hover:shadow-sm'
                  }`}
                >
                  {/* Grip handle */}
                  <div className="text-gray-300 flex-shrink-0">
                    <GripVertical size={18} />
                  </div>

                  {/* Day badge */}
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                    item.dayIndex === 0 ? 'bg-blue-100 text-blue-700' :
                    item.dayIndex === 1 ? 'bg-green-100 text-green-700' :
                    'bg-purple-100 text-purple-700'
                  }`}>
                    D{item.dayIndex + 1}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-[#1A1A1A] truncate">
                      {item.place.name}
                    </div>
                    <div className="text-[10px] text-gray-400 truncate">
                      {item.place.timeSlot} · {item.place.category}
                    </div>
                  </div>

                  {/* Position number */}
                  <span className="text-[10px] font-bold text-gray-300 w-5 text-center flex-shrink-0">
                    #{idx + 1}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom actions */}
        <div className="p-6 border-t border-gray-100 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 text-gray-400 font-bold text-sm rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-bold text-sm shadow-lg shadow-blue-100 hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
          >
            <Save size={16} /> 保存排序
          </button>
        </div>
      </motion.div>
    </div>
  );
};

const TransportRow = ({ 
  transport
}: { 
  transport?: { mode: string; duration: string; description: string };
}) => {
  const [expanded, setExpanded] = useState(false);
  if (!transport) return null;

  const Icon = transport.mode === 'walk' ? Footprints : transport.mode === 'taxi' ? Car : Train;

  return (
    <div 
      className="ml-6 border-l-2 border-dashed border-gray-100 pl-8"
    >
      {/* 折叠态：一行显示 */}
      <div 
        className="flex items-center gap-2 text-[11px] text-gray-400 group cursor-pointer transition-all"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2 bg-white px-3 py-1 -ml-3 rounded-full border border-gray-100 transition-colors group-hover:border-blue-100 group-hover:text-blue-600 shadow-sm">
          <Icon size={12} className="text-blue-500" />
          <span className="font-bold text-[#1A1A1A]">{transport.duration}</span>
        </div>
        <span className="text-gray-300 text-[10px]">{expanded ? '▲' : '▼'}</span>
      </div>

      {/* 展开态：完整信息 */}
      {expanded && (
        <div className="mt-2 pl-1 text-[11px] text-gray-500">
          {transport.description}
        </div>
      )}
    </div>
  );
};

const PlaceCard = ({ 
  place, 
  onShowDetail, 
  onRefresh,
  onEdit,
  city
}: { 
  place: Place; 
  onShowDetail: () => void; 
  onRefresh: () => void;
  onEdit: () => void;
  city?: string;
}) => {
  return (
    <motion.div 
      layout
      className="bg-white rounded-2xl border border-gray-200 p-5 minimalism-shadow minimalism-shadow-hover transition-all group relative overflow-hidden"
    >
      <div className="absolute top-0 right-0 p-3 flex gap-1">
        <button 
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-blue-600 transition-colors"
        >
          <Edit2 size={16} />
        </button>
        <button 
          onClick={(e) => { e.stopPropagation(); onRefresh(); }}
          className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-blue-600 transition-colors"
        >
          <RefreshCcw size={16} />
        </button>
      </div>

      <div className="flex gap-4">
        <PlaceImage placeName={place.name} city={city} size="md" className="mt-1" />
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-blue-600">
              {place.timeSlot}
            </span>
          </div>
          <h3 className="text-lg font-bold text-[#1A1A1A] group-hover:text-blue-600 transition-colors">
            {place.name}
          </h3>
          <p className="text-xs text-gray-400 mt-1 line-clamp-1">
            {place.address}
          </p>
          <p className="text-sm text-gray-500 mt-2.5 leading-relaxed line-clamp-2">
            {place.description}
          </p>
          
          <div className="mt-4 flex items-center justify-between">
            <div className="flex gap-2">
              <span className="px-2 py-1 bg-blue-50 text-blue-700 text-[10px] font-bold rounded uppercase">{place.category}</span>
              <div className="flex items-center gap-1 text-[11px] font-bold text-gray-400 ml-2">
                <Star size={12} className="text-blue-600" fill="currentColor" /> {place.rating}
              </div>
            </div>
            <button 
              onClick={onShowDetail} 
              className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-blue-600 transition-colors"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export const PlannerView = ({ 
  trip: initialTrip,
  onReplan,
  onBack,
  onTripUpdated,
}: { 
  trip: Trip | null;
  onReplan?: () => void;
  onBack?: () => void;
  onTripUpdated?: (trip: Trip) => void;
}) => {
  const [trip, setTrip] = useState<Trip | null>(initialTrip);
  const [activeDay, setActiveDay] = useState(0);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [showSwap, setShowSwap] = useState<Place | null>(null);
  const [editingPlace, setEditingPlace] = useState<Place | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showReorder, setShowReorder] = useState(false);
  const [alternatives, setAlternatives] = useState<any[]>([]);
  const [loadingAlts, setLoadingAlts] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  const [tempTimeSlot, setTempTimeSlot] = useState<string>('');

  const [areaRecommendations, setAreaRecommendations] = useState<{ area: string; reason: string; pros: string; cons: string }[]>([]);
  const [areaRecommendationsLoading, setAreaRecommendationsLoading] = useState(false);

  // 同步 trip 变更回父组件（App.tsx）和 localStorage
  const commitTrip = (updatedTrip: Trip) => {
    setTrip(updatedTrip);
    // 同步到父组件（让 TimelineView 能获取到最新数据）
    onTripUpdated?.(updatedTrip);
    // 同步到 localStorage
    try {
      localStorage.setItem('current_trip', JSON.stringify(updatedTrip));
    } catch {}
  };
  const areaRecAbortRef = useRef<AbortController | null>(null);

  /** 判断是否为住宿类景点 */
  const isAccommodation = (place: Place): boolean => {
    const keywords = ['酒店', '旅馆', '民宿', '住宿', '客栈', '青旅', '宾馆', '度假村'];
    return keywords.some(k => 
      place.name.includes(k) || 
      place.description?.includes(k) ||
      place.category?.includes(k)
    );
  };

  // Sync with prop if it changes (e.g. newly generated)
  React.useEffect(() => {
    setTrip(initialTrip);
  }, [initialTrip]);

  if (!trip) return (
    <div className="flex flex-col items-center justify-center h-full px-12 text-center text-gray-400 py-20">
      <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-6">
        <MapPin size={32} />
      </div>
      <p className="text-sm font-medium">暂无行程，快去对话框告诉我你想去哪吧！</p>
    </div>
  );

  const handleRefresh = async (place: Place) => {
    setShowSwap(place);
    setLoadingAlts(true);
    try {
      const alts = await getAlternatives(place.name, trip.destination);
      setAlternatives(alts);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingAlts(false);
    }
  };

  const updatePlace = (updated: Place) => {
    if (!trip) return;
    const newDays = [...trip.days];
    const places = [...newDays[activeDay].places];
    const idx = places.findIndex(p => p.id === updated.id);
    if (idx !== -1) {
      places[idx] = updated;
      newDays[activeDay] = { ...newDays[activeDay], places };
      commitTrip({ ...trip, days: newDays });
    }
    setEditingPlace(null);
    setRescheduling(false);
    setTempTimeSlot('');
  };

  const handleTimeSlotChange = async (place: Place, newTimeSlot: string) => {
    if (!trip) return;
    
    setRescheduling(true);
    setTempTimeSlot(newTimeSlot);
    
    try {
      // 解析新旧时间段的起始分钟数
      const parseStartMin = (slot: string): number => {
        const m = slot.match(/(\d{1,2}):(\d{2})/);
        return m ? parseInt(m[1]) * 60 + parseInt(m[2]) : 0;
      };
      const parseEndMin = (slot: string): number => {
        const parts = slot.split('-');
        const m = parts[1]?.match(/(\d{1,2}):(\d{2})/);
        return m ? parseInt(m[1]) * 60 + parseInt(m[2]) : parseStartMin(slot) + 120;
      };

      const oldStart = parseStartMin(place.timeSlot);
      const newStart = parseStartMin(newTimeSlot);
      const oldEnd = parseEndMin(place.timeSlot);
      const newEnd = parseEndMin(newTimeSlot);
      const duration = newEnd - newStart; // 新时间段持续分钟数
      const offset = newStart - oldStart; // 偏移量

      const currentDayPlaces = trip.days[activeDay].places;
      const placeIdx = currentDayPlaces.findIndex(p => p.id === place.id);

      // 构建新的 places 列表
      const updatedPlaces = currentDayPlaces.map((p, idx) => {
        if (idx === placeIdx) {
          return { ...p, timeSlot: newTimeSlot };
        }
        if (idx > placeIdx) {
          // 后续景点同步偏移
          const pStart = parseStartMin(p.timeSlot);
          const pEnd = parseEndMin(p.timeSlot);
          const pDuration = pEnd - pStart;
          const newPStart = pStart + offset;
          const newPEnd = newPStart + pDuration;
          // 确保时间在合理范围内
          if (newPStart >= 480 && newPEnd <= 1320) { // 08:00 - 22:00
            const startH = Math.floor(newPStart / 60);
            const startM = newPStart % 60;
            const endH = Math.floor(newPEnd / 60);
            const endM = newPEnd % 60;
            return {
              ...p,
              timeSlot: `${startH.toString().padStart(2, '0')}:${startM.toString().padStart(2, '0')} - ${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`
            };
          }
        }
        return p;
      });

      // 更新行程
      const newDays = [...trip.days];
      newDays[activeDay] = { ...newDays[activeDay], places: updatedPlaces };
      commitTrip({ ...trip, days: newDays });

      // 短暂等待展示加载状态
      await new Promise(r => setTimeout(r, 600));
      
      // 自动关闭编辑弹窗
      setEditingPlace(null);
    } catch (error) {
      console.error('Failed to reschedule:', error);
      alert('重新安排时间失败，请稍后重试');
    } finally {
      setRescheduling(false);
      setTempTimeSlot('');
    }
  };

  // 当行程更新时，同步更新 editingPlace（如果正在编辑）
  React.useEffect(() => {
    if (editingPlace && trip) {
      const updatedPlace = trip.days[activeDay].places.find(p => p.id === editingPlace.id);
      if (updatedPlace) {
        setEditingPlace(updatedPlace);
      }
    }
  }, [trip, activeDay]);

  // 住宿类景点详情：获取区域推荐
  React.useEffect(() => {
    if (areaRecAbortRef.current) {
      areaRecAbortRef.current.abort();
    }
    setAreaRecommendations([]);
    setAreaRecommendationsLoading(false);

    if (!selectedPlace || !isAccommodation(selectedPlace)) return;

    setAreaRecommendationsLoading(true);
    const controller = new AbortController();
    areaRecAbortRef.current = controller;

    getAreaRecommendations(
      trip?.destination || '',
      selectedPlace.name,
      controller.signal
    ).then((result) => {
      setAreaRecommendations(result);
    }).finally(() => {
      setAreaRecommendationsLoading(false);
    });

    return () => {
      controller.abort();
    };
  }, [selectedPlace]);

  const handleSaveOrder = (newDays: DayPlan[]) => {
    if (!trip) return;
    commitTrip({ ...trip, days: newDays });
    // 同时保存到 localStorage
    const saved = localStorage.getItem('current_trip');
    if (saved) {
      const storedTrip = JSON.parse(saved);
      storedTrip.days = newDays;
      localStorage.setItem('current_trip', JSON.stringify(storedTrip));
    }
  };

  return (
    <div className="bg-white min-h-full">
      {/* Day Tabs + 操作按钮 */}
      <div className="sticky top-0 bg-white z-20 border-b border-gray-50/50">
        {/* 操作栏：分享 / 重新规划 / 编辑 */}
        <div className="px-8 pt-3 pb-1.5 flex items-center justify-end gap-4">
          <button 
            onClick={() => setShowShareModal(true)}
            className="text-xs font-medium text-blue-600 flex items-center gap-1 hover:underline"
          >
            <Share2 size={13} /> 分享
          </button>
          <button 
            onClick={onReplan}
            className="text-xs font-medium text-gray-400 flex items-center gap-1 hover:text-blue-600 transition-colors"
          >
            <RefreshCcw size={12} /> 重新规划
          </button>
          <button 
            onClick={() => setShowReorder(true)}
            className="text-xs font-medium text-blue-600 flex items-center gap-1 hover:underline"
          >
            <Edit2 size={13} /> 编辑
          </button>
        </div>
        {/* 天数切换 */}
        <div className="px-8 pb-3 flex gap-2 overflow-x-auto scrollbar-hide">
          {trip.days.map((day, idx) => (
            <button
              key={idx}
              onClick={() => setActiveDay(idx)}
              className={`px-6 py-2 rounded-full whitespace-nowrap text-sm font-medium transition-all ${
                activeDay === idx 
                  ? 'bg-black text-white' 
                  : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-400'
              }`}
            >
              Day {idx + 1}
            </button>
          ))}
        </div>
      </div>

      {/* 当日路线地图 — 左右比地点卡片各宽 6px */}
      <div className="mx-[22px] pt-2">
        <AMapRouteStatic places={trip.days[activeDay].places} />
      </div>

      {/* Place List */}
      <div className="px-8 py-8 space-y-2">
        {trip.days[activeDay].places.map((place, idx, arr) => (
          <React.Fragment key={place.id}>
            <PlaceCard 
              place={place} 
              onShowDetail={() => setSelectedPlace(place)}
              onRefresh={() => handleRefresh(place)}
              onEdit={() => setEditingPlace(place)}
              city={trip?.destination}
            />
            {idx < arr.length - 1 && (
              <TransportRow 
                transport={place.transportToNext} 
              />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Share Modal */}
      <AnimatePresence>
        {showShareModal && (
          <ShareModal trip={trip} onClose={() => setShowShareModal(false)} />
        )}
      </AnimatePresence>

      {/* Reorder Modal */}
      <AnimatePresence>
        {showReorder && trip && (
          <ReorderModal
            trip={trip}
            onSave={handleSaveOrder}
            onClose={() => setShowReorder(false)}
          />
        )}
      </AnimatePresence>

      {/* Detail Modal */}
      <AnimatePresence>
        {selectedPlace && (
          <div className="fixed inset-0 z-[100] flex items-end justify-center">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedPlace(null)}
              className="absolute inset-0 bg-black/20 backdrop-blur-[2px]"
            />
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="w-full max-w-md bg-white rounded-t-3xl shadow-2xl relative z-20 overflow-y-auto max-h-[90vh] overscroll-contain"
            >
              <div className="h-64 bg-gray-100 relative">
                <PlaceImage placeName={selectedPlace.name} city={trip?.destination} size="lg" className="w-full h-64" />
                {/* 图片加载失败时显示地图兜底 */}
                <div className="absolute inset-0">
                  <AMapStatic 
                    name={selectedPlace.name} 
                    address={selectedPlace.address}
                    coordinates={selectedPlace.coordinates}
                  />
                </div>
              </div>
              <div className="p-8">
                <div className="flex justify-between items-start mb-6">
                   <div>
                    <span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest bg-blue-50 px-2 py-0.5 rounded">{selectedPlace.category}</span>
                    <h2 className="text-2xl font-bold mt-2 text-[#1A1A1A]">{selectedPlace.name}</h2>
                    <p className="text-xs text-gray-400 mt-1 flex items-center gap-1"><MapPin size={14} /> {selectedPlace.address}</p>
                   </div>
                   <button onClick={() => setSelectedPlace(null)} className="p-2 hover:bg-gray-100 rounded-lg text-gray-400"><X size={24}/></button>
                </div>

                <div className="space-y-3 mb-8">
                  <div className="text-[11px] flex justify-between border-b border-gray-50 pb-2">
                    <span className="text-gray-400">开放时间</span>
                    <span className="font-medium text-[#1A1A1A]">{selectedPlace.openingHours || '全天开放'}</span>
                  </div>
                  <div className="text-[11px] flex justify-between border-b border-gray-50 pb-2">
                    <span className="text-gray-400">门票建议</span>
                    <span className="font-medium text-[#1A1A1A]">{selectedPlace.ticketPrice || '免费'}</span>
                  </div>
                </div>

                <p className="text-sm text-gray-500 leading-relaxed mb-8">{selectedPlace.description}</p>

                {isAccommodation(selectedPlace) && (
                  <div className="mb-8">
                    <div className="flex items-center gap-2 mb-4">
                      <MapPin size={14} className="text-blue-500" />
                      <span className="text-xs font-bold text-blue-700 uppercase tracking-wider">推荐住宿区域</span>
                    </div>

                    {areaRecommendationsLoading && areaRecommendations.length === 0 ? (
                      <div className="flex items-center gap-2 text-blue-400 py-4">
                        <Loader2 size={14} className="animate-spin" />
                        <span className="text-sm">正在为你推荐...</span>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {areaRecommendations.map((rec, idx) => (
                          <motion.div
                            key={idx}
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.15, duration: 0.3 }}
                            className="bg-white border border-blue-100 rounded-xl p-4 shadow-sm"
                          >
                            <h4 className="text-sm font-bold text-[#1A1A1A] mb-1">{rec.area}</h4>
                            <p className="text-xs text-gray-500 mb-3">{rec.reason}</p>
                            <div className="flex gap-3 text-[11px]">
                              <span className="flex-1 bg-green-50 text-green-700 px-2.5 py-1.5 rounded-lg">
                                <span className="font-bold">👍 优点</span> {rec.pros}
                              </span>
                              <span className="flex-1 bg-orange-50 text-orange-700 px-2.5 py-1.5 rounded-lg">
                                <span className="font-bold">⚠️ 不足</span> {rec.cons}
                              </span>
                            </div>
                          </motion.div>
                        ))}
                        {!areaRecommendationsLoading && areaRecommendations.length === 0 && (
                          <p className="text-xs text-gray-400 py-2">暂无推荐</p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div className="flex gap-3">
                  <button 
                    onClick={() => openGaodeNavigation(selectedPlace)}
                    className="flex-1 bg-blue-600 text-white py-4 rounded-xl text-sm font-bold shadow-lg shadow-blue-100 active:scale-95 transition-transform flex items-center justify-center gap-2"
                  >
                    <Navigation size={18} /> 导航到目的地
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Modal */}
      <AnimatePresence>
        {editingPlace && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditingPlace(null)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-sm bg-white rounded-3xl shadow-2xl relative z-20 p-8"
            >
              <h3 className="text-xl font-bold mb-6 text-[#1A1A1A]">修改地点信息</h3>
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">游玩时间</label>
                  <input 
                    type="text" 
                    value={tempTimeSlot || editingPlace.timeSlot}
                    onChange={(e) => setTempTimeSlot(e.target.value)}
                    placeholder="如：09:00 - 11:00"
                    className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-400"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">地点名称</label>
                  <input 
                    type="text" 
                    value={editingPlace.name}
                    onChange={(e) => setEditingPlace({ ...editingPlace, name: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-400"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">详细地址</label>
                  <textarea 
                    value={editingPlace.address}
                    onChange={(e) => setEditingPlace({ ...editingPlace, address: e.target.value })}
                    rows={3}
                    className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-400 resize-none"
                  />
                </div>
              </div>
              {rescheduling && (
                <div className="mt-4 flex items-center gap-2 justify-center text-blue-600 bg-blue-50 rounded-xl px-4 py-3 text-xs font-medium">
                  <Loader2 size={14} className="animate-spin" />
                  正在同步获取景点详细信息...
                </div>
              )}
              <div className="mt-4 flex gap-3">
                <button 
                  onClick={() => setEditingPlace(null)}
                  className="flex-1 py-3 text-gray-400 font-bold text-sm"
                >
                  取消
                </button>
                <button 
                  onClick={async () => {
                    if (tempTimeSlot && tempTimeSlot !== editingPlace.timeSlot) {
                      await handleTimeSlotChange(editingPlace, tempTimeSlot);
                    } else {
                      setRescheduling(true);
                      
                      // 获取原始景点，判断名称是否变更
                      const original = trip?.days[activeDay]?.places.find(p => p.id === editingPlace.id);
                      const nameChanged = original && editingPlace.name !== original.name;
                      
                      let enrichedPlace = { ...editingPlace };

                      if (nameChanged) {
                        try {
                          // 1. 高德搜索详细信息
                          const details = await searchPlaceDetails(editingPlace.name, trip?.destination);
                          
                          if (details) {
                            enrichedPlace = {
                              ...enrichedPlace,
                              // 名字变了 → 优先用高德地址；用户手动改过地址则保留手动输入
                              address: original && editingPlace.address !== original.address
                                ? editingPlace.address
                                : details.address || editingPlace.address || '',
                              category: details.category || enrichedPlace.category,
                              rating: details.rating || enrichedPlace.rating,
                              coordinates: details.coordinates || enrichedPlace.coordinates,
                              openingHours: details.openingHours || enrichedPlace.openingHours,
                              image: details.imageUrl || enrichedPlace.image,
                            };
                          }
                          
                          // 2. AI 生成景点简介
                          const aiDescription = await generatePlaceDescription(editingPlace.name, trip?.destination || '');
                          if (aiDescription) {
                            enrichedPlace.description = aiDescription;
                          }
                          
                          // 3. 重新生成到下一个地点的交通信息
                          const placeIdx = trip?.days[activeDay]?.places.findIndex(p => p.id === editingPlace.id);
                          if (placeIdx !== undefined && placeIdx !== -1 && trip) {
                            const places = trip.days[activeDay].places;
                            // 检查这个位置后面还有景点
                            const nextPlaceFound = placeIdx < places.length - 1 && places[placeIdx + 1];
                            if (nextPlaceFound) {
                              const nextPlace = places[placeIdx + 1];
                              const transport = await generateTransportSuggestion(
                                editingPlace.name,
                                nextPlace.name,
                                trip.destination,
                                editingPlace.timeSlot
                              );
                              if (transport) {
                                enrichedPlace.transportToNext = transport;
                              }
                            }
                          }
                        } catch (e) {
                          console.error('Auto-fetch place details failed:', e);
                        }
                      }
                      
                      await new Promise(r => setTimeout(r, 400));
                      updatePlace(enrichedPlace);
                    }
                  }}
                  disabled={rescheduling}
                  className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-bold text-sm shadow-lg shadow-blue-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {rescheduling ? (
                    <><Loader2 size={16} className="animate-spin" /> 保存中...</>
                  ) : '保存修改'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Alternatives Sheet */}
      <AnimatePresence>
        {showSwap && (
          <div className="fixed inset-0 z-[101] flex items-end justify-center">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSwap(null)}
              className="absolute inset-0 bg-black/20 backdrop-blur-[2px]"
            />
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="w-full max-w-md bg-white rounded-t-3xl shadow-2xl relative z-20"
            >
              <div className="p-8">
                <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                  <RefreshCcw size={20} className="text-blue-600" />
                  寻找替代方案
                </h3>
                
                <div className="space-y-3 mb-8">
                  {loadingAlts ? (
                    <div className="py-12 flex flex-col items-center gap-4 text-gray-400">
                      <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                      <p className="text-xs font-medium">寻找最佳方案中...</p>
                    </div>
                  ) : (
                    alternatives.map((alt, idx) => (
                      <div 
                        key={idx} 
                        onClick={() => {
                          updatePlace({ ...showSwap, ...alt });
                          setShowSwap(null);
                        }}
                        className="p-4 rounded-xl border border-gray-100 flex items-center justify-between hover:border-blue-200 hover:bg-blue-50/50 transition-all cursor-pointer"
                      >
                        <div className="flex-1">
                          <h5 className="text-sm font-bold text-[#1A1A1A]">{alt.name}</h5>
                          <p className="text-[11px] text-gray-400 line-clamp-1">{alt.description}</p>
                        </div>
                        <button className="ml-4 text-[11px] font-bold text-blue-600">替换</button>
                      </div>
                    ))
                  )}
                </div>

                <button 
                  onClick={() => setShowSwap(null)}
                  className="w-full py-4 text-sm text-gray-400 font-bold border-t border-gray-50"
                >
                  保持当前计划
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
