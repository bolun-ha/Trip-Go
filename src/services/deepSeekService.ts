import { Trip, UserPreferences, TransportInfo } from "../types";

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || 'sk-b83699f0a60941e9aadea69468590dc3';
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';

const SYSTEM_INSTRUCTION = `
You are an expert travel planner named "去哪玩" (Where to Go).
Your goal is to create highly personalized, efficient, and exciting travel itineraries based on user requests and preferences.

Guidelines:
1. Return purely JSON that matches the Trip interface.
2. Be creative with place descriptions - make them sound inviting.
3. 根据用户的要求选择每天安排的景点数量（用户没明确说时默认 3-5 个）。
4. Include realistic time slots (e.g., "09:00 - 11:00").
5. Account for travel preferences provided (likes, dislikes, transport).
6. Categories should be one of: "Scenic", "Culture", "Food", "Shopping", "Entertainment", "Relaxation".
7. Ensure IDs are unique strings like "day1-spot1".
8. Always use Chinese (Simplified) for names and descriptions as the user is Chinese.
9. For each place (except the last one of the day), provide "transportToNext" explaining how to get to the next destination. Use these transport modes: "subway" (地铁), "taxi" (打车), "walk" (步行), "bus" (公交), "train" (火车). Include duration (e.g., "15 分钟") and description (e.g., "乘坐地铁 1 号线").
10. Output ONLY valid JSON, no markdown, no code blocks, no explanations.
11. **同一天景点尽量避免安排在相距超过 30 分钟车程的两个区域**。如果实在无法避免（例如用户指定了某些景点），必须在 transportToNext 的 description 中以"⚠️注意：XX到XX距离较远（约XX分钟车程）"开头，让用户知晓。
12. **如果用户指定了「每日起点」**，当天的第一个景点应以该起点附近为出发点规划路线。**如果用户指定了「每日终点」**，当天最后一个景点结束后应返回该终点。如果起/终点是具体住宿地点，以它为中心优化当天路线。
`;

const TRIP_SCHEMA_DESCRIPTION = `
Response must be a JSON object with this structure:
{
  "id": string,
  "destination": string,
  "duration": number (days),
  "startPoint": string (optional, hotel/accommodation name for daily start),
  "endPoint": string (optional, hotel/accommodation name for daily end),
  "days": [
    {
      "day": number,
      "date": string (optional),
      "places": [
        {
          "id": string (e.g., "day1-spot1"),
          "name": string,
          "address": string,
          "timeSlot": string (e.g., "09:00 - 11:00"),
          "description": string,
          "category": string (Scenic|Culture|Food|Shopping|Entertainment|Relaxation),
          "rating": number,
          "openingHours": string (optional),
          "ticketPrice": string (optional),
          "coordinates": {
            "lat": number (latitude, e.g., 39.9042),
            "lng": number (longitude, e.g., 116.4074)
          },
          "transportToNext": {
            "mode": string (subway|taxi|walk|bus|train),
            "duration": string,
            "description": string
          } (optional, not needed for last place of the day)
        }
      ]
    }
  ]
}

IMPORTANT: For each place, you MUST provide accurate coordinates (latitude and longitude) based on the actual location of the place. Use real GPS coordinates that can be found on maps.
`;

export async function generateTrip(
  prompt: string, 
  preferences: UserPreferences,
  conversationHistory: string[] = []
): Promise<Trip> {
  const conversationContext = conversationHistory.length > 0 ? `

Conversation History:
${conversationHistory.slice(-10).join('\n')}

The user's current request may be a continuation of previous requests. Consider the full context.
` : '';

  const fullPrompt = `
User Request: ${prompt}
Preferences:
- Likes: ${preferences.likes.join(', ')}
- Dislikes: ${preferences.dislikes.join(', ')}
- Transport: ${preferences.transport.join(', ')}
${conversationContext}
${TRIP_SCHEMA_DESCRIPTION}

Please generate a detailed travel itinerary in JSON format.
`;

  try {
    const response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: SYSTEM_INSTRUCTION
          },
          {
            role: 'user',
            content: fullPrompt
          }
        ],
        temperature: 0.7,
        max_tokens: 4000
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API request failed: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content.trim();
    
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : content;
    const trip = JSON.parse(jsonStr);
    
    return trip;
  } catch (error) {
    console.error('Failed to generate trip:', error);
    throw error;
  }
}

export async function getAlternatives(placeName: string, destination: string): Promise<any[]> {
  const prompt = `推荐 3 个${destination}可以替代"${placeName}"的景点。返回 JSON 数组，包含 name, address, description, category, rating 字段。用中文。`;
  
  try {
    const response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: '你是一个旅游助手。返回 JSON 数组，不要其他内容。'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 2000
      })
    });

    const data = await response.json();
    const content = data.choices[0].message.content.trim();
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    const jsonStr = jsonMatch ? jsonMatch[0] : content;
    return JSON.parse(jsonStr);
  } catch (error) {
    console.error('Failed to get alternatives:', error);
    return [];
  }
}

/**
 * 获取住宿区域推荐（返回结构化数据）
 */
/**
 * AI 生成景点简介（当高德搜索不到描述时的降级方案）
 */
