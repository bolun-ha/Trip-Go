import React, { useRef, useState, useEffect, useMemo } from 'react';
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

/** 等待容器内所有图片加载完成 */
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

    case 6:
      return [
        p(205, 185, 6, 6, 20, -0.5, false),
        p(165, 150, 6, 225, 25, 0.5, true),
        p(140, 135, 205, 6, 15, -0.3, false),
        p(165, 150, 202, 160, 15, 0.8, false),
        p(120, 115, 76, 165, 30, -0.3, false),
        p(95, 95, 265, 310, 12, 1, false),
      ];

    case 7:
      return [
        p(200, 180, 6, 6, 20, -0.5, false),
        p(155, 140, 6, 220, 25, 0.5, true),
        p(130, 125, 200, 6, 15, -0.3, false),
        p(145, 130, 195, 155, 15, 0, false),
        p(110, 105, 75, 165, 30, -0.8, false),
        p(80, 80, 280, 250, 12, 1, false),
        p(75, 75, 268, 335, 10, -0.5, false),
      ];

    default: // 8
      return [
        p(200, 180, 6, 6, 20, -0.5, false),
        p(155, 140, 6, 220, 25, 0.5, true),
        p(130, 125, 200, 6, 15, -0.3, false),
        p(145, 130, 195, 155, 15, 0, false),
        p(110, 105, 75, 165, 30, -0.8, false),
        p(80, 80, 280, 250, 12, 1, false),
        p(75, 75, 268, 335, 10, -0.5, false),
        p(65, 65, 60, 105, 35, 0.8, false),
      ];
  }
}

