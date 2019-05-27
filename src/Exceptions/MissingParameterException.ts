export default class MissingParameterException extends Error {
  constructor(message?: string) {
    if (typeof message === 'undefined') {
      message = 'Invalid request, a parameter is missing'
    }

    super(message)

    this.message = message
    this.name = 'MissingParameterException'

    Error.captureStackTrace(this, MissingParameterException)
  }
}
