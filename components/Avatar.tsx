'use client';

interface AvatarProps {
  photoURL?: string;
  displayName: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  gradientFrom?: string;
  gradientTo?: string;
  /** Letter avatar style: 'gradient' (colored) or 'primary' (surface + accent) */
  letterVariant?: 'gradient' | 'primary';
}

const sizeClasses = {
  xs: 'w-6 h-6 text-xs',
  sm: 'w-8 h-8 text-sm',
  md: 'w-10 h-10 text-base',
  lg: 'w-12 h-12 text-lg',
  xl: 'w-32 h-32 text-4xl',
};

export default function Avatar({
  photoURL,
  displayName,
  size = 'md',
  className = '',
  gradientFrom = 'from-blue-500',
  gradientTo = 'to-purple-600',
  letterVariant = 'gradient',
}: AvatarProps) {
  const sizeClass = sizeClasses[size];
  
  if (photoURL) {
    return (
      <img
        src={photoURL}
        alt={displayName}
        className={`${sizeClass} rounded-full object-cover ${className}`}
      />
    );
  }

  // Fallback to letter avatar
  if (letterVariant === 'primary') {
    return (
      <div className={`${sizeClass} rounded-full bg-primary/15 text-primary font-semibold flex items-center justify-center ${className}`}>
        {displayName.charAt(0).toUpperCase()}
      </div>
    );
  }
  return (
    <div className={`${sizeClass} rounded-full bg-gradient-to-br ${gradientFrom} ${gradientTo} flex items-center justify-center text-white font-bold ${className}`}>
      {displayName.charAt(0).toUpperCase()}
    </div>
  );
}
