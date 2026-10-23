// Errors carry a stable machine code plus a plain-language message the UI can
// show directly (SRS §9.3).

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const notFound = (what = 'Resource') => new ApiError(404, 'NOT_FOUND', `${what} was not found.`);
export const badRequest = (message, details) => new ApiError(400, 'INVALID_INPUT', message, details);
export const conflict = (code, message, details) => new ApiError(409, code, message, details);

/** Wrap async route handlers so rejections reach the error middleware. */
export const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
