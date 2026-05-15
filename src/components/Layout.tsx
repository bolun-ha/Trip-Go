import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Compass, 
  Map as MapIcon, 
  Clock, 
  Settings, 
  ChevronLeft,
  X
} from 'lucide-react';
import { ViewState } from '../types';

interface NavItemProps {
  id: ViewState;
  icon: React.ReactNode;
  label: string;
  activeId: ViewState;
  onClick: (id: ViewState) => void;
}

const NavItem = ({ id, icon, label, activeId, onClick }: NavItemProps) => {
  const isActive = activeId === id;
  return (
    <button
      onClick={() => onClick(id)}
      className={`flex flex-col items-center justify-center gap-1 transition-all duration-300 ${
        isActive ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'
      }`}
    >
      <motion.div
        whileTap={{ scale: 0.9 }}
        className={`p-2 rounded-xl ${isActive ? 'bg-blue-50' : ''}`}
      >
        {icon}
      </motion.div>
      <span className="text-[10px] font-medium tracking-wide uppercase">{label}</span>
    </button>
  );
};

export const Layout = ({ 
  children, 
  view, 
  setView,
  title,
  showBack = false
}: { 
  children: React.ReactNode; 
  view: ViewState; 
  setView: (v: ViewState) => void;
  title: string;
  showBack?: boolean;
}) => {
  const [showQR, setShowQR] = useState(false);
  const qrUrl = 'https://tripgg.netlify.app/';
  return (
    <div className="flex flex-col h-screen bg-[#F4F4F7] text-[#1A1A1A] font-sans max-w-md mx-auto border-x border-[#E5E5E5] overflow-hidden shadow-2xl relative">
      {/* Header */}
      <header className="px-6 py-4 flex items-center justify-between border-b border-[#E5E5E5] bg-white sticky top-0 z-50">
        <div className="flex items-center gap-3">
          {showBack && (
            <button onClick={() => setView('home')} className="p-1 -ml-1 text-gray-400 hover:text-blue-600 transition-colors">
              <ChevronLeft size={24} />
            </button>
          )}
          <h1 className="text-xl font-bold tracking-tight text-[#1A1A1A]">
            {title} <span className="text-gray-300 font-light ml-1">/ TRIP AI</span>
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowQR(true)}
            className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 border border-blue-100 hover:bg-blue-100 transition-colors cursor-pointer"
          >
            <Compass size={18} />
          </button>
        </div>
      </header>

      {/* 二维码弹窗 */}
      <AnimatePresence>
        {showQR && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 backdrop-blur-sm"
            onClick={() => setShowQR(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-white rounded-2xl p-6 shadow-xl text-center relative"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setShowQR(false)}
                className="absolute -top-2 -right-2 w-7 h-7 bg-gray-100 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-200 transition-colors"
              >
                <X size={14} />
              </button>
              <h3 className="text-sm font-bold text-[#1A1A1A] mb-1">扫码打开</h3>
              <p className="text-[10px] text-gray-400 mb-4">手机扫码访问此页面</p>
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrUrl)}`}
                alt="主页二维码"
                className="w-44 h-44 mx-auto rounded-lg"
              />
              <p className="text-[10px] text-gray-300 mt-3 break-all">{qrUrl}</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto pb-24 relative bg-white">
        <motion.div
          key={view}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="min-h-full"
        >
          {children}
        </motion.div>
      </main>

      {/* Navigation */}
      <nav className="absolute bottom-0 left-0 right-0 h-20 bg-white border-t border-[#E5E5E5] px-8 flex items-center justify-between z-50">
        <NavItem id="home" icon={<Compass size={24} />} label="发现" activeId={view} onClick={setView} />
        <NavItem id="planner" icon={<MapIcon size={24} />} label="行程" activeId={view} onClick={setView} />
        <NavItem id="timeline" icon={<Clock size={24} />} label="动态" activeId={view} onClick={setView} />
        <NavItem id="preferences" icon={<Settings size={24} />} label="设置" activeId={view} onClick={setView} />
      </nav>
    </div>
  );
};
