import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Send, Sparkles, History, MapPin, Check, X, Clock, Calendar, ListOrdered, AlertTriangle } from 'lucide-react';
import { generateTrip, modifyTrip, analyzeIntent } from '../services/deepSeekService';
import { Trip, UserPreferences } from '../types';

/** 计算两点间的大圆距离（Haversine 公式） */
function haversineKm(a?: { lat: number; lng: number }, b?: { lat: number; lng: number }): number | null {
  if (!a || !b) return null;
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  return Math.round(R * 2 * Math.atan2(
    Math.sqrt(sinDLat * sinDLat + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * sinDLng * sinDLng),
    Math.sqrt(1 - (sinDLat * sinDLat + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * sinDLng * sinDLng))
  ));
}

/** 检查行程中是否有距离过远的景点对 */
function findFarDistances(trip: Trip): { day: number; from: string; to: string; km: number }[] {
  const warnings: { day: number; from: string; to: string; km: number }[] = [];
  trip.days.forEach((day) => {
    for (let i = 0; i < day.places.length - 1; i++) {
      const a = day.places[i].coordinates;
      const b = day.places[i + 1].coordinates;
      const km = haversineKm(a, b);
      if (km !== null && km > 30) {
        warnings.push({ day: day.day, from: day.places[i].name, to: day.places[i + 1].name, km });
      }
    }
  });
  return warnings;
}
import { LocationInfo } from '../services/locationService';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  trip?: Trip;
  isPreview?: boolean;
}

interface TripFormData {
  destination: string;
  days: number;
  placesPerDay: number;
  startTime: string;
  endTime: string;
  startDate: string;
  startPoint: string;
  endPoint: string;
}

