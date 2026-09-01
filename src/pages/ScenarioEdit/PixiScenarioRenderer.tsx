import { Application, Assets, Container, Graphics, Sprite, Texture } from "pixi.js";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import type { ScenarioElementProps } from "../../interfaces/ScenarioElement";
import {
  defaultElementResponse as defaultResponse,
  elementIntersectsScenario,
  getElementPivotWorld,
  getRenderedElementGeometry,
  getTransformControls,
  hitTestTransformControl,
  pointHitsElement,
  pointHitsTransformBox,
  scenarioElementBaseSize as baseSize,
  type ElementResponse,
  type ScenarioTransformControlMode,
} from "./scenarioGeometry";
import { getRigAnchorWorld, getRigResponsiveElementIds } from "./scenarioRig";

interface PixiScenarioRendererProps {
  width: number;
  height: number;
  backgroundColor: string;
  elements: ScenarioElementProps[];
  responsesRef: RefObject<Map<string, ElementResponse>>;
  onElementPointerDown: (event: PointerEvent, elementId: string) => void;
  onTransformPointerDown: (event: PointerEvent, mode: PixiTransformMode, elementId: string) => void;
  onRigElementPointerDown: (event: PointerEvent, elementId: string, point: { x: number; y: number }) => void;
  onRigAnchorPointerDown: (event: PointerEvent, childId: string, role: RigAnchorRole) => void;
  isSelectionToolActive: boolean;
  isRigToolActive: boolean;
  selectedElementIds: string[];
  selectedElementId?: string;
  smartGuides: { vertical?: number; horizontal?: number };
  marqueeSelection?: { start: { x: number; y: number }; current: { x: number; y: number } };
  zoom: number;
  view: { x: number; y: number };
}

export type PixiTransformMode = ScenarioTransformControlMode;
export type RigAnchorRole = "parent" | "child";

export interface PixiScenarioRendererHandle {
  render: () => void;
}

interface RenderedElement {
  container: Container;
  element?: ScenarioElementProps;
  graphic?: Graphics;
  sprite?: Sprite;
  source?: string;
  scenarioWidth?: number;
  scenarioHeight?: number;
  visible?: boolean;
  opacity?: number;
  layerIndex?: number;
  drawnWidth?: number;
  drawnHeight?: number;
  drawnColor?: string;
}

interface OverlayProps {
  elements: ScenarioElementProps[];
  selectedElementIds: string[];
  selectedElementId?: string;
  smartGuides: { vertical?: number; horizontal?: number };
  marqueeSelection?: { start: { x: number; y: number }; current: { x: number; y: number } };
  zoom: number;
  width: number;
  height: number;
}

const drawCircle = (graphic: Graphics, width: number, height: number, color: string) => {
  graphic.clear();
  graphic.circle(width / 2, height / 2, Math.min(width, height) / 2).fill(color);
  const highlightSize = Math.min(width, height) * 0.1;
  graphic.circle(width / 2, height * 0.15, highlightSize / 2).fill("#ffffff");
};

const scenarioCornerRadius = 10;

