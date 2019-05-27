import TransformedResponseData from '../Interfaces/TransformedResponseData'
import { APIGatewayProxyResult } from 'aws-lambda'
import Factory from '../Interfaces/Factory'

class ResponseFactory implements Factory {
  build(
    data: TransformedResponseData,
    origin: string,
    options: any = {}
  ): APIGatewayProxyResult {
    return {
      statusCode: data.status,
      headers: {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Credentials':
          'withCredentials' in options ? options.withCredentials : false,
        'Access-Control-Allow-Headers':
          'access-control-allow-origin, Access-Control-Allow-Headers, Access-Control-Allow-Origin, Origin,Accept, Access-Control-Allow-Credentials',
      },
      body: JSON.stringify(data.data),
    }
  }
}

export default ResponseFactory
