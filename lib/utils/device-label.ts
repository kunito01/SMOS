/** Exact stored device id for the machine renamed to PC02. */
export const retiredDeviceLabel = "M2air";

export const replacementDeviceLabel = "PC02";

/** Replace that stored id. Any other string, including "M2 Air" prose, stays as written. */
export const canonicalDeviceLabel = (value: string) =>
  value.trim() === retiredDeviceLabel ? replacementDeviceLabel : value;