const PixiScenarioRenderer = forwardRef<PixiScenarioRendererHandle, PixiScenarioRendererProps>(function PixiScenarioRenderer({
  width,
  height,
  backgroundColor,
  elements,
  responsesRef,
  onElementPointerDown,
  onTransformPointerDown,
  onRigElementPointerDown,
  onRigAnchorPointerDown,
  isSelectionToolActive,
  isRigToolActive,
  selectedElementIds,
  selectedElementId,
  smartGuides,
  marqueeSelection,
  zoom,
  view,
}, ref) {
  const responsiveElementIds = useMemo(() => getRigResponsiveElementIds(elements), [elements]);
  const responsiveElements = useMemo(
    () => elements.filter((element) => responsiveElementIds.has(element.id)),
    [elements, responsiveElementIds],
  );
  const hostRef = useRef<HTMLDivElement | null>(null);
  const appRef = useRef<Application | null>(null);
  const elementsRef = useRef(new Map<string, RenderedElement>());
  const textureCacheRef = useRef(new Map<string, {
    texture?: Texture;
    loading?: Promise<void>;
    users: number;
  }>());
  const latestElementsRef = useRef(elements);
  const responsiveElementsRef = useRef(responsiveElements);
  const responsiveElementIdsRef = useRef(responsiveElementIds);
  const onElementPointerDownRef = useRef(onElementPointerDown);
  const onTransformPointerDownRef = useRef(onTransformPointerDown);
  const onRigElementPointerDownRef = useRef(onRigElementPointerDown);
  const onRigAnchorPointerDownRef = useRef(onRigAnchorPointerDown);
  const overlayRef = useRef<Graphics | null>(null);
  const sceneLayerRef = useRef<Container | null>(null);
  const sceneContentLayerRef = useRef<Container | null>(null);
  const sceneMaskRef = useRef<Graphics | null>(null);
  const sceneBackgroundRef = useRef<Graphics | null>(null);
  const overlayLayerRef = useRef<Container | null>(null);
  const renderFrameRef = useRef<() => void>(() => undefined);
  const overlayPropsRef = useRef<OverlayProps>({
    elements,
    selectedElementIds,
    selectedElementId,
    smartGuides,
    marqueeSelection,
    zoom,
    width,
    height,
  });
  const [isReady, setIsReady] = useState(false);
  const [rendererError, setRendererError] = useState(false);

  latestElementsRef.current = elements;
  responsiveElementsRef.current = responsiveElements;
  responsiveElementIdsRef.current = responsiveElementIds;
  onElementPointerDownRef.current = onElementPointerDown;
  onTransformPointerDownRef.current = onTransformPointerDown;
  onRigElementPointerDownRef.current = onRigElementPointerDown;
  onRigAnchorPointerDownRef.current = onRigAnchorPointerDown;
  overlayPropsRef.current = {
    elements,
    selectedElementIds,
    selectedElementId,
    smartGuides,
    marqueeSelection,
    zoom,
    width,
    height,
  };

  useImperativeHandle(ref, () => ({
    render: () => renderFrameRef.current(),
  }), []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let initialized = false;
    let resizeObserver: ResizeObserver | undefined;
    let canvas: HTMLCanvasElement | undefined;
    let handleContextLost: ((event: Event) => void) | undefined;
    let handleContextRestored: (() => void) | undefined;
    const app = new Application();
    const resolution = Math.min(2, Math.max(1, window.devicePixelRatio || 1));

    void app.init({
      resizeTo: host,
      autoStart: false,
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      resolution,
      preference: "webgl",
    }).then(() => {
      if (disposed) {
        app.destroy(true);
        return;
      }
      initialized = true;
      appRef.current = app;
      app.stage.eventMode = "none";
      app.stage.sortableChildren = true;
      const sceneLayer = new Container();
      const sceneContentLayer = new Container();
      sceneContentLayer.sortableChildren = true;
      const sceneBackground = new Graphics().roundRect(0, 0, width, height, scenarioCornerRadius).fill(backgroundColor).stroke({ color: "#ffffff", width: 1 });
      const sceneMask = new Graphics().roundRect(0, 0, width, height, scenarioCornerRadius).fill("#ffffff");
      sceneContentLayer.mask = sceneMask;
      sceneLayer.addChild(sceneBackground);
      sceneLayer.addChild(sceneContentLayer);
      sceneLayer.addChild(sceneMask);
      const overlayLayer = new Container();
      overlayLayer.sortableChildren = true;
      const overlay = new Graphics();
      overlay.eventMode = "none";
      overlay.zIndex = Number.MAX_SAFE_INTEGER;
      overlayLayer.addChild(overlay);
      app.stage.addChild(sceneLayer);
      app.stage.addChild(overlayLayer);
      sceneLayerRef.current = sceneLayer;
      sceneContentLayerRef.current = sceneContentLayer;
      sceneMaskRef.current = sceneMask;
      sceneBackgroundRef.current = sceneBackground;
      overlayLayerRef.current = overlayLayer;
      overlayRef.current = overlay;
      host.appendChild(app.canvas);
      app.canvas.style.display = "block";
      app.canvas.style.pointerEvents = "auto";
      canvas = app.canvas;
      handleContextLost = (event) => {
        event.preventDefault();
        setRendererError(true);
      };
      handleContextRestored = () => {
        setRendererError(false);
        renderFrameRef.current();
      };
      canvas.addEventListener("webglcontextlost", handleContextLost);
      canvas.addEventListener("webglcontextrestored", handleContextRestored);

      const renderFrame = () => {
        for (const element of responsiveElementsRef.current) {
          const rendered = elementsRef.current.get(element.id);
          if (!rendered) continue;
          applyTransform(
            rendered,
            element,
            responsesRef.current.get(element.id) ?? defaultResponse,
            overlayPropsRef.current.width,
            overlayPropsRef.current.height,
          );
        }
        const overlayNeedsAnimation = overlayPropsRef.current.selectedElementIds
          .some((id) => responsiveElementIdsRef.current.has(id))
          || overlayPropsRef.current.elements.some((element) =>
            Boolean(element.rigParentId) && responsiveElementIdsRef.current.has(element.id),
          );
        if (overlayRef.current && overlayNeedsAnimation) {
          drawOverlay(overlayRef.current, overlayPropsRef.current, responsesRef.current);
        }
        app.render();
      };
      renderFrameRef.current = renderFrame;
      resizeObserver = new ResizeObserver(() => app.resize());
      resizeObserver.observe(host);
      setIsReady(true);
      setRendererError(false);
    }).catch(() => {
      if (!disposed) setRendererError(true);
    });

    return () => {
      disposed = true;
      elementsRef.current.clear();
      textureCacheRef.current.forEach(({ texture }, source) => {
        void Assets.unload(source).catch(() => texture?.destroy(true));
      });
      textureCacheRef.current.clear();
      overlayRef.current = null;
      sceneLayerRef.current = null;
      sceneContentLayerRef.current = null;
      sceneMaskRef.current = null;
      sceneBackgroundRef.current = null;
      overlayLayerRef.current = null;
      renderFrameRef.current = () => undefined;
      if (appRef.current === app) appRef.current = null;
      setIsReady(false);
      if (canvas && handleContextLost) canvas.removeEventListener("webglcontextlost", handleContextLost);
      if (canvas && handleContextRestored) canvas.removeEventListener("webglcontextrestored", handleContextRestored);
      if (initialized) app.destroy(true);
      resizeObserver?.disconnect();
    };
  }, [responsesRef]);

  useEffect(() => {
    const app = appRef.current;
    if (!app) return;
    const renderedElements = elementsRef.current;
    const textureCache = textureCacheRef.current;
    const releaseTexture = (source: string | undefined) => {
      if (!source) return;
      const cached = textureCache.get(source);
      if (!cached) return;
      cached.users -= 1;
      if (cached.users > 0) return;
      textureCache.delete(source);
      void Assets.unload(source).catch(() => cached.texture?.destroy(true));
    };
    const acquireTexture = (source: string) => {
      const cached = textureCache.get(source);
      if (cached) {
        cached.users += 1;
        return cached;
      }
      // PNG/blob/data URLs load asynchronously. Creating the Sprite only when
      // the texture is ready prevents blank image components in Pixi.
      const entry: { texture?: Texture; loading?: Promise<void>; users: number } = { users: 1 };
      textureCache.set(source, entry);
      // O loader do Assets não é consistente com data URLs em alguns webviews
      // do Tauri. A imagem já foi validada antes de virar um componente, então
      // usamos o elemento HTML como fallback e mantemos a mesma textura em cache.
      const loadTexture = () => Assets.load<Texture>(source).catch(() => new Promise<Texture>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(Texture.from(image));
        image.onerror = () => reject(new Error("Não foi possível carregar a imagem do componente."));
        image.src = source;
      }));
      entry.loading = loadTexture()
        .then((texture) => {
          const current = textureCache.get(source);
          if (!current || current.users <= 0) {
            void Assets.unload(source).catch(() => texture.destroy(true));
            return;
          }
          current.texture = texture;
          current.loading = undefined;
          for (const [elementId, rendered] of elementsRef.current) {
            if (rendered.source !== source || rendered.sprite) continue;
            rendered.sprite = new Sprite(texture);
            rendered.container.addChild(rendered.sprite);
            const element = latestElementsRef.current.find((item) => item.id === elementId);
            if (element) {
              applyTransform(
                rendered,
                element,
                responsesRef.current.get(element.id) ?? defaultResponse,
                overlayPropsRef.current.width,
                overlayPropsRef.current.height,
              );
            }
          }
          renderFrameRef.current();
        })
        .catch(() => {
          const current = textureCache.get(source);
          if (current) current.loading = undefined;
        });
      return entry;
    };
    const currentIds = new Set(elements.map((element) => element.id));

    for (const [id, rendered] of renderedElements) {
      if (currentIds.has(id)) continue;
      releaseTexture(rendered.source);
      rendered.container.destroy({ children: true });
      renderedElements.delete(id);
    }

    elements.forEach((element, index) => {
      let rendered = renderedElements.get(element.id);
      // imageData é a fonte persistida e funciona depois de reabrir o cenário.
      // Não priorize a blob URL transitória do preview, pois ela pode deixar de
      // ser resolvida pelo WebGL/Tauri ainda durante a importação.
      const source = element.imageData ?? element.imagePreviewUrl;
      if (!rendered) {
        rendered = { container: new Container() };
        rendered.container.sortableChildren = true;
        rendered.container.eventMode = "none";
        sceneContentLayerRef.current?.addChild(rendered.container);
        renderedElements.set(element.id, rendered);
      }

      if (source) {
        if (rendered.source !== source) {
          releaseTexture(rendered.source);
          rendered.container.removeChildren().forEach((child) => child.destroy());
          rendered.graphic = undefined;
          rendered.drawnWidth = undefined;
          rendered.drawnHeight = undefined;
          rendered.drawnColor = undefined;
          rendered.source = source;
          acquireTexture(source);
        }
        const texture = textureCache.get(source)?.texture;
        if (texture && !rendered.sprite) {
          rendered.sprite = new Sprite(texture);
          rendered.container.addChild(rendered.sprite);
        }
      } else {
        const needsNewGraphic = !rendered.graphic || rendered.source !== undefined;
        if (needsNewGraphic) {
          releaseTexture(rendered.source);
          rendered.container.removeChildren().forEach((child) => child.destroy());
          rendered.sprite = undefined;
          rendered.source = undefined;
          rendered.drawnWidth = undefined;
          rendered.drawnHeight = undefined;
          rendered.drawnColor = undefined;
          rendered.graphic = new Graphics();
          rendered.container.addChild(rendered.graphic);
        }
      }

      if (
        rendered.element !== element
        || rendered.scenarioWidth !== width
        || rendered.scenarioHeight !== height
      ) {
        const response = responsesRef.current.get(element.id) ?? defaultResponse;
        applyTransform(rendered, element, response, width, height);
        rendered.element = element;
        rendered.scenarioWidth = width;
        rendered.scenarioHeight = height;
      }
      if (rendered.visible !== element.visible) {
        rendered.container.visible = element.visible;
        rendered.visible = element.visible;
      }
      if (rendered.layerIndex !== index) {
        rendered.container.zIndex = Math.max(1, elements.length - index);
        rendered.layerIndex = index;
      }
    });
    app.stage.sortChildren();
    sceneMaskRef.current?.clear().roundRect(0, 0, width, height, scenarioCornerRadius).fill("#ffffff");
    sceneBackgroundRef.current?.clear().roundRect(0, 0, width, height, scenarioCornerRadius).fill(backgroundColor).stroke({ color: "#ffffff", width: 1 });
    if (overlayRef.current) drawOverlay(overlayRef.current, overlayPropsRef.current, responsesRef.current);
    app.render();
  }, [elements, responsesRef, isReady, width, height, backgroundColor]);

  useEffect(() => {
    if (!isReady || !overlayRef.current) return;
    drawOverlay(overlayRef.current, overlayPropsRef.current, responsesRef.current);
    appRef.current?.render();
  }, [isReady, selectedElementIds, selectedElementId, smartGuides, marqueeSelection, zoom, width, height, responsesRef]);

  useEffect(() => {
    if (!isReady) return;
    sceneLayerRef.current?.position.set(view.x, view.y);
    sceneLayerRef.current?.scale.set(zoom);
    overlayLayerRef.current?.position.set(view.x, view.y);
    overlayLayerRef.current?.scale.set(zoom);
    appRef.current?.render();
  }, [isReady, view, zoom]);

  const handleCanvasPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((!isSelectionToolActive && !isRigToolActive) || event.button !== 0 || event.ctrlKey) return;
    const host = hostRef.current;
    if (!host) return;
    const bounds = host.getBoundingClientRect();
    if (bounds.width === 0 || bounds.height === 0) return;
    const point = {
      x: (event.clientX - bounds.left - view.x) / zoom,
      y: (event.clientY - bounds.top - view.y) / zoom,
    };
    if (isSelectionToolActive) {
      const selectedIds = new Set(overlayPropsRef.current.selectedElementIds);
      const elementsById = new Map(latestElementsRef.current.map((element) => [element.id, element]));
      const anchorRadius = 9 / zoom;
      let closestAnchor: { childId: string; role: RigAnchorRole; distance: number } | undefined;
      for (const child of latestElementsRef.current) {
        if (!child.visible || !child.rigParentId) continue;
        const parent = elementsById.get(child.rigParentId);
        if (!parent?.visible || (!selectedIds.has(parent.id) && !selectedIds.has(child.id))) continue;
        const anchors: Array<{ role: RigAnchorRole; point: { x: number; y: number } }> = [
          {
            role: "parent",
            point: getRigAnchorWorld(
              parent,
              responsesRef.current.get(parent.id) ?? defaultResponse,
              child.rigParentAnchorX ?? 0.5,
              child.rigParentAnchorY ?? 0.5,
            ),
          },
          {
            role: "child",
            point: getRigAnchorWorld(
              child,
              responsesRef.current.get(child.id) ?? defaultResponse,
              child.rigChildAnchorX ?? 0.5,
              child.rigChildAnchorY ?? 0.5,
            ),
          },
        ];
        for (const anchor of anchors) {
          const distance = Math.hypot(point.x - anchor.point.x, point.y - anchor.point.y);
          if (distance <= anchorRadius && (!closestAnchor || distance < closestAnchor.distance)) {
            closestAnchor = { childId: child.id, role: anchor.role, distance };
          }
        }
      }
      if (closestAnchor) {
        event.preventDefault();
        event.stopPropagation();
        onRigAnchorPointerDownRef.current(event.nativeEvent, closestAnchor.childId, closestAnchor.role);
        return;
      }
    }
    const selectedElement = isSelectionToolActive ? latestElementsRef.current.find((element) =>
      element.id === overlayPropsRef.current.selectedElementId && element.visible,
    ) : undefined;
    if (selectedElement) {
      const response = responsesRef.current.get(selectedElement.id) ?? defaultResponse;
      const control = hitTestTransformControl(point, selectedElement, response, zoom);
      if (control) {
        event.preventDefault();
        event.stopPropagation();
        onTransformPointerDownRef.current(event.nativeEvent, control, selectedElement.id);
        return;
      }
    }
    const insideScenario = point.x >= 0 && point.x <= width && point.y >= 0 && point.y <= height;
    if (insideScenario) {
      const target = latestElementsRef.current.find((element) => pointHitsElement(
        point,
        element,
        responsesRef.current.get(element.id) ?? defaultResponse,
      ));
      if (target) {
        event.preventDefault();
        event.stopPropagation();
        if (isRigToolActive) onRigElementPointerDownRef.current(event.nativeEvent, target.id, point);
        else onElementPointerDownRef.current(event.nativeEvent, target.id);
        return;
      }
    }
    // When no actual component is under the pointer, the selected transform
    // rectangle remains draggable even beyond the clipped scenario boundary.
    if (selectedElement) {
      const response = responsesRef.current.get(selectedElement.id) ?? defaultResponse;
      if (pointHitsTransformBox(point, selectedElement, response, zoom)) {
        event.preventDefault();
        event.stopPropagation();
        onElementPointerDownRef.current(event.nativeEvent, selectedElement.id);
      }
    }
  };

  const handleCanvasPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const host = hostRef.current;
    if (host && isRigToolActive) {
      host.style.cursor = "crosshair";
      return;
    }
    const selectedElement = latestElementsRef.current.find((element) =>
      element.id === overlayPropsRef.current.selectedElementId && element.visible,
    );
    if (!host || !selectedElement || !isSelectionToolActive) return;
    const bounds = host.getBoundingClientRect();
    const point = {
      x: (event.clientX - bounds.left - view.x) / zoom,
      y: (event.clientY - bounds.top - view.y) / zoom,
    };
    const selectedIds = new Set(overlayPropsRef.current.selectedElementIds);
    const elementsById = new Map(latestElementsRef.current.map((element) => [element.id, element]));
    const anchorRadius = 9 / zoom;
    for (const child of latestElementsRef.current) {
      if (!child.visible || !child.rigParentId) continue;
      const parent = elementsById.get(child.rigParentId);
      if (!parent?.visible || (!selectedIds.has(parent.id) && !selectedIds.has(child.id))) continue;
      const parentPoint = getRigAnchorWorld(
        parent,
        responsesRef.current.get(parent.id) ?? defaultResponse,
        child.rigParentAnchorX ?? 0.5,
        child.rigParentAnchorY ?? 0.5,
      );
      const childPoint = getRigAnchorWorld(
        child,
        responsesRef.current.get(child.id) ?? defaultResponse,
        child.rigChildAnchorX ?? 0.5,
        child.rigChildAnchorY ?? 0.5,
      );
      if (Math.hypot(point.x - parentPoint.x, point.y - parentPoint.y) <= anchorRadius
        || Math.hypot(point.x - childPoint.x, point.y - childPoint.y) <= anchorRadius) {
        host.style.cursor = "grab";
        return;
      }
    }
    const response = responsesRef.current.get(selectedElement.id) ?? defaultResponse;
    const control = hitTestTransformControl(point, selectedElement, response, zoom);
    host.style.cursor = control === "rotate" ? "crosshair" : control ? "move" : "";
  };

  return (
    <div ref={hostRef} onPointerDown={handleCanvasPointerDown} onPointerMove={handleCanvasPointerMove} style={{ position: "absolute", inset: 0 }}>
      {rendererError && (
        <span style={{ position: "absolute", inset: 0, zIndex: 1, display: "grid", placeItems: "center", color: "#ffffff", fontSize: 12, pointerEvents: "none" }}>
          Não foi possível renderizar o cenário. Reabra o editor para restaurar o contexto gráfico.
        </span>
      )}
    </div>
  );
});

