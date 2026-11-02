import { createBoardHtmlOverlay } from "../../js/board_html_overlay.js";
import { clampSize, truncateText } from "../../js/message_common.js";
import { MutationType } from "../../js/mutation_type.js";
import { CardContract } from "../contracts.js";
import {
  createShapeToolBoot,
  drawShapeTool,
  makeBoxShapeUpdateMessage,
  makeSeedShapeCreateMessage,
  moveShapeTool,
  pressShapeTool,
  releaseShapeTool,
} from "../shape_tool.js";
/** @typedef {import("../../js/board_write_module.js").RuntimeBoardMessage} RuntimeBoardMessage */

export {
  cancelShapeToolTouchGesture as cancelTouchGesture,
  quitShapeTool as onquit,
  disconnectShapeTool as onSocketDisconnect,
  rejectShapeMutation as onMutationRejected,
  shapeToolMessage as onMessage,
} from "../shape_tool.js";

export const toolId = "card";
export const drawsOnBoard = true;
export const mouseCursor = "crosshair";

const contract = CardContract;

/** @typedef {{tool: number, type: number, id: string, color: string, size: number, opacity?: number, x: number, y: number, x2: number, y2: number}} CardCreateMessage */
/** @typedef {{tool: number, type: number, id: string, x?: number, y?: number, x2?: number, y2?: number, label?: string}} CardUpdateMessage */
export { contract };
export const shortcut = "k";

/**
 * Card text font size follows the Text tool's rule: derived from the current
 * size preference, not a fixed board-unit constant.
 * @param {number} rawSize
 * @returns {number}
 */
export function cardFontSize(rawSize) {
  return clampSize(Math.round(rawSize * 1.5 + 120));
}

/** @param {number} fontSize @returns {number} */
export function labelRowHeight(fontSize) {
  return Math.round(fontSize * 1.2);
}

/** @typedef {"label"} CardField */
/** @typedef {{input: HTMLInputElement, editorOverlay: ReturnType<typeof createBoardHtmlOverlay>, viewport: import("../../../types/app-runtime").ViewportController, editingField: CardField | null, editingId: string, sentText: string, lastSending: number, lastDrawnId: string, boundChange: (evt: Event | KeyboardEvent | FocusEvent) => void, boundBlur: () => void}} CardEditorState */
/** @typedef {ReturnType<ReturnType<typeof createShapeToolBoot>> & CardEditorState} CardState */

/**
 * @param {SVGGElement} group
 * @param {string} className
 * @param {string} tagName
 * @returns {SVGElement}
 */
function ensureCardChild(group, className, tagName) {
  let child = group.querySelector(`:scope > .${className}`);
  if (!child) {
    child = document.createElementNS("http://www.w3.org/2000/svg", tagName);
    child.setAttribute("class", className);
    group.appendChild(child);
  }
  return /** @type {SVGElement} */ (child);
}

/**
 * @param {SVGGElement} group
 * @param {{x?: number, y?: number, x2: number, y2: number, label?: string, body?: string, size?: number}} data
 * @param {CardState | undefined} [_state]
 */
function applyCardGeometry(group, data, _state) {
  group.setAttribute("class", "card");
  const fontSize =
    typeof data.size === "number" && data.size > 0
      ? cardFontSize(data.size)
      : Number(
          group
            .querySelector(":scope > .card-label")
            ?.getAttribute("font-size"),
        ) || cardFontSize(40);
  const x = data.x ?? data.x2;
  const y = data.y ?? data.y2;
  const left = Math.min(data.x2, x);
  const top = Math.min(data.y2, y);
  const width = Math.abs(data.x2 - x);
  const minWidthPx = 1500; // Minimum width in board pixels
  const clampedWidth = Math.max(width, minWidthPx); // Enforce minimum width
  const height = Math.abs(data.y2 - y);
  const minHeightPx = 200; // Minimum height in board pixels
  const clampedHeight = Math.max(height, minHeightPx); // Enforce minimum height

  const rect = /** @type {SVGRectElement} */ (
    ensureCardChild(group, "card-box", "rect")
  );
  rect.x.baseVal.value = left;
  rect.y.baseVal.value = top;
  rect.width.baseVal.value = clampedWidth;
  rect.height.baseVal.value = clampedHeight;

  const label = /** @type {SVGTextElement} */ (
    ensureCardChild(group, "card-label", "text")
  );
  label.setAttribute("font-family", "sans-serif");
  label.setAttribute("font-size", String(fontSize));
  label.setAttribute("stroke", "none");
  label.setAttribute("text-anchor", "middle");
  label.setAttribute("x", String(left + clampedWidth / 2));
  label.setAttribute("y", String(top + fontSize));
  if (typeof data.label === "string") label.textContent = data.label;
  else if (!label.textContent) label.textContent = "Title";
}