/** 本地解析用户输入，提取行程信息 */
function parseTripInput(input: string): Partial<TripFormData> {
  const result: Partial<TripFormData> = {};

  // 目的地：尝试提取 "去/到/前往 X" 模式
  const destMatch = input.match(/(?:去|到|前往|规划|安排|想去|游|玩|在|的)\s*([\u4e00-\u9fff]{2,6})/);
  if (destMatch) {
    result.destination = destMatch[1];
  } else {
    // 去掉数字和常见词，剩下的可能就是目的地
    const clean = input.replace(/(\d+\s*天|\d+\s*日\s*游|[一二三四五六七八九十]+\s*日\s*游|[一二三四五六七八九十]+\s*天|\d+\s*个\s*景点?|每天\s*\d+|出发|开始|规划)/g, '').trim();
    const cityMatch = clean.match(/([\u4e00-\u9fff]{2,4})/);
    if (cityMatch) {
      result.destination = cityMatch[1];
    }
  }

  const chineseNumMap: Record<string, number> = { '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10 };

  // 天数（支持中文数字：一日、两天、三日游）
  const dayMatch = input.match(/(\d+)\s*天|([一两三四五六七八九十])\s*天|(\d+)\s*日\s*游|([一二三四五六七八九十])\s*日\s*游/);
  if (dayMatch) {
    if (dayMatch[1]) result.days = parseInt(dayMatch[1]);
    else if (dayMatch[2]) result.days = chineseNumMap[dayMatch[2]] || 1;
    else if (dayMatch[3]) result.days = parseInt(dayMatch[3]);
    else if (dayMatch[4]) result.days = chineseNumMap[dayMatch[4]] || 1;
  }

  // 每日景点数（支持中文数字：两个景点、三个地方）
  const placesMatch = input.match(/(?:每天|每日)\s*(\d+)\s*个|(\d+)\s*个\s*(?:景点|地方)|([一两三四五六七八九十])\s*个\s*(?:景点|地方)|每[天日]\s*([一两三四五六七八九十])\s*个/);
  if (placesMatch) {
    if (placesMatch[1]) result.placesPerDay = parseInt(placesMatch[1]);
    else if (placesMatch[2]) result.placesPerDay = parseInt(placesMatch[2]);
    else if (placesMatch[3]) result.placesPerDay = chineseNumMap[placesMatch[3]] || 3;
    else if (placesMatch[4]) result.placesPerDay = chineseNumMap[placesMatch[4]] || 3;
  }

  // 开始时间
  const timeMatch = input.match(/(\d{1,2})\s*[：:]\s*(\d{2})\s*(?:出发|开始)?|(\d{1,2})\s*点\s*(?:出发|开始)?/);
  if (timeMatch) {
    if (timeMatch[1] && timeMatch[2]) {
      result.startTime = `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`;
    } else if (timeMatch[3]) {
      result.startTime = `${timeMatch[3].padStart(2, '0')}:00`;
    }
  }

  // 结束时间
  const endMatch = input.match(/(?:到|结束|回来|收工|结)?\s*(\d{1,2})\s*[：:]\s*(\d{2})\s*(?:结束|回来|收工)?\s*$|(\d{1,2})\s*点\s*(?:结束|回来|收工|到)/);
  if (endMatch) {
    if (endMatch[1] && endMatch[2]) {
      result.endTime = `${endMatch[1].padStart(2, '0')}:${endMatch[2]}`;
    } else if (endMatch[3]) {
      result.endTime = `${endMatch[3].padStart(2, '0')}:00`;
    }
  } else {
    // 尝试匹配 "从X点到Y点" 模式，Y点就是结束
    const rangeMatch = input.match(/从\s*(\d{1,2})\s*点\s*(?:到|至)\s*(\d{1,2})\s*点/);
    if (rangeMatch) {
      result.startTime = `${rangeMatch[1].padStart(2, '0')}:00`;
      result.endTime = `${rangeMatch[2].padStart(2, '0')}:00`;
    }
  }

  return result;
}

/** 检查信息是否完整 */
function isFormComplete(data: Partial<TripFormData>): boolean {
  return !!(data.destination && data.days && data.placesPerDay && data.startTime && data.endTime && data.startDate);
}

/** 填充默认值 */
function fillDefaults(data: Partial<TripFormData>): TripFormData {
  const today = new Date();
  const defaultDate = `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}`;
  return {
    destination: data.destination || '',
    days: data.days || 3,
    placesPerDay: data.placesPerDay || 4,
    startTime: data.startTime || '09:00',
    endTime: data.endTime || '18:00',
    startDate: data.startDate || defaultDate,
    startPoint: data.startPoint || '',
    endPoint: data.endPoint || '',
  };
}

export const HomeView = ({
  onTripGenerated,
  onViewTrip,
  preferences,
  userLocation,
  hasExistingTrip = false,
  existingTrip,
}: {
  onTripGenerated: (trip: Trip) => void;
  onViewTrip?: () => void;
  preferences: UserPreferences;
  userLocation?: LocationInfo | null;
  hasExistingTrip?: boolean;
  existingTrip?: Trip | null;
}) => {
  const [input, setInput] = useState('');

  // 从 localStorage 加载历史对话
  const loadMessages = (): Message[] => {
    const saved = localStorage.getItem('chat_history');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        // 解析失败，使用默认欢迎消息
      }
    }
    return [
      {
        id: 'welcome',
        role: 'assistant',
        content: userLocation
          ? `你好！我是你的旅游助手。检测到你在${userLocation.city || userLocation.district || '当前位置'}，想去哪里玩？`
          : '你好！我是你的旅游助手。想去哪里玩？告诉我你的目的地，比如"帮我规划三天杭州旅行"。'
      }
    ];
  };

  const [messages, setMessages] = useState<Message[]>(loadMessages);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<TripFormData>({ destination: '', days: 3, placesPerDay: 4, startTime: '09:00', endTime: '18:00', startDate: new Date().toISOString().slice(0, 10), startPoint: '', endPoint: '' });
  const [latestUserInput, setLatestUserInput] = useState('');
  const [distanceWarning, setDistanceWarning] = useState<{ trip: Trip; warnings: { day: number; from: string; to: string; km: number }[] } | null>(null);
  const [showCleanup, setShowCleanup] = useState(false);
  const cleanupDismissedCount = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 保存对话历史到 localStorage
  useEffect(() => {
    localStorage.setItem('chat_history', JSON.stringify(messages));
  }, [messages]);

  // 检测对话数量，提示清理
  useEffect(() => {
    const totalMsgs = messages.length;
    if (totalMsgs > 20 && !showCleanup) {
      // 上次忽略后又增加了 10 条再提醒
      const sinceDismiss = totalMsgs - 20 - cleanupDismissedCount.current * 10;
      if (sinceDismiss >= 10) {
        setShowCleanup(true);
      }
    }
  }, [messages.length, showCleanup]);

  const handleCleanup = (keepCount: number) => {
    const keep = messages.slice(-keepCount);
    setMessages(keep);
    setShowCleanup(false);
    cleanupDismissedCount.current = 0;
  };

  const handleDismissCleanup = () => {
    setShowCleanup(false);
    cleanupDismissedCount.current += 1;
  };

  // 滚动到底部
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading, showForm]);

  const handleGenerateTrip = async (form: TripFormData, userInput: string, convHistory: Message[]) => {
    setLoading(true);
    setShowForm(false);

    try {
      const conversationHistory = convHistory.slice(-10).map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`);
      const promptParts = [
        `${userInput}（行程要求：${form.destination}，${form.days}天`,
        `${form.startDate}出发`,
        `每天${form.placesPerDay}个景点`,
        `${form.startTime}开始，${form.endTime}结束`,
      ];
      if (form.startPoint) promptParts.push(`每日起点：${form.startPoint}`);
      if (form.endPoint) promptParts.push(`每日终点：${form.endPoint}`);
      const fullPrompt = promptParts.join('，') + '）';

      const trip = await generateTrip(fullPrompt, preferences, conversationHistory);
      trip.startPoint = form.startPoint || undefined;
      trip.endPoint = form.endPoint || undefined;
      const warnings = findFarDistances(trip);

      if (warnings.length > 0) {
        setDistanceWarning({ trip, warnings });
      } else if (hasExistingTrip) {
        const assistantMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: `我为你规划了一个新的 ${trip.destination} ${trip.duration} 天行程，要替换当前行程吗？`,
          trip: { ...trip, startDate: form.startDate },
          isPreview: true
        };
        setMessages(prev => [...prev, assistantMsg]);
      } else {
        const tripWithDate = { ...trip, startDate: form.startDate };
        const assistantMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: `太棒了！我已经为你规划好了前往 ${tripWithDate.destination} 的 ${tripWithDate.duration} 天行程。`,
          trip: tripWithDate,
          isPreview: false
        };
        setMessages(prev => [...prev, assistantMsg]);
        onTripGenerated(tripWithDate);
        localStorage.setItem('current_trip', JSON.stringify(tripWithDate));
      }
    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '抱歉，规划行程时出了一点小问题。请再试一次。'
      }]);
    } finally {
      setLoading(false);
    }
  };

  /** 用户选择了继续使用（忽略距离警告） */
  const confirmFarTrip = () => {
    if (!distanceWarning) return;
    const { trip } = distanceWarning;
    const startDate = trip.startDate || new Date().toISOString().slice(0, 10);
    setDistanceWarning(null);

    if (hasExistingTrip) {
      const msg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `我为你规划了一个新的 ${trip.destination} ${trip.duration} 天行程，要替换当前行程吗？`,
        trip: { ...trip, startDate },
        isPreview: true,
      };
      setMessages(prev => [...prev, msg]);
    } else {
      const tripWithDate = { ...trip, startDate };
      const msg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `太棒了！我已经为你规划好了前往 ${tripWithDate.destination} 的 ${tripWithDate.duration} 天行程。`,
        trip: tripWithDate,
        isPreview: false,
      };
      setMessages(prev => [...prev, msg]);
      onTripGenerated(tripWithDate);
      localStorage.setItem('current_trip', JSON.stringify(tripWithDate));
    }
  };

  /** 用户要求重新规划（避开远距离景点对） */
  const regenerateWithWarning = async () => {
    if (!distanceWarning) return;
    const { trip, warnings } = distanceWarning;
    setDistanceWarning(null);

    // 把距离警告作为约束发给 AI 重新生成
    const constraintText = warnings
      .map(w => `第${w.day}天的"${w.from}"和"${w.to}"相距${w.km}km，请将它们分到不同天或替换成更近的景点。`)
      .join('；');
    const retryPrompt = `刚才的方案存在距离问题：${constraintText}。请重新规划，确保同一天景点在同一区域。目的地：${trip.destination}，${trip.duration}天。`;

    setLoading(true);
    try {
      const convHistory = messages.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`);
      const newTrip = await generateTrip(retryPrompt, preferences, [...convHistory, `User: ${retryPrompt}`]);
      const newWarnings = findFarDistances(newTrip);

      if (newWarnings.length > 0) {
        // 还有警告，再次展示（最多提示一次后直接出结果避免死循环） */
        setDistanceWarning({ trip: newTrip, warnings: newWarnings });
      } else if (hasExistingTrip) {
        setMessages(prev => [...prev, {
          id: (Date.now() + 1).toString(), role: 'assistant',
          content: `我重新规划了一个新的 ${newTrip.destination} ${newTrip.duration} 天行程，要替换当前行程吗？`,
          trip: { ...newTrip, startDate: trip.startDate || new Date().toISOString().slice(0, 10) }, isPreview: true,
        }]);
      } else {
        const tripWithDate = { ...newTrip, startDate: trip.startDate || new Date().toISOString().slice(0, 10) };
        setMessages(prev => [...prev, {
          id: (Date.now() + 1).toString(), role: 'assistant',
          content: `重新规划好了！前往 ${newTrip.destination} 的 ${newTrip.duration} 天行程。`,
          trip: tripWithDate, isPreview: false,
        }]);
        onTripGenerated(tripWithDate);
        localStorage.setItem('current_trip', JSON.stringify(tripWithDate));
      }
    } catch {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(), role: 'assistant',
        content: '重新规划时出了点问题，这是原始方案，你看看能不能接受？',
        trip: { ...trip, startDate: trip.startDate || new Date().toISOString().slice(0, 10) }, isPreview: hasExistingTrip,
      }]);
    } finally {
      setLoading(false);
    }
  };

  /** 判断用户输入是否为行程修改意图（而非新一轮规划） */
  const isModificationIntent = (input: string, hasCurrentTrip: boolean): boolean => {
    if (!hasCurrentTrip) return false;

    // 修改关键词
    const modifyVerbs = /修改|调整|更改|改[了一成]?下?|换[掉了一个成]?|替换|重新安排|重新规划|重新调整/;
    const targets = /第[一二三四五六七八九十\d]+天|行程|路线|路线安排|景点安排|当日行程|当天安排|景点|安排/;

    // 第一种："修改第X天" / "调整行程" / "换掉XX景点"
    if (modifyVerbs.test(input) && targets.test(input)) return true;

    // 第二种："改一下" / "改成" / "换成" + 行程/路线/景点
    if (/改[了一成]?下?/.test(input) && /行程|路线|景点|安排/.test(input)) return true;
    if (/换[了一个成]?/.test(input) && /行程|路线|景点|安排/.test(input)) return true;
    // "调整X个景点"
    if (/调整\s*\d+\s*个/.test(input)) return true;

    // 第三种："把X改成/换成Y" — 典型修改模式，无需指定目标词
    if (/把\s*\S{2,}\s*(改成|换成)/.test(input)) return true;
    if (/\S{2,}\s*(改成|换成)\s*\S{2,}/.test(input)) return true;

    // 第四种：住宿相关修改
    if (/住(在)?\s*\S{2,}\s*(附近|这边?)/.test(input) && /调整|修改|改|换|重新/.test(input)) return true;
    if (/住宿|酒店|民宿/.test(input) && /调整|修改|改|换|重新/.test(input)) return true;

    // 第五种：针对某天的具体微调
    if (/(第[一二三四五六七八九十\d]+天|明天|后天|今天).{0,8}(加[一]?[个座]?|去掉|删除|换[成掉]?)/.test(input)) return true;
    if (/(加[一]?[个座]?|去掉|删除|换[成掉]?|增加|减少).{0,8}(第[一二三四五六七八九十\d]+天|景点|行程)/.test(input)) return true;

    return false;
  };

  /** 处理行程修改请求 */
  const handleModifyTrip = async (userInput: string, existingTrip: Trip, allMessages: Message[]) => {
    setLoading(true);

    try {
      // 如果用户没指定第几天，默认改第一天
      const hasDaySpecified = /第[一二三四五六七八九十\d]+天/.test(userInput);
      const modifyInput = hasDaySpecified ? userInput : `调整第1天。${userInput}`;

      const convHistory = allMessages
        .filter(m => !m.trip || m.trip.destination === existingTrip.destination)
        .slice(-5)
        .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`);
      const modifiedTrip = await modifyTrip(existingTrip, modifyInput, convHistory);
      const tripWithDate = { ...modifiedTrip, startDate: existingTrip.startDate || new Date().toISOString().slice(0, 10), startPoint: modifiedTrip.startPoint || existingTrip.startPoint, endPoint: modifiedTrip.endPoint || existingTrip.endPoint };

      const assistantMsg: Message = {
        id: (Date.now() + 2).toString(),
        role: 'assistant',
        content: `已根据你的要求调整了行程 ✨`,
        trip: tripWithDate,
        isPreview: true,
      };
      setMessages(prev => [...prev, assistantMsg]);
      onTripGenerated(tripWithDate);
      localStorage.setItem('current_trip', JSON.stringify(tripWithDate));
    } catch {
      setMessages(prev => [...prev, {
        id: (Date.now() + 2).toString(),
        role: 'assistant',
        content: '修改行程时出了点问题，请再试一次。'
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userInput = input.trim();
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: userInput };
    
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput('');
    setLatestUserInput(userInput);

    // 判断是否已有行程（消息中有 trip 对象或 hasExistingTrip）
    var hasTrip = hasExistingTrip || messages.some(function (m) { return !!m.trip; });

    // ⭐ 行程修改检测：有当前行程 + 修改意图 → 走修改流程（不触发表单/不重新规划整段）
    var currentTrip: Trip | null = existingTrip || null;
    if (!currentTrip && hasTrip) {
      for (var mt = messages.length - 1; mt >= 0; mt--) {
        if (messages[mt].trip) { currentTrip = messages[mt].trip || null; break; }
      }
    }
    if (hasTrip && currentTrip && isModificationIntent(userInput, true)) {
      await handleModifyTrip(userInput, currentTrip, updatedMessages);
      return;
    }

    // ⭐ 正则没匹配上时，用 AI 兜底分析，防止遗漏模糊修改意图
    // 但如果解析输入已发现明确的新目的地（与当前行程不同），跳过 AI 分析直接弹表单
    var isAIModification = false;
    var parsedPre = parseTripInput(userInput);
    var hasNewDestPre = !!(parsedPre.destination && parsedPre.destination.length >= 2 && 
      parsedPre.destination !== (currentTrip && currentTrip.destination));
    if (hasTrip && currentTrip && !isModificationIntent(userInput, true) && !hasNewDestPre) {
      try {
        const historyTexts = updatedMessages
          .filter(m => !m.trip || m.trip.destination === currentTrip.destination)
          .slice(-3)
          .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content || ''}`);
        const intent = await analyzeIntent(userInput, historyTexts);
        isAIModification = intent.isModification;
      } catch {
        // AI 分析失败则静默回退到常规流程
      }
    }
    if (isAIModification && currentTrip) {
      await handleModifyTrip(userInput, currentTrip, updatedMessages);
      return;
    }

    // 本地解析输入
    var parsed = parseTripInput(userInput);
    
    // ⭐ 非修改、无旅行信息 → 纯闲聊/无关话题，不触发任何规划
    var hasValidDest = !!parsed.destination && !/今天|明天|昨天|天气|你好|谢谢|请问|哈哈|哈哈|嗯好|好的|知道|随便/.test(parsed.destination);
    var hasAnyTravelInfo = hasValidDest || !!parsed.days || !!parsed.placesPerDay || !!parsed.startTime || !!parsed.endTime;
    if (!hasAnyTravelInfo) {
      setMessages(prev => [...prev, {
        id: (Date.now() + 2).toString(),
        role: 'assistant',
        content: '我是旅游规划助手，可以帮你规划行程。想去哪里玩？告诉我目的地和天数就行 😊'
      }]);
      return;
    }

    // 已存在行程且输入没有明确的新目的地 → 追问模式，跳过表单
    
    // 已存在行程且输入没有明确的新目的地 → 追问模式，跳过表单
    var hasNewDest = !!(parsed.destination && parsed.destination.length >= 2);
    if (hasTrip && !hasNewDest) {
      // 尝试从已有行程中提取目的地
      var existingDest = '';
      var existingDays = 0;
      for (var mi = messages.length - 1; mi >= 0; mi--) {
        var m = messages[mi];
        if (m.trip && m.trip.destination) {
          existingDest = m.trip.destination;
          existingDays = m.trip.duration || 3;
          break;
        }
      }
      var mergeForm: TripFormData = {
        destination: existingDest || parsed.destination || '',
        days: parsed.days || existingDays || 3,
        placesPerDay: parsed.placesPerDay || 4,
        startTime: parsed.startTime || '09:00',
        endTime: parsed.endTime || '18:00',
        startDate: parsed.startDate || new Date().toISOString().slice(0, 10),
        startPoint: '',
        endPoint: '',
      };
      await handleGenerateTrip(mergeForm, userInput, updatedMessages);
      return;
    }

    if (isFormComplete(parsed)) {
      // 信息完整，直接生成
      const completeForm = fillDefaults(parsed);
      await handleGenerateTrip(completeForm, userInput, updatedMessages);
    } else {
      // 信息不完整，展示表单
      setFormData(fillDefaults(parsed));
      setShowForm(true);
    }
  };

  const handleFormSubmit = () => {
    const updatedMessages = [...messages, ...(showForm ? [] : [])]; // current messages
    handleGenerateTrip(formData, latestUserInput, updatedMessages);
  };

  const templates = [
    "京都赏樱三日游",
    "上海周末艺术发现",
    "曼谷美食深夜之旅",
  ];

  return (
    <div className="flex flex-col h-full bg-white relative">
      {/* Chat Area — 底部留空给固定输入区 */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-6 py-6 pb-44 space-y-6 scroll-smooth"
      >
        <AnimatePresence initial={false}>
          {showCleanup && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex items-center justify-between gap-3 bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3"
            >
              <div className="flex items-center gap-2 text-[12px] text-yellow-700">
                <History size={14} />
                <span>对话已有 <strong>{messages.length}</strong> 条记录</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => handleCleanup(20)}
                  className="text-[11px] bg-yellow-600 text-white px-3 py-1.5 rounded-lg font-bold hover:bg-yellow-700 transition-colors"
                >
                  清理（保留最近20条）
                </button>
                <button
                  onClick={handleDismissCleanup}
                  className="text-[11px] text-yellow-500 px-2 py-1.5 rounded-lg hover:bg-yellow-100 transition-colors"
                >
                  暂不
                </button>
              </div>
            </motion.div>
          )}
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div className={`max-w-[85%] rounded-2xl p-4 shadow-sm ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white rounded-br-none'
                  : 'bg-gray-100 text-[#1A1A1A] rounded-bl-none'
              }`}>
                <p className="text-[14px] leading-relaxed font-medium">{msg.content}</p>

                {msg.trip && (
                  <div className="mt-3 space-y-2">
                    {msg.isPreview ? (
                      <>
                        <button
                          onClick={() => {
                            onTripGenerated(msg.trip!);
                            const updatedMessages = messages.map(m => 
                              m.id === msg.id ? { ...m, isPreview: false } : m
                            );
                            setMessages(updatedMessages);
                            setTimeout(() => {
                              if (onViewTrip) onViewTrip();
                            }, 300);
                          }}
                          className="w-full bg-green-600 text-white py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 shadow-sm hover:bg-green-700 transition-colors"
                        >
                          <Check size={16} />
                          确认使用此行程
                        </button>
                        <button
                          onClick={() => {
                            const updatedMessages = messages.filter(m => m.id !== msg.id);
                            setMessages(updatedMessages);
                          }}
                          className="w-full bg-white text-gray-600 border border-gray-200 py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-gray-50 transition-colors"
                        >
                          <X size={16} />
                          保持原行程
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => {
                          onTripGenerated(msg.trip!);
                          setTimeout(() => {
                            if (onViewTrip) onViewTrip();
                          }, 300);
                        }}
                        className="w-full bg-white text-blue-600 py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 shadow-sm hover:bg-white/90 transition-colors"
                      >
                        <MapPin size={16} />
                        查看详细行程
                      </button>
                    )}
                  </div>
                )}
              </div>
              <span className="text-[10px] text-gray-400 mt-1 mx-1 uppercase tracking-tighter">
                {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </motion.div>
          ))}

          {/* Form Card */}
          {showForm && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-start w-full"
            >
              <div className="w-full bg-white rounded-2xl border border-blue-100 shadow-lg p-6 space-y-5">
                {/* Header */}
                <div className="flex items-center gap-2 pb-3 border-b border-gray-50">
                  <div className="w-8 h-8 bg-blue-50 rounded-full flex items-center justify-center">
                    <Sparkles size={16} className="text-blue-600" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-[#1A1A1A]">行程信息确认</h3>
                    <p className="text-[10px] text-gray-400">请确认或补充以下信息</p>
                  </div>
                </div>

                {/* 目的地 */}
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                    <MapPin size={12} /> 目的地
                  </label>
                  <input
                    type="text"
                    value={formData.destination}
                    onChange={(e) => setFormData({ ...formData, destination: e.target.value })}
                    placeholder="如：东京"
                    className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-sm font-bold text-[#1A1A1A] focus:outline-none focus:border-blue-400 focus:bg-white transition-all"
                  />
                </div>

                {/* 出发日期 */}
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                    <Calendar size={12} /> 出发日期
                  </label>
                  <input
                    type="text"
                    value={formData.startDate}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^0-9]/g, '');
                      let formatted = raw;
                      if (raw.length > 4) formatted = raw.slice(0, 4) + '-' + raw.slice(4);
                      if (raw.length > 6) formatted = formatted.slice(0, 7) + '-' + formatted.slice(7);
                      if (formatted.length > 10) formatted = formatted.slice(0, 10);
                      setFormData({ ...formData, startDate: formatted });
                    }}
                    placeholder="2026-05-15"
                    inputMode="numeric"
                    className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-sm font-bold text-[#1A1A1A] focus:outline-none focus:border-blue-400 focus:bg-white transition-all"
                  />
                </div>

                {/* 第一行：天数 / 景点数 */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                      <Calendar size={12} /> 天数
                    </label>
                    <div className="flex items-center bg-gray-50 border border-gray-100 rounded-xl overflow-hidden focus-within:border-blue-400 focus-within:bg-white transition-all">
                      <button
                        onClick={() => setFormData({ ...formData, days: Math.max(1, formData.days - 1) })}
                        className="px-2.5 py-3 text-gray-400 hover:text-blue-600 font-bold text-sm"
                      >−</button>
                      <input
                        type="number"
                        min={1}
                        max={30}
                        value={formData.days}
                        onChange={(e) => setFormData({ ...formData, days: Math.max(1, parseInt(e.target.value) || 1) })}
                        className="w-full bg-transparent text-center text-sm font-bold text-[#1A1A1A] focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <button
                        onClick={() => setFormData({ ...formData, days: Math.min(30, formData.days + 1) })}
                        className="px-2.5 py-3 text-gray-400 hover:text-blue-600 font-bold text-sm"
                      >+</button>
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                      <ListOrdered size={12} /> 景点/天
                    </label>
                    <div className="flex items-center bg-gray-50 border border-gray-100 rounded-xl overflow-hidden focus-within:border-blue-400 focus-within:bg-white transition-all">
                      <button
                        onClick={() => setFormData({ ...formData, placesPerDay: Math.max(1, formData.placesPerDay - 1) })}
                        className="px-2.5 py-3 text-gray-400 hover:text-blue-600 font-bold text-sm"
                      >−</button>
                      <input
                        type="number"
                        min={1}
                        max={10}
                        value={formData.placesPerDay}
                        onChange={(e) => setFormData({ ...formData, placesPerDay: Math.max(1, parseInt(e.target.value) || 1) })}
                        className="w-full bg-transparent text-center text-sm font-bold text-[#1A1A1A] focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <button
                        onClick={() => setFormData({ ...formData, placesPerDay: Math.min(10, formData.placesPerDay + 1) })}
                        className="px-2.5 py-3 text-gray-400 hover:text-blue-600 font-bold text-sm"
                      >+</button>
                    </div>
                  </div>
                </div>

                {/* 第二行：开始时间 / 结束时间 */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                      <Clock size={12} /> 开始时间
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={5}
                      value={formData.startTime}
                      onChange={(e) => {
                        let v = e.target.value.replace(/[^0-9:]/g, '');
                        if (v.length > 2 && v[2] !== ':') v = v.slice(0, 2) + ':' + v.slice(2);
                        if (v.length > 5) v = v.slice(0, 5);
                        setFormData({ ...formData, startTime: v });
                      }}
                      placeholder="09:00"
                      className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-3 text-sm font-bold text-[#1A1A1A] text-center focus:outline-none focus:border-blue-400 focus:bg-white transition-all"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                      <Clock size={12} /> 结束时间
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={5}
                      value={formData.endTime}
                      onChange={(e) => {
                        let v = e.target.value.replace(/[^0-9:]/g, '');
                        if (v.length > 2 && v[2] !== ':') v = v.slice(0, 2) + ':' + v.slice(2);
                        if (v.length > 5) v = v.slice(0, 5);
                        setFormData({ ...formData, endTime: v });
                      }}
                      placeholder="18:00"
                      className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-3 text-sm font-bold text-[#1A1A1A] text-center focus:outline-none focus:border-blue-400 focus:bg-white transition-all"
                    />
                  </div>
                </div>

                {/* 每日起止点（选填） */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                      <MapPin size={12} /> 每日起点 <span className="text-blue-400 font-bold text-[10px]">选填</span>
                    </label>
                    <input
                      type="text"
                      value={formData.startPoint}
                      onChange={(e) => setFormData(prev => ({ ...prev, startPoint: e.target.value, endPoint: prev.endPoint || e.target.value }))}
                      placeholder="如：酒店名称或地址"
                      className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-sm font-bold text-[#1A1A1A] focus:outline-none focus:border-blue-400 focus:bg-white transition-all"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                      <MapPin size={12} /> 每日终点 <span className="text-blue-400 font-bold text-[10px]">选填</span>
                    </label>
                    <input
                      type="text"
                      value={formData.endPoint}
                      onChange={(e) => {
                        setFormData(prev => ({ ...prev, endPoint: e.target.value }));
                      }}
                      placeholder="如：酒店名称或地址"
                      className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-sm font-bold text-[#1A1A1A] focus:outline-none focus:border-blue-400 focus:bg-white transition-all"
                    />
                  </div>
                </div>

                {/* Submit button */}
                <button
                  onClick={handleFormSubmit}
                  disabled={!formData.destination.trim()}
                  className="w-full bg-blue-600 text-white py-3.5 rounded-xl font-bold text-sm shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] flex items-center justify-center gap-2"
                >
                  <Sparkles size={16} />
                  生成行程
                </button>

                {/* Cancel */}
                <button
                  onClick={() => setShowForm(false)}
                  className="w-full text-center text-[11px] text-gray-400 hover:text-gray-600 font-medium"
                >
                  取消，重新输入
                </button>
              </div>
            </motion.div>
          )}

          {loading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex justify-start"
            >
              <div className="bg-gray-100 rounded-2xl rounded-bl-none px-5 py-3.5 flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce"></span>
                <span className="text-xs text-gray-500 ml-2 font-medium">AI 正在生成计划...</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 距离警告弹窗 */}
      <AnimatePresence>
        {distanceWarning && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="fixed left-1/2 -translate-x-1/2 bottom-28 z-40 w-full max-w-md px-6"
          >
            <div className="bg-white rounded-2xl border border-orange-200 shadow-lg p-5 space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-orange-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <AlertTriangle size={18} className="text-orange-500" />
                </div>
                <div className="flex-1">
                  <h4 className="text-sm font-bold text-[#1A1A1A]">距离较远，确认一下？</h4>
                  <div className="mt-2 space-y-1">
                    {distanceWarning.warnings.map((w, i) => (
                      <p key={i} className="text-[11px] text-gray-500 leading-relaxed">
                        <span className="font-bold text-orange-600">第{w.day}天</span> 「{w.from}」到「{w.to}」
                        <span className="font-bold text-orange-600"> 约{w.km}km</span>
                      </p>
                    ))}
                  </div>
                  <p className="text-[10px] text-gray-400 mt-2">距离较远可能影响行程节奏，是否重新规划？</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={confirmFarTrip}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold text-gray-500 bg-gray-50 border border-gray-200 hover:bg-gray-100 transition-colors"
                >
                  继续使用
                </button>
                <button
                  onClick={regenerateWithWarning}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-orange-500 hover:bg-orange-600 transition-colors"
                >
                  换掉远距离景点
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input Area — 固定在底部（白色底板延伸到 nav，防止镂空漏出） */}
      <div className="fixed left-1/2 -translate-x-1/2 bottom-0 z-30 w-full max-w-md bg-white">
        <div className="p-6 pb-0 border-t border-gray-100">
          <div className="flex gap-2 mb-4 overflow-x-auto pb-2 scrollbar-hide">
          <div className="flex items-center gap-2 flex-nowrap">
            {templates.map((t) => (
              <button
                key={t}
                onClick={() => setInput(t)}
                className="whitespace-nowrap px-4 py-2 rounded-full border border-gray-200 text-[11px] font-bold text-gray-400 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-all flex items-center gap-1.5"
              >
                <Sparkles size={12} />
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="relative group">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
            placeholder="输入想去的地方和天数..."
            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-5 py-3.5 text-sm focus:outline-none focus:border-blue-400 transition-all"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading}
            className={`absolute right-3 top-2.5 text-blue-600 font-bold text-lg transition-opacity ${
              input.trim() && !loading ? 'opacity-100' : 'opacity-20'
            }`}
          >
            ↵
          </button>
        </div>
      </div>
      {/* 白色底板填满导航栏区域，防止滚动时漏出 */}
      <div className="h-20 bg-white"></div>
    </div>
    </div>
  );
};
