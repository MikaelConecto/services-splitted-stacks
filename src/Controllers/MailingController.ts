import HttpRequestClient from '../Interfaces/HttpRequestClient'
import Transformer from '../Interfaces/Transformer'
import MailingModel from '../Interfaces/MailingModel'

import MailchimpModel from '../Models/MailchimpModel'
import logger from '../Helpers/logger'

class MailingController {
  private requestService: HttpRequestClient
  private transformer: Transformer
  private model: MailingModel

  constructor(
    requestClient: HttpRequestClient,
    list: string,
    transformer: Transformer
  ) {
    this.requestService = requestClient
    this.transformer = transformer

    this.model = new MailchimpModel(requestClient, list)
  }

  getSubscriptionStatus(email: string) {
    return this.model.getMemberStatus(email)
  }

  subscribe(data: any) {
    logger(
      'Mailchimp Subscription',
      'generic',
      'write',
      'transformation',
      'Fields transformation for MailChimp'
    )
    const transformedData = this.transformer.transform(data)

    logger(
      'Mailchimp Subscription',
      'generic',
      'write',
      'request',
      'Before MailChimp subscription'
    )
    return this.model.subscribe(transformedData)
  }
}

export default MailingController