export default PixiScenarioRenderer;

function applyTransform(
  rendered: RenderedElement,
  element: ScenarioElementProps,
  response: ElementResponse,
  scenarioWidth: number,
  scenarioHeight: number,
) {
  const width = baseSize * element.scaleX;
  const height = baseSize * element.scaleY;
  const pivot = getElementPivotWorld(element);
  const radians = ((element.rotation + response.rotation) * Math.PI) / 180;
  const centerX = (0.5 - element.pivotX) * width * response.scale;
  const centerY = (0.5 - element.pivotY) * height * response.scale;
  const compensatedX = centerX * (1 - response.widthScale);
  const compensatedY = centerY * (1 - response.heightScale);
  const rotatedCompensationX = compensatedX * Math.cos(radians) - compensatedY * Math.sin(radians);
  const rotatedCompensationY = compensatedX * Math.sin(radians) + compensatedY * Math.cos(radians);
  rendered.container.position.set(
    pivot.x + response.translationX + rotatedCompensationX,
    pivot.y + response.translationY + rotatedCompensationY,
  );
  rendered.container.pivot.set(element.pivotX * width, element.pivotY * height);
  rendered.container.scale.set(
    response.scale * response.widthScale,
    response.scale * response.heightScale,
  );
  rendered.container.rotation = radians;
  const renderedOpacity = Math.max(0, Math.min(1, element.opacity + response.opacity));
  if (rendered.opacity !== renderedOpacity) {
    rendered.container.alpha = renderedOpacity;
    rendered.opacity = renderedOpacity;
  }
  rendered.container.renderable = elementIntersectsScenario(element, response, scenarioWidth, scenarioHeight);
  if (rendered.sprite) {
    rendered.sprite.width = width;
    rendered.sprite.height = height;
  }
  if (rendered.graphic && (
    rendered.drawnWidth !== width
    || rendered.drawnHeight !== height
    || rendered.drawnColor !== element.color
  )) {
    drawCircle(rendered.graphic, width, height, element.color);
    rendered.drawnWidth = width;
    rendered.drawnHeight = height;
    rendered.drawnColor = element.color;
  }
}

