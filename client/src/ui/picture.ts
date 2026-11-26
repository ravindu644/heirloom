import { useEffect, useState } from 'preact/hooks';
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

/** A picture by its hash, as a URL an `img` shows, once the core has it; nothing while it has not. */
export function usePicture(rooms: Rooms, hash: string | null | undefined): string | undefined {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    setUrl(undefined);
    if (!hash) return;
    let gone = false;
    void rooms.picture(hash).then((got) => !gone && setUrl(got ?? undefined));
    return () => void (gone = true);
  }, [hash]);
  return url;
}

/** Your own picture's hash, as your rooms last said it: the server names it nowhere else. */
export const ownPicture = (rooms: Rooms) => rooms.list.value.flatMap((room) => room.members.filter((m) => m.you)).find((m) => m.picture)?.picture ?? null;
