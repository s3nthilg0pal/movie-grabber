// Firefox exposes promise-based APIs under `browser`; Chrome MV3 uses `chrome`.
// The APIs used here share the same signatures, so reuse the existing Chrome types.
declare const browser: typeof chrome;

export const extension = typeof browser !== 'undefined' ? browser : chrome;
