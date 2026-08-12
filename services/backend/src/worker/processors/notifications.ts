import type { Job } from "bullmq";
import type { EngagementService, NotificationDeliveryProvider } from "../../modules/engagement/service.js";

export class ConsoleNotificationProvider implements NotificationDeliveryProvider {
  async send(notification: { id: string; kind: string }) {
    console.info(JSON.stringify({ level: "info", message: "notification delivered", notificationId: notification.id, kind: notification.kind }));
  }
}

export function createNotificationProcessor(service: EngagementService, provider: NotificationDeliveryProvider) {
  return async (job: Job<Record<string, unknown>>) => {
    const id = job.data.notificationId;
    if (typeof id !== "string") throw new Error("notification.deliver payload is missing notificationId");
    return service.deliver(id, provider);
  };
}

