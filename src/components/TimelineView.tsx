import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trip, Place } from '../types';
import { CheckCircle2, Circle, Clock, MapPin, Navigation, Calendar, RefreshCcw, Loader2, Camera, Image as ImageIcon, Share2 } from 'lucide-react';
import { getAlternatives } from '../services/deepSeekService';
import { openGaodeNavigation } from '../services/navigationService';
import { PlaceImage } from './PlaceImage';
import { uploadPhoto, getPhotos, deletePhoto, type StoredPhoto } from '../services/photoService';
import { ShareCard } from './ShareCard';

/** 从 timeSlot（如 "09:00 - 11:00"）解析出开始时间的分钟数 */
const parseStartMinutes = (timeSlot: string): number => {
  const match = timeSlot.match(/(\d{1,2}):(\d{2})/);
  if (!match) return 0;
  return parseInt(match[1]) * 60 + parseInt(match[2]);
};

/** 从 timeSlot（如 "09:00 - 11:00"）解析出结束时间的分钟数 */
const parseEndMinutes = (timeSlot: string): number => {
  const match = timeSlot.match(/-(\s*\d{1,2}):(\d{2})/);
  if (!match) return 1440; // 找不到结束时间则默认次日凌晨
  return parseInt(match[1]) * 60 + parseInt(match[2]);
};

/** 根据当前时间计算在第几个景点 */
const findCurrentPlaceIndex = (places: Place[]): number => {
  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
  for (let i = places.length - 1; i >= 0; i--) {
    if (nowMinutes >= parseStartMinutes(places[i].timeSlot)) {
      return i;
    }
  }
  return -1;
};

