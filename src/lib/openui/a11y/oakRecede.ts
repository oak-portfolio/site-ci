/**
 * The conversation behind an open sheet recedes: inert, so focus and the screen reader stay in the sheet, and marked so
 * ornament.css scales and dims it. Closing makes it live first, then puts focus back on the control that opened the sheet.
 * An `inert` the layer already had (the larger-window notice) belongs to React, so closing leaves it in place.
 */
export function oakRecede(layer: Pick<Element, "setAttribute" | "removeAttribute" | "hasAttribute"> | null | undefined, open: boolean,
  opener?: { isConnected: boolean; focus: () => void } | null) {
  if (!layer) return;
  if (open) {
    if (!layer.hasAttribute("inert")) { layer.setAttribute("inert", ""); layer.setAttribute("data-recede-inert", ""); }
    layer.setAttribute("data-receded", "");
    return;
  }
  if (layer.hasAttribute("data-recede-inert")) { layer.removeAttribute("inert"); layer.removeAttribute("data-recede-inert"); }
  layer.removeAttribute("data-receded");
  if (opener?.isConnected) opener.focus();
}
