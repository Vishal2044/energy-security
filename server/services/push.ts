import { PushSubscriptionModel } from '../models/index.js';
import { isDatabaseConnected } from '../db.js';
import { env } from '../config/env.js';

export type PushDeliveryStatus = 'SENT' | 'FAILED' | 'NO_SUBSCRIPTION' | 'NOT_CONFIGURED' | 'UNAVAILABLE';

export async function deliverPushToUser(userId: string | undefined, payload: { title: string; body: string; deepLink?: string }): Promise<PushDeliveryStatus> {
  if (!userId || !env.vapidPublicKey || !env.vapidPrivateKey || !env.vapidSubject) return 'NOT_CONFIGURED';
  if (!isDatabaseConnected()) return 'NO_SUBSCRIPTION';
  const subscriptions: any[] = await PushSubscriptionModel.find({ userId }); if (!subscriptions.length) return 'NO_SUBSCRIPTION';
  try {
    const imported: any = await import('web-push'); const webPush: any = imported.default ?? imported; webPush.setVapidDetails(env.vapidSubject, env.vapidPublicKey, env.vapidPrivateKey);
    let sent = false;
    for (const subscription of subscriptions) {
      try { await webPush.sendNotification({ endpoint: subscription.endpoint, keys: subscription.keys }, JSON.stringify(payload)); sent = true; }
      catch (error: any) { if (error?.statusCode === 404 || error?.statusCode === 410) await PushSubscriptionModel.deleteOne({ _id: subscription._id }); }
    }
    return sent ? 'SENT' : 'FAILED';
  } catch { return 'UNAVAILABLE'; }
}