/** 根据 startDate 计算当前在哪一天（索引） */
const getCurrentDayIndex = (trip: Trip): number => {
  if (!trip.startDate) return 0;
  const start = new Date(trip.startDate);
  const now = new Date();
  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.floor((today.getTime() - startDay.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return -1;
  return Math.min(diffDays, trip.days.length - 1);
};

/** 获取当前地点状态 */
const getPlaceStatus = (placeIndex: number, currentIndex: number): 'completed' | 'current' | 'upcoming' | 'pending' => {
  if (currentIndex === -1) return 'pending';
  if (placeIndex < currentIndex) return 'completed';
  if (placeIndex === currentIndex) return 'current';
  return 'upcoming';
};

export const TimelineView = ({ trip, onTripUpdated }: { trip: Trip | null; onTripUpdated?: (trip: Trip) => void }) => {
  const now = new Date();
  const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

  // 模式切换
  const [photoMode, setPhotoMode] = useState(false);

  // 心跳刷新：旅行期间每 60 秒自动重新计算当前天/景点
  const [, forceUpdate] = useState(0);

  // 换个地方状态
  const [swapPlace, setSwapPlace] = useState<{ place: Place; dayIdx: number } | null>(null);
  const [alternatives, setAlternatives] = useState<any[]>([]);
  const [loadingAlts, setLoadingAlts] = useState(false);

  // 照片模式：展开的卡片 id
  const [photoExpandedId, setPhotoExpandedId] = useState<string | null>(null);

  // 照片状态
  const [storedPhotos, setStoredPhotos] = useState<Record<string, StoredPhoto[]>>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const [selectedPhotos, setSelectedPhotos] = useState<Record<string, boolean>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadTarget, setUploadTarget] = useState<string | null>(null);

  // 加载当前天的所有照片
  const dayIndex = getCurrentDayIndex(trip);
  const today = trip ? trip.days[dayIndex] : null;

  // 心跳定时刷新：旅行期间每 60s 重新计算当前天/景点
  useEffect(() => {
    if (!trip || dayIndex < 0) return; // 旅行还没开始，不用心跳
    const id = setInterval(() => forceUpdate(n => n + 1), 60000);
    return () => clearInterval(id);
  }, [trip, dayIndex]);

  useEffect(() => {
    if (!today || !photoMode) return;
    today.places.forEach(async (place) => {
      const photos = await getPhotos(place.id);
      if (photos.length > 0) {
        setStoredPhotos(prev => ({ ...prev, [place.id]: photos }));
      }
    });
  }, [today, photoMode]);

  /** 上传照片 */
  const handleUpload = async (placeId: string, file: File) => {
    setUploading(placeId);
    try {
      const photo = await uploadPhoto(placeId, file);
      setStoredPhotos(prev => ({
        ...prev,
        [placeId]: [...(prev[placeId] || []), photo],
      }));
    } catch (err: any) {
      alert(err.message || '上传失败');
    } finally {
      setUploading(null);
      setUploadTarget(null);
    }
  };

  const handleDelete = async (placeId: string) => {
    const ids = Object.keys(selectedPhotos).filter(id => selectedPhotos[id]);
    if (ids.length === 0) return;
    if (!confirm('确定删除选中的 ' + ids.length + ' 张照片？')) return;

    try {
      await Promise.all(ids.map(id => deletePhoto(id)));
      setStoredPhotos(prev => ({
        ...prev,
        [placeId]: (prev[placeId] || []).filter(p => !selectedPhotos[p.id]),
      }));
      setSelectedPhotos({});
    } catch (err) {
      console.error('Delete failed:', err);
      alert('删除失败');
    }
  };

  if (!trip) return (
    <div className="flex flex-col items-center justify-center h-full px-12 text-center text-gray-400 py-20">
      <Clock size={32} className="mb-4" />
      <p>开始一次旅行后，这里将显示实时进度</p>
    </div>
  );

  if (dayIndex === -1) {
    const startDate = trip.startDate
      ? new Date(trip.startDate).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })
      : '规划中';
    return (
      <div className="flex flex-col items-center justify-center h-full px-12 text-center py-20">
        <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-6">
          <Calendar size={32} className="text-blue-600" />
        </div>
        <h3 className="text-lg font-bold text-[#1A1A1A] mb-2">旅行即将开始</h3>
        <p className="text-sm text-gray-400">
          你前往 <span className="font-bold text-[#1A1A1A]">{trip.destination}</span> 的行程将于 {startDate} 开始
        </p>
      </div>
    );
  }

  const currentPlaceIndex = findCurrentPlaceIndex(today!.places);

  /** 换个地方：加载备选 */
  const handleSwap = async (place: Place, idx: number) => {
    setSwapPlace({ place, dayIdx: idx });
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

  /** 确认替换 */
  const handleConfirmSwap = (alt: any) => {
    if (!swapPlace || !trip) return;
    const newDays = [...trip.days];
    const places = [...newDays[dayIndex].places];
    const idx = places.findIndex(p => p.id === swapPlace.place.id);
    if (idx !== -1) {
      places[idx] = {
        ...places[idx],
        name: alt.name,
        address: alt.address || places[idx].address,
        description: alt.description || places[idx].description,
        category: alt.category || places[idx].category,
        rating: alt.rating || places[idx].rating,
      };
      newDays[dayIndex] = { ...newDays[dayIndex], places };
      const updatedTrip = { ...trip, days: newDays };
      if (onTripUpdated) onTripUpdated(updatedTrip);
    }
    setSwapPlace(null);
    setAlternatives([]);
  };

  return (
    <div className="bg-white p-8 min-h-full">
      {/* 隐藏的文件输入框 */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file && uploadTarget) {
            handleUpload(uploadTarget, file);
          }
          e.target.value = '';
        }}
      />

      <div className="flex items-center justify-between mb-10">
        <div>
          <h2 className="text-2xl font-bold text-[#1A1A1A]">
            {photoMode ? '照片记录' : '实时路线'}
          </h2>
          <p className="text-xs text-gray-400 font-medium uppercase tracking-widest mt-1">
            {trip.destination} · Day {dayIndex + 1} · {currentTime}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* 模式切换按钮 */}
          <button
            onClick={() => setPhotoMode(!photoMode)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold border transition-all ${
              photoMode
                ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300'
            }`}
          >
            <ImageIcon size={14} />
            照片
          </button>
          {/* 实时同步指示器 */}
          <div className="flex items-center gap-2 bg-green-50 px-3 py-1.5 rounded-full border border-green-100">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
            <span className="text-[10px] font-bold text-green-700 uppercase tracking-tighter">{currentTime}</span>
          </div>
        </div>
      </div>

      <div className="relative">
        <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-gray-100" />

        <div className="space-y-12">
          {today!.places.map((place, idx) => {
            const status = getPlaceStatus(idx, currentPlaceIndex);
            const isCompleted = status === 'completed';
            const isCurrent = status === 'current';
            const placePhotos = storedPhotos[place.id] || [];

            return (
              <div key={place.id} className="relative pl-10">
                <div className={`absolute left-0 top-1.5 p-1 rounded-full bg-white z-10 ${
                  isCompleted ? 'text-green-500' : isCurrent ? 'text-blue-600' : 'text-gray-200'
                }`}>
                  {isCompleted ? (
                    <CheckCircle2 size={24} fill="currentColor" className="text-green-500 bg-white rounded-full" />
                  ) : isCurrent ? (
                    <div className="w-6 h-6 bg-blue-600 rounded-full border-4 border-white minimalism-shadow"></div>
                  ) : (
                    <Circle size={24} strokeWidth={3} />
                  )}
                </div>

                <div
                  className={`p-5 rounded-2xl border transition-all cursor-pointer ${
                    photoMode
                      ? 'border-gray-100 bg-white hover:border-blue-200'
                      : isCurrent 
                        ? 'border-blue-600 bg-white minimalism-shadow scale-[1.02]' 
                        : isCompleted 
                          ? 'border-gray-50 bg-gray-50/50 opacity-60' 
                          : 'border-gray-100 bg-white'
                  }`}
                  onClick={() => {
                    if (photoMode) {
                      setPhotoExpandedId(photoExpandedId === place.id ? null : place.id);
                      setSelectedPhotos({});
                    }
                  }}
                >
                  <div className="flex gap-3 items-start">
                    {/* 非照片模式 & 未完成：显示缩略图 */}
                    {!photoMode && !isCompleted && (
                      <PlaceImage placeName={place.name} city={trip.destination} size="sm" className="mt-0.5 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start mb-2">
                        <span className={`text-[10px] font-bold uppercase tracking-widest ${
                          isCurrent ? 'text-blue-600' : 'text-gray-400'
                        }`}>
                          {place.timeSlot}
                        </span>
                        {isCurrent && (
                          <span className="bg-blue-50 text-blue-700 text-[9px] font-bold px-2 py-0.5 rounded uppercase">进行中</span>
                        )}
                        {status === 'upcoming' && (
                          <span className="text-[9px] font-bold text-gray-300 uppercase">待出发</span>
                        )}
                      </div>
                      <h3 className="text-lg font-bold text-[#1A1A1A] leading-tight mb-2">
                        {place.name}
                      </h3>
                      <p className="text-sm text-gray-500 mb-4 line-clamp-2 leading-relaxed">
                        {place.description}
                      </p>

                      {/* 照片模式：展开后才显示照片 */}
                      {photoMode && photoExpandedId === place.id && placePhotos.length > 0 && (
                        <div className="flex gap-1.5 mb-3 overflow-x-auto flex-wrap">
                          {placePhotos.map((p, pi) => (
                            <div
                              key={p.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedPhotos(prev => ({
                                  ...prev,
                                  [p.id]: !prev[p.id],
                                }));
                              }}
                              className={'w-14 h-14 rounded-lg overflow-hidden flex-shrink-0 bg-gray-100 border border-gray-100 relative cursor-pointer transition-all duration-150 select-none ' + (selectedPhotos[p.id] ? 'ring-2 ring-red-500 opacity-75 scale-95' : '')}
                              style={{ touchAction: 'manipulation' }}
                            >
                              <img src={p.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                              {selectedPhotos[p.id] && (
                                <div className="absolute top-0.5 right-0.5 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center">
                                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* 照片模式：展开后才显示按钮 */}
                      {photoMode && photoExpandedId === place.id && (
                        <div className="flex gap-2 justify-end border-t border-gray-100 pt-4 mt-2">
                          {Object.keys(selectedPhotos).filter(k => selectedPhotos[k]).length > 0 ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(place.id);
                              }}
                              className="w-auto px-5 py-3 rounded-xl bg-red-50 text-red-600 font-bold text-[11px] uppercase tracking-wide flex items-center justify-center gap-1.5 hover:bg-red-100 transition-colors border border-red-100"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                              删除 {Object.keys(selectedPhotos).filter(k => selectedPhotos[k]).length} 张
                            </button>
                          ) : (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setUploadTarget(place.id);
                                fileInputRef.current?.click();
                              }}
                              disabled={uploading === place.id}
                              className="w-auto px-5 py-3 rounded-xl bg-blue-600 text-white font-bold text-[11px] uppercase tracking-wide shadow-lg shadow-blue-100 flex items-center justify-center gap-1.5 disabled:opacity-50"
                            >
                              {uploading === place.id ? (
                                <Loader2 size={14} className="animate-spin" />
                              ) : (
                                <Camera size={14} />
                              )}
                              上传照片
                            </button>
                          )}
                          <div onClick={(e) => e.stopPropagation()}>
                            <ShareCard
                              placeName={place.name}
                              dayLabel={`Day ${dayIndex + 1}`}
                              address={place.address}
                              description={place.description}
                              photos={placePhotos.map(p => p.dataUrl)}
                            />
                          </div>
                        </div>
                      )}

                      {/* 非照片模式：原有操作按钮 */}
                      {!photoMode && isCurrent && (
                        <div className="flex gap-2 border-t border-gray-100 pt-4 mt-2">
                          <button
                            onClick={() => openGaodeNavigation(place)}
                            className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-bold text-[11px] uppercase tracking-wide shadow-lg shadow-blue-100"
                          >
                            地图导航
                          </button>
                          <button
                            onClick={() => handleSwap(place, idx)}
                            className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-400 font-bold text-[11px] uppercase tracking-wide"
                          >
                            换个地方
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 所有景点都结束了（超过最后一个景点的结束时间后才显示） */}
      {currentPlaceIndex >= today!.places.length - 1 && currentPlaceIndex !== -1 && (() => {
        const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
        const lastEnd = parseEndMinutes(today!.places[today!.places.length - 1].timeSlot);
        return nowMinutes >= lastEnd ? (
          <div className="mt-8 text-center py-4 bg-blue-50 rounded-2xl border border-blue-100">
            <p className="text-sm font-bold text-blue-700">
              🎉 今日行程全部完成！
            </p>
            {dayIndex < trip.days.length - 1 && (
              <p className="text-xs text-blue-500 mt-1">
                明天还有 Day {dayIndex + 2} 的精彩行程等着你
              </p>
            )}
          </div>
        ) : null;
      })()}

      {/* 换个地方 弹窗 */}
      <AnimatePresence>
        {swapPlace && (
          <div className="fixed inset-0 z-[150] flex items-end justify-center">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { setSwapPlace(null); setAlternatives([]); }}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="w-full max-w-md bg-white rounded-3xl rounded-b-none shadow-2xl relative z-20 max-h-[70vh] flex flex-col"
            >
              <div className="flex items-center justify-between p-6 border-b border-gray-100">
                <div>
                  <h3 className="text-lg font-bold text-[#1A1A1A]">换个地方</h3>
                  <p className="text-xs text-gray-400 mt-0.5">替代 {swapPlace.place.name}</p>
                </div>
                <button
                  onClick={() => { setSwapPlace(null); setAlternatives([]); }}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-400 hover:bg-gray-200"
                >
                  ✕
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {loadingAlts ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 size={24} className="animate-spin text-blue-600" />
                  </div>
                ) : alternatives.length === 0 ? (
                  <div className="text-center py-12 text-gray-400 text-sm">
                    暂无推荐替代景点
                  </div>
                ) : (
                  alternatives.map((alt, i) => (
                    <div
                      key={i}
                      className="p-4 rounded-xl border border-gray-100 hover:border-blue-200 hover:shadow-sm transition-all"
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
                          <MapPin size={16} className="text-blue-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-bold text-[#1A1A1A]">{alt.name}</h4>
                          <p className="text-[10px] text-gray-400 mt-0.5 truncate">
                            {alt.category || '景点'} {alt.rating ? `· ⭐ ${alt.rating}` : ''}
                          </p>
                          {alt.address && (
                            <p className="text-[10px] text-gray-400 mt-0.5">{alt.address}</p>
                          )}
                          <p className="text-[11px] text-gray-500 mt-1.5 line-clamp-2 leading-relaxed">
                            {alt.description}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleConfirmSwap(alt)}
                        className="mt-3 w-full py-2.5 rounded-xl bg-blue-600 text-white text-[11px] font-bold shadow-sm hover:bg-blue-700 transition-colors"
                      >
                        替换为此景点
                      </button>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
