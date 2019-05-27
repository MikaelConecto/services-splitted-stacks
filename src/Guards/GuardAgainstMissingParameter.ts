import _ from 'lodash'

import MissingParameterException from '../Exceptions/MissingParameterException'

export default class GuardAgainstMissingParameter {
  static guard(
    params: string[],
    paramsToValidate: string[],
    customExceptionMessage?: string
  ) {
    let exceptionMessage =
      'Required parameters : [' + paramsToValidate.join(', ') + ']'

    if (typeof customExceptionMessage !== 'undefined') {
      exceptionMessage = customExceptionMessage
    }

    const intersectionParams = _.intersection(params, paramsToValidate)

    if (intersectionParams.length !== paramsToValidate.length) {
      throw new MissingParameterException(exceptionMessage)
    }
  }
}
