import qs from 'qs'

import HttpRequestClient from '../Interfaces/HttpRequestClient'
import CRMModel from '../Interfaces/CRMModel'
import ContactCreationTransformedRawData from '../Interfaces/ContactCreationTransformedRawData'
import CRMUpdateData from '../Interfaces/CRMUpdateData'

class ContactsModel implements CRMModel {
  requestService: HttpRequestClient

  constructor(httpRequestClient: HttpRequestClient) {
    this.requestService = httpRequestClient
  }

  create(data: ContactCreationTransformedRawData) {
    return this.requestService.post({
      url: '/contacts',
      data: { data }, // must be contained in { data: { ...values }}
    })
  }

  update(id: number, data: CRMUpdateData) {
    return this.requestService.put({
      url: `/contacts/${id}`,
      data: { data }, // must be contained in { data: { ...values }}
    })
  }

  fetch(id: number) {
    const request =  this.requestService.get({
      url: `/contacts/${id}`,
    })

    return request
  }

  findAll(queryParams: any) {
    return this.requestService.get({
      url: '/contacts',
      params: queryParams,
      paramsSerializer: params => qs.stringify(params),
    })
  }
}

export default ContactsModel