const drawDashedLine = (
  graphic: Graphics,
  from: { x: number; y: number },
  to: { x: number; y: number },
  color: string,
  lineWidth: number,
  dash: number,
) => {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  if (distance === 0) return;
  const dx = (to.x - from.x) / distance;
  const dy = (to.y - from.y) / distance;
  for (let offset = 0; offset < distance; offset += dash * 2) {
    const end = Math.min(distance, offset + dash);
    graphic
      .moveTo(from.x + dx * offset, from.y + dy * offset)
      .lineTo(from.x + dx * end, from.y + dy * end)
      .stroke({ color, width: lineWidth });
  }
};

const drawDashedCircle = (
  graphic: Graphics,
  center: { x: number; y: number },
  radius: number,
  color: string,
  lineWidth: number,
  dash: number,
) => {
  if (radius <= 0) return;
  const dashAngle = Math.min(Math.PI / 4, dash / radius);
  for (let start = 0; start < Math.PI * 2; start += dashAngle * 2) {
    graphic
      .arc(center.x, center.y, radius, start, Math.min(Math.PI * 2, start + dashAngle))
      .stroke({ color, width: lineWidth, alpha: 0.9 });
  }
};

const getWanderRadii = (element: ScenarioElementProps) => {
  const radii = [
    ...element.operations
      .filter((operation) => operation.operation === "wander")
      .map((operation) => operation.wanderRadius ?? 20),
    ...(element.frequencyResponse?.operation === "wander"
      ? [element.frequencyResponse.wanderRadius ?? 20]
      : []),
    ...(element.vocalResponse?.operation === "wander"
      ? [element.vocalResponse.wanderRadius ?? 20]
      : []),
  ];
  return [...new Set(radii.filter((radius) => Number.isFinite(radius) && radius > 0))];
};

