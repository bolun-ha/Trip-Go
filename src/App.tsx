/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Layout } from './components/Layout';
import { HomeView } from './components/HomeView';
import { PlannerView } from './components/PlannerView';
import { TimelineView } from './components/TimelineView';
import { PreferencesView } from './components/PreferencesView';
import { Trip, UserPreferences, ViewState } from './types';
import { LocationInfo } from './services/locationService';

export default function App() {
  const [view, setView] = useState<ViewState>('home');
  const [trip, setTrip] = useState<Trip | null>(() => {
    try {
      const saved = localStorage.getItem('current_trip');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [userLocation, setUserLocation] = useState<LocationInfo | null>(null);
  const [preferences, setPreferences] = useState<UserPreferences>(() => {
    const saved = localStorage.getItem('trip_preferences');
    return saved ? JSON.parse(saved) : {
      likes: ['nature', 'history'],
      dislikes: ['crowds'],
      transport: ['taxi', 'walk']
    };
  });

  useEffect(() => {
    localStorage.setItem('trip_preferences', JSON.stringify(preferences));
  }, [preferences]);

  const handleTripGenerated = (newTrip: Trip) => {
    setTrip(newTrip);
    // 不自动切换视图，让用户继续对话
  };

  const handleViewTrip = () => {
    // 查看行程页面
    setView('planner');
  };

  const handleReplan = () => {
    // 返回首页重新规划，但保留当前行程
    setView('home');
  };

  const handleTripUpdated = (updatedTrip: Trip) => {
    setTrip(updatedTrip);
  };

  const getTitle = () => {
    switch(view) {
      case 'home': return 'Travoo';
      case 'planner': return '特别行程';
      case 'timeline': return '实时动态';
      case 'preferences': return '个性偏好';
      default: return 'Travoo';
    }
  };

  return (
    <Layout 
      view={view} 
      setView={setView} 
      title={getTitle()}
      showBack={view !== 'home'}
    >
      {view === 'home' && (
        <HomeView 
          onTripGenerated={handleTripGenerated} 
          onViewTrip={handleViewTrip}
          preferences={preferences}
          userLocation={userLocation}
          hasExistingTrip={!!trip}
          existingTrip={trip}
        />
      )}
      {view === 'planner' && (
        <PlannerView trip={trip} onReplan={handleReplan} onBack={() => setView('home')} onTripUpdated={handleTripUpdated} />
      )}
      {view === 'timeline' && (
        <TimelineView trip={trip} onTripUpdated={handleTripUpdated} />
      )}
      {view === 'preferences' && (
        <PreferencesView preferences={preferences} setPreferences={setPreferences} />
      )}
    </Layout>
  );
}

