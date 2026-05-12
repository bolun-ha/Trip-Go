import React, { useEffect, useState } from 'react';
import { ImageIcon, Loader2 } from 'lucide-react';
import { getPlaceImage } from '../services/placeImageService';

interface PlaceImageProps {
  /** 景点名称 */
  placeName: string;
  /** 城市名称（可选，提高搜索精度） */
  city?: string;
  /** 图片尺寸 */
  size?: 'sm' | 'md' | 'lg';
  /** 额外的容器类名 */
  className?: string;
  /** 图片加载完成回调 */
  onLoaded?: () => void;
}

const sizeMap = {
  sm: { w: 'w-16 h-16' },
  md: { w: 'w-24 h-24' },
  lg: { w: 'w-full h-full' },
};

export const PlaceImage: React.FC<PlaceImageProps> = ({
  placeName,
  city,
  size = 'md',
  className = '',
  onLoaded,
}) => {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(false);
    setImageUrl(null);

    getPlaceImage(placeName, city).then((url) => {
      if (cancelled) return;
      if (url) {
        setImageUrl(url);
      } else {
        setError(true);
      }
      setLoading(false);
      onLoaded?.();
    });

    return () => { cancelled = true; };
  }, [placeName, city]);

  const dims = sizeMap[size];

  return (
    <div className={`${dims.w} rounded-xl overflow-hidden bg-gray-100 flex-shrink-0 relative ${className}`}>
      {loading && (
        <div className="w-full h-full flex items-center justify-center">
          <Loader2 size={16} className="text-gray-300 animate-spin" />
        </div>
      )}
      {error && !loading && (
        <div className="w-full h-full flex items-center justify-center">
          <ImageIcon size={18} className="text-gray-200" />
        </div>
      )}
      {imageUrl && (
        <img
          src={imageUrl}
          alt={placeName}
          className={`${dims.w} object-cover`}
          onError={() => { setError(true); setImageUrl(null); }}
          loading="lazy"
        />
      )}
    </div>
  );
};
