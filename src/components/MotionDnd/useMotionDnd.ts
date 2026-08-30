import { useCallback, useMemo, useRef, useState, type RefCallback, type RefObject } from "react";
import type { DragPreview } from ".";
import {
  DND_ACTION_SELECTOR,
  DND_DISABLED_TRANSITION,
  DND_DRAG_PREVIEW_POINTER_EVENTS,
  DND_DRAG_PREVIEW_REMOVED_DISPLAY,
  DND_DRAG_PREVIEW_TRANSLATE_Z,
  DND_DRAG_THRESHOLD_PX,
  DND_DRAGGABLE_DETACH_DELAY_MS,
  DND_DRAGGABLE_INITIAL_CLASS,
  DND_DRAGGABLE_SELECTOR,
  DND_DRAGGABLE_TYPE,
  DND_DRAG_SOURCE_CLASS,
  DND_DRAG_SOURCE_OVERLAY_CLASS,
  DND_DRAGGING_CLASS,
  DND_EDITABLE_CARD_DRAGGABLE_CLASS,
  DND_EDITABLE_CARD_SELECTOR,
  DND_DROPPABLE_DATA_VALUE,
  DND_SWAP_BOTTOM_CLASS,
  DND_SWAP_LEFT_CLASS,
  DND_SWAP_RIGHT_CLASS,
  DND_SWAP_TOP_CLASS,
  DND_DROPPABLE_FOCUSED_CLASS,
  DND_DROPPABLE_INITIAL_CLASS,
  DND_DROPPABLE_SELECTOR,
  DND_GLOBAL_DRAGGING_CLASS,
  DND_HIDDEN_VISIBILITY,
  DND_LAYER_SELECTOR,
  DND_TRIGGER_ATTACH_ATTEMPTS,
} from "./config";

interface PointerPosition {
  x: number;
  y: number;
}

interface DndActionResult {
  draggableData: {
    from: unknown;
    to: unknown;
  };
  droppableData: {
    from: unknown;
    to: unknown;
  };
}

interface DndClickResult<Generic = unknown> {
  draggableData: Generic;
  element: HTMLElement;
  event: PointerEvent;
}

interface MotionDndValue {
  isDragging: boolean;
  elementData: unknown | null;
  isLocalDragging: <Generic>(draggableData: Generic) => boolean;
  draggable: <Generic>(draggableData: Generic, options?: DndDraggableOptions<Generic>) => RefCallback<HTMLElement>;
  droppable: <Generic>(droppableData: Generic, options?: DndDroppableOptions) => RefCallback<HTMLElement>;
}

type SwapDirection = "top" | "right" | "bottom" | "left";

const SWAP_DIRECTION_CLASSES: Record<SwapDirection, string> = {
  top: DND_SWAP_TOP_CLASS,
  right: DND_SWAP_RIGHT_CLASS,
  bottom: DND_SWAP_BOTTOM_CLASS,
  left: DND_SWAP_LEFT_CLASS,
};

interface DndDraggableOptions<Generic = unknown> {
  allowActionDrag?: boolean;
  triggerRef?: RefObject<HTMLElement | null>;
  onClick?: (clickResult: DndClickResult<Generic>) => void;
  onTopSwap?: (swapResult: DndActionResult) => void;
  onRightSwap?: (swapResult: DndActionResult) => void;
  onBottomSwap?: (swapResult: DndActionResult) => void;
  onLeftSwap?: (swapResult: DndActionResult) => void;
}

interface DndDroppableOptions {
  triggerRef?: RefObject<HTMLElement | null>;
  onDrop?: (dropResult: DndActionResult) => void;
}

function isHTMLElement(element: Element | null): element is HTMLElement {
  return element instanceof HTMLElement;
}

function getPoint(event: PointerEvent): PointerPosition {
  return { x: event.clientX, y: event.clientY };
}

