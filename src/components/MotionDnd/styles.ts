import { createGlobalStyle, keyframes } from "styled-components";
import {
  DND_ACTIVE_OPACITY,
  DND_DRAG_SOURCE_CLASS,
  DND_DRAG_SOURCE_OVERLAY_CLASS,
  DND_DRAG_SOURCE_OVERLAY_Z_INDEX,
  DND_DRAG_SOURCE_OVERLAY_COLOR,
  DND_DRAG_SOURCE_OVERLAY_TRANSITION,
  DND_DRAGGABLE_CURSOR,
  DND_DRAGGABLE_INITIAL_CLASS,
  DND_DRAGGABLE_SELECTOR,
  DND_DRAGGABLE_TOUCH_ACTION,
  DND_DRAGGABLE_USER_SELECT,
  DND_DRAGGING_CLASS,
  DND_DRAGGING_CURSOR,
  DND_DRAGGING_FILTER,
  DND_EDITABLE_CARD_DRAGGABLE_CLASS,
  DND_DROPPABLE_DATA_ATTRIBUTE,
  DND_DROPPABLE_FOCUS_TRANSITION,
  DND_DROPPABLE_FOCUSED_CLASS,
  DND_DROPPABLE_INITIAL_CLASS,
  DND_FOCUS_RING_COLOR,
  DND_FOCUS_RING_SIZE_PX,
  DND_GLOBAL_DRAGGING_CLASS,
  DND_OUTLINE,
  DND_OVERLAY_POINTER_EVENTS,
  DND_SWAP_BOTTOM_CLASS,
  DND_SWAP_DIRECTION_ANIMATION_DELAY_MS,
  DND_SWAP_DIRECTION_ANIMATION_DURATION_MS,
  DND_SWAP_DIRECTION_ANIMATION_EASING,
  DND_SWAP_DIRECTION_ANIMATION_FILL_MODE,
  DND_SWAP_DIRECTION_COLOR,
  DND_SWAP_DIRECTION_OPACITY,
  DND_SWAP_DIRECTION_SIZE,
  DND_SWAP_DIRECTION_Z_INDEX,
  DND_SWAP_LEFT_CLASS,
  DND_SWAP_RIGHT_CLASS,
  DND_SWAP_TOP_CLASS,
  DND_TRANSPARENT_COLOR,
} from "./config";

const growLeft = keyframes`
  from { transform: scaleX(0); }
  to { transform: scaleX(1); }
`;

const growRight = keyframes`
  from { transform: scaleX(0); }
  to { transform: scaleX(1); }
`;

const growTop = keyframes`
  from { transform: scaleY(0); }
  to { transform: scaleY(1); }
`;

const growBottom = keyframes`
  from { transform: scaleY(0); }
  to { transform: scaleY(1); }
`;

