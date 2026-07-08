const mockDelayMs = 120;

export async function mockApi<T>(value: T, delay = mockDelayMs): Promise<T> {
  await new Promise((resolve) => setTimeout(resolve, delay));
  return structuredClone(value);
}

export function requireEntity<T>(entity: T | undefined, message: string): T {
  if (!entity) {
    throw new Error(message);
  }

  return entity;
}
