'use client';

import { useRef, useState, useCallback, useEffect } from 'react';

interface Props {
  children: [React.ReactNode, React.ReactNode];
  defaultRightWidth?: number; // px
  minWidth?: number;
  maxWidth?: number;
}

export default function ResizablePanel({
  children,
  defaultRightWidth = 420,
  minWidth = 240,
  maxWidth = 700,
}: Props) {
  const [rightWidth, setRightWidth] = useState(defaultRightWidth);
  const dragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const newRight = Math.min(maxWidth, Math.max(minWidth, rect.right - e.clientX));
      setRightWidth(newRight);
    }
    function onMouseUp() {
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [minWidth, maxWidth]);

  return (
    <div ref={containerRef} className="flex flex-1 overflow-hidden">
      {/* Left panel */}
      <div className="flex-1 overflow-hidden min-w-0">
        {children[0]}
      </div>

      {/* Drag handle */}
      <div
        onMouseDown={onMouseDown}
        className="w-1 shrink-0 bg-terminal-border hover:bg-terminal-green cursor-col-resize transition-colors relative group"
        title="Drag to resize"
      >
        <div className="absolute inset-y-0 -left-1 -right-1" onMouseDown={onMouseDown} />
      </div>

      {/* Right panel */}
      <div
        className="shrink-0 overflow-hidden flex flex-col border-l border-terminal-border"
        style={{ width: rightWidth }}
      >
        {children[1]}
      </div>
    </div>
  );
}
