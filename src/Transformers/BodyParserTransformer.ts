import Transformer from '../Interfaces/Transformer'

class BodyParserTransformer implements Transformer {
  transform(data: string): any {
    return JSON.parse(data)
  }
}

export default BodyParserTransformer