export const MotionDndStyles = createGlobalStyle`
  .${DND_DRAGGABLE_INITIAL_CLASS} {
    cursor: ${DND_DRAGGABLE_CURSOR} !important;
    touch-action: ${DND_DRAGGABLE_TOUCH_ACTION};
    user-select: ${DND_DRAGGABLE_USER_SELECT};
    -webkit-user-drag: none;
  }

  .${DND_DRAGGABLE_INITIAL_CLASS} * {
    -webkit-user-drag: none;
    user-drag: none;
  }

  .${DND_DRAGGABLE_INITIAL_CLASS} .dnd-action {
    z-index: 20 !important;
    pointer-events: auto !important;
  }

  .${DND_EDITABLE_CARD_DRAGGABLE_CLASS} {
    border-radius: 8px;
    box-shadow: var(--box-shadow);
  }

  .${DND_DROPPABLE_INITIAL_CLASS} {
    outline: ${DND_OUTLINE} !important;
    box-shadow: 0 0 0 ${DND_FOCUS_RING_SIZE_PX}px ${DND_TRANSPARENT_COLOR};
  }

  [${DND_DROPPABLE_DATA_ATTRIBUTE}] {
    outline: ${DND_OUTLINE} !important;
    box-shadow: 0 0 0 ${DND_FOCUS_RING_SIZE_PX}px ${DND_TRANSPARENT_COLOR};
  }

  .${DND_DRAGGING_CLASS} {
    opacity: ${DND_ACTIVE_OPACITY} !important;
    filter: ${DND_DRAGGING_FILTER};
  }

  ${DND_DRAGGABLE_SELECTOR} {
    position: relative;
    overflow: hidden;
  }

  ${DND_DRAGGABLE_SELECTOR} > .${DND_DRAG_SOURCE_OVERLAY_CLASS} {
    position: absolute;
    inset: 0;
    z-index: ${DND_DRAG_SOURCE_OVERLAY_Z_INDEX};
    border-radius: inherit;
    background-color: ${DND_DRAG_SOURCE_OVERLAY_COLOR};
    opacity: 0;
    pointer-events: ${DND_OVERLAY_POINTER_EVENTS};
    transition: ${DND_DRAG_SOURCE_OVERLAY_TRANSITION};
  }

  .${DND_DRAG_SOURCE_CLASS} > .${DND_DRAG_SOURCE_OVERLAY_CLASS} {
    opacity: ${DND_ACTIVE_OPACITY};
  }

  .${DND_DROPPABLE_FOCUSED_CLASS} {
    box-shadow: 0 0 0 ${DND_FOCUS_RING_SIZE_PX}px ${DND_FOCUS_RING_COLOR};
    transition: ${DND_DROPPABLE_FOCUS_TRANSITION};
  }

  .${DND_SWAP_TOP_CLASS},
  .${DND_SWAP_RIGHT_CLASS},
  .${DND_SWAP_BOTTOM_CLASS},
  .${DND_SWAP_LEFT_CLASS} {
    position: relative;
    overflow: hidden;
  }

  .${DND_SWAP_LEFT_CLASS} > .${DND_DRAG_SOURCE_OVERLAY_CLASS},
  .${DND_SWAP_RIGHT_CLASS} > .${DND_DRAG_SOURCE_OVERLAY_CLASS},
  .${DND_SWAP_TOP_CLASS} > .${DND_DRAG_SOURCE_OVERLAY_CLASS},
  .${DND_SWAP_BOTTOM_CLASS} > .${DND_DRAG_SOURCE_OVERLAY_CLASS} {
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    width: 100%;
    box-sizing: border-box;
    opacity: ${DND_SWAP_DIRECTION_OPACITY};
    background-repeat: no-repeat;
    pointer-events: ${DND_OVERLAY_POINTER_EVENTS};
    will-change: transform;
    z-index: ${DND_SWAP_DIRECTION_Z_INDEX};
  }

  .${DND_SWAP_TOP_CLASS} > .${DND_DRAG_SOURCE_OVERLAY_CLASS} {
    height: ${DND_SWAP_DIRECTION_SIZE};
    background-image: linear-gradient(to bottom, ${DND_SWAP_DIRECTION_COLOR}, ${DND_TRANSPARENT_COLOR});
    transform-origin: center top;
    animation: ${growTop} ${DND_SWAP_DIRECTION_ANIMATION_DURATION_MS}ms ${DND_SWAP_DIRECTION_ANIMATION_EASING} ${DND_SWAP_DIRECTION_ANIMATION_DELAY_MS}ms ${DND_SWAP_DIRECTION_ANIMATION_FILL_MODE};
  }

  .${DND_SWAP_RIGHT_CLASS} > .${DND_DRAG_SOURCE_OVERLAY_CLASS} {
    left: auto;
    right: 0;
    width: ${DND_SWAP_DIRECTION_SIZE};
    background-image: linear-gradient(to left, ${DND_SWAP_DIRECTION_COLOR}, ${DND_TRANSPARENT_COLOR});
    transform-origin: right center;
    animation: ${growRight} ${DND_SWAP_DIRECTION_ANIMATION_DURATION_MS}ms ${DND_SWAP_DIRECTION_ANIMATION_EASING} ${DND_SWAP_DIRECTION_ANIMATION_DELAY_MS}ms ${DND_SWAP_DIRECTION_ANIMATION_FILL_MODE};
  }

  .${DND_SWAP_BOTTOM_CLASS} > .${DND_DRAG_SOURCE_OVERLAY_CLASS} {
    top: auto;
    bottom: 0;
    height: ${DND_SWAP_DIRECTION_SIZE};
    background-image: linear-gradient(to top, ${DND_SWAP_DIRECTION_COLOR}, ${DND_TRANSPARENT_COLOR});
    transform-origin: center bottom;
    animation: ${growBottom} ${DND_SWAP_DIRECTION_ANIMATION_DURATION_MS}ms ${DND_SWAP_DIRECTION_ANIMATION_EASING} ${DND_SWAP_DIRECTION_ANIMATION_DELAY_MS}ms ${DND_SWAP_DIRECTION_ANIMATION_FILL_MODE};
  }

  .${DND_SWAP_LEFT_CLASS} > .${DND_DRAG_SOURCE_OVERLAY_CLASS} {
    width: ${DND_SWAP_DIRECTION_SIZE};
    background-image: linear-gradient(to right, ${DND_SWAP_DIRECTION_COLOR}, ${DND_TRANSPARENT_COLOR});
    transform-origin: left center;
    animation: ${growLeft} ${DND_SWAP_DIRECTION_ANIMATION_DURATION_MS}ms ${DND_SWAP_DIRECTION_ANIMATION_EASING} ${DND_SWAP_DIRECTION_ANIMATION_DELAY_MS}ms ${DND_SWAP_DIRECTION_ANIMATION_FILL_MODE};
  }

  body.${DND_GLOBAL_DRAGGING_CLASS},
  body.${DND_GLOBAL_DRAGGING_CLASS} * {
    cursor: ${DND_DRAGGING_CURSOR} !important;
    user-select: ${DND_DRAGGABLE_USER_SELECT} !important;
  }
`;
