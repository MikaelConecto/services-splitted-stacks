export default class MissingValueException extends Error {
  constructor(message?: string) {
    if (typeof message === 'undefined') {
      message = 'Invalid request, a value is missing'
    }

    super(message)

    this.message = message
    this.name = 'MissingValueException'

    Error.captureStackTrace(this, MissingValueException)
  }
}
