import { Place } from "../types";

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || 'sk-b83699f0a60941e9aadea69468590dc3';
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';

/**
 * 重新生成一天的时间安排
 */
export async function rescheduleDay(
  places: Place[],
  modifiedPlaceId: string,
  newTimeSlot: string,
  destination: string
): Promise<Place[]> {
  const SYSTEM_INSTRUCTION = `
你是一个专业的旅游行程规划助手。用户修改了某个地点的游玩时间，你需要重新安排当天其他地点的时间，确保：

1. 时间合理，不冲突
2. 每个地点的游玩时间充足
3. 地点之间的交通时间合理
4. 符合当地实际情况（如景点开放时间）
5. 保持原有的地点顺序不变，只调整时间

返回一个 JSON 数组，包含所有地点的完整信息。只返回 JSON 数组，不要其他内容。
`;

  const userMessage = `
我在${destination}的行程中，修改了一个地点的时间，请帮我重新安排其他地点的时间。

修改的地点：${places.find(p => p.id === modifiedPlaceId)?.name}
新的时间段：${newTimeSlot}

所有地点列表：
${places.map((p, i) => `${i + 1}. ${p.name} (${p.timeSlot})`).join('\n')}

请重新安排所有地点的时间段，确保时间合理、不冲突。返回完整的地点列表（包含所有字段）。
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
            content: userMessage
          }
        ],
        temperature: 0.5,
        max_tokens: 2000
      })
    });

    const data = await response.json();
    const content = data.choices[0].message.content.trim();
    
    // 解析 JSON 响应
    const rescheduledPlaces = JSON.parse(content);
    
    // 保留原始地点的其他信息
    return places.map((place, idx) => {
      const rescheduled = rescheduledPlaces.find((p: any) => p.name === place.name);
      return {
        ...place,
        timeSlot: rescheduled?.timeSlot || place.timeSlot,
        transportToNext: place.transportToNext
      };
    });
  } catch (error) {
    console.error('Failed to reschedule:', error);
    return places;
  }
}
