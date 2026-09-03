import { createContext, useContext } from "react";

/**
 * Id of the `<label>` a `Field` rendered, so the control inside it can point
 * at that text as its accessible name.
 *
 * A plain `<label>` can't do the job here: `htmlFor` only binds to a real form
 * element, and these controls are Radix composites — the thing carrying
 * `role="slider"` is a span several levels down. Left alone, a screen reader
 * announces "slider, 8200" with no hint of what it adjusts, which axe reports
 * as `aria-input-field-name` on all fifty-odd of them.
 *
 * Passing the id through context rather than a prop means every control
 * already inside a Field is named without touching a single call site — and
 * one placed outside a Field still shows up in the audit, which is the right
 * outcome rather than a silently unnamed widget.
 */
export const FieldLabelContext = createContext<string | undefined>(undefined);

export const useFieldLabelId = () => useContext(FieldLabelContext);