export async function generatePlaceDescription(
  placeName: string,
  destination: string
): Promise<string> {
  try {
    const res = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DEEPSEEK_API_KEY}` },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: '你是一个旅游专家。用50字以内简洁介绍一个景点。只返回文字描述，不要任何额外格式。' },
          { role: 'user', content: `请用中文介绍${destination}的景点：${placeName}` },
        ],
        temperature: 0.5,
        max_tokens: 100,
        stream: false,
      }),
    });
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || '';
  } catch {
    return '';
  }
}

/**
 * AI 生成两个景点之间的交通建议
 */
export async function generateTransportSuggestion(
  fromPlace: string,
  toPlace: string,
  destination: string,
  timeSlot: string
): Promise<TransportInfo | null> {
  try {
    const res = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DEEPSEEK_API_KEY}` },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { 
            role: 'system', 
            content: '你是一个交通规划专家。根据两个景点和出发时间，推荐最佳交通方式。返回纯 JSON：{"mode":"subway|taxi|walk|bus|train","duration":"预计用时如 "30分钟"","description":"简短说明如 "地铁2号线直达""}。只返回 JSON，不要其他文字。' 
          },
          { 
            role: 'user', 
            content: `${destination}旅游，从"${fromPlace}"到"${toPlace}"，出发时间${timeSlot}。请推荐交通方式。` 
          },
        ],
        temperature: 0.3,
        max_tokens: 200,
        stream: false,
      }),
    });
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content?.trim() || '';
    const parsed = JSON.parse(text);
    if (parsed && parsed.mode && parsed.duration) {
      return {
        mode: parsed.mode,
        duration: parsed.duration,
        description: parsed.description || '',
      };
    }
    return null;
  } catch {
    return null;
  }
}

export async function getAreaRecommendations(
  destination: string,
  placeName: string,
  signal?: AbortSignal
): Promise<{ area: string; reason: string; pros: string; cons: string }[]> {
  const prompt = `我在${destination}旅行，住在${placeName}。请推荐${destination}市区最适合游客住宿的3-4个区域。

返回 JSON 数组，每个元素包含：
{
  "area": "区域名称",
  "reason": "推荐原因（一句话）",
  "pros": "优点",
  "cons": "缺点（可能的不足）"
}

用中文。只返回 JSON 数组，不要其他内容。`;

  try {
    const response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: '你是当地旅行达人，用中文回答。只返回 JSON 数组，不要其他内容。'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.8,
        max_tokens: 1500
      }),
      signal
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('API request failed:', response.status, errorText);
      return [];
    }

    const data = await response.json();
    const content = data.choices[0].message.content.trim();
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    const jsonStr = jsonMatch ? jsonMatch[0] : content;
    return JSON.parse(jsonStr);
  } catch (error: any) {
    if (error.name === 'AbortError') return [];
    console.error('Failed to get area recommendations:', error);
    return [];
  }
}

/**
 * 修改已有行程（用户要求调整某天行程、或确认住宿后调整路线）
 * @param existingTrip 当前行程
 * @param modificationRequest 用户的修改要求（如"修改第三天，加宽窄巷子"）
 * @param conversationHistory 对话历史
 */
export async function modifyTrip(
  existingTrip: Trip,
  modificationRequest: string,
  conversationHistory: string[] = []
): Promise<Trip> {
  const conversationContext = conversationHistory.length > 0 ? `

Conversation History:
${conversationHistory.slice(-5).join('\n')}
` : '';

  const fullPrompt = `
## 用户需求
用户已有以下行程，现在想修改：

【当前行程 JSON】
${JSON.stringify(existingTrip, null, 2)}

## 修改要求
${modificationRequest}
${conversationContext}
## 修改规则
1. 只修改用户提到的那部分（某一天、某个景点），**未提及的天数保持原样不变**。
2. 天数（duration）和出发日期保持不变。
3. 修改后确保景点之间的坐标准确、交通合理。
4. 如果修改涉及住宿地点，调整路线时以住宿点为中心优化路线。
5. 同一天景点不应相距过远（避免超过30分钟车程）。
6. 输出完整的 JSON 行程对象（与 Trip 接口一致）。
7. 只输出 JSON，不要任何额外文字、标记或代码块。

${TRIP_SCHEMA_DESCRIPTION}

请输出修改后的完整行程 JSON。
`;

  try {
    const response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: SYSTEM_INSTRUCTION
          },
          {
            role: 'user',
            content: fullPrompt
          }
        ],
        temperature: 0.5,
        max_tokens: 4000
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API request failed: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content.trim();
    
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : content;
    const trip = JSON.parse(jsonStr);
    
    return trip;
  } catch (error) {
    console.error('Failed to modify trip:', error);
    throw error;
  }
}

/**
 * 分析用户输入是否为修改已有行程的意图
 * 作为正则检测失败后的兜底，用 AI 判断模糊表达
 */
export async function analyzeIntent(
  userInput: string,
  recentHistory: string[]
): Promise<{ isModification: boolean }> {
  const contextStr = recentHistory.length > 0
    ? `最近对话:\n${recentHistory.slice(-3).join('\n')}\n`
    : '';

  const prompt = `判断以下用户输入是否是"修改已有行程"的意图。

已有行程存在，用户说：
${userInput}

${contextStr}
修改意图包括：换景点、改路线、加景点、删景点、调整顺序、改天数、改住宿等。
新规划意图包括：去另一个地方、规划新行程、查询信息、闲聊等。

只输出 JSON，格式: {"isModification": true} 或 {"isModification": false}`;

  try {
    const response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 50
      })
    });
    const data = await response.json();
    const text = data.choices?.[0]?.message?.content?.trim() || '';
    const jsonMatch = text.match(/\{"isModification":\s*(true|false)\}/);
    if (jsonMatch) {
      return { isModification: jsonMatch[1] === 'true' };
    }
    return { isModification: false };
  } catch {
    return { isModification: false };
  }
}
