import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trip, Place } from '../types';
import { CheckCircle2, Circle, Clock, MapPin, Navigation, Calendar, RefreshCcw, Loader2, Star } from 'lucide-react';
import { getAlternatives } from '../services/deepSeekService';
import { openGaodeNavigation } from '../services/navigationService';
import { PlaceImage } from './PlaceImage';

/** 从 timeSlot（如 "09:00 - 11:00"）解析出开始时间的分钟数 */
const parseStartMinutes = (timeSlot: string): number => {
  const match = timeSlot.match(/(\d{1,2}):(\d{2})/);
  if (!match) return 0;
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

  // 换个地方状态
  const [swapPlace, setSwapPlace] = useState<{ place: Place; dayIdx: number } | null>(null);
  const [alternatives, setAlternatives] = useState<any[]>([]);
  const [loadingAlts, setLoadingAlts] = useState(false);

  if (!trip) return (
    <div className="flex flex-col items-center justify-center h-full px-12 text-center text-gray-400 py-20">
      <Clock size={32} className="mb-4" />
      <p>开始一次旅行后，这里将显示实时进度</p>
    </div>
  );

  const dayIndex = getCurrentDayIndex(trip);

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

  const today = trip.days[dayIndex];
  const currentPlaceIndex = findCurrentPlaceIndex(today.places);

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
      <div className="flex items-center justify-between mb-10">
        <div>
          <h2 className="text-2xl font-bold text-[#1A1A1A]">实时路线</h2>
          <p className="text-xs text-gray-400 font-medium uppercase tracking-widest mt-1">
            {trip.destination} · Day {dayIndex + 1} · {currentTime}
          </p>
        </div>
        <div className="flex items-center gap-2 bg-green-50 px-3 py-1.5 rounded-full border border-green-100">
          <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
          <span className="text-[10px] font-bold text-green-700 uppercase tracking-tighter">实时同步</span>
        </div>
      </div>

      <div className="relative">
        <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-gray-100" />

        <div className="space-y-12">
          {today.places.map((place, idx) => {
            const status = getPlaceStatus(idx, currentPlaceIndex);
            const isCompleted = status === 'completed';
            const isCurrent = status === 'current';

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

                <div className={`p-5 rounded-2xl border transition-all ${
                  isCurrent 
                    ? 'border-blue-600 bg-white minimalism-shadow scale-[1.02]' 
                    : isCompleted 
                      ? 'border-gray-50 bg-gray-50/50 opacity-60' 
                      : 'border-gray-100 bg-white'
                }`}>
                  <div className="flex gap-3 items-start">
                    {!isCompleted && <PlaceImage placeName={place.name} city={trip.destination} size="sm" className="mt-0.5 flex-shrink-0" />}
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
                      
                      {isCurrent && (
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

      {/* 所有景点都结束了 */}
      {currentPlaceIndex >= today.places.length - 1 && currentPlaceIndex !== -1 && (
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
      )}

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
