/**
 * Login details of a user just created or reset, kept in memory only (like the web's navigation state):
 * never written to storage, gone when the app restarts.
 */
interface Created { username: string; temp_password: string }
const created = new Map<string, Created>()

export const createdLogin = {
  set: (userId: string, c: Created) => { created.set(userId, c) },
  get: (userId: string) => created.get(userId) ?? null,
}
