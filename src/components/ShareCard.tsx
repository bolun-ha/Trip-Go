import React, { useRef, useState, useEffect, useMemo } from 'react';
import { toPng } from 'html-to-image';
import html2canvas from 'html2canvas';
import { Share2, Loader2 } from 'lucide-react';

interface ShareCardProps {
  placeName: string;
  dayLabel: string;
  address: string;
  description: string;
  photos: string[];
}

// ─── 色彩工具 ──────────────────────────────────────

function extractTopColors(dataUrl: string, count: number): Promise<Array<{ r: number; g: number; b: number }>> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = 16;
      c.height = 16;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0, 16, 16);
      const d = ctx.getImageData(0, 0, 16, 16).data;

      const freq = new Map<string, { r: number; g: number; b: number; count: number }>();
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2];
        const brightness = r + g + b;
        if (brightness < 60 || brightness > 720) continue;
        const key = (r >> 4) + ',' + (g >> 4) + ',' + (b >> 4);
        const v = freq.get(key) || { r, g, b, count: 0 };
        v.count++;
        freq.set(key, v);
      }

      if (freq.size === 0) {
        const fallback = Array.from({ length: count }, () => ({ r: 180, g: 190, b: 200 }));
        resolve(fallback);
        return;
      }

      const sorted = Array.from(freq.values()).sort(function (a, b) { return b.count - a.count; });
      const result = sorted.slice(0, count).map(function (v) {
        const sat = Math.max(v.r, v.g, v.b) - Math.min(v.r, v.g, v.b);
        return { r: v.r, g: v.g, b: v.b, sat: sat, count: v.count };
      });

      // 按饱和度调整排序：第一个取评分最高的，后续取不同色相的分
      if (result.length === 0) {
        resolve(Array.from({ length: count }, () => ({ r: 180, g: 190, b: 200 })));
        return;
      }

      const best = result.reduce(function (a, b) {
        return (a.count * (0.7 + 0.3 * a.sat / 255)) > (b.count * (0.7 + 0.3 * b.sat / 255)) ? a : b;
      });

      const rest = result.filter(function (v) { return v !== best; });

      const top: Array<{ r: number; g: number; b: number }> = [best];
      for (let i = 1; i < count; i++) {
        if (rest[i - 1]) {
          top.push(rest[i - 1]);
        } else {
          top.push({ r: 180, g: 190, b: 200 });
        }
      }
      resolve(top);
    };
    img.onerror = function () {
      resolve(Array.from({ length: count }, () => ({ r: 180, g: 190, b: 200 })));
    };
    img.src = dataUrl;
  });
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (mx + mn) / 2;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (mx === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return [h * 360, s * 100, l * 100];
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  h /= 360; s /= 100; l /= 100;
  if (s === 0) { const v = Math.round(l * 255); return { r: v, g: v, b: v }; }
  const hue2rgb = function (p: number, q: number, t: number) {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, h) * 255),
    b: Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  };
}

function previewBrightness(r: number, g: number, b: number): number {
  return (r * 0.2126 + g * 0.7152 + b * 0.0722);
}

function makeBgColor(r: number, g: number, b: number): string {
  const [h, s] = rgbToHsl(r, g, b);
  var newS = Math.min(s * 0.25, 22);
  var newL = 88;
  var adjusted = hslToRgb(h, newS, newL);
  return '(' + adjusted.r + ', ' + adjusted.g + ', ' + adjusted.b + ')';
}

// ─── 几何拼贴布局 ────────────────────────────────
// 模拟 CSS Grid 6×6 的视觉布局，使用绝对定位

const PHOTO_AREA_W = 420;
const PHOTO_AREA_H = 360;

function getLayoutForCount(count: number) {
  var p = function (w: number, h: number, top: number, left: number, z: number, rotate: number, border: boolean, opacity?: number, grayscale?: number) {
    return { w: Math.round(w), h: Math.round(h), top: Math.round(top), left: Math.round(left), z, rotate, border, opacity: opacity !== undefined ? opacity : 1, grayscale: grayscale !== undefined ? grayscale : undefined };
  };

  switch (count) {
    case 1:
      return [p(340, 310, 8, 8, 20, 0, false)];

    case 2:
      return [
        p(260, 240, 6, 6, 20, -0.8, false),
        p(180, 200, 140, 225, 25, 1.2, true),
      ];

    case 3:
      return [
        p(235, 215, 6, 6, 20, -0.5, false),
        p(180, 165, 8, 226, 25, 0.8, true),
        p(140, 130, 215, 12, 15, -1.2, false),
      ];

    case 4:
      return [
        p(215, 195, 6, 6, 20, -0.5, false),
        p(175, 155, 6, 235, 25, 0.5, true),
        p(195, 165, 186, 8, 15, 0, false),
        p(155, 140, 210, 230, 15, 0.8, false),
      ];

    case 5:
      return [
        p(210, 190, 6, 6, 20, -0.5, false),
        p(170, 155, 6, 230, 25, 0.5, true),
        p(165, 150, 197, 8, 15, 0, false),
        p(150, 135, 195, 195, 15, 1, false),
        p(95, 95, 70, 135, 30, -0.8, false),
      ];

    default:
      return [
        p(205, 185, 6, 6, 20, -0.5, false),
        p(165, 150, 6, 225, 25, 0.5, true),
        p(140, 135, 205, 6, 15, -0.3, false),
        p(165, 150, 202, 160, 15, 0.8, false),
        p(120, 115, 76, 165, 30, -0.3, false),
        p(95, 95, 265, 310, 12, 1, false),
      ];
  }
}