/** @type {import("../shape_tool.js").ShapeToolConfig} */
const config = {
  contract:
    /** @type {import("../shape_tool.js").ShapeToolConfig["contract"]} */ (
      /** @type {unknown} */ (contract)
    ),
  uidPrefix: "card",
  isShapeElement: (element) =>
    String(element?.tagName).toLowerCase() === contract.storedTagName,
  makeCreateMessage: (state, id, x, y) => {
    const message = makeSeedShapeCreateMessage(state, id, x, y);
    // Enforce minimum width of 1500px and minimum height of 200px in board coordinates
    message.x2 = x + 1500;
    message.y2 = y + 200;
    return message;
  },
  makeUpdateMessage: (state, x, y) => {
    const start = state.currentShape;
    if (!start) return null;
    const message = makeBoxShapeUpdateMessage(
      /** @type {any} */ (contract.toolCode),
      start.id,
      start,
      x,
      y,
    );
    // Enforce minimum width of 1500px in board coordinates
    const width = Math.abs(message.x2 - (message.x ?? message.x2));
    if (width < 1500) {
      message.x2 = (message.x ?? message.x2) + 1500;
    }
    return message;
  },
  makeFallbackShape: (data) => ({
    id: data.id,
    x: data.x2,
    y: data.y2,
    x2: data.x2,
    y2: data.y2,
  }),
  applyShapeGeometry: (
    /** @type {SVGElement} */ group,
    /** @type {import("../shape_tool.js").ShapeRuntimeMessage} */ data,
  ) => {
    if (data && "x2" in data && "y2" in data) {
      applyCardGeometry(
        /** @type {SVGGElement} */ (group),
        /** @type {{x?: number, y?: number, x2: number, y2: number, label?: string, size?: number}} */ (
          data
        ),
        undefined,
      );
    }
  },
};

const shapeBoot = createShapeToolBoot(config);

/**
 * @param {CardState} state
 * @returns {SVGGElement | null}
 */
function getEditingCard(state) {
  if (!state.editingId) return null;
  const elem = state.board.svg.getElementById(state.editingId);
  return elem && String(elem.tagName).toLowerCase() === "g"
    ? /** @type {SVGGElement} */ (elem)
    : null;
}

/**
 * @param {SVGGElement} card
 * @returns {number}
 */
function cardFontSizeOf(card) {
  const label = card.querySelector(":scope > .card-label");
  return Number(label?.getAttribute("font-size")) || cardFontSize(40);
}

/**
 * @param {CardState} state
 * @param {CardField} field
 */
function fieldBounds(state, field) {
  const card = getEditingCard(state);
  if (!card) return null;
  const rect = card.querySelector(":scope > .card-box");
  if (!(rect instanceof SVGRectElement)) return null;
  const x = rect.x.baseVal.value;
  const y = rect.y.baseVal.value;
  const width = Math.max(40, rect.width.baseVal.value);
  const rowHeight = labelRowHeight(cardFontSizeOf(card));
  return field === "label"
    ? { x, y, width, height: rowHeight }
    : {
        x,
        y: y + rowHeight,
        width,
        height: Math.max(20, rect.height.baseVal.value - rowHeight),
      };
}

/** @param {CardState} state */
function syncEditorLayout(state) {
  if (!state.editingField) return;
  state.editorOverlay.syncBoardRect(() =>
    fieldBounds(state, /** @type {CardField} */ (state.editingField)),
  );
}

/** @param {CardState} state */
function stopEdit(state) {
  state.input.removeEventListener("input", state.boundChange);
  state.input.removeEventListener("blur", state.boundChange);
  state.input.removeEventListener("blur", state.boundBlur);
  try {
    state.input.blur();
  } catch {
    /* ignore */
  }
  state.editorOverlay.hide();
  state.editingField = null;
  state.editingId = "";
  state.sentText = "";
  state.input.value = "";
}

/**
 * @param {CardState} state
 * @param {string} id
 * @param {CardField} field
 */
