import type { ScenarioElementProps } from "../../interfaces/ScenarioElement";

export interface Point {
  x: number;
  y: number;
}

export interface ElementResponse {
  scale: number;
  widthScale: number;
  heightScale: number;
  opacity: number;
  rotation: number;
  translationX: number;
  translationY: number;
  translationZ: number;
}

export interface ElementGeometry {
  width: number;
  height: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
  centerX: number;
  centerY: number;
}

export type ScenarioTransformControlMode = "rotate" | "pivot" | `resize-${
  | "north-west"
  | "north"
  | "north-east"
  | "east"
  | "south-east"
  | "south"
  | "south-west"
  | "west"}`;

export const scenarioElementBaseSize = 40;

export const defaultElementResponse: ElementResponse = {
  scale: 1,
  widthScale: 1,
  heightScale: 1,
  // Deslocamento temporário em relação à opacidade base do elemento.
  opacity: 0,
  rotation: 0,
  translationX: 0,
  translationY: 0,
  translationZ: 0,
};

export const hasElementResponse = (element: ScenarioElementProps) =>
  element.operations.some((operation) => Boolean(operation.operation))
  || Boolean(element.frequencyResponse?.operation)
  || Boolean(element.vocalResponse?.operation);

export const getElementDimensions = (element: ScenarioElementProps) => ({
  width: scenarioElementBaseSize * element.scaleX,
  height: scenarioElementBaseSize * element.scaleY,
});

export const rotatePoint = (point: Point, radians: number): Point => ({
  x: point.x * Math.cos(radians) - point.y * Math.sin(radians),
  y: point.x * Math.sin(radians) + point.y * Math.cos(radians),
});

export const getScenarioOffset = (x: number, y: number, rotation: number) =>
  rotatePoint({ x, y }, (rotation * Math.PI) / 180);

export const getElementPivotWorld = (
  element: ScenarioElementProps,
  rotation = element.rotation,
): Point => {
  const { width, height } = getElementDimensions(element);
  const offset = getScenarioOffset(
    (element.pivotX - 0.5) * width,
    (element.pivotY - 0.5) * height,
    rotation,
  );
  return { x: element.x + offset.x, y: element.y + offset.y };
};

export const getElementGeometry = (
  element: ScenarioElementProps,
  center: Point = { x: element.x, y: element.y },
): ElementGeometry => {
  const { width, height } = getElementDimensions(element);
  const radians = (element.rotation * Math.PI) / 180;
  const extentX = Math.abs(Math.cos(radians) * width * 0.5) + Math.abs(Math.sin(radians) * height * 0.5);
  const extentY = Math.abs(Math.sin(radians) * width * 0.5) + Math.abs(Math.cos(radians) * height * 0.5);
  return {
    width,
    height,
    left: center.x - extentX,
    right: center.x + extentX,
    top: center.y - extentY,
    bottom: center.y + extentY,
    centerX: center.x,
    centerY: center.y,
  };
};

export const worldPointToElementCenterLocal = (point: Point, element: ScenarioElementProps) =>
  rotatePoint(
    { x: point.x - element.x, y: point.y - element.y },
    (-element.rotation * Math.PI) / 180,
  );

export const getRenderedElementGeometry = (
  element: ScenarioElementProps,
  response: ElementResponse = defaultElementResponse,
) => {
  const baseWidth = scenarioElementBaseSize * element.scaleX;
  const baseHeight = scenarioElementBaseSize * element.scaleY;
  const width = baseWidth * response.scale * response.widthScale;
  const height = baseHeight * response.scale * response.heightScale;
  const pivot = getElementPivotWorld(element);
  const radians = ((element.rotation + response.rotation) * Math.PI) / 180;
  const centerAfterUniformScale = rotatePoint({
    x: (0.5 - element.pivotX) * baseWidth * response.scale,
    y: (0.5 - element.pivotY) * baseHeight * response.scale,
  }, radians);
  const centerAfterAxisScale = rotatePoint({
    x: (0.5 - element.pivotX) * width,
    y: (0.5 - element.pivotY) * height,
  }, radians);
  const origin = {
    x: pivot.x + response.translationX + centerAfterUniformScale.x - centerAfterAxisScale.x,
    y: pivot.y + response.translationY + centerAfterUniformScale.y - centerAfterAxisScale.y,
  };
  const localToWorld = (x: number, y: number) => {
    const rotated = rotatePoint(
      { x: x - element.pivotX * width, y: y - element.pivotY * height },
      radians,
    );
    return { x: origin.x + rotated.x, y: origin.y + rotated.y };
  };
  return { width, height, pivot, origin, radians, localToWorld };
};

