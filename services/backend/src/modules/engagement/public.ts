import { type NotificationKind } from "@expresso/contracts";

export interface NotificationDeliveryProvider {
  send(notification: { id: string; userId: string; kind: NotificationKind; targetUrl: string }): Promise<void>;
}

export class EngagementError extends Error {
  readonly statusCode: number;
  constructor(statusCode: number, message: string) { super(message); this.name = "EngagementError"; this.statusCode = statusCode; }
}
