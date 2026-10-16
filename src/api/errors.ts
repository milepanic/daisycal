/** Base class for CalDAV transport errors. */
export class DavError extends Error {
  readonly status: number
  readonly url: string

  constructor(message: string, status: number, url: string) {
    super(message)
    this.name = 'DavError'
    this.status = status
    this.url = url
  }
}

/** 401: credentials are missing, wrong or no longer accepted. */
export class UnauthorizedError extends DavError {
  constructor(url: string) {
    super('Not authorized', 401, url)
    this.name = 'UnauthorizedError'
  }
}

/** 412: the object changed on the server since we last read it (e.g. edited on the phone). */
export class ConflictError extends DavError {
  constructor(url: string) {
    super('Object was modified on the server', 412, url)
    this.name = 'ConflictError'
  }
}

/** 404: the object or collection no longer exists. */
export class NotFoundError extends DavError {
  constructor(url: string) {
    super('Not found', 404, url)
    this.name = 'NotFoundError'
  }
}

/** Network failure: the server could not be reached at all. */
export class NetworkError extends DavError {
  readonly cause: unknown

  constructor(url: string, cause?: unknown) {
    super('Server unreachable', 0, url)
    this.name = 'NetworkError'
    this.cause = cause
  }
}

export function isDavError(err: unknown): err is DavError {
  return err instanceof DavError
}
