import type { ScenarioElementProps } from "../../interfaces/ScenarioElement";
import {
  defaultElementResponse,
  getRenderedElementGeometry,
  hasElementResponse,
  rotatePoint,
  type ElementResponse,
  type Point,
} from "./scenarioGeometry";

const isDefaultResponse = (response: ElementResponse) =>
  response.scale === 1
  && response.widthScale === 1
  && response.heightScale === 1
  && response.opacity === 0
  && response.rotation === 0
  && response.translationX === 0
  && response.translationY === 0
  && response.translationZ === 0;

export const getRigDescendants = (elements: ScenarioElementProps[], parentId: string) => {
  const childrenByParent = new Map<string, ScenarioElementProps[]>();
  for (const element of elements) {
    if (!element.rigParentId) continue;
    const children = childrenByParent.get(element.rigParentId) ?? [];
    children.push(element);
    childrenByParent.set(element.rigParentId, children);
  }
  const descendants: ScenarioElementProps[] = [];
  const pending = [...(childrenByParent.get(parentId) ?? [])];
  const visited = new Set<string>();
  while (pending.length > 0) {
    const child = pending.shift();
    if (!child || visited.has(child.id)) continue;
    visited.add(child.id);
    descendants.push(child);
    pending.push(...(childrenByParent.get(child.id) ?? []));
  }
  return descendants;
};

export const transformRigDescendants = (
  elements: ScenarioElementProps[],
  parentStart: ScenarioElementProps,
  parentNext: ScenarioElementProps,
  descendantStarts: ScenarioElementProps[],
) => {
  if (descendantStarts.length === 0) {
    return elements.map((element) => element.id === parentStart.id ? parentNext : element);
  }
  const startById = new Map(descendantStarts.map((element) => [element.id, element]));
  const rotationDelta = parentNext.rotation - parentStart.rotation;
  const nextRadians = (parentNext.rotation * Math.PI) / 180;
  const startRadians = (-parentStart.rotation * Math.PI) / 180;
  const scaleRatioX = parentNext.scaleX / parentStart.scaleX;
  const scaleRatioY = parentNext.scaleY / parentStart.scaleY;
  return elements.map((element) => {
    if (element.id === parentStart.id) return parentNext;
    const start = startById.get(element.id);
    if (!start) return element;
    const local = rotatePoint({ x: start.x - parentStart.x, y: start.y - parentStart.y }, startRadians);
    const transformed = rotatePoint({ x: local.x * scaleRatioX, y: local.y * scaleRatioY }, nextRadians);
    return {
      ...start,
      x: parentNext.x + transformed.x,
      y: parentNext.y + transformed.y,
      rotation: start.rotation + rotationDelta,
      scaleX: start.scaleX * scaleRatioX,
      scaleY: start.scaleY * scaleRatioY,
    };
  });
};

export const wouldCreateRigCycle = (
  elements: ScenarioElementProps[],
  parentId: string,
  childId: string,
) => {
  const byId = new Map(elements.map((element) => [element.id, element]));
  let currentId: string | undefined = parentId;
  const visited = new Set<string>();
  while (currentId) {
    if (currentId === childId) return true;
    if (visited.has(currentId)) return true;
    visited.add(currentId);
    currentId = byId.get(currentId)?.rigParentId;
  }
  return false;
};

export const getElementNormalizedPoint = (
  point: Point,
  element: ScenarioElementProps,
  response: ElementResponse = defaultElementResponse,
) => {
  const { width, height, origin, radians } = getRenderedElementGeometry(element, response);
  const local = rotatePoint({ x: point.x - origin.x, y: point.y - origin.y }, -radians);
  return {
    x: Math.max(0, Math.min(1, (local.x + element.pivotX * width) / width)),
    y: Math.max(0, Math.min(1, (local.y + element.pivotY * height) / height)),
  };
};

export const getRigAnchorWorld = (
  element: ScenarioElementProps,
  response: ElementResponse,
  anchorX: number,
  anchorY: number,
) => {
  const geometry = getRenderedElementGeometry(element, response);
  return geometry.localToWorld(anchorX * geometry.width, anchorY * geometry.height);
};

export const getRigResponsiveElementIds = (elements: ScenarioElementProps[]) => {
  const responsive = new Set(elements.filter(hasElementResponse).map((element) => element.id));
  let changed = true;
  while (changed) {
    changed = false;
    for (const element of elements) {
      if (responsive.has(element.id) || !element.rigParentId || !responsive.has(element.rigParentId)) continue;
      responsive.add(element.id);
      changed = true;
    }
  }
  return responsive;
};

const getRenderedCenter = (element: ScenarioElementProps, response: ElementResponse) => {
  const geometry = getRenderedElementGeometry(element, response);
  return geometry.localToWorld(geometry.width / 2, geometry.height / 2);
};

const transformPointByResponse = (
  point: Point,
  element: ScenarioElementProps,
  response: ElementResponse,
) => {
  if (isDefaultResponse(response)) return point;
  const local = rotatePoint(
    { x: point.x - element.x, y: point.y - element.y },
    (-element.rotation * Math.PI) / 180,
  );
  const transformed = rotatePoint({
    x: local.x * response.scale * response.widthScale,
    y: local.y * response.scale * response.heightScale,
  }, ((element.rotation + response.rotation) * Math.PI) / 180);
  const center = getRenderedCenter(element, response);
  return { x: center.x + transformed.x, y: center.y + transformed.y };
};

export const composeRigResponses = (
  elements: ScenarioElementProps[],
  rawResponses: Map<string, ElementResponse>,
  targetIds: Iterable<string>,
) => {
  const byId = new Map(elements.map((element) => [element.id, element]));
  const resolved = new Map<string, ElementResponse>();
  const visiting = new Set<string>();
  const resolve = (element: ScenarioElementProps): ElementResponse => {
    const cached = resolved.get(element.id);
    if (cached) return cached;
    const own = rawResponses.get(element.id) ?? defaultElementResponse;
    const parent = element.rigParentId ? byId.get(element.rigParentId) : undefined;
    if (!parent || visiting.has(element.id)) {
      resolved.set(element.id, own);
      return own;
    }
    visiting.add(element.id);
    const parentResponse = resolve(parent);
    visiting.delete(element.id);
    if (isDefaultResponse(parentResponse)) {
      resolved.set(element.id, own);
      return own;
    }
    const desiredCenter = transformPointByResponse(getRenderedCenter(element, own), parent, parentResponse);
    const combined: ElementResponse = {
      scale: own.scale * parentResponse.scale,
      widthScale: own.widthScale * parentResponse.widthScale,
      heightScale: own.heightScale * parentResponse.heightScale,
      opacity: own.opacity + parentResponse.opacity,
      rotation: own.rotation + parentResponse.rotation,
      translationX: 0,
      translationY: 0,
      translationZ: own.translationZ + parentResponse.translationZ,
    };
    const zeroCenter = getRenderedCenter(element, combined);
    combined.translationX = desiredCenter.x - zeroCenter.x;
    combined.translationY = desiredCenter.y - zeroCenter.y;
    resolved.set(element.id, combined);
    return combined;
  };
  for (const id of targetIds) {
    const element = byId.get(id);
    if (element) resolve(element);
  }
  return resolved;
};
