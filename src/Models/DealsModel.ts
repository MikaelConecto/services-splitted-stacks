import HttpRequestClient from '../Interfaces/HttpRequestClient'
import CRMModel from '../Interfaces/CRMModel'
import CRMUpdateData from '../Interfaces/CRMUpdateData'

class DealsModel implements CRMModel {
  requestService: HttpRequestClient

  constructor(httpRequestClient: HttpRequestClient) {
    this.requestService = httpRequestClient
  }

  update(id, data: CRMUpdateData) {
    return this.requestService.put({
      url: `/deals/${id}`,
      data: { data }, // must be contained in { data: { ...values }}
    })
  }

  addAssociatedContact(id, contact_id, role = 'involved') {
    return this.requestService.post({
      url: `/deals/${id}/associated_contacts`,
      data: {
        data: {
          contact_id,
          role,
        },
      },
    })
  }

  fetch(id: number, queryParams: any) {
    return this.requestService.get({
      url: `/deals/${id}`,
      params: queryParams,
    })
  }

  findAll(queryParams: any) {
    return this.requestService.get({
      url: '/deals',
      params: queryParams,
    })
  }
}

export default DealsModel
