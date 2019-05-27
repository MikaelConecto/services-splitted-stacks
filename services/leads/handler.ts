import { APIGatewayProxyHandler } from 'aws-lambda'
import moment from 'moment'

import AxiosClient from '../../src/Clients/AxiosClient'
import MandrillClient from '../../src/Clients/MandrillClient'

import DataValidator from '../../src/Validators/DataValidator'
import LeadCreationSchema from '../../src/ValidationSchemas/LeadCreationSchema'

import BodyParserTransformer from '../../src/Transformers/BodyParserTransformer'
import LeadCreationTransformer from '../../src/Transformers/LeadCreationTransformer'
import MailchimpLeadTransformer from '../../src/Transformers/MailchimpLeadTransformer'

import LeadsController from '../../src/Controllers/LeadsController'
import MailingController from '../../src/Controllers/MailingController'

import ResponseFactory from '../../src/Factories/ResponseFactory'
import ErrorFactory from '../../src/Factories/ErrorFactory'
import logger from '../../src/Helpers/logger'
import labelsJobType from '../../src/Helpers/labelsJobType'

const mandrillClient = new MandrillClient()

export const creation: APIGatewayProxyHandler = async event => {
  logger('Lead Creation', 'generic', 'begin')
  try {
    const validator = new DataValidator(LeadCreationSchema)
    const leadTransformer = new LeadCreationTransformer([
      'firstname',
      'lastname',
      'tel',
      'email',
      'number',
      'address',
      'city',
      'zipcode',
      'latitude',
      'longitude',
      'jobType',
      'jobTypeSpecific',
      'jobInfo',
      'preferredContactMethod',
      'preferredContactTime',
      'conditions',
      'locale',
    ])
    const leadsClient = new AxiosClient({
      baseURL: process.env.ZENDESK_API_V2_URL,
      timeout: 3000,
      headers: {
        Authorization: `Bearer ${process.env.ZENDESK_API_TOKEN}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    })
    const mailchimpClient = new AxiosClient({
      baseURL: process.env.MAILCHIMP_API_URL,
      timeout: 3000,
      headers: {
        Authorization:
          'Basic ' +
          new Buffer('any:' + process.env.MAILCHIMP_APIKEY).toString('base64'),
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    })

    const parsedData = new BodyParserTransformer().transform(event.body)

    logger(
      'Lead Creation',
      'generic',
      'write',
      'request',
      `Lead Creation For: ${JSON.stringify(parsedData, null, 2)}`
    )

    const Leads = new LeadsController(leadsClient, validator, leadTransformer)
    const lead = await Leads.create(parsedData)

    moment.locale(lead.data.custom_fields.locale)

    const contact_method = lead.data.custom_fields.preferredContactMethod.split(', ').map((contactMethod) => {
      if (lead.data.custom_fields.locale === 'fr') {
        switch (contactMethod) {
          case 'email':
            return 'courriel'
          case 'phone':
            return 'téléphone'
          default:
            return contactMethod
        }
      } else {
        return contactMethod
      }
    }).join(', ')
    const contact_time = lead.data.custom_fields.preferredContactTime.split(', ').map((contactTime) => {
      if (lead.data.custom_fields.locale === 'fr') {
        switch (contactTime) {
          case 'evening':
            return 'soirée'
          default:
            return contactTime
        }
      } else {
        return contactTime
      }
    }).join(', ')

    const mailData = {
      to: lead.data.email,
      name: `${lead.data.first_name} ${
        lead.data.last_name
        }`,
      subject: (lead.data.custom_fields.locale === 'fr') ? `Confirmation de demande de soumission` : `Quote Request Confirmation`,
      templateName: (lead.data.custom_fields.locale === 'fr') ? process.env.MANDRILL_TEMPLATE_FR_CONFIRM_OPPORTUNITY : process.env.MANDRILL_TEMPLATE_EN_CONFIRM_OPPORTUNITY,
      templateContent: [],
      async: true,
    }

    const email = await mandrillClient.sendEmailWithTemplate(mailData, {
      global_merge_vars: [
        {
          name: "first_name",
          content: lead.data.first_name,
        },{
          name: "last_name",
          content: lead.data.last_name,
        },{
          name: "phone",
          content: lead.data.phone,
        },{
          name: "email",
          content: lead.data.email,
        },{
          name: "address",
          content: lead.data.address.streetAddress + ', ' + lead.data.address.city + ', ' + lead.data.address.postal_code + ', ' + lead.data.address.state + ', ' + lead.data.address.country,
        },{
          name: "contact_method",
          content: contact_method,
        },{
          name: "contact_time",
          content: contact_time,
        },{
          name: "time",
          content: moment().format('H:mm')
        },{
          name: "date",
          content: moment().format('D MMMM YYYY')
        },{
          name: "job",
          content: labelsJobType[lead.data.custom_fields.locale][`labelJobType_${lead.data.custom_fields.jobType}`]
        },{
          name: "job_specific",
          content: labelsJobType[lead.data.custom_fields.locale][`labelJobTypeSpecific_${lead.data.custom_fields.jobTypeSpecific}`]
        },
      ],
    })

    if (lead.data.custom_fields.conditions) {
      logger(
        'Lead Creation',
        'generic',
        'write',
        'request',
        `Mailchimp Subscription ${lead.data.email}, locale: ${lead.data.custom_fields.locale}`
      )

      const mailchimpTransformer = new MailchimpLeadTransformer()
      const Mailing = new MailingController(
        mailchimpClient,
        (lead.data.custom_fields.locale === 'fr') ? process.env.MAILCHIMP_TOITURE_LIST_ID : process.env.MAILCHIMP_ROOFING_LIST_ID,
        mailchimpTransformer
      )
      const emailIsSubscribed = await Mailing.getSubscriptionStatus(
        lead.data.email
      )

      if (!emailIsSubscribed) {
        logger(
          'Lead Creation',
          'generic',
          'write',
          'request',
          `Mailchimp Subscribre email`
        )

        await Mailing.subscribe(lead)
      }
    }

    logger('Lead Creation', 'generic', 'end')

    return new ResponseFactory().build(lead, event.headers.origin)
  } catch (err) {
    logger('Hook On New Deal', 'generic', 'end', 'error')
    return new ErrorFactory().build(err, event.headers.origin)
  }
}
