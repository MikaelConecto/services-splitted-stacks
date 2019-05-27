interface ResponseHeaders {
  'Access-Control-Allow-Origin': string
  'Access-Control-Allow-Credentials': boolean
  'Access-Control-Allow-Headers': string
}

interface Response {
  statusCode: number
  headers: ResponseHeaders
  body: string
}

export default Response
