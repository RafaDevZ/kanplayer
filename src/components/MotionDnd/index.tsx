import { motion } from "framer-motion";
import { forwardRef, useCallback, useLayoutEffect, useRef, type ForwardedRef } from "react";
import {
  DND_DRAG_PREVIEW_INITIAL_TRANSFORM,
  DND_DRAG_PREVIEW_OPACITY,
  DND_DRAG_PREVIEW_POINTER_EVENTS,
  DND_DRAG_PREVIEW_SPRING_TRANSITION,
  DND_DRAG_PREVIEW_TRANSFORM_TRANSITION,
  DND_DRAG_PREVIEW_Z_INDEX,
} from "./config";
import { MotionDndStyles } from "./styles";

export interface DragPreview {
  element: HTMLElement;
  width: number;
  height: number;
  x: number;
  y: number;
}

interface MotionDndProps {
  dragPreview: DragPreview | null;
}

function setForwardedRef<T>(ref: ForwardedRef<T>, value: T | null) {
  if (typeof ref === "function") {
    ref(value);
    return;
  }

  if (ref) {
    ref.current = value;
  }
}

export const MotionDnd = forwardRef<HTMLDivElement, MotionDndProps>(
  ({ dragPreview }, ref) => {
    const containerRef = useRef<HTMLDivElement | null>(null);

    const setContainerRef = useCallback((element: HTMLDivElement | null) => {
      containerRef.current = element;
      setForwardedRef(ref, element);
    }, [ref]);

    useLayoutEffect(() => {
      const container = containerRef.current;
      if (!container || !dragPreview) return;

      container.replaceChildren(dragPreview.element);

      return () => {
        container.replaceChildren();
      };
    }, [dragPreview]);

    return (
      <>
        <MotionDndStyles />

        {dragPreview && (
          <motion.div
            ref={setContainerRef}
            initial={{
              opacity: DND_DRAG_PREVIEW_OPACITY,
            }}
            animate={{
              opacity: DND_DRAG_PREVIEW_OPACITY,
            }}
            transition={DND_DRAG_PREVIEW_SPRING_TRANSITION}
            style={{
              position: "fixed",
              left: dragPreview.x,
              top: dragPreview.y,
              width: dragPreview.width,
              height: dragPreview.height,
              transform: DND_DRAG_PREVIEW_INITIAL_TRANSFORM,
              transition: DND_DRAG_PREVIEW_TRANSFORM_TRANSITION,
              willChange: "transform",
              pointerEvents: DND_DRAG_PREVIEW_POINTER_EVENTS,
              zIndex: DND_DRAG_PREVIEW_Z_INDEX,
            }}
          />
        )}
      </>
    );
  }
);