function startEdit(state, id, field) {
  const elem = state.board.svg.getElementById(id);
  if (!elem || String(elem.tagName).toLowerCase() !== "g") return;
  const card = /** @type {SVGGElement} */ (elem);
  stopEdit(state);
  state.editingId = id;
  state.editingField = field;
  const textElem = /** @type {SVGTextElement | null} */ (
    card.querySelector(`:scope > .card-${field}`)
  );
  state.input.value = textElem?.textContent || "";
  state.sentText = state.input.value;
  state.input.style.fontWeight = field === "label" ? "bold" : "normal";
  state.input.style.fontFamily = "sans-serif";
  const layoutFontSize = Math.max(
    4,
    state.viewport.boardCoordinateToLayout(cardFontSizeOf(card)),
  );
  state.input.style.fontSize = `${layoutFontSize}px`;
  state.input.style.lineHeight = `${layoutFontSize}px`;
  state.input.style.boxSizing = "border-box";
  state.input.style.background = "#fff";
  state.input.style.border = "1px solid #4b5563";
  state.input.style.outline = "none";
  state.input.style.textAlign = field === "label" ? "center" : "left";
  state.input.style.padding = "0";
  state.input.style.color = state.preferences.getColor();
  syncEditorLayout(state);
  state.input.focus();
  state.input.addEventListener("input", state.boundChange);
  state.input.addEventListener("blur", state.boundChange);
  state.input.addEventListener("blur", state.boundBlur);
}

/**
 * @param {CardState} state
 * @param {Event | KeyboardEvent | FocusEvent} evt
 */
function changeHandler(state, evt) {
  if (evt instanceof KeyboardEvent && evt.key === "Escape") {
    stopEdit(state);
    return;
  }

  if (!state.editingField || !state.editingId) return;
  const nextText = truncateText(state.input.value);
  if (state.input.value !== nextText) state.input.value = nextText;
  const card = getEditingCard(state);
  const textElem = card?.querySelector(`:scope > .card-label`);
  if (textElem) textElem.textContent = nextText;
  if (performance.now() - state.lastSending <= 100) return;
  if (state.sentText === nextText) return;
  state.writes.drawAndSend(
    /** @type {RuntimeBoardMessage} */ ({
      tool: contract.toolCode,
      type: MutationType.UPDATE,
      id: state.editingId,
      label: nextText,
    }),
  );
  state.sentText = nextText;
  state.lastSending = performance.now();
}

/**
 * @param {import("../../../types/app-runtime").ToolBootContext} ctx
 * @returns {CardState}
 */
export function boot(ctx) {
  const state = /** @type {CardState} */ (shapeBoot(ctx));
  const input = document.createElement("input");
  input.id = "cardToolInput";
  input.type = "text";
  input.setAttribute("autocomplete", "off");
  state.input = input;
  state.editorOverlay = createBoardHtmlOverlay({
    board: ctx.runtime.board,
    viewport: ctx.runtime.viewport,
    element: input,
  });
  state.viewport = ctx.runtime.viewport;
  state.editingField = null;
  state.editingId = "";
  state.sentText = "";
  state.lastSending = 0;
  state.lastDrawnId = "";
  state.boundChange = (evt) =>
    changeHandler(
      state,
      /** @type {Event | KeyboardEvent | FocusEvent} */ (evt),
    );
  state.boundBlur = () => {
    if (state.editingField) state.editorOverlay.hide();
  };
  return state;
}

/**
 * @param {CardState} state
 * @param {unknown} data
 * @param {boolean} isLocal
 */
export function draw(state, data, isLocal = false) {
  drawShapeTool(state, /** @type {any} */ (data), isLocal);
}

/**
 * @param {CardState} state
 * @param {number} x
 * @param {number} y
 * @param {MouseEvent | TouchEvent} evt
 */
export function move(state, x, y, evt) {
  moveShapeTool(state, x, y, evt);
}

/**
 * @param {CardState} state
 * @param {number} x
 * @param {number} y
 * @param {MouseEvent | TouchEvent} evt
 */
export function press(state, x, y, evt) {
  const target = evt.target;
  if (target instanceof Element) {
    const cardElem = target.closest("g.card");
    if (cardElem && cardElem.id && state.board.svg.contains(cardElem)) {
      const card = /** @type {SVGGElement} */ (cardElem);
      const rect = card.querySelector(":scope > .card-box");
      const _top = rect instanceof SVGRectElement ? rect.y.baseVal.value : y;
      const _rowHeight = labelRowHeight(cardFontSizeOf(card));
      startEdit(state, card.id, "label");
      evt.preventDefault();
      return;
    }
  }
  stopEdit(state);
  pressShapeTool(state, x, y, evt);
  if (state.currentShape) state.lastDrawnId = state.currentShape.id;
}

/**
 * @param {CardState} state
 * @param {number} x
 * @param {number} y
 */
export function release(state, x, y) {
  releaseShapeTool(state, x, y);
  const id = state.lastDrawnId;
  state.lastDrawnId = "";
  if (id) startEdit(state, id, "label");
}

/** @param {CardState} state */
export function onstart(state) {
  stopEdit(state);
}
