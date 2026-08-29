import type { CSSProperties } from "styled-components";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { animate, useDragControls, useMotionValue } from "framer-motion";
import { useIsFetching, useIsMutating } from "@tanstack/react-query";
import { Icons } from "../Icons";
import {
  ChildrenContainer,
  CloseButton,
  WindowBody,
  WindowContainer,
  WindowHeader,
  WindowIconsBox,
} from "./styles";
import { DND_LAYER_DATA_ATTRIBUTE, DND_LAYER_DATA_VALUE } from "../MotionDnd/config";

const WINDOW_ANIMATION_MS = 100;
const WINDOW_RETURN_PADDING = 30;
const WINDOW_QUERY_SETTLE_MS = 80;

interface WindowProps {
  isVisible: boolean;
  children?: ReactNode;
  onClose?: () => void;
  height?: string;
  width?: string;
  zIndex?: number;
  style?: CSSProperties;
  title?: string;
  icon?: ReactNode;
  className?: string;
  noPadding?: boolean;
  onResizeTransitionEnd?: () => void;
}

function Window({ isVisible, children, onClose, height, width, zIndex, style, title, icon, className, noPadding, onResizeTransitionEnd }: WindowProps) {
  const [shouldRender, setShouldRender] = useState<boolean>(isVisible);
  const [isClosing, setIsClosing] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isPreparingOpen, setIsPreparingOpen] = useState<boolean>(false);
  const isFetching = useIsFetching({
    predicate: query => query.meta?.skipGlobalLoading !== true,
  });
  const isMutating = useIsMutating();
  const isQueryBusy = isFetching > 0 || isMutating > 0;

  const windowRef = useRef<HTMLDivElement | null>(null);
  const backdropPointerStartedRef = useRef<boolean>(false);
  const dragControls = useDragControls();

  const x = useMotionValue(0);
  const y = useMotionValue(0);

  useEffect(() => {
    if (isVisible) {
      if (!shouldRender) {
        x.set(0);
        y.set(0);

        setShouldRender(true);
        setIsClosing(false);
        setIsPreparingOpen(true);
        return;
      }

      if (isPreparingOpen) {
        if (isQueryBusy) return;

        const timeout = window.setTimeout(() => {
          setIsPreparingOpen(false);
        }, WINDOW_QUERY_SETTLE_MS);

        return () => window.clearTimeout(timeout);
      }

      setIsClosing(false);
      return;
    }

    setIsPreparingOpen(false);

    if (!shouldRender) return;

    setIsClosing(true);

    const timeout = window.setTimeout(() => {
      setShouldRender(false);
      setIsClosing(false);
    }, WINDOW_ANIMATION_MS);

    return () => window.clearTimeout(timeout);
  }, [isPreparingOpen, isQueryBusy, isVisible, shouldRender, x, y]);

  const containerStyle = useMemo<CSSProperties>(() => ({
    zIndex,
    ...style,
  }), [zIndex, style]);

  const childrenStyle = useMemo<CSSProperties>(() => ({
    maxHeight: height,
    maxWidth: width,
  }), [height, width]);

  const hasNoPadding = useMemo(() => {
    if (noPadding) return true;
    if (!className) return false;

    return className.split(" ").includes("no-padding");
  }, [noPadding, className]);

  const fixWindowPosition = useCallback(() => {
    const element = windowRef.current;
    if (!element) return;

    const rect = element.getBoundingClientRect();

    let nextX = x.get();
    let nextY = y.get();

    if (rect.left < WINDOW_RETURN_PADDING) {
      nextX += WINDOW_RETURN_PADDING - rect.left;
    }

    if (rect.right > window.innerWidth - WINDOW_RETURN_PADDING) {
      nextX -= rect.right - (window.innerWidth - WINDOW_RETURN_PADDING);
    }

    if (rect.top < WINDOW_RETURN_PADDING) {
      nextY += WINDOW_RETURN_PADDING - rect.top;
    }

    if (rect.bottom > window.innerHeight - WINDOW_RETURN_PADDING) {
      nextY -= rect.bottom - (window.innerHeight - WINDOW_RETURN_PADDING);
    }

    animate(x, nextX, {
      duration: 0.2,
      ease: "easeOut",
    });

    animate(y, nextY, {
      duration: 0.2,
      ease: "easeOut",
    });
  }, [x, y]);

  const handleBackdropPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    backdropPointerStartedRef.current = e.target === e.currentTarget;
  }, []);

  const handleBackdropClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const didStartOnBackdrop = backdropPointerStartedRef.current;
    backdropPointerStartedRef.current = false;

    if (isDragging || !didStartOnBackdrop) return;

    if (e.target === e.currentTarget) {
      onClose?.();
    }
  }, [isDragging, onClose]);

  const handleHeaderPointerDown = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;

    e.preventDefault();
    e.stopPropagation();

    dragControls.start(e);
  }, [dragControls]);

  const handleHeaderDoubleClick = useCallback((e: React.MouseEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();

    animate(x, 0, {
      duration: 0.2,
      ease: "easeOut",
    });

    animate(y, 0, {
      duration: 0.2,
      ease: "easeOut",
    });
  }, [x, y]);

  const handleCloseClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    onClose?.();
  }, [onClose]);

  if (!shouldRender) return null;

  const windowElement = (
    <WindowBody
      {...{ [DND_LAYER_DATA_ATTRIBUTE]: DND_LAYER_DATA_VALUE }}
      $isDragging={isDragging}
      onPointerDown={handleBackdropPointerDown}
      onClick={handleBackdropClick}
      initial={{ opacity: 0 }}
      animate={{ opacity: isClosing || isPreparingOpen ? 0 : 1 }}
      transition={{ duration: WINDOW_ANIMATION_MS / 1000, ease: "easeInOut" }}
      style={{ pointerEvents: isPreparingOpen ? "none" : undefined }}
    >
      <WindowContainer
        ref={windowRef}
        data-window-container-dragging={isDragging ? "true" : "false"}
        drag
        dragControls={dragControls}
        dragListener={false}
        dragMomentum={false}
        dragElastic={0}
        dragConstraints={false}
        $height={height}
        $width={width}
        $isDragging={isDragging}
        style={{ ...containerStyle, x, y }}
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{
          opacity: isClosing || isPreparingOpen ? 0 : isDragging ? 0.2 : 1,
          scale: isClosing ? 0.98 : 1,
        }}
        transition={{ duration: WINDOW_ANIMATION_MS / 1000, ease: "easeInOut" }}
        onDragStart={() => setIsDragging(true)}
        onDragEnd={() => {
          setIsDragging(false);
          fixWindowPosition();
        }}
        onTransitionEnd={(event) => {
          if (event.target === event.currentTarget && (event.propertyName === "width" || event.propertyName === "height")) {
            onResizeTransitionEnd?.();
          }
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <WindowHeader
          onPointerDown={handleHeaderPointerDown}
          onDoubleClick={handleHeaderDoubleClick}
        >
          <WindowIconsBox>
            {icon}
          </WindowIconsBox>

          {title}

          <CloseButton onClick={handleCloseClick}>
            {Icons.closeIcon}
          </CloseButton>
        </WindowHeader>

        <ChildrenContainer
          style={childrenStyle}
          className={className}
          $noPadding={hasNoPadding}
        >
          {children}
        </ChildrenContainer>
      </WindowContainer>
    </WindowBody>
  );

  if (typeof document === "undefined") return windowElement;

  return createPortal(windowElement, document.body);
}

export default memo(Window);
