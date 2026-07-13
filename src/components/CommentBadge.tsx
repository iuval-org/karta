import { memo } from 'react';

interface CommentBadgeProps {
  count: number;
  onClick: () => void;
}

function CommentBadge({ count, onClick }: CommentBadgeProps) {
  if (count === 0) return null;

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="absolute -top-2 -right-2 z-[9999] w-6 h-6 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center shadow-sm cursor-pointer hover:bg-red-600 motion-safe:transition-colors active:scale-[0.97]"
      title={`${count} comentario${count !== 1 ? 's' : ''}`}
      aria-label={`${count} comentario${count !== 1 ? 's' : ''}`}
    >
      {count > 99 ? '99+' : count}
    </button>
  );
}

export default memo(CommentBadge);
