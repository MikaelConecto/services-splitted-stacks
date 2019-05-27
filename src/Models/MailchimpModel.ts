import { createHash } from 'crypto'
import HttpRequestClient from '../Interfaces/HttpRequestClient'
import MailingModel from '../Interfaces/MailingModel'
import MailchimpContactSubscibeData from '../Interfaces/MailchimpSubscibeData'

class MailchimpModel implements MailingModel {
  requestService: HttpRequestClient
  list: string

  constructor(httpRequestClient: HttpRequestClient, list: string) {
    this.requestService = httpRequestClient
    this.list = list
  }

  encodeEmail(email: string) {
    return createHash('md5')
      .update(email)
      .digest('hex')
  }

  async getMemberStatus(email: string): Promise<any> {
    const encodedEmail = this.encodeEmail(email)

    return this.requestService
      .get({
        url: `lists/${this.list}/members/${encodedEmail}`,
      })
      .then(() => {
        return true
      })
      .catch(err => {
        if (err.response.status === 404) {
          return false
        }

        return true
      })
  }

  async subscribe(data: MailchimpContactSubscibeData) {
    return this.requestService
      .post({
        url: `lists/${this.list}/members/`,
        data,
      })
      .then(response => {
        return response
      })
      .catch(err => {
        return err
      })
  }
}

export default MailchimpModel
