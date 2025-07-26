// hooks/useDraggablePanel.ts
import { useRef, useState, useEffect, useCallback } from "react";

interface UseDraggablePanelOptions {
  initialX?: number;
  initialY?: number;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  // Add an optional ID for persistence
  id?: string;
}

export function useDraggablePanel<T extends HTMLElement = HTMLDivElement>(
  containerRef: React.RefObject<HTMLElement | null>,
  options?: UseDraggablePanelOptions
) {
  const panelRef = useRef<T>(null);
  const draggingRef = useRef(false);
  const offsetRef = useRef({ x: 0, y: 0 });

  const storageKey = options?.id ? `floatingPanelPosition_${options.id}` : null;

  // Initialize position from localStorage or options/default
  const [position, setPosition] = useState(() => {
    if (storageKey && typeof window !== 'undefined') {
      const storedPos = localStorage.getItem(storageKey);
      if (storedPos) {
        try {
          return JSON.parse(storedPos);
        } catch (e) {
          console.error("Failed to parse stored panel position", e);
        }
      }
    }
    return { x: options?.initialX || 0, y: options?.initialY || 0 };
  });

  const clampPosition = useCallback(() => {
    if (!panelRef.current || !containerRef.current) return;

    const container = containerRef.current;
    const panel = panelRef.current;

    const containerRect = container.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();

    let newX = position.x;
    let newY = position.y;

    // Clamp values to stay within the container
    newX = Math.max(0, Math.min(newX, containerRect.width - panelRect.width));
    newY = Math.max(0, Math.min(newY, containerRect.height - panelRect.height));

    // Ensure we don't go below min/above max dimensions (if applicable)
    if (options?.minWidth && panelRect.width < options.minWidth) newX = Math.min(newX, containerRect.width - options.minWidth);
    if (options?.minHeight && panelRect.height < options.minHeight) newY = Math.min(newY, containerRect.height - options.minHeight);

    if (newX !== position.x || newY !== position.y) {
      setPosition({ x: newX, y: newY });
    }
  }, [position, containerRef, options]);

  // Initial positioning and clamping on mount/resize
  useEffect(() => {
    if (!containerRef.current || !panelRef.current) return;

    const container = containerRef.current;
    const panel = panelRef.current;

    // Set initial position if not loaded from storage
    if (storageKey && !localStorage.getItem(storageKey)) {
        // Default to top-right if no stored position
        const defaultX = container.offsetWidth - panel.offsetWidth - (options?.initialX || 16);
        const defaultY = (options?.initialY || 16);
        setPosition({ x: defaultX, y: defaultY });
    }
    
    clampPosition(); // Clamp initial position

    const handleResize = () => clampPosition();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [containerRef, clampPosition, options?.initialX, options?.initialY, storageKey]);


  // Mouse event handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!panelRef.current || !containerRef.current) return;

    const panelRect = panelRef.current.getBoundingClientRect();
    const containerRect = containerRef.current.getBoundingClientRect();

    const offsetX = e.clientX - panelRect.left;
    const offsetY = e.clientY - panelRect.top;

    offsetRef.current = { x: offsetX, y: offsetY };
    draggingRef.current = true;

    e.preventDefault(); // prevent text selection
  }, [containerRef]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!draggingRef.current || !panelRef.current || !containerRef.current) return;

    const container = containerRef.current;
    const panel = panelRef.current;
    const offset = offsetRef.current;

    let newX = e.clientX - container.getBoundingClientRect().left - offset.x;
    let newY = e.clientY - container.getBoundingClientRect().top - offset.y;

    // Update position directly without clamping yet
    setPosition({ x: newX, y: newY });
  }, [containerRef]);

  const handleMouseUp = useCallback(() => {
    draggingRef.current = false;
    clampPosition(); // Clamp position after dragging ends
    if (storageKey) {
      localStorage.setItem(storageKey, JSON.stringify(position));
    }
  }, [clampPosition, storageKey, position]);

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);


  return {
    panelRef,
    position,
    handleMouseDown,
  };
}