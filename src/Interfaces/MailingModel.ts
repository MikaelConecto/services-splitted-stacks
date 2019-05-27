import HttpRequestClient from './HttpRequestClient'

interface MailingModel {
  requestService: HttpRequestClient
  list: string
  getMemberStatus: (email: string) => any
  subscribe: (data: any) => any
}

export default MailingModel