const drawDiamond = (graphic: Graphics, x: number, y: number, size: number) => {
  graphic
    .moveTo(x, y - size / 2)
    .lineTo(x + size / 2, y)
    .lineTo(x, y + size / 2)
    .lineTo(x - size / 2, y)
    .closePath()
    .fill("#a855f7")
    .stroke({ color: "#ffffff", width: size / 8 });
};

const drawRigChildTriangle = (graphic: Graphics, x: number, y: number, size: number, lineWidth: number) => {
  graphic
    .moveTo(x, y - size * 0.6)
    .lineTo(x + size * 0.6, y + size * 0.5)
    .lineTo(x - size * 0.6, y + size * 0.5)
    .closePath()
    .fill("#00a8ff")
    .stroke({ color: "#ffffff", width: lineWidth });
};

function drawOverlay(graphic: Graphics, props: OverlayProps, responses: Map<string, ElementResponse>) {
  graphic.clear();
  const pixel = 1 / props.zoom;
  if (props.marqueeSelection) {
    const { start, current } = props.marqueeSelection;
    const left = Math.min(start.x, current.x);
    const top = Math.min(start.y, current.y);
    graphic
      .rect(left, top, Math.abs(current.x - start.x), Math.abs(current.y - start.y))
      .fill({ color: "#00a8ff", alpha: 0.15 })
      .stroke({ color: "#00a8ff", width: pixel });
  }
  if (props.smartGuides.vertical !== undefined) {
    graphic.moveTo(props.smartGuides.vertical, 0).lineTo(props.smartGuides.vertical, props.height)
      .stroke({ color: "#00a8ff", width: pixel });
  }
  if (props.smartGuides.horizontal !== undefined) {
    graphic.moveTo(0, props.smartGuides.horizontal).lineTo(props.width, props.smartGuides.horizontal)
      .stroke({ color: "#00a8ff", width: pixel });
  }

  const selectedSet = new Set(props.selectedElementIds);
  const elementsById = new Map(props.elements.map((element) => [element.id, element]));
  for (const child of props.elements) {
    if (!child.visible || !child.rigParentId) continue;
    const parent = elementsById.get(child.rigParentId);
    if (!parent?.visible || (!selectedSet.has(parent.id) && !selectedSet.has(child.id))) continue;
    const parentPoint = getRigAnchorWorld(
      parent,
      responses.get(parent.id) ?? defaultResponse,
      child.rigParentAnchorX ?? 0.5,
      child.rigParentAnchorY ?? 0.5,
    );
    const childPoint = getRigAnchorWorld(
      child,
      responses.get(child.id) ?? defaultResponse,
      child.rigChildAnchorX ?? 0.5,
      child.rigChildAnchorY ?? 0.5,
    );
    drawDashedLine(graphic, parentPoint, childPoint, "#a855f7", 1.5 * pixel, 5 / props.zoom);
    // Círculo = ponto do pai; triângulo = ponto do filho.
    graphic.circle(parentPoint.x, parentPoint.y, 4 / props.zoom)
      .fill("#a855f7").stroke({ color: "#ffffff", width: pixel });
    drawRigChildTriangle(graphic, childPoint.x, childPoint.y, 8 / props.zoom, pixel);
  }

  for (const element of props.elements) {
    if (!element.visible || !selectedSet.has(element.id)) continue;
    const response = responses.get(element.id) ?? defaultResponse;
    for (const radius of getWanderRadii(element)) {
      drawDashedCircle(graphic, { x: element.x, y: element.y }, radius, "#a855f7", pixel, 4 / props.zoom);
    }
    const { width, height, localToWorld } = getRenderedElementGeometry(element, response);
    const isPrimary = element.id === props.selectedElementId;
    const inset = 10 / props.zoom;
    const corners = [
      localToWorld(-inset, -inset),
      localToWorld(width + inset, -inset),
      localToWorld(width + inset, height + inset),
      localToWorld(-inset, height + inset),
    ];
    const color = isPrimary ? "#ffffff" : "#00a8ff";
    for (let index = 0; index < corners.length; index += 1) {
      drawDashedLine(graphic, corners[index], corners[(index + 1) % corners.length], color, pixel, 3 / props.zoom);
    }
    if (!isPrimary) continue;

    const handleSize = 8 / props.zoom;
    const controls = getTransformControls(element, response, props.zoom);
    for (const { point } of controls.resize) {
      graphic.rect(point.x - handleSize / 2, point.y - handleSize / 2, handleSize, handleSize)
        .fill("#00a8ff")
        .stroke({ color: "#ffffff", width: pixel });
    }
    for (const { point } of controls.rotate) {
      graphic.circle(point.x, point.y, 5 / props.zoom).fill("#00a8ff").stroke({ color: "#ffffff", width: pixel });
    }
    const pivotPoint = controls.pivot.point;
    drawDiamond(graphic, pivotPoint.x, pivotPoint.y, 10 / props.zoom);
  }
}
