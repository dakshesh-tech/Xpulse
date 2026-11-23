import React, { useState } from 'react';
import {
  Award,
  BookMarked,
  BookOpen,
  Brain,
  Compass,
  Cpu,
  Crown,
  Dumbbell,
  Flame,
  Footprints,
  Hammer,
  Orbit,
  Shield,
  Sparkles,
  Sunrise,
  Users,
  Zap,
} from 'lucide-react';

interface RpgIconProps {
  name: string;
  className?: string;
}

export const RpgIcon: React.FC<RpgIconProps> = ({ name, className = 'w-4 h-4' }) => {
  switch (name) {
    case 'Brain':
      return <Brain className={className} />;
    case 'BookOpen':
      return <BookOpen className={className} />;
    case 'BookMarked':
      return <BookMarked className={className} />;
    case 'Compass':
      return <Compass className={className} />;
    case 'Dumbbell':
      return <Dumbbell className={className} />;
    case 'Shield':
      return <Shield className={className} />;
    case 'Sparkles':
      return <Sparkles className={className} />;
    case 'Users':
      return <Users className={className} />;
    case 'Flame':
      return <Flame className={className} />;
    case 'Footprints':
      return <Footprints className={className} />;
    case 'Sunrise':
      return <Sunrise className={className} />;
    case 'Hammer':
      return <Hammer className={className} />;
    case 'Crown':
      return <Crown className={className} />;
    case 'Zap':
      return <Zap className={className} />;
    case 'Orbit':
      return <Orbit className={className} />;
    case 'Cpu':
      return <Cpu className={className} />;
    case 'Award':
    default:
      return <Award className={className} />;
  }
};

interface SafeImageProps {
  src: string;
  alt: string;
  className?: string;
  fallbackIcon?: string;
  fallbackLabel?: string;
}

export const SafeImage: React.FC<SafeImageProps> = ({
  src,
  alt,
  className = '',
  fallbackIcon = 'Award',
  fallbackLabel,
}) => {
  const [failed, setFailed] = useState(false);

  if (failed || !src) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-[#1B1E2B] via-[#131520] to-[#0D0F16] text-violet-300/80 ${className}`}
        role="img"
        aria-label={alt}
      >
        <RpgIcon name={fallbackIcon} className="w-6 h-6" />
        {fallbackLabel && (
          <span className="mt-1.5 text-[11px] text-slate-400 px-2 text-center truncate max-w-full">
            {fallbackLabel}
          </span>
        )}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
};
