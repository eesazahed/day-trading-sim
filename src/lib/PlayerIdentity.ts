const StorageKey = 'PtpPublicPlayerId'

function RandomUuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (C) => {
    const R = (Math.random() * 16) | 0
    const V = C === 'x' ? R : (R & 0x3) | 0x8
    return V.toString(16)
  })
}

export function GetOrCreatePublicPlayerId(): string {
  try {
    const Existing = localStorage.getItem(StorageKey)
    if (Existing && /^[0-9a-f-]{36}$/i.test(Existing)) return Existing
    const Created = RandomUuid()
    localStorage.setItem(StorageKey, Created)
    return Created
  } catch {
    return RandomUuid()
  }
}