function hasMovedEnough(pointerPosition: PointerPosition, startPosition: PointerPosition) {
  return (
    Math.abs(pointerPosition.x - startPosition.x) >= DND_DRAG_THRESHOLD_PX ||
    Math.abs(pointerPosition.y - startPosition.y) >= DND_DRAG_THRESHOLD_PX
  );
}

function getTriggerElement(fallbackElement: HTMLElement, triggerRef?: RefObject<HTMLElement | null>) {
  return triggerRef?.current ?? fallbackElement;
}

function scheduleTriggerAttach(
  attachTrigger: () => boolean,
  setFrame: (frame: number | null) => void,
  attempts = DND_TRIGGER_ATTACH_ATTEMPTS
) {
  const frame = requestAnimationFrame(() => {
    setFrame(null);

    if (attachTrigger() || attempts <= 1) return;

    scheduleTriggerAttach(attachTrigger, setFrame, attempts - 1);
  });

  setFrame(frame);
}

function withHiddenElement<Result>(
  element: HTMLElement | null | undefined,
  callback: () => Result
): Result {
  if (!element) return callback();

  const previousVisibility = element.style.visibility;
  element.style.visibility = DND_HIDDEN_VISIBILITY;

  try {
    return callback();
  } finally {
    element.style.visibility = previousVisibility;
  }
}

function getElementsFromPoint(
  pointerPosition: PointerPosition,
  ignoredElement?: HTMLElement | null
) {
  return withHiddenElement(ignoredElement, () => {
    return document
      .elementsFromPoint(pointerPosition.x, pointerPosition.y)
      .filter(isHTMLElement);
  });
}

function isVisuallyBlockedByEarlierElement(candidate: HTMLElement, earlierElements: HTMLElement[]) {
  return earlierElements.some((element) => {
    if (element === candidate) return false;
    if (candidate.contains(element)) return false;
    if (element.contains(candidate)) return false;

    return true;
  });
}

function getVisibleClosestElementsFromPoint(
  pointerPosition: PointerPosition,
  selector: string,
  ignoredElement?: HTMLElement | null
) {
  const pointElements = getElementsFromPoint(pointerPosition, ignoredElement);
  const visibleClosestElements: HTMLElement[] = [];

  pointElements.forEach((element, index) => {
    const closestElement = closestHTMLElement(element, selector);
    if (!closestElement) return;

    const earlierElements = pointElements.slice(0, index);
    if (isVisuallyBlockedByEarlierElement(closestElement, earlierElements)) return;

    visibleClosestElements.push(closestElement);
  });

  return Array.from(new Set(visibleClosestElements));
}

function getTopLayerFromPoint(pointerPosition: PointerPosition) {
  const pointElements = getElementsFromPoint(pointerPosition);

  return pointElements
    .map((element) => closestHTMLElement(element, DND_LAYER_SELECTOR))
    .find(isHTMLElement) ?? null;
}

function closestHTMLElement(element: Element, selector: string) {
  const closestElement = element.closest(selector);
  return isHTMLElement(closestElement) ? closestElement : null;
}

function canStartFromLayer(pointerPosition: PointerPosition, draggableElement: HTMLElement) {
  const topLayer = getTopLayerFromPoint(pointerPosition);

  return !topLayer || topLayer.contains(draggableElement);
}

function preventNextClick() {
  const preventClick = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  };

  window.addEventListener("click", preventClick, { capture: true, once: true });
}

function isSameDndData(first: unknown, second: unknown) {
  return first === second;
}

function isHeaderOrFloatingDrag(data: unknown) {
  return Boolean(
    data
    && typeof data === "object"
    && ["header", "floating"].includes((data as { source?: string }).source || ""),
  );
}

