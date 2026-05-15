export interface TransportInfo {
  mode: 'subway' | 'taxi' | 'walk' | 'bus' | 'train';
  duration: string;
  description: string;
}

export interface Place {
  id: string;
  name: string;
  address: string;
  timeSlot: string;
  description: string;
  category: string;
  rating: number;
  image?: string;
  openingHours?: string;
  ticketPrice?: string;
  coordinates?: { lat: number; lng: number };
  transportToNext?: TransportInfo;
}

export interface DayPlan {
  day: number;
  date: string;
  places: Place[];
  transportation?: TransportSuggestion[];
}

export interface TransportSuggestion {
  from: string;
  to: string;
  type: 'subway' | 'taxi' | 'walk' | 'bus';
  duration: string;
  cost: string;
  reason: string;
}

export interface Trip {
  id: string;
  destination: string;
  duration: number;
  startDate?: string;
  startPoint?: string;
  endPoint?: string;
  days: DayPlan[];
}

export interface UserPreferences {
  likes: string[]; // e.g., ['nature', 'history']
  dislikes: string[]; // e.g., ['crowds', 'shopping']
  transport: string[]; // e.g., ['taxi', 'walk']
}

export type ViewState = 'home' | 'planner' | 'timeline' | 'preferences';
