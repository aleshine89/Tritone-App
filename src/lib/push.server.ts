import type { Sql } from "@/lib/db";

type Keys = { publicKey: string; privateKey: string };

type WebPush = {
  setVapidDetails: (subject: string, publicKey: string, privateKey: string) => void;
  generateVAPIDKeys: () => Keys;
  sendNotification: (
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
    payload: string,
  ) => Promise<unknown>;
};

async function webPush(): Promise<WebPush> {
  const loaded = (await import("web-push")) as WebPush & { default?: WebPush };
  return loaded.default ?? loaded;
}

export async function ensureVapid(sql: Sql): Promise<Keys> {
  const rows = await sql<{ public_key: string; private_key: string }>`
    select public_key, private_key from push_keys where id = 1
  `;
  if (rows[0]) return { publicKey: rows[0].public_key, privateKey: rows[0].private_key };
  const keys = (await webPush()).generateVAPIDKeys();
  await sql`
    insert into push_keys (id, public_key, private_key)
    values (1, ${keys.publicKey}, ${keys.privateKey})
    on conflict (id) do nothing
  `;
  const again = await sql<{ public_key: string; private_key: string }>`
    select public_key, private_key from push_keys where id = 1
  `;
  return again[0]
    ? { publicKey: again[0].public_key, privateKey: again[0].private_key }
    : keys;
}

async function deliver(sql: Sql, userIds: string[], title: string, body: string, url: string, foreground = false) {
  const ids = [...new Set(userIds.filter((id) => id))];
  if (!ids.length || typeof window !== "undefined") return;
  try {
    const devices = await sql.query<{ endpoint: string; p256dh: string; auth: string }>(
      `select endpoint, p256dh, auth from push_devices where user_id = any($1::text[])`,
      [ids],
    );
    if (!devices.length) return;
    const keys = await ensureVapid(sql);
    const push = await webPush();
    push.setVapidDetails("mailto:quaderno@divinghub.local", keys.publicKey, keys.privateKey);
    const payload = JSON.stringify({ title, body, url, foreground });
    await Promise.all(
      devices.map(async (device) => {
        try {
          await push.sendNotification(
            { endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } },
            payload,
          );
        } catch (reason) {
          const status = (reason as { statusCode?: number } | null)?.statusCode;
          if (status === 404 || status === 410) {
            await sql`delete from push_devices where endpoint = ${device.endpoint}`;
          }
        }
      }),
    );
  } catch {
    // La registrazione non deve fallire se il telefono non è raggiungibile.
  }
}

export async function pushUsers(sql: Sql, userIds: string[], title: string, body: string, url = "/notifiche", foreground = false) {
  await deliver(sql, userIds, title, body, url, foreground);
}

export async function pushSchoolPhone(sql: Sql, clubId: number, title: string, body: string, exceptUserId?: string, url = "/notifiche", foreground = false) {
  const people = await sql<{ user_id: string }>`
    select owner_user_id as user_id from club where id = ${clubId} and owner_user_id is not null
    union
    select co_owner_user_id as user_id from club where id = ${clubId} and co_owner_user_id is not null
    union
    select user_id from staff_membri where club_id = ${clubId}
  `;
  await deliver(
    sql,
    people.map((row) => row.user_id).filter((id) => id && id !== exceptUserId),
    title,
    body,
    url,
    foreground,
  );
}