// ─── 组件 ────────────────────────────────────────

export const ShareCard = function ({ placeName, dayLabel, address, description, photos }: ShareCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [canvasesReady, setCanvasesReady] = useState(false);
  const [capturedDataUrl, setCapturedDataUrl] = useState<string | null>(null);
  const [bgColor, setBgColor] = useState('');
  const [accentColor, setAccentColor] = useState('');
  const [rotatedPhotos, setRotatedPhotos] = useState<string[]>([]);

  // 提取主色调 + 辅色
  useEffect(function () {
    if (photos.length === 0) {
      setBgColor('');
      setAccentColor('');
      return;
    }
    extractTopColors(photos[0], 2).then(function (colors) {
      if (colors.length >= 1) {
        setBgColor('rgb' + makeBgColor(colors[0].r, colors[0].g, colors[0].b));
      }
      if (colors.length >= 2) {
        setAccentColor('rgb(' + colors[1].r + ', ' + colors[1].g + ', ' + colors[1].b + ')');
      } else {
        setAccentColor('rgb(0, 0, 0)');
      }
    });
  }, [photos]);

  // 预渲染旋转后的照片（canvas 里旋转 + cover 裁剪，避免 html2canvas 的 CSS transform bug）
  useEffect(function () {
    setCanvasesReady(false);
    if (photos.length === 0) {
      setRotatedPhotos([]);
      setCanvasesReady(true);
      return;
    }
    var cancelled = false;
    var layouts = getLayoutForCount(Math.min(photos.length, 6));

    Promise.all(photos.map(function (url, i) {
      return new Promise<string>(function (resolve) {
        var layout = layouts[i] || layouts[layouts.length - 1] || { w: 200, h: 200, rotate: 0 };
        var img = new Image();
        img.onload = function () {
          if (cancelled) { resolve(url); return; }
          // 1) cover 裁剪
          var scale = Math.max(layout.w / img.width, layout.h / img.height);
          var sw = img.width * scale;
          var sh = img.height * scale;
          var sx = (layout.w - sw) / 2;
          var sy = (layout.h - sh) / 2;

          // 2) 先裁后旋转
          var cropCanvas = document.createElement('canvas');
          cropCanvas.width = layout.w;
          cropCanvas.height = layout.h;
          var cropCtx = cropCanvas.getContext('2d');
          if (!cropCtx) { resolve(url); return; }
          cropCtx.drawImage(img, sx, sy, sw, sh);

          // 3) 旋转
          var rad = layout.rotate * Math.PI / 180;
          var cos = Math.abs(Math.cos(rad));
          var sin = Math.abs(Math.sin(rad));
          var rotW = Math.ceil(layout.w * cos + layout.h * sin);
          var rotH = Math.ceil(layout.w * sin + layout.h * cos);

          var rotCanvas = document.createElement('canvas');
          rotCanvas.width = rotW;
          rotCanvas.height = rotH;
          var rotCtx = rotCanvas.getContext('2d');
          if (!rotCtx) { resolve(url); return; }
          rotCtx.translate(rotW / 2, rotH / 2);
          rotCtx.rotate(rad);
          rotCtx.drawImage(cropCanvas, -layout.w / 2, -layout.h / 2);
          resolve(rotCanvas.toDataURL('image/jpeg', 0.85));
        };
        img.onerror = function () { resolve(url); };
        img.src = url;
      });
    })).then(function (results) {
      if (!cancelled) {
        setRotatedPhotos(results);
        setCanvasesReady(true);
      }
    });

    return function () { cancelled = true; };
  }, [photos]);

  // ── 分享逻辑 ──

  const handleShare = async function () {
    if (!cardRef.current || generating || !canvasesReady) return;
    setGenerating(true);
    setProgress(0);
    setCapturedDataUrl(null);

    // 各阶段推进进度并保证最小停留时长
    var advance = async function (target: number, minMs: number) {
      setProgress(target);
      await new Promise<void>(function (r) { setTimeout(r, minMs); });
    };

    var el = cardRef.current;
    var origOpacity = el.style.opacity;
    var origZIndex = el.style.zIndex;
    var origPointer = el.style.pointerEvents;
    var origTop = el.style.top;
    var origLeft = el.style.left;

    el.style.zIndex = '9999';
    el.style.pointerEvents = 'auto';

    try {
      // Phase 1: 准备渲染
      await advance(15, 300);

      // Phase 2: 移回可见位置（卡片一直 opacity:1，canvas 一直渲染）
      el.style.top = '0';
      el.style.left = '0';
      // 等一帧让浏览器处理位置变化
      await new Promise<void>(function (resolve) {
        requestAnimationFrame(function () { resolve(); });
      });
      await advance(35, 100);

      // Phase 3: 捕获为图片
      var canvas = await html2canvas(el, {
        useCORS: true,
        scale: 2,
        backgroundColor: null,
        logging: false,
      });
      var dataUrl = canvas.toDataURL('image/jpeg', 0.6);
      await advance(60, 200);

      // 恢复隐藏（移回屏幕外）
      el.style.top = origTop;
      el.style.left = origLeft;
      el.style.zIndex = origZIndex;
      el.style.pointerEvents = origPointer;

      // Phase 4: 渲染完成，保存图片（不触发下载）
      setCapturedDataUrl(dataUrl);
      await advance(90, 250);

      // Phase 5: 完成
      await advance(100, 1000);
    } catch (err) {
      console.error('Render failed:', err);
      el.style.top = origTop;
      el.style.left = origLeft;
      el.style.zIndex = origZIndex;
      el.style.pointerEvents = origPointer;
      await advance(100, 800);
    } finally {
      setGenerating(false);
      setProgress(0);
    }
  };

  // 导出已渲染的图片
  const handleExport = async function () {
    if (!capturedDataUrl) return;
    if (navigator.share && /mobile|android|iphone|ipad|ipod/i.test(navigator.userAgent)) {
      var blob = await (await fetch(capturedDataUrl)).blob();
      var file = new File([blob], placeName + '.jpg', { type: 'image/jpeg' });
      await navigator.share({ title: placeName, files: [file] }).catch(function () {});
    } else {
      var link = document.createElement('a');
      link.download = placeName + '.jpg';
      link.href = capturedDataUrl;
      link.click();
    }
    setCapturedDataUrl(null);
  };

  var photoCount = Math.min(photos.length, 6);
  var layouts = useMemo(function () {
    var base = getLayoutForCount(photoCount || 3);
    // 每张照片随机微倾斜 ±0.7°，保持自然感
    return base.map(function (l, i) {
      var raw = (Math.random() - 0.5) * 16; // -8 ~ +8
      // 避开 0°：如果落在 -1~+1 之间，往正方向推
      var tilt = (raw > -1 && raw < 1) ? (raw >= 0 ? 1 : -1) : raw;
      return { ...l, rotate: Math.round((l.rotate + tilt) * 10) / 10 };
    });
  }, [photoCount]);

  var cardBg = bgColor
    ? bgColor + ' linear-gradient(145deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0.1) 60%, rgba(255,255,255,0.25) 100%)'
    : '#f0f0f0';

  return (
    <div>
      {/* ───── 隐藏的卡片 ───── */}
      <div
        ref={cardRef}
        style={{
          width: 480,
          height: 'auto',
          position: 'fixed',
          top: -9999,
          left: -9999,
          zIndex: 1,
          opacity: 1,
          pointerEvents: 'none',
          fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Noto Sans SC, sans-serif',
          background: cardBg,
          overflow: 'hidden',
          borderRadius: 0,
        }}
      >
        {/* 内边距容器 */}
        <div style={{ padding: '28px 28px 24px' }}>
          {/* ── 顶部标题 ── */}
          <div style={{ marginBottom: 28, textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 500, letterSpacing: 4, textTransform: 'uppercase', marginBottom: 8, color: '#1a1a1a' }}>
              {placeName}
            </div>
            <div style={{ width: 40, height: 1, background: 'rgba(0,0,0,0.2)', margin: '0 auto 6px' }} />
            <div style={{ fontSize: 10, color: '#888', letterSpacing: 2, textTransform: 'uppercase', fontWeight: 400 }}>
              {dayLabel} · 旅行记录
            </div>
          </div>

          {/* ── 照片墙 · 几何拼贴 ── */}
          {photoCount > 0 ? (
            <div style={{ position: 'relative', width: PHOTO_AREA_W, height: PHOTO_AREA_H, margin: '0 auto 24px' }}>
              {/* 装饰性几何线 — 右上角 */}
              <div style={{ position: 'absolute', top: 8, right: 12, width: 36, height: 36, borderRight: '1.5px solid rgba(255,255,255,0.5)', borderTop: '1.5px solid rgba(255,255,255,0.5)', zIndex: 40, pointerEvents: 'none' }} />

              {Array.from({ length: photoCount }).map(function (_, i) {
                var layout = layouts[i];

                return (
                  <div
                    key={i}
                    style={{
                      position: 'absolute',
                      top: layout.top,
                      left: layout.left,
                      width: layout.w,
                      height: layout.h,
                      zIndex: layout.z,
                      boxShadow: '0 6px 24px rgba(0,0,0,0.1)',
                      borderRadius: 6,
                      overflow: 'hidden',
                      border: layout.border ? '4px solid #fff' : 'none',
                      opacity: layout.opacity,
                      filter: layout.grayscale ? 'grayscale(' + layout.grayscale + '%)' : 'none',
                      background: '#fff',
                    }}
                  >
                    <img
                      src={rotatedPhotos[i] || photos[i]}
                      style={{ width: layout.w, height: layout.h, objectFit: 'cover', display: 'block' }}
                      alt=""
                    />
                  </div>
                );
              })}

              {photos.length > 6 ? (
                <div style={{ position: 'absolute', right: 12, bottom: 8, background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 10, zIndex: 50 }}>
                  +{photos.length - 6}
                </div>
              ) : null}
            </div>
          ) : null}

          {/* ── 描述 ── */}
          {description ? (
            <div style={{ fontSize: 12, color: '#666', lineHeight: 1.6, marginBottom: 20, fontStyle: 'italic', textAlign: 'center', maxWidth: 380, margin: '0 auto 20px' }}>
              &ldquo;{description.split('。')[0]}。&rdquo;
            </div>
          ) : null}

          {/* ── 底部信息 ── */}
          <div style={{ borderTop: '1px solid rgba(0,0,0,0.06)', paddingTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div style={{ fontSize: 9, color: '#999', fontFamily: 'SF Mono, Monaco, Consolas, monospace', letterSpacing: 1, lineHeight: 1.8 }}>
              <div style={{ marginBottom: 2 }}>DATE: {new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })}</div>
              <div>{address || '去哪玩 · 旅行助手'}</div>
            </div>
            <div
              style={{
                fontSize: 9,
                letterSpacing: 2,
                textTransform: 'uppercase',
                fontWeight: 600,
                padding: '4px 12px',
                border: '1px solid ' + (accentColor || '#999'),
                borderRadius: 20,
                color: accentColor || '#999',
              }}
            >
              EXPLORE
            </div>
          </div>
        </div>
      </div>

      {/* ───── 分享按钮 ───── */}
      <div>
        <button
          onClick={capturedDataUrl ? handleExport : handleShare}
          disabled={(generating || !canvasesReady) && !capturedDataUrl}
          className={generating ? "w-full py-3 rounded-xl bg-blue-50 text-blue-600 text-[11px] uppercase tracking-wide font-bold cursor-default border border-blue-100" : capturedDataUrl ? "w-auto px-5 py-3 rounded-xl bg-green-50 text-green-700 font-bold text-[11px] uppercase tracking-wide flex items-center justify-center gap-1.5 hover:bg-green-100 transition-colors border border-green-100 cursor-pointer" : "w-auto px-5 py-3 rounded-xl bg-blue-50 text-blue-600 font-bold text-[11px] uppercase tracking-wide flex items-center justify-center gap-1.5 hover:bg-blue-100 transition-colors disabled:opacity-50 border border-blue-100"}
        >
          {generating ? (
            <div className="flex flex-col items-center w-full px-3 gap-1.5">
              <div className="flex items-center gap-1.5">
                <Loader2 size={14} className="animate-spin" />
                {progress < 15 ? '准备渲染...' :
                 progress < 35 ? '渲染卡片...' :
                 progress < 60 ? '生成图片...' :
                 progress < 75 ? '捕获完成' :
                 progress < 100 ? '处理中...' :
                 '完成 ✓'}
              </div>
              <div className="w-full h-1 bg-blue-100 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full transition-all duration-300 ease-out" style={{ width: progress + '%' }}></div>
              </div>
            </div>
          ) : capturedDataUrl ? (
            <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> 导出</>
          ) : !canvasesReady ? (
            <><Loader2 size={14} className="animate-spin" /> 准备中...</>
          ) : (
            <><Share2 size={14} /> 分享</>
          )}
        </button>
      </div>
    </div>
  );
};