export const pointHitsElement = (
  point: Point,
  element: ScenarioElementProps,
  response: ElementResponse = defaultElementResponse,
) => {
  if (!element.visible) return false;
  const { width, height, origin, radians } = getRenderedElementGeometry(element, response);
  const local = rotatePoint({ x: point.x - origin.x, y: point.y - origin.y }, -radians);
  const x = local.x + element.pivotX * width;
  const y = local.y + element.pivotY * height;
  if (x < 0 || x > width || y < 0 || y > height) return false;
  if (element.imageData) return true;
  const ellipseX = (x - width / 2) / (width / 2);
  const ellipseY = (y - height / 2) / (height / 2);
  return ellipseX * ellipseX + ellipseY * ellipseY <= 1;
};

export const elementIntersectsScenario = (
  element: ScenarioElementProps,
  response: ElementResponse,
  scenarioWidth: number,
  scenarioHeight: number,
) => {
  const { width, height, origin, radians } = getRenderedElementGeometry(element, response);
  const centerOffset = rotatePoint({
    x: (0.5 - element.pivotX) * width,
    y: (0.5 - element.pivotY) * height,
  }, radians);
  const centerX = origin.x + centerOffset.x;
  const centerY = origin.y + centerOffset.y;
  const horizontalExtent = Math.abs(Math.cos(radians)) * width / 2 + Math.abs(Math.sin(radians)) * height / 2;
  const verticalExtent = Math.abs(Math.sin(radians)) * width / 2 + Math.abs(Math.cos(radians)) * height / 2;
  return centerX + horizontalExtent >= 0
    && centerX - horizontalExtent <= scenarioWidth
    && centerY + verticalExtent >= 0
    && centerY - verticalExtent <= scenarioHeight;
};

export const getTransformControls = (
  element: ScenarioElementProps,
  response: ElementResponse,
  zoom: number,
) => {
  const { width, height, localToWorld } = getRenderedElementGeometry(element, response);
  const inset = 10 / zoom;
  const rotateOffset = 14 / zoom;
  const resize: Array<{ mode: ScenarioTransformControlMode; point: Point }> = [
    { mode: "resize-north-west", point: localToWorld(-inset, -inset) },
    { mode: "resize-north", point: localToWorld(width / 2, -inset) },
    { mode: "resize-north-east", point: localToWorld(width + inset, -inset) },
    { mode: "resize-east", point: localToWorld(width + inset, height / 2) },
    { mode: "resize-south-east", point: localToWorld(width + inset, height + inset) },
    { mode: "resize-south", point: localToWorld(width / 2, height + inset) },
    { mode: "resize-south-west", point: localToWorld(-inset, height + inset) },
    { mode: "resize-west", point: localToWorld(-inset, height / 2) },
  ];
  const rotate = [
    localToWorld(-inset - rotateOffset, -inset - rotateOffset),
    localToWorld(width + inset + rotateOffset, -inset - rotateOffset),
    localToWorld(width + inset + rotateOffset, height + inset + rotateOffset),
    localToWorld(-inset - rotateOffset, height + inset + rotateOffset),
  ].map((point) => ({ mode: "rotate" as const, point }));
  const pivot = {
    mode: "pivot" as const,
    point: localToWorld(element.pivotX * width, element.pivotY * height),
  };
  return { width, height, inset, resize, rotate, pivot };
};

export const hitTestTransformControl = (
  point: Point,
  element: ScenarioElementProps,
  response: ElementResponse,
  zoom: number,
): ScenarioTransformControlMode | undefined => {
  const controls = getTransformControls(element, response, zoom);
  const candidates = [controls.pivot, ...controls.rotate, ...controls.resize];
  const radius = 9 / zoom;
  let closest: { mode: ScenarioTransformControlMode; distance: number } | undefined;
  for (const candidate of candidates) {
    const distance = Math.hypot(point.x - candidate.point.x, point.y - candidate.point.y);
    if (distance <= radius && (!closest || distance < closest.distance)) {
      closest = { mode: candidate.mode, distance };
    }
  }
  return closest?.mode;
};

export const pointHitsTransformBox = (
  point: Point,
  element: ScenarioElementProps,
  response: ElementResponse,
  zoom: number,
) => {
  const { width, height, origin, radians } = getRenderedElementGeometry(element, response);
  const local = rotatePoint({ x: point.x - origin.x, y: point.y - origin.y }, -radians);
  const x = local.x + element.pivotX * width;
  const y = local.y + element.pivotY * height;
  const inset = 10 / zoom;
  return x >= -inset && x <= width + inset && y >= -inset && y <= height + inset;
};