function isDndActionTarget(eventTarget: EventTarget | null, draggableElement: HTMLElement) {
  if (!(eventTarget instanceof Element)) return false;

  const explicitAction = eventTarget.closest(DND_ACTION_SELECTOR);
  if (explicitAction && draggableElement.contains(explicitAction)) return true;

  let element: Element | null = eventTarget;

  while (element && element !== draggableElement) {
    if (element instanceof HTMLElement) {
      const hasInlineClick = typeof element.onclick === "function";
      const hasPointerCursor = window.getComputedStyle(element).cursor === "pointer";

      if (hasInlineClick || hasPointerCursor) return true;
    }

    element = element.parentElement;
  }

  return false;
}

function hasDroppableDescendant(element: HTMLElement) {
  return element.querySelector(DND_DROPPABLE_SELECTOR) !== null;
}

function getDragSourceOverlay(draggableElement: HTMLElement) {
  const existingOverlay = draggableElement.querySelector(`:scope > .${DND_DRAG_SOURCE_OVERLAY_CLASS}`);
  return isHTMLElement(existingOverlay) ? existingOverlay : null;
}

function ensureDragSourceOverlay(draggableElement: HTMLElement) {
  const existingOverlay = getDragSourceOverlay(draggableElement);
  if (existingOverlay) return existingOverlay;

  const overlay = document.createElement("span");
  overlay.className = DND_DRAG_SOURCE_OVERLAY_CLASS;
  draggableElement.appendChild(overlay);

  return overlay;
}

function removeDragSourceOverlay(draggableElement: HTMLElement) {
  getDragSourceOverlay(draggableElement)?.remove();
}

function getSwapDirections(
  pointerPosition: PointerPosition,
  target: HTMLElement,
  handlers?: DndDraggableOptions
): SwapDirection[] {
  const rect = target.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const directions: SwapDirection[] = [];

  if (pointerPosition.y < centerY && handlers?.onTopSwap) directions.push("top");
  if (pointerPosition.y >= centerY && handlers?.onBottomSwap) directions.push("bottom");
  if (pointerPosition.x < centerX && handlers?.onLeftSwap) directions.push("left");
  if (pointerPosition.x >= centerX && handlers?.onRightSwap) directions.push("right");

  return directions;
}

function runSwapHandlers(directions: SwapDirection[], swapResult: DndActionResult, handlers?: DndDraggableOptions) {
  directions.forEach((direction) => {
    if (direction === "top") handlers?.onTopSwap?.(swapResult);
    if (direction === "right") handlers?.onRightSwap?.(swapResult);
    if (direction === "bottom") handlers?.onBottomSwap?.(swapResult);
    if (direction === "left") handlers?.onLeftSwap?.(swapResult);
  });
}

function getHoveredSwapDraggable(
  pointerPosition: PointerPosition,
  draggingElement: HTMLElement | null,
  draggingSourceDroppable: HTMLElement | null,
  ignoredElement?: HTMLElement | null,
  canUseDraggable?: (element: HTMLElement) => boolean
) {
  const hoveredDraggables = getVisibleClosestElementsFromPoint(
    pointerPosition,
    DND_DRAGGABLE_SELECTOR,
    ignoredElement
  )
    .filter((element) => element !== draggingElement)
    .filter((element) => !canUseDraggable || canUseDraggable(element));

  const shouldFindNestedDraggable = Boolean(draggingSourceDroppable);

  return hoveredDraggables.find((element) => {
    const isNestedInDroppable = closestHTMLElement(element, DND_DROPPABLE_SELECTOR) !== null;
    return isNestedInDroppable === shouldFindNestedDraggable;
  }) ?? null;
}

function getHoveredDroppable(
  pointerPosition: PointerPosition,
  ignoredElement?: HTMLElement | null,
  canUseDroppable?: (element: HTMLElement) => boolean
) {
  const hoveredDroppables = getVisibleClosestElementsFromPoint(
    pointerPosition,
    DND_DROPPABLE_SELECTOR,
    ignoredElement
  );

  return hoveredDroppables.find((element) => !canUseDroppable || canUseDroppable(element)) ?? null;
}

