import { useEffect, useState } from 'preact/hooks';
import type { Engine } from '../sync/engine.ts';
import type { Rooms } from '../sync/rooms.ts';

// What the server takes (protocol section 15): square, 96 by 96, WebP or JPEG, at most 12000 bytes.
const SIDE = 96;
const MOST = 12000;

/**
 * A picture as the server wants it, made here so a few kilobytes are sent and not a photo's
 * megabytes: the middle square of `file`, 96 by 96, as WebP, or JPEG where this browser cannot
 * make WebP, a little coarser until it fits. Null when the file is no picture this browser can read.
 */
export async function makePicture(file: Blob): Promise<Uint8Array | null> {
  const image = await createImageBitmap(file).catch(() => null);
  if (!image) return null;
  const side = Math.min(image.width, image.height);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIDE;
  canvas.getContext('2d')!.drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, 0, 0, SIDE, SIDE);
  image.close();
  const as = (type: string, quality: number) => new Promise<Blob | null>((done) => canvas.toBlob(done, type, quality));
  for (const quality of [0.8, 0.6, 0.4, 0.25]) {
    let blob = await as('image/webp', quality);
    // A browser that cannot make WebP hands back a PNG: JPEG is the other kind the server takes.
    if (blob?.type !== 'image/webp') blob = await as('image/jpeg', quality);
    if (blob && blob.size <= MOST) return new Uint8Array(await blob.arrayBuffer());
  }
  return null;
}

/**
 * A picture by its hash, as a URL an `img` shows: undefined while it is on its way, null when
 * there is none to be had (no hash, or a fetch that answered nothing: offline, gone), and then
 * the circle shows its letters.
 */
export function usePicture(rooms: Rooms, hash: string | null | undefined, { account, online }: Holder): string | null | undefined {
  // Kept on the device, it is there for the first paint; otherwise it is fetched, and kept. What
  // was fetched is the account's it was fetched for: another account's URL is gone with it.
  const [fetched, setFetched] = useState<{ hash: string; url: string | null; account: number } | null>(null);
  useEffect(() => {
    if (!hash || rooms.pictureNow(hash) || !online) return;
    let gone = false;
    void rooms.picture(hash).then((url) => !gone && setFetched({ hash, url, account }));
    return () => void (gone = true);
    // Asked again when the connection comes back: an answer of nothing while offline was no answer.
  }, [hash, account, online]);
  if (!hash) return null;
  // Offline, one not kept here cannot come: the letters stand in until the connection is back.
  return rooms.pictureNow(hash) ?? (fetched?.hash === hash && fetched.account === account ? fetched.url : online ? undefined : null);
}

/** Whose pictures are asked for, and whether they can be: an account's, and only with a connection. */
export interface Holder {
  /** The rooms' count of account changes: it moves also when the same account signs in again, whose old URLs are gone. */
  account: number;
  online: boolean;
}

/** Which signing in the pictures belong to, and whether the server can be reached. */
export const holderOf = (engine: Engine, rooms: Rooms): Holder => ({ account: rooms.account.value, online: engine.sync.value !== 'offline' });

/** Your own picture's hash, as your rooms last said it: the server names it nowhere else. */
export const ownPicture = (rooms: Rooms) => rooms.list.value.flatMap((room) => room.members.filter((m) => m.you)).find((m) => m.picture)?.picture ?? null;
