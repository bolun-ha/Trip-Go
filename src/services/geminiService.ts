import { GoogleGenAI, Type } from "@google/genai";
import { Trip, UserPreferences } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

const SYSTEM_INSTRUCTION = `
You are an expert travel planner named "去哪玩" (Where to Go).
Your goal is to create highly personalized, efficient, and exciting travel itineraries based on user requests and preferences.

Guidelines:
1. Return purely JSON that matches the Trip interface.
2. Be creative with place descriptions - make them sound inviting.
3. Suggest 3-5 places per day.
4. Include realistic time slots (e.g., "09:00 - 11:00").
5. Account for travel preferences provided (likes, dislikes, transport).
6. Categories should be one of: "Scenic", "Culture", "Food", "Shopping", "Entertainment", "Relaxation".
7. Ensure IDs are unique strings like "day1-spot1".
8. Always use Chinese (Simplified) for names and descriptions as the user is Chinese.
9. For each place (except the last one of the day), provide "transportToNext" explaining how to get to the next destination (e.g. subway line, walking distance).
`;

const TRIP_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    id: { type: Type.STRING },
    destination: { type: Type.STRING },
    duration: { type: Type.INTEGER },
    days: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          day: { type: Type.INTEGER },
          date: { type: Type.STRING },
          places: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                name: { type: Type.STRING },
                address: { type: Type.STRING },
                timeSlot: { type: Type.STRING },
                description: { type: Type.STRING },
                category: { type: Type.STRING },
                rating: { type: Type.NUMBER },
                openingHours: { type: Type.STRING },
                ticketPrice: { type: Type.STRING },
                transportToNext: {
                  type: Type.OBJECT,
                  properties: {
                    mode: { type: Type.STRING, enum: ["subway", "taxi", "walk", "bus", "train"] },
                    duration: { type: Type.STRING },
                    description: { type: Type.STRING },
                  },
                  required: ["mode", "duration", "description"]
                }
              },
              required: ["id", "name", "address", "timeSlot", "description", "category", "rating"],
            }
          }
        },
        required: ["day", "places"]
      }
    }
  },
  required: ["id", "destination", "duration", "days"]
};

export async function generateTrip(prompt: string, preferences: UserPreferences): Promise<Trip> {
  const fullPrompt = `
User Request: ${prompt}
Preferences:
- Likes: ${preferences.likes.join(', ')}
- Dislikes: ${preferences.dislikes.join(', ')}
- Transport: ${preferences.transport.join(', ')}

Please generate a detailed travel itinerary.
`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: fullPrompt,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: TRIP_SCHEMA,
      },
    });

    if (!response.text) {
      throw new Error("No response from AI");
    }

    return JSON.parse(response.text) as Trip;
  } catch (error) {
    console.error("Error generating trip:", error);
    throw error;
  }
}

export async function getAlternatives(placeName: string, destination: string): Promise<any[]> {
  const prompt = `Recommend 3 alternative places to "${placeName}" in ${destination}. 
  Return as a JSON array of objects with: name, address, description, category, rating. Use Chinese.`;
  
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            address: { type: Type.STRING },
            description: { type: Type.STRING },
            category: { type: Type.STRING },
            rating: { type: Type.NUMBER },
          }
        }
      }
    }
  });

  return JSON.parse(response.text || "[]");
}
