import AWS from 'aws-sdk'

class DynamoDBClient {
  private engine

  constructor() {
    this.engine = new AWS.DynamoDB.DocumentClient()
  }

  call(action: string, params: any) {
    return this.engine[action](params).promise()
  }

  put(params) {
    return this.call('put', params)
  }

  get(params) {
    return this.call('get', params)
  }

  update(params) {
    return this.call('update', params)
  }

  query(params) {
    return this.engine.query(params).promise()
  }

  scan(params) {
    return this.engine.scan(params).promise()
  }

  batchGet(params) {
    return this.engine.batchGet(params).promise()
  }
}

export default DynamoDBClient
