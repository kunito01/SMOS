/** Stored device id for the machine renamed to PC02. */
export const retiredDeviceLabel = "M2air";

export const replacementDeviceLabel = "PC02";

/**
 * Replace that device id. Workflow hosts also store M2Air and m2air, so the
 * match ignores case. Other text, including "M2 Air" prose, stays as written.
 */
export const canonicalDeviceLabel = (value: string) =>
  value.trim().toLowerCase() === retiredDeviceLabel.toLowerCase() ? replacementDeviceLabel : value;
