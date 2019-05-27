import MissingValueException from '../Exceptions/MissingValueException'

export default class GuardAgainstMissingValue {
  static guard(
    field: string,
    valueType: string,
    data: any,
    customExceptionMessage?: string
  ) {
    let exceptionMessage = `Required field "${field}" needs a value of type ${valueType} in ${JSON.stringify(
      data
    )}`

    if (typeof customExceptionMessage !== 'undefined') {
      exceptionMessage = customExceptionMessage
    }

    if (
      !data.hasOwnProperty(field) ||
      data[field] === null ||
      typeof data[field] === 'undefined'
    ) {
      throw new MissingValueException(exceptionMessage)
    }
  }
}
