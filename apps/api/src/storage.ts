/**
 * R2 key layout. Every file that belongs to a user lives under that user's prefix, so
 * "delete my data" can remove all of them by prefix even if a database row was never written.
 */
export const userFilePrefix = (userId: string): string => `users/${userId}/`;

/** R2 deletes at most 1000 keys per call. */
const DELETE_BATCH = 1000;

/** Deletes the given keys plus everything under the user's prefix. Returns how many keys were sent for deletion. */
export async function deleteUserFiles(bucket: R2Bucket, userId: string, knownKeys: Iterable<string>): Promise<number> {
  const keys = new Set(knownKeys);
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix: userFilePrefix(userId), cursor });
    for (const object of page.objects) keys.add(object.key);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  const all = [...keys];
  for (let i = 0; i < all.length; i += DELETE_BATCH) await bucket.delete(all.slice(i, i + DELETE_BATCH));
  return all.length;
}
