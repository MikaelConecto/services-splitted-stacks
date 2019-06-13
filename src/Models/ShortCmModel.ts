import HttpRequestClient from '../Interfaces/HttpRequestClient'

class ShortCmModel {
  requestService: HttpRequestClient

  constructor(httpRequestClient: HttpRequestClient) {
    this.requestService = httpRequestClient
  }

  createLink(data) {
    return this.requestService.post({
      url: '/links',
      data, // must be contained in { data: { ...values }}
    })
  }
}

export default ShortCmModel
