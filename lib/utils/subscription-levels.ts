import type { SubscriptionLevel } from "@/lib/types";

export const subscriptionLevels: SubscriptionLevel[] = ["Plus", "Pro", "Max 5x", "Max 20x", "Heavy"];

export const isSubscriptionLevel = (value: unknown): value is SubscriptionLevel =>
  typeof value === "string" && (subscriptionLevels as string[]).includes(value);
