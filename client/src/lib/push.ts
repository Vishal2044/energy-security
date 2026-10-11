import { api } from './api';

function decodeKey(value: string) { const padding = '='.repeat((4 - value.length % 4) % 4); const raw = atob((value + padding).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from([...raw].map((character) => character.charCodeAt(0))); }

export async function subscribeForPush() {
  const publicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined; if (!publicKey || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window) || Notification.permission !== 'granted') return false;
  try { const registration = await navigator.serviceWorker.register('/push-sw.js', { scope: '/push/' }); let subscription = await registration.pushManager.getSubscription(); if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeKey(publicKey) }); const json = subscription.toJSON(); if (json.endpoint && json.keys) await api.post('/push/subscribe', { endpoint: json.endpoint, keys: json.keys }); return true; } catch { return false; }
}