export function useMotionDnd() {
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [draggingData, setDraggingData] = useState<unknown>(null);

  const dragPreviewElementRef = useRef<HTMLDivElement | null>(null);
  const isDraggingRef = useRef(false);
  const draggingDataRef = useRef<unknown>(null);
  const draggingElementRef = useRef<HTMLElement | null>(null);
  const draggingSourceDroppableRef = useRef<HTMLElement | null>(null);
  const focusedDroppableRef = useRef<HTMLElement | null>(null);
  const draggableDataRef = useRef(new WeakMap<HTMLElement, unknown>());
  const draggableOptionsRef = useRef(new WeakMap<HTMLElement, DndDraggableOptions<any> | undefined>());
  const draggableDetachTimeoutRef = useRef(new WeakMap<HTMLElement, number>());
  const droppableDataRef = useRef(new WeakMap<HTMLElement, unknown>());
  const droppableOptionsRef = useRef(new WeakMap<HTMLElement, DndDroppableOptions | undefined>());
  const dragFrameRef = useRef<number | null>(null);
  const lastPointerPositionRef = useRef<PointerPosition | null>(null);
  const finishDndRef = useRef<(() => void) | null>(null);
  const focusedDroppableTargetRef = useRef<HTMLElement | null>(null);
  const draggingTriggerElementRef = useRef<HTMLElement | null>(null);
  const focusedSwapTargetRef = useRef<HTMLElement | null>(null);
  const focusedSwapDirectionsKeyRef = useRef("");

  const detachDraggableData = useCallback((draggableElement: HTMLElement) => {
    removeDragSourceOverlay(draggableElement);
    delete draggableElement.dataset.dndType;
    draggableDataRef.current.delete(draggableElement);
    draggableOptionsRef.current.delete(draggableElement);
  }, []);

  const cancelDraggableDetach = useCallback((draggableElement: HTMLElement) => {
    const detachTimeout = draggableDetachTimeoutRef.current.get(draggableElement);
    if (detachTimeout === undefined) return;

    window.clearTimeout(detachTimeout);
    draggableDetachTimeoutRef.current.delete(draggableElement);
  }, []);

  const scheduleDraggableDetach = useCallback((draggableElement: HTMLElement) => {
    cancelDraggableDetach(draggableElement);

    if (!draggableElement.isConnected) {
      detachDraggableData(draggableElement);
      return;
    }

    const detachTimeout = window.setTimeout(() => {
      draggableDetachTimeoutRef.current.delete(draggableElement);
      detachDraggableData(draggableElement);
    }, DND_DRAGGABLE_DETACH_DELAY_MS);

    draggableDetachTimeoutRef.current.set(draggableElement, detachTimeout);
  }, [cancelDraggableDetach, detachDraggableData]);

  const clearFocusedDroppable = useCallback(() => {
    focusedDroppableRef.current?.classList.remove(DND_DROPPABLE_FOCUSED_CLASS);
    focusedDroppableTargetRef.current?.classList.remove(DND_DROPPABLE_FOCUSED_CLASS);

    focusedDroppableRef.current = null;
    focusedDroppableTargetRef.current = null;
  }, []);

  const clearFocusedSwap = useCallback(() => {
    Object.values(SWAP_DIRECTION_CLASSES).forEach((className) => {
      focusedSwapTargetRef.current?.classList.remove(className);
    });

    focusedSwapTargetRef.current = null;
    focusedSwapDirectionsKeyRef.current = "";
  }, []);

  const focusSwap = useCallback((target: HTMLElement, directions: SwapDirection[]) => {
    const directionsKey = directions.join("-");
    const shouldRestartAnimation = (
      focusedSwapTargetRef.current === target &&
      focusedSwapDirectionsKeyRef.current !== directionsKey
    );

    if (focusedSwapTargetRef.current !== target) {
      clearFocusedSwap();
      focusedSwapTargetRef.current = target;
    } else if (shouldRestartAnimation) {
      Object.values(SWAP_DIRECTION_CLASSES).forEach((className) => {
        target.classList.remove(className);
      });

      target.getBoundingClientRect();
    }

    Object.entries(SWAP_DIRECTION_CLASSES).forEach(([direction, className]) => {
      target.classList.toggle(className, directions.includes(direction as SwapDirection));
    });

    focusedSwapDirectionsKeyRef.current = directionsKey;
  }, [clearFocusedSwap]);

  const focusDroppable = useCallback((droppable: HTMLElement) => {
    const draggingElement = draggingElementRef.current;

    if (draggingSourceDroppableRef.current === droppable) {
      clearFocusedSwap();
      clearFocusedDroppable();
      return;
    }

    if (draggingElement?.contains(droppable) || droppable.contains(draggingElement)) {
      clearFocusedSwap();
      clearFocusedDroppable();
      return;
    }

    if (focusedDroppableRef.current === droppable) return;

    clearFocusedDroppable();
    clearFocusedSwap();

    focusedDroppableRef.current = droppable;
    focusedDroppableTargetRef.current = droppable;

    const focusTarget = focusedDroppableTargetRef.current;
    const hadInitialClass = focusTarget.classList.contains(DND_DROPPABLE_INITIAL_CLASS);

    if (hadInitialClass) {
      focusTarget.classList.add(DND_DROPPABLE_INITIAL_CLASS);
    } else {
      const previousTransition = focusTarget.style.transition;

      focusTarget.style.transition = DND_DISABLED_TRANSITION;
      focusTarget.classList.add(DND_DROPPABLE_INITIAL_CLASS);
      focusTarget.getBoundingClientRect();
      focusTarget.style.transition = previousTransition;
    }

    focusTarget.classList.add(DND_DROPPABLE_FOCUSED_CLASS);
  }, [clearFocusedDroppable, clearFocusedSwap]);

  const removeDragPreview = useCallback(() => {
    if (dragPreviewElementRef.current) {
      dragPreviewElementRef.current.style.display = DND_DRAG_PREVIEW_REMOVED_DISPLAY;
    }

    dragPreviewElementRef.current = null;
    setDragPreview(null);
  }, []);

  const finishDrag = useCallback((controller?: AbortController) => {
    controller?.abort();

    isDraggingRef.current = false;
    setIsDragging(false);

    if (dragFrameRef.current !== null) {
      cancelAnimationFrame(dragFrameRef.current);
      dragFrameRef.current = null;
    }

    lastPointerPositionRef.current = null;
    document.body.classList.remove(DND_GLOBAL_DRAGGING_CLASS);
    draggingElementRef.current?.classList.remove(DND_DRAG_SOURCE_CLASS);
    draggingElementRef.current?.classList.remove(DND_DRAGGING_CLASS);
    draggingTriggerElementRef.current?.classList.remove(DND_DRAGGING_CLASS);
    clearFocusedDroppable();
    clearFocusedSwap();

    draggingDataRef.current = null;
    setDraggingData(null);
    draggingElementRef.current = null;
    draggingTriggerElementRef.current = null;
    draggingSourceDroppableRef.current = null;
    finishDndRef.current = null;

    removeDragPreview();
  }, [clearFocusedDroppable, clearFocusedSwap, removeDragPreview]);

  const runSwapAtPointer = useCallback((pointerPosition: PointerPosition): DndActionResult | null => {
    const draggingElement = draggingElementRef.current;
    const hoveredDraggable = getHoveredSwapDraggable(
      pointerPosition,
      draggingElement,
      draggingSourceDroppableRef.current,
      dragPreviewElementRef.current
    );

    if (!draggingElement || !hoveredDraggable || draggingElement === hoveredDraggable) {
      return null;
    }

    const draggingHandlers = draggableOptionsRef.current.get(draggingElement);
    const directions = getSwapDirections(pointerPosition, hoveredDraggable, draggingHandlers);

    if (directions.length === 0) return null;

    const targetDroppable = closestHTMLElement(hoveredDraggable, DND_DROPPABLE_SELECTOR);
    const sourceDroppable = draggingSourceDroppableRef.current;
    const actionResult = {
      draggableData: {
        from: draggingDataRef.current,
        to: draggableDataRef.current.get(hoveredDraggable),
      },
      droppableData: {
        from: sourceDroppable ? droppableDataRef.current.get(sourceDroppable) : undefined,
        to: targetDroppable ? droppableDataRef.current.get(targetDroppable) : undefined,
      },
    };

    runSwapHandlers(directions, actionResult, draggingHandlers);

    return actionResult;
  }, []);

  const runDropAtPointer = useCallback((pointerPosition: PointerPosition): DndActionResult | null => {
    const draggingElement = draggingElementRef.current;
    const hoveredDroppable = getHoveredDroppable(
      pointerPosition,
      dragPreviewElementRef.current
    );

    if (!draggingElement || !hoveredDroppable) return null;
    if (hoveredDroppable === draggingSourceDroppableRef.current) return null;
    if (draggingElement.contains(hoveredDroppable)) return null;
    if (hoveredDroppable.contains(draggingElement)) return null;
    if (hoveredDroppable.dataset.dndProtectedAction === "true" && isHeaderOrFloatingDrag(draggingDataRef.current)) {
      return null;
    }

    const sourceDroppable = draggingSourceDroppableRef.current;
    const actionResult = {
      draggableData: {
        from: draggingDataRef.current,
        to: undefined,
      },
      droppableData: {
        from: sourceDroppable ? droppableDataRef.current.get(sourceDroppable) : undefined,
        to: droppableDataRef.current.get(hoveredDroppable),
      },
    };

    droppableOptionsRef.current.get(hoveredDroppable)?.onDrop?.(actionResult);

    return actionResult;
  }, []);

  const draggable = useCallback(<Generic,>(
    draggableData: Generic,
    options?: DndDraggableOptions<Generic>
  ): RefCallback<HTMLElement> => {
    let cleanup: (() => void) | undefined;
    let attachFrame: number | null = null;

    return (draggableElement) => {
      cleanup?.();
      cleanup = undefined;

      if (attachFrame !== null) {
        cancelAnimationFrame(attachFrame);
        attachFrame = null;
      }

      if (!draggableElement) return;

      cancelDraggableDetach(draggableElement);
      ensureDragSourceOverlay(draggableElement);
      draggableElement.dataset.dndType = DND_DRAGGABLE_TYPE;
      draggableDataRef.current.set(draggableElement, draggableData);
      draggableOptionsRef.current.set(draggableElement, options);

      const onPointerDown = (event: PointerEvent) => {
        if (isDraggingRef.current || event.button !== 0) return;
        if (!options?.allowActionDrag && isDndActionTarget(event.target, draggableElement)) return;

        const triggerElement = event.currentTarget instanceof HTMLElement
          ? event.currentTarget
          : draggableElement;

        const startPosition = getPoint(event);
        if (!canStartFromLayer(startPosition, draggableElement)) return;

        const startRect = draggableElement.getBoundingClientRect();
        let didStartDrag = false;

        lastPointerPositionRef.current = startPosition;

        const startDrag = () => {
          if (didStartDrag) return;

          const previewElement = draggableElement.cloneNode(true) as HTMLElement;
          previewElement.style.width = `${startRect.width}px`;
          previewElement.style.height = `${startRect.height}px`;
          previewElement.style.pointerEvents = DND_DRAG_PREVIEW_POINTER_EVENTS;

          didStartDrag = true;
          isDraggingRef.current = true;
          setIsDragging(true);
          draggingDataRef.current = draggableData;
          setDraggingData(draggableData);
          draggingElementRef.current = draggableElement;
          draggingSourceDroppableRef.current = closestHTMLElement(draggableElement, DND_DROPPABLE_SELECTOR);

          document.body.classList.add(DND_GLOBAL_DRAGGING_CLASS);
          draggableElement.classList.add(DND_DRAG_SOURCE_CLASS);
          draggableElement.classList.add(DND_DRAGGING_CLASS);
          triggerElement.classList.add(DND_DRAGGING_CLASS);
          draggingTriggerElementRef.current = triggerElement;

          setDragPreview({
            element: previewElement,
            width: startRect.width,
            height: startRect.height,
            x: startRect.left,
            y: startRect.top,
          });
        };

        const updateDragFrame = () => {
          dragFrameRef.current = null;

          const pointerPosition = lastPointerPositionRef.current;
          const previewElement = dragPreviewElementRef.current;
          if (!pointerPosition || !previewElement) return;

          previewElement.style.transform = `translate3d(${pointerPosition.x - startPosition.x}px, ${pointerPosition.y - startPosition.y}px, ${DND_DRAG_PREVIEW_TRANSLATE_Z})`;

          const hoveredSwapDraggable = getHoveredSwapDraggable(
            pointerPosition,
            draggingElementRef.current,
            draggingSourceDroppableRef.current,
            previewElement
          );

          if (hoveredSwapDraggable) {
            const draggingHandlers = draggingElementRef.current
              ? draggableOptionsRef.current.get(draggingElementRef.current)
              : undefined;
            const directions = getSwapDirections(pointerPosition, hoveredSwapDraggable, draggingHandlers);

            clearFocusedDroppable();
            focusSwap(hoveredSwapDraggable, directions);
            return;
          }

          clearFocusedSwap();

          const hoveredDroppable = getHoveredDroppable(
            pointerPosition,
            previewElement
          );

          if (hoveredDroppable) {
            focusDroppable(hoveredDroppable);
          } else {
            clearFocusedDroppable();
          }
        };

        const onPointerMove = (moveEvent: PointerEvent) => {
          const pointerPosition = getPoint(moveEvent);
          lastPointerPositionRef.current = pointerPosition;

          if (!didStartDrag) {
            if (!hasMovedEnough(pointerPosition, startPosition)) return;

            moveEvent.preventDefault();
            startDrag();
          }

          if (dragFrameRef.current === null) {
            dragFrameRef.current = requestAnimationFrame(updateDragFrame);
          }
        };

        const onPointerUp = (upEvent: PointerEvent) => {
          const pointerPosition = lastPointerPositionRef.current ?? getPoint(upEvent);

          if (didStartDrag) {
            const swapResult = runSwapAtPointer(pointerPosition);
            if (!swapResult) {
              runDropAtPointer(pointerPosition);
            }
          } else if (!hasMovedEnough(getPoint(upEvent), startPosition)) {
            upEvent.preventDefault();
            upEvent.stopPropagation();
            preventNextClick();

            options?.onClick?.({
              draggableData,
              element: draggableElement,
              event: upEvent,
            });
          }

          finishDndRef.current?.();
        };

        const controller = new AbortController();
        const captureOptions = { capture: true, signal: controller.signal };

        finishDndRef.current = () => finishDrag(controller);

        window.addEventListener("pointermove", onPointerMove, captureOptions);
        window.addEventListener("pointerup", onPointerUp, captureOptions);
        window.addEventListener("pointercancel", finishDndRef.current, captureOptions);
        window.addEventListener("blur", finishDndRef.current, { signal: controller.signal });
      };

      const attachTrigger = () => {
        const triggerElement = getTriggerElement(draggableElement, options?.triggerRef);
        if (!triggerElement) return false;

        const shouldPrepareDroppableFocus = hasDroppableDescendant(draggableElement);

        triggerElement.classList.add(DND_DRAGGABLE_INITIAL_CLASS);
        if (draggableElement.querySelector(DND_EDITABLE_CARD_SELECTOR)) {
          draggableElement.classList.add(DND_EDITABLE_CARD_DRAGGABLE_CLASS);
        }
        if (shouldPrepareDroppableFocus) {
          draggableElement.classList.add(DND_DROPPABLE_INITIAL_CLASS);
        }

        triggerElement.addEventListener("pointerdown", onPointerDown);

        cleanup = () => {
          const shouldKeepDragState = draggingElementRef.current === draggableElement && draggableElement.isConnected;

          if (draggingElementRef.current === draggableElement && !draggableElement.isConnected) {
            finishDndRef.current?.();
          }

          triggerElement.classList.remove(DND_DRAGGABLE_INITIAL_CLASS);
          draggableElement.classList.remove(DND_EDITABLE_CARD_DRAGGABLE_CLASS);
          if (shouldPrepareDroppableFocus) {
            draggableElement.classList.remove(DND_DROPPABLE_INITIAL_CLASS);
          }

          if (!shouldKeepDragState) {
            draggableElement.classList.remove(DND_DRAGGING_CLASS);
            draggableElement.classList.remove(DND_DRAG_SOURCE_CLASS);
            triggerElement.classList.remove(DND_DRAGGING_CLASS);
          }

          if (!shouldKeepDragState) {
            scheduleDraggableDetach(draggableElement);
          }

          triggerElement.removeEventListener("pointerdown", onPointerDown);
        };

        return true;
      };

      if (options?.triggerRef && !options.triggerRef.current) {
        scheduleTriggerAttach(attachTrigger, (frame) => {
          attachFrame = frame;
        });
      } else {
        attachTrigger();
      }
    };
  }, [cancelDraggableDetach, clearFocusedDroppable, clearFocusedSwap, finishDrag, focusDroppable, focusSwap, runDropAtPointer, runSwapAtPointer, scheduleDraggableDetach]);

  const droppable = useCallback(<Generic,>(
    droppableData: Generic,
    options?: DndDroppableOptions
  ): RefCallback<HTMLElement> => {
    let cleanup: (() => void) | undefined;
    let attachFrame: number | null = null;

    return (droppableElement) => {
      cleanup?.();
      cleanup = undefined;

      if (attachFrame !== null) {
        cancelAnimationFrame(attachFrame);
        attachFrame = null;
      }

      if (!droppableElement) return;

      droppableElement.dataset.dndDroppable = DND_DROPPABLE_DATA_VALUE;
      droppableDataRef.current.set(droppableElement, droppableData);
      droppableOptionsRef.current.set(droppableElement, options);

      const attachTrigger = () => {
        const triggerElement = getTriggerElement(droppableElement, options?.triggerRef);
        if (!triggerElement) return false;

        const initialClassElement = options?.triggerRef ? triggerElement : droppableElement;

        initialClassElement.classList.add(DND_DROPPABLE_INITIAL_CLASS);

        cleanup = () => {
          if (focusedDroppableRef.current === droppableElement) {
            clearFocusedDroppable();
          }

          initialClassElement.classList.remove(DND_DROPPABLE_INITIAL_CLASS);
          droppableElement.classList.remove(DND_DROPPABLE_FOCUSED_CLASS);
          delete droppableElement.dataset.dndDroppable;
          droppableDataRef.current.delete(droppableElement);
          droppableOptionsRef.current.delete(droppableElement);
        };

        return true;
      };

      if (options?.triggerRef && !options.triggerRef.current) {
        scheduleTriggerAttach(attachTrigger, (frame) => {
          attachFrame = frame;
        });
      } else {
        attachTrigger();
      }
    };
  }, [clearFocusedDroppable]);

  const isLocalDragging = useCallback(<Generic,>(draggableData: Generic) => {
    return isDragging && isSameDndData(draggingData, draggableData);
  }, [draggingData, isDragging]);

  const contextValue = useMemo<MotionDndValue>(() => ({
    isDragging,
    elementData: draggingData,
    isLocalDragging,
    draggable,
    droppable,
  }), [draggable, draggingData, droppable, isDragging, isLocalDragging]);

  return {
    contextValue,
    dragPreview,
    dragPreviewElementRef,
    draggable,
    droppable,
    isLocalDragging,
  };
}
