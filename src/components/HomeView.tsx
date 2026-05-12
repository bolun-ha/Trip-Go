import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Send, Sparkles, History, MapPin, Check, X, Clock, Calendar, ListOrdered } from 'lucide-react';
import { generateTrip } from '../services/deepSeekService';
import { Trip, UserPreferences } from '../types';
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
    const clean = input.replace(/(\d+\s*天|\d+\s*日\s*游|\d+\s*个\s*景点?|每天\s*\d+|出发|开始|规划)/g, '').trim();
    const cityMatch = clean.match(/([\u4e00-\u9fff]{2,4})/);
    if (cityMatch) {
      result.destination = cityMatch[1];
    }
  }

  // 天数
  const dayMatch = input.match(/(\d+)\s*天/);
  if (dayMatch) {
    result.days = parseInt(dayMatch[1]);
  }

  // 每日景点数
  const placesMatch = input.match(/(?:每天|每日)\s*(\d+)\s*个|(\d+)\s*个\s*(?:景点|地方)/);
  if (placesMatch) {
    result.placesPerDay = parseInt(placesMatch[1] || placesMatch[2]);
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
  return !!(data.destination && data.days && data.placesPerDay && data.startTime && data.endTime);
}

/** 填充默认值 */
function fillDefaults(data: Partial<TripFormData>): TripFormData {
  return {
    destination: data.destination || '',
    days: data.days || 3,
    placesPerDay: data.placesPerDay || 4,
    startTime: data.startTime || '09:00',
    endTime: data.endTime || '18:00',
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
  const [formData, setFormData] = useState<TripFormData>({ destination: '', days: 3, placesPerDay: 4, startTime: '09:00', endTime: '18:00' });
  const [latestUserInput, setLatestUserInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // 保存对话历史到 localStorage
  useEffect(() => {
    localStorage.setItem('chat_history', JSON.stringify(messages));
  }, [messages]);

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
      // 构建对话历史
      const conversationHistory = convHistory.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`);
      
      // 构造带有完整信息的 prompt
      const fullPrompt = `${userInput}（行程要求：${form.destination}，${form.days}天，每天${form.placesPerDay}个景点，${form.startTime}开始，${form.endTime}结束）`;

      if (hasExistingTrip) {
        const trip = await generateTrip(fullPrompt, preferences, conversationHistory);
        const assistantMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: `我为你规划了一个新的 ${trip.destination} ${trip.duration} 天行程，要替换当前行程吗？`,
          trip,
          isPreview: true
        };
        setMessages(prev => [...prev, assistantMsg]);
      } else {
        const trip = await generateTrip(fullPrompt, preferences, conversationHistory);
        const assistantMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: `太棒了！我已经为你规划好了前往 ${trip.destination} 的 ${trip.duration} 天行程。`,
          trip,
          isPreview: false
        };
        setMessages(prev => [...prev, assistantMsg]);
        onTripGenerated(trip);
        localStorage.setItem('current_trip', JSON.stringify(trip));
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

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userInput = input.trim();
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: userInput };
    
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput('');
    setLatestUserInput(userInput);

    // 本地解析输入
    const parsed = parseTripInput(userInput);
    
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
      {/* Chat Area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-6 py-6 space-y-6 scroll-smooth"
      >
        <AnimatePresence initial={false}>
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

      {/* Input Area */}
      <div className="p-6 bg-white border-t border-gray-100">
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
    </div>
  );
};
