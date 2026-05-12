import React from 'react';
import { UserPreferences } from '../types';
import { 
  Trees, 
  History, 
  ShoppingBag, 
  Coffee, 
  Users, 
  Train, 
  Car, 
  Footprints,
  ShieldAlert,
  Frown
} from 'lucide-react';

export const PreferencesView = ({ 
  preferences, 
  setPreferences 
}: { 
  preferences: UserPreferences; 
  setPreferences: (p: UserPreferences) => void;
}) => {
  const toggleItem = (list: keyof UserPreferences, item: string) => {
    const currentList = preferences[list];
    const newList = currentList.includes(item)
      ? currentList.filter(i => i !== item)
      : [...currentList, item];
    
    setPreferences({
      ...preferences,
      [list]: newList
    });
  };

  const Option = ({ 
    type, 
    id, 
    label, 
    icon 
  }: { 
    type: keyof UserPreferences; 
    id: string; 
    label: string; 
    icon: React.ReactNode 
  }) => {
    const isActive = preferences[type].includes(id);
    return (
      <button
        onClick={() => toggleItem(type, id)}
        className={`flex items-center gap-3 p-4 rounded-xl border transition-all duration-300 ${
          isActive 
            ? 'bg-blue-50 border-blue-400 text-blue-900 minimalism-shadow' 
            : 'bg-white border-gray-100 text-gray-500 hover:border-gray-200'
        }`}
      >
        <div className={`p-2 rounded-lg ${isActive ? 'bg-blue-600 text-white' : 'bg-gray-50'}`}>
          {icon}
        </div>
        <span className="text-sm font-bold tracking-tight">{label}</span>
      </button>
    );
  };

  return (
    <div className="bg-white min-h-full p-8 pb-32">
      <div className="mb-10">
        <h2 className="text-3xl font-bold text-[#1A1A1A] mb-2 tracking-tight">偏好设置</h2>
        <p className="text-sm text-gray-400 font-medium">定制您的 AI 旅行品味</p>
      </div>

      <section className="mb-10">
        <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-600 mb-6 flex items-center gap-2">
          我要去 <div className="h-px flex-1 bg-blue-50" />
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <Option type="likes" id="nature" label="自然风景" icon={<Trees size={18} />} />
          <Option type="likes" id="history" label="人文历史" icon={<History size={18} />} />
          <Option type="likes" id="shopping" label="生活购物" icon={<ShoppingBag size={18} />} />
          <Option type="likes" id="food" label="特色美食" icon={<Coffee size={18} />} />
        </div>
      </section>

      <section className="mb-10">
        <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400 mb-6 flex items-center gap-2">
          不要去 <div className="h-px flex-1 bg-gray-50" />
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <Option type="dislikes" id="crowds" label="人多拥挤" icon={<Users size={18} />} />
          <Option type="dislikes" id="religious" label="宗教场所" icon={<ShieldAlert size={18} />} />
        </div>
      </section>

      <section>
        <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-600 mb-6 flex items-center gap-2">
          怎么走 <div className="h-px flex-1 bg-blue-50" />
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <Option type="transport" id="taxi" label="打车出行" icon={<Car size={18} />} />
          <Option type="transport" id="subway" label="公共交通" icon={<Train size={18} />} />
          <Option type="transport" id="walk" label="城市漫步" icon={<Footprints size={18} />} />
        </div>
      </section>
    </div>
  );
};
