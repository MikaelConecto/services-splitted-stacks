import regexp from '../Helpers/regexp'

import Transformer from '../Interfaces/Transformer'

class PhoneNumberTransformer implements Transformer {
  transform(data: string) {
    const numberMatches = data.match(regexp.phone)

    return numberMatches[1] !== undefined
      ? data.replace(regexp.phone, '$1$2$3$4')
      : data.replace(regexp.phone, '+1$2$3$4')
  }
}

export default PhoneNumberTransformer
