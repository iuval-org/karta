import { memo } from 'react';
import { Handle, Position, NodeResizer, type NodeProps } from '@xyflow/react';
import type { ShapeNodeData } from '../types/nodes';
import { useCommentStore } from '../stores/commentStore';
import CommentBadge from './CommentBadge';

function ShapeNode({ id, data, selected }: NodeProps) {
  const shapeData = data as unknown as ShapeNodeData;
  const { shapeType, label, fillColor = '#FFFFFF', borderColor = '#D1D5DB' } = shapeData;

  const commentCount = useCommentStore((s) => s.getCommentsForNode(id).length);
  const openThread = useCommentStore((s) => s.openThread);

  const isCircle = shapeType === 'circle';

  return (
    <div
      className={`relative flex items-center justify-center w-full h-full select-none ${
        selected ? 'ring-2 ring-[#2563EB]/20' : ''
      }`}
    >
      {isCircle ? (
        <NodeResizer
          minWidth={80}
          minHeight={80}
          keepAspectRatio
          isVisible={selected}
          handleStyle={{
            width: 6,
            height: 6,
            border: '2px solid #2563EB',
            backgroundColor: 'white',
            borderRadius: 2,
          }}
          lineStyle={{
            border: '1.5px solid #2563EB',
            opacity: 0.4,
          }}
        />
      ) : (
        <NodeResizer
          minWidth={shapeType === 'line' ? 120 : 100}
          minHeight={shapeType === 'line' ? 4 : 40}
          isVisible={selected}
          handleStyle={{
            width: 6,
            height: 6,
            border: '2px solid #2563EB',
            backgroundColor: 'white',
            borderRadius: 2,
          }}
          lineStyle={{
            border: '1.5px solid #2563EB',
            opacity: 0.4,
          }}
        />
      )}

      <Handle
        type="target"
        position={Position.Top}
        className="!opacity-0 !pointer-events-auto"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!opacity-0 !pointer-events-auto"
      />

      <CommentBadge count={commentCount} onClick={() => openThread(id)} />

      {shapeType === 'rectangle' && (
        <div
          className="w-full h-full rounded-lg border-2 flex items-center justify-center"
          style={{ backgroundColor: fillColor, borderColor }}
        >
          <span className="text-xs text-gray-400 pointer-events-none">{label}</span>
        </div>
      )}

      {shapeType === 'circle' && (
        <div
          className="w-full h-full rounded-full border-2 flex items-center justify-center"
          style={{ backgroundColor: fillColor, borderColor }}
        >
          <span className="text-xs text-gray-400 pointer-events-none">{label}</span>
        </div>
      )}

      {shapeType === 'arrow' && (
        <div className="w-full h-full relative flex items-center justify-center">
          <svg
            className="absolute inset-0 w-full h-full"
            viewBox="0 0 200 60"
            preserveAspectRatio="xMidYMid meet"
          >
            <line x1="0" y1="30" x2="170" y2="30" stroke={borderColor} strokeWidth="2" />
            <polygon points="170,15 200,30 170,45" fill={borderColor} />
          </svg>
          <span className="text-xs text-gray-400 pointer-events-none relative z-10">
            {label}
          </span>
        </div>
      )}

      {shapeType === 'line' && (
        <div className="w-full h-full flex items-center justify-center">
          <div
            className="w-full"
            style={{
              height: 2,
              backgroundColor: borderColor,
              borderRadius: 1,
            }}
          />
          <span className="absolute text-xs text-gray-400 pointer-events-none">{label}</span>
        </div>
      )}
    </div>
  );
}

export default memo(ShapeNode);