/** 整齐排列：不旋转、无白边、不重叠；随机大小位置，保证零重叠 */
function getTidyLayout(count: number) {
  var W = 420, H = 360, GAP = 8, z = 10;
  var p = function (w: number, h: number, top: number, left: number) {
    return { w: Math.round(w), h: Math.round(h), top: Math.round(top), left: Math.round(left), z, rotate: 0, border: false };
  };

  if (count === 1) return [p(320, 300, (H - 300) / 2, (W - 320) / 2)];

  // 生成随机尺寸
  var sizes: Array<{w: number; h: number}> = [];
  for (var i = 0; i < count; i++) {
    var ratio = 0.5 + Math.random() * 1.5;
    var areaFactor = 0.15 + Math.random() * 0.25; // 占全区域的 15-40%
    if (count >= 6) areaFactor = 0.1 + Math.random() * 0.18;
    else if (count >= 4) areaFactor = 0.12 + Math.random() * 0.22;
    var a = W * H * areaFactor;
    var w = Math.round(Math.sqrt(a * ratio));
    var h = Math.round(Math.sqrt(a / ratio));
    w = Math.max(50, Math.min(w, W - GAP * 2));
    h = Math.max(50, Math.min(h, H - GAP * 2));
    sizes.push({ w, h });
  }

  // 碰撞放置
  var placed: Array<{x: number; y: number; w: number; h: number}> = [];

  var overlaps = function (x: number, y: number, w: number, h: number): boolean {
    for (var j = 0; j < placed.length; j++) {
      var o = placed[j];
      if (x < o.x + o.w + GAP && x + w + GAP > o.x && y < o.y + o.h + GAP && y + h + GAP > o.y) return true;
    }
    return false;
  };

  var results: Array<{w: number; h: number; top: number; left: number; z: number; rotate: number; border: boolean}> = [];

  for (var i = 0; i < sizes.length; i++) {
    var w = sizes[i].w, h = sizes[i].h;
    var found = false;

    // 随机尝试 300 次
    for (var t = 0; t < 300; t++) {
      var x = Math.round(GAP + Math.random() * (W - w - GAP * 2));
      var y = Math.round(GAP + Math.random() * (H - h - GAP * 2));
      if (!overlaps(x, y, w, h)) {
        placed.push({ x, y, w, h });
        results.push(p(w, h, y, x));
        found = true;
        break;
      }
    }
    if (found) continue;

    // 缩小后扫描找空位
    for (var shrink = 0.85; shrink >= 0.35 && !found; shrink -= 0.05) {
      var sw = Math.round(w * shrink);
      var sh = Math.round(h * shrink);
      if (sw < 35 || sh < 35) continue;
      for (var sy = GAP; sy <= H - sh - GAP && !found; sy += 4) {
        for (var sx = GAP; sx <= W - sw - GAP && !found; sx += 4) {
          if (!overlaps(sx, sy, sw, sh)) {
            placed.push({ x: sx, y: sy, w: sw, h: sh });
            results.push(p(sw, sh, sy, sx));
            found = true;
          }
        }
      }
    }

    if (!found) {
      placed.push({ x: GAP, y: GAP, w: 30, h: 30 });
      results.push(p(30, 30, GAP, GAP));
    }
  }

  return results;
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
  const [showPicker, setShowPicker] = useState(false);

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

  // 预渲染旋转后的照片（只旋转带白边的照片；其他照片仅 cover 裁剪）
  useEffect(function () {
    setCanvasesReady(false);
    if (photos.length === 0) {
      setRotatedPhotos([]);
      setCanvasesReady(true);
      return;
    }
    var cancelled = false;
    var layouts = getLayoutForCount(Math.min(photos.length, 8));

    Promise.all(photos.map(function (url, i) {
      return new Promise<string>(function (resolve) {
        var layout = layouts[i] || layouts[layouts.length - 1] || { w: 200, h: 200, rotate: 0, border: false };
        var img = new Image();
        img.onload = function () {
          if (cancelled) { resolve(url); return; }
          // cover 裁剪 — 先算出在原图上裁剪的区域
          var scale = Math.max(layout.w / img.width, layout.h / img.height);
          var srcW = layout.w / scale;
          var srcH = layout.h / scale;
          var srcX = (img.width - srcW) / 2;
          var srcY = (img.height - srcH) / 2;

          var renderScale = 2;
          var cropCanvas = document.createElement('canvas');
          cropCanvas.width = layout.w * renderScale;
          cropCanvas.height = layout.h * renderScale;
          var cropCtx = cropCanvas.getContext('2d');
          if (!cropCtx) { resolve(url); return; }
          cropCtx.imageSmoothingEnabled = true;
          cropCtx.imageSmoothingQuality = 'high';
          cropCtx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, layout.w * renderScale, layout.h * renderScale);
          resolve(cropCanvas.toDataURL('image/png'));
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

  // ── 在 memory canvas 上绘制圆角矩形（不 fill，只走 path） ──

  var roundRectPath = function (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  };

  // ── 单张照片渲染到 canvas（返回 Promise） ──

  var renderPhotoToCanvas = function (url: string, layout: any): Promise<string> {
    return new Promise(function (resolve) {
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () {
        // 在原图上计算 cover 裁剪区域
        var scale = Math.max(layout.w / img.width, layout.h / img.height);
        var srcW = layout.w / scale;
        var srcH = layout.h / scale;
        var srcX = (img.width - srcW) / 2;
        var srcY = (img.height - srcH) / 2;

        var renderScale = 2;
        var canvas = document.createElement('canvas');
        canvas.width = layout.w * renderScale;
        canvas.height = layout.h * renderScale;
        var ctx = canvas.getContext('2d');
        if (!ctx) { resolve(url); return; }
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, layout.w * renderScale, layout.h * renderScale);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = function () { resolve(url); };
      img.src = url;
    });
  };

  // ── 最终卡片渲染（纯 Canvas，不碰 DOM） ──

  var renderFinalCard = async function (mode: 'tidy' | 'random'): Promise<string> {
    var SCALE = 2;
    var S = SCALE;
    var CARD_W = 480; // 1× 尺寸
    var W = CARD_W * S;
    var pad = { top: 28, right: 28, bottom: 24, left: 28 };
    var W = CARD_W * S;

    // 1. 提前渲染所有照片 → Image 对象
    // 根据模式选择布局
    var activeLayouts: Array<{w:number; h:number; top:number; left:number; z:number; rotate:number; border:boolean}>;
    if (mode === 'tidy') {
      activeLayouts = getTidyLayout(photoCount);
    } else {
      var base = getLayoutForCount(photoCount || 3);
      activeLayouts = base.map(function (l, i) {
        if (photoCount === 1) return { ...l, rotate: 0 };
        var raw = (Math.random() - 0.5) * 10;
        var tilt = Math.round(raw * 10) / 10;
        if (tilt > -1 && tilt < 1) tilt = tilt >= 0 ? 1 : -1;
        return { ...l, rotate: tilt };
      });
    }

    var photoResults = await Promise.all(photos.slice(0, 8).map(async function (url, i) {
      var l = activeLayouts[i];
      if (!l) return null;
      var dataUrl = await renderPhotoToCanvas(url, l);
      var img = await new Promise<HTMLImageElement | null>(function (r) {
        var i = new Image();
        i.onload = function () { r(i); };
        i.onerror = function () { r(null); };
        i.src = dataUrl;
      });
      return { img: img, layout: l };
    }));

    // 2. 卡片总高度（1× 像素）
    var descLineEst = description ? Math.max(1, Math.ceil(description.length / 20)) : 0;
    var descTextH = descLineEst * 12 * 1.6;  // fontSize × lineHeight
    var descSectionH = description ? descTextH + 20 /* margin-bottom */ : 0;
    var cardH = 28 /* top pad */ + 83 /* title section */ + 384 /* photo area + margin */ + descSectionH + 59 /* bottom section: pad16 + content27(9date+9gap+9addr) + pad16 */;
    var H = cardH * S;

    // 3. 创建最终画布
    var canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    var ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no ctx');

    var cx = W / 2;  // center X

    // ─── 背景 ───
    if (bgColor) {
      // 底色
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, W, H);
      // 叠一层渐变（模拟 CSS 145deg linear-gradient）
      var grad = ctx.createLinearGradient(W * 0.1, H * 0.9, W * 0.85, H * 0.05);
      grad.addColorStop(0, 'rgba(255,255,255,0.5)');
      grad.addColorStop(0.6, 'rgba(255,255,255,0.1)');
      grad.addColorStop(1, 'rgba(255,255,255,0.25)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
    } else {
      ctx.fillStyle = '#f0f0f0';
      ctx.fillRect(0, 0, W, H);
    }

    // ─── 顶部标题 ───
    var y = pad.top * S;

    // 地点名: fontSize 22
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = '500 ' + (22 * S) + 'px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans SC", sans-serif';
    ctx.fillStyle = '#1a1a1a';
    ctx.fillText(placeName, cx, y);
    var afterTitle = y + 26 * S + 8 * S;

    // 分隔线: 40px wide at center
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 1 * S;
    ctx.beginPath();
    ctx.moveTo(cx - 20 * S, afterTitle);
    ctx.lineTo(cx + 20 * S, afterTitle);
    ctx.stroke();

    // 日期行
    var dateY = afterTitle + (1 + 6) * S;
    ctx.font = '400 ' + (10 * S) + 'px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans SC", sans-serif';
    ctx.fillStyle = '#888';
    ctx.fillText(dayLabel + ' · 旅行记录', cx, dateY);

    // ─── 描述（支持自动换行）───
    var drawWrappedText = function (text: string, x: number, y: number, maxW: number, lineH: number) {
      var chars = text.split('');
      var line = '';
      for (var ci = 0; ci < chars.length; ci++) {
        var testLine = line + chars[ci];
        if (ctx.measureText(testLine).width > maxW && line.length > 0) {
          ctx.fillText(line, x, y);
          line = chars[ci];
          y += lineH;
        } else {
          line = testLine;
        }
      }
      if (line.length > 0) ctx.fillText(line, x, y);
      return y + lineH;  // 返回文本段实际底部 Y
    };

    // ─── 照片墙 ───
    var photoAreaY = pad.top * S + 83 * S;  // 28px pad + 83px title section
    var photoAreaLeft = ((CARD_W - 420) / 2) * S;

    for (var pi = 0; pi < photoResults.length; pi++) {
      var pr = photoResults[pi];
      if (!pr || !pr.img) continue;
      var l = pr.layout;
      var cx2 = (photoAreaLeft + l.left * S) + (l.w * S) / 2;
      var cy2 = (photoAreaY + l.top * S) + (l.h * S) / 2;
      var cw = l.w * S;
      var ch = l.h * S;

      ctx.save();

      // 移动到照片中心
      ctx.translate(cx2, cy2);
      ctx.rotate(l.rotate * Math.PI / 180);

      // 阴影（仅 borderless）— 先画圆角矩形产生阴影，再 clip 照片
      if (!l.border) {
        roundRectPath(ctx, -cw / 2, -ch / 2, cw, ch, 6 * S);
        ctx.shadowColor = 'rgba(0,0,0,0.22)';
        ctx.shadowBlur = 28 * S;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 10 * S;
        ctx.fillStyle = '#fff';
        ctx.fill();
      }

      // 白边（bordered 照片）
      if (l.border) {
        var borderW = 4 * S;
        roundRectPath(ctx, -cw / 2 - borderW, -ch / 2 - borderW, cw + borderW * 2, ch + borderW * 2, 6 * S);
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.shadowColor = 'transparent';
      }

      // 照片圆角裁剪 + 绘制
      ctx.save();
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      roundRectPath(ctx, -cw / 2, -ch / 2, cw, ch, 6 * S);
      ctx.clip();

      // 灰度滤镜
      if (l.grayscale) {
        ctx.filter = 'grayscale(' + l.grayscale + '%)';
      }
      ctx.drawImage(pr.img, -cw / 2, -ch / 2, cw, ch);
      ctx.restore();

      ctx.restore();
    }

    // ─── 描述 ───
    var bottomTopY = photoAreaY + 360 * S;
    if (description) {
      bottomTopY += 24 * S;  // photo area margin-bottom
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.font = 'italic 400 ' + (12 * S) + 'px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans SC", sans-serif';
      ctx.fillStyle = '#666';
      var descText = '“' + description.split('。')[0] + '。”';
      var maxW = 380 * S;
      var lineH = 12 * S * 1.6;  // fontSize 12 × lineHeight 1.6
      var endY = drawWrappedText(descText, cx, bottomTopY, maxW, lineH);
      bottomTopY = endY + 20 * S;  // margin-bottom 20px
    } else {
      bottomTopY += 24 * S;
    }

    // ─── 底部信息 ───
    // 分隔线
    ctx.strokeStyle = 'rgba(0,0,0,0.06)';
    ctx.lineWidth = 1 * S;
    ctx.beginPath();
    ctx.moveTo(pad.left * S, bottomTopY);
    ctx.lineTo(W - pad.right * S, bottomTopY);
    ctx.stroke();

    var bottomY = bottomTopY + 16 * S;
    ctx.textBaseline = 'top';

    // 左：日期 + 地址
    ctx.textAlign = 'left';
    ctx.font = '400 ' + (9 * S) + 'px "SF Mono", Monaco, Consolas, monospace';
    ctx.fillStyle = '#999';
    var nowStr = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
    ctx.fillText('DATE: ' + nowStr, pad.left * S, bottomY);
    ctx.font = '400 ' + (9 * S) + 'px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans SC", sans-serif';
    ctx.fillText(address || 'Travoo · 旅行助手', pad.left * S, bottomY + 18 * S);

    // 右：EXPLORE 徽章
    var badge = 'EXPLORE';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '600 ' + (9 * S) + 'px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans SC", sans-serif';
    ctx.letterSpacing = '1.5px';
    var accentC = accentColor || '#999';
    ctx.fillStyle = accentC;
    var badgeMetrics = ctx.measureText(badge);
    var badgeW = badgeMetrics.width + 24 * S;
    var badgeH = 20 * S;
    var badgeX = W - pad.right * S - badgeW;
    // 底部对齐地址文字底边（匹配 DOM alignItems: flex-end）
    var badgeBottomY = bottomY + 18 * S + 9 * S;  // address top + fontSize 9
    var badgeY = badgeBottomY - badgeH;
    ctx.strokeStyle = accentC;
    ctx.lineWidth = 1 * S;
    roundRectPath(ctx, badgeX, badgeY, badgeW, badgeH, 10 * S);
    ctx.stroke();
    ctx.fillText(badge, badgeX + badgeW / 2, badgeY + badgeH / 2);
    ctx.letterSpacing = '0px';

    // 额外照片计数 badge
    var extraCount = photos.length - 6;
    if (extraCount > 0) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '700 ' + (10 * S) + 'px -apple-system, sans-serif';
      ctx.fillStyle = '#fff';
      var badgeX2 = (photoAreaLeft + 420 * S) - (12 * S) - (9 * S);
      var badgeY2 = photoAreaY + 360 * S - 8 * S - 10 * S;
      var badgeW2 = 18 * S;
      var badgeH2 = 16 * S;
      // 背景圆角矩形
      roundRectPath(ctx, badgeX2 - badgeW2 / 2, badgeY2 - badgeH2 / 2, badgeW2, badgeH2, 10 * S);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText('+' + extraCount, badgeX2, badgeY2);
    }

    return canvas.toDataURL('image/png');
  };

  // ── 导出处理 ──

  var handleExport = async function () {
    if (!capturedDataUrl) return;
    if (navigator.share && /mobile|android|iphone|ipad|ipod/i.test(navigator.userAgent)) {
      var blob = await (await fetch(capturedDataUrl)).blob();
      var file = new File([blob], placeName + '.png', { type: 'image/png' });
      await navigator.share({ title: placeName, files: [file] }).catch(function () {});
    } else {
      var link = document.createElement('a');
      link.download = placeName + '.png';
      link.href = capturedDataUrl;
      link.click();
    }
    setCapturedDataUrl(null);
  };

  // ── 分享逻辑（纯 Canvas 渲染，不碰 DOM） ──

  const handleShare = function () {
    if (generating) return;
    setShowPicker(true);
  };

  const startRender = async function (mode: 'tidy' | 'random') {
    setShowPicker(false);
    if (generating) return;
    setGenerating(true);
    setProgress(0);
    setCapturedDataUrl(null);

    var advance = async function (target: number, minMs: number) {
      setProgress(target);
      await new Promise<void>(function (r) { setTimeout(r, minMs); });
    };

    try {
      // Phase 1: 渲染所有照片到 canvas
      await advance(5, 100);

      // Phase 2: 合成最终卡片画布（传入布局模式）
      var dataUrl = await renderFinalCard(mode);
      await advance(80, 200);

      setCapturedDataUrl(dataUrl);
      await advance(95, 200);
      await advance(100, 800);
    } catch (err) {
      console.error('Render failed:', err);
      await advance(100, 800);
    } finally {
      setGenerating(false);
      setProgress(0);
    }
  };

  var photoCount = Math.min(photos.length, 8);
  var layouts = useMemo(function () {
    var base = getLayoutForCount(photoCount || 3);
    return base.map(function (l, i) {
      // 1 张照片不旋转
      if (photoCount === 1) return { ...l, rotate: 0 };
      var raw = (Math.random() - 0.5) * 10;   // -5 ~ +5
      var tilt = Math.round(raw * 10) / 10;
      if (tilt > -1 && tilt < 1) tilt = tilt >= 0 ? 1 : -1;  // 避开 0°
      return { ...l, rotate: tilt };
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
                var zi = layout.z || 1;
                var useShadow = !layout.border;

                return (
                  <div
                    key={i}
                    style={{
                      position: 'absolute',
                      top: layout.top,
                      left: layout.left,
                      width: layout.w,
                      height: layout.h,
                      zIndex: zi,
                      transform: 'rotate(' + layout.rotate + 'deg) translateZ(0)',
                      transformOrigin: 'center center',
                      backfaceVisibility: 'hidden',
                      boxShadow: useShadow ? '0 10px 28px rgba(0,0,0,0.22)' : 'none',
                      borderRadius: 6,
                      border: layout.border ? '4px solid #fff' : 'none',
                      opacity: layout.opacity,
                      filter: layout.grayscale ? 'grayscale(' + layout.grayscale + '%)' : 'none',
                      background: '#fff',
                    }}
                  >
                    <img
                      src={rotatedPhotos[i] || photos[i]}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
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
              <div>{address || 'Travoo · 旅行助手'}</div>
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
                textAlign: 'center',
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
          disabled={generating && !capturedDataUrl}
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
          ) : (
            <><Share2 size={14} /> 分享</>
          )}
        </button>
      </div>

      {/* ───── 布局选择弹窗 ───── */}
      {showPicker ? (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 24, width: 280, boxShadow: '0 8px 40px rgba(0,0,0,0.15)', position: 'relative' }}>
            <button onClick={() => setShowPicker(false)} style={{ position: 'absolute', top: 10, right: 12, border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 18, color: '#999', lineHeight: 1 }}>✕</button>
            <div style={{ textAlign: 'center', fontSize: 16, fontWeight: 600, marginBottom: 4, color: '#1a1a1a' }}>选择布局</div>
            <div style={{ textAlign: 'center', fontSize: 11, color: '#999', marginBottom: 20 }}>选择你喜欢的照片排列方式</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => startRender('tidy')} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '16px 8px', borderRadius: 12, border: '1px solid #e5e7eb', background: '#f9fafb', cursor: 'pointer' }}>
                <span style={{ fontSize: 22 }}>📐</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#333' }}>整齐排列</span>
                <span style={{ fontSize: 10, color: '#9ca3af' }}>照片不重叠</span>
              </button>
              <button onClick={() => startRender('random')} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '16px 8px', borderRadius: 12, border: '1px solid #e5e7eb', background: '#f9fafb', cursor: 'pointer' }}>
                <span style={{ fontSize: 22 }}>🎲</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#333' }}>随机排列</span>
                <span style={{ fontSize: 10, color: '#9ca3af' }}>拼贴风格</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
