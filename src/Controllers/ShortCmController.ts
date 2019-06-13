import HttpRequestClient from '../Interfaces/HttpRequestClient'

import ShortCmModel from '../Models/ShortCmModel'

class ShortCmController {
  private requestService: HttpRequestClient
  private model: any

  constructor(
    requestClient: HttpRequestClient,
  ) {
    this.requestService = requestClient

    this.model = new ShortCmModel(requestClient)
  }

  async create(data: any): Promise<any> {
    try {
      const response = await this.model.createLink(data)

      return response
    } catch (e) {
      console.log(e)
      throw new Error(e)
    }
  }
}

export default ShortCmController
