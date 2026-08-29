export const DND_DRAG_THRESHOLD_PX = 6;
export const DND_TRIGGER_ATTACH_ATTEMPTS = 3;

export const DND_DRAGGABLE_TYPE = "draggable";
export const DND_DRAGGABLE_DATA_ATTRIBUTE = "data-dnd-type";
export const DND_DROPPABLE_DATA_ATTRIBUTE = "data-dnd-droppable";
export const DND_LAYER_DATA_ATTRIBUTE = "data-motion-dnd-layer";
export const DND_DROPPABLE_DATA_VALUE = "true";
export const DND_LAYER_DATA_VALUE = "true";
export const DND_DRAGGABLE_SELECTOR = `[${DND_DRAGGABLE_DATA_ATTRIBUTE}='${DND_DRAGGABLE_TYPE}']`;
export const DND_DROPPABLE_SELECTOR = `[${DND_DROPPABLE_DATA_ATTRIBUTE}]`;
export const DND_LAYER_SELECTOR = `[${DND_LAYER_DATA_ATTRIBUTE}]`;

export const DND_ACTION_SELECTORS = [
  "button",
  "a",
  "input",
  "select",
  "textarea",
  "[role='button']",
  ".dnd-action",
];
export const DND_ACTION_SELECTOR = DND_ACTION_SELECTORS.join(",");
export const DND_ACTION_DESCENDANT_SELECTOR = DND_ACTION_SELECTORS.map(selector => `${selector} *`).join(",");

export const DND_DRAGGABLE_INITIAL_CLASS = "motion-dnd-draggable-initial";
export const DND_EDITABLE_CARD_DRAGGABLE_CLASS = "motion-dnd-editable-card-draggable";
export const DND_EDITABLE_CARD_SELECTOR = ".editable-card";
export const DND_DROPPABLE_INITIAL_CLASS = "motion-dnd-droppable-initial";
export const DND_DRAGGING_CLASS = "motion-dnd-dragging";
export const DND_DRAG_SOURCE_CLASS = "motion-dnd-drag-source";
export const DND_DRAG_SOURCE_OVERLAY_CLASS = "motion-dnd-drag-source-overlay";
export const DND_DROPPABLE_FOCUSED_CLASS = "motion-dnd-droppable-focused";
export const DND_GLOBAL_DRAGGING_CLASS = "motion-dnd-global-dragging";
export const DND_SWAP_TOP_CLASS = "motion-dnd-swap-top";
export const DND_SWAP_RIGHT_CLASS = "motion-dnd-swap-right";
export const DND_SWAP_BOTTOM_CLASS = "motion-dnd-swap-bottom";
export const DND_SWAP_LEFT_CLASS = "motion-dnd-swap-left";

export const DND_DRAGGABLE_CURSOR = "grab";
export const DND_DRAGGING_CURSOR = "grabbing";
export const DND_DRAGGABLE_TOUCH_ACTION = "none";
export const DND_DRAGGABLE_USER_SELECT = "none";
export const DND_OUTLINE = "none";
export const DND_DRAGGING_FILTER = "saturate(0.8)";
export const DND_ACTIVE_OPACITY = 1;

export const DND_FOCUS_RING_SIZE_PX = 4;
export const DND_FOCUS_RING_COLOR = "var(--primary-soft-color)";
export const DND_SWAP_DIRECTION_COLOR = "var(--primary-mid-color)";
export const DND_DRAG_SOURCE_OVERLAY_COLOR = "var(--primary-soft-color)";
export const DND_TRANSPARENT_COLOR = "transparent";

export const DND_SWAP_DIRECTION_OPACITY = 0.2;
export const DND_DRAG_PREVIEW_OPACITY = 0.2;
export const DND_SWAP_DIRECTION_SIZE = "50%";

export const DND_TRANSITION_DURATION_MS = 200;
export const DND_TRANSITION_DELAY_MS = 0;
export const DND_TRANSITION_EASING = "ease-in-out";
export const DND_DRAG_SOURCE_OVERLAY_TRANSITION_PROPERTY = "opacity";
export const DND_DROPPABLE_FOCUS_TRANSITION_PROPERTY = "box-shadow";
export const DND_DRAG_SOURCE_OVERLAY_TRANSITION = `${DND_DRAG_SOURCE_OVERLAY_TRANSITION_PROPERTY} ${DND_TRANSITION_DURATION_MS}ms ${DND_TRANSITION_EASING} ${DND_TRANSITION_DELAY_MS}ms`;
export const DND_DROPPABLE_FOCUS_TRANSITION = `${DND_DROPPABLE_FOCUS_TRANSITION_PROPERTY} ${DND_TRANSITION_DURATION_MS}ms ${DND_TRANSITION_EASING} ${DND_TRANSITION_DELAY_MS}ms`;
export const DND_DRAGGABLE_DETACH_DELAY_MS = DND_TRANSITION_DURATION_MS + DND_TRANSITION_DELAY_MS;
export const DND_SWAP_DIRECTION_ANIMATION_DURATION_MS = DND_TRANSITION_DURATION_MS;
export const DND_SWAP_DIRECTION_ANIMATION_DELAY_MS = DND_TRANSITION_DELAY_MS;
export const DND_SWAP_DIRECTION_ANIMATION_EASING = DND_TRANSITION_EASING;
export const DND_SWAP_DIRECTION_ANIMATION_FILL_MODE = "forwards";

export const DND_DRAG_PREVIEW_TRANSFORM_DURATION_MS = 300;
export const DND_DRAG_PREVIEW_TRANSFORM_DELAY_MS = 0;
export const DND_DRAG_PREVIEW_TRANSFORM_BEZIER = "cubic-bezier(0.2, 0.8, 0.2, 1)";
export const DND_DRAG_PREVIEW_TRANSFORM_TRANSITION = `transform ${DND_DRAG_PREVIEW_TRANSFORM_DURATION_MS}ms ${DND_DRAG_PREVIEW_TRANSFORM_BEZIER} ${DND_DRAG_PREVIEW_TRANSFORM_DELAY_MS}ms`;
export const DND_DRAG_PREVIEW_INITIAL_TRANSFORM = "translate3d(0, 0, 0)";
export const DND_DRAG_PREVIEW_TRANSLATE_Z = 0;
export const DND_DRAG_PREVIEW_POINTER_EVENTS = "none";
export const DND_DRAG_PREVIEW_Z_INDEX = 9999;
export const DND_DRAG_PREVIEW_REMOVED_DISPLAY = "none";
export const DND_OVERLAY_POINTER_EVENTS = "none";
export const DND_DRAG_SOURCE_OVERLAY_Z_INDEX = 30;
export const DND_SWAP_DIRECTION_Z_INDEX = 31;
export const DND_DISABLED_TRANSITION = "none";
export const DND_HIDDEN_VISIBILITY = "hidden";

export const DND_DRAG_PREVIEW_SPRING_TRANSITION = {
  type: "spring",
  stiffness: 900,
  damping: 55,
  mass: 0.2,
  delay: 0,
} as const;
