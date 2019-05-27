import { APIGatewayProxyHandler } from 'aws-lambda'
import _ from 'lodash'
import Cryptr from 'cryptr'
import moment from 'moment'
import { BitlyClient } from 'bitly'

import AxiosClient from '../../src/Clients/AxiosClient'
import TwilioClient from '../../src/Clients/TwilioClient'
import DynamoDBClient from '../../src/Clients/DynamoDBClient'

import ContactsController from '../../src/Controllers/ContactsController'
import DealsController from '../../src/Controllers/DealsController'

import ResponseFactory from '../../src/Factories/ResponseFactory'
import ErrorFactory from '../../src/Factories/ErrorFactory'
import CognitoServiceProviderClient from '../../src/Clients/CognitoServiceProviderClient'
import DealsNotificationsTransformer from '../../src/Transformers/DealsNotificationsTransformer'
import PhoneNumberTransformer from '../../src/Transformers/PhoneNumberTransformer'

const cryptr = new Cryptr(process.env.CRYPTR_SECRET_KEY)

const twilioClient = new TwilioClient()
const bitlyClient = new BitlyClient(process.env.BITLY_ACCESS_TOKEN)

const crmClient = new AxiosClient({
  baseURL: process.env.ZENDESK_API_V2_URL,
  timeout: 3000,
  headers: {
    Authorization: `Bearer ${process.env.ZENDESK_API_TOKEN}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  },
})

const dynamoDb = new DynamoDBClient()
const cognitoIdentityClient = new CognitoServiceProviderClient()
const phoneTransformer = new PhoneNumberTransformer()

import logger from '../../src/Helpers/logger'

export const fetch: APIGatewayProxyHandler = async event => {
  logger('Notifications Fetch', 'all', 'begin')
  try {
    logger('Notifications Fetch', 'all', 'read', 'Before Cognito Values')
    const connectedUser = await cognitoIdentityClient.getUser(
      cognitoIdentityClient.getEventAuthValues(event)
    )
    logger(
      'Notifications Fetch',
      'all',
      'read',
      'After Cognito Values',
      `ContactId ${connectedUser['custom:contactId']}, CompanyId ${
        connectedUser['custom:companyId']
        }`
    )

    if (connectedUser['custom:isActive'] === '0') {
      logger(
        'Notifications Fetch',
        'all',
        'not active',
        JSON.stringify(connectedUser, null, 2)
      )
      throw 'The user is not active'
    }

    const encryptedDealId = decodeURIComponent(
      event.pathParameters.encryptedDealId
    )
    const encryptedContactId = decodeURIComponent(
      event.pathParameters.encryptedContactId
    )
    const dealId = cryptr.decrypt(encryptedDealId)
    const companyContactId = cryptr.decrypt(encryptedContactId)

    if (connectedUser['custom:companyId'] !== companyContactId) {
      logger(
        'Notifications Fetch',
        'all',
        'not the same company ID',
        JSON.stringify(connectedUser, null, 2)
      )
      throw 'The connected company is not the same as the notified one'
    }

    logger(
      'Notifications Fetch',
      'all',
      'read',
      'request',
      `Get Deal Infos By Id - DealId: ${dealId}`
    )

    const Deals = new DealsController(crmClient)
    const currentDeal = await Deals.getInfoById(dealId)
    const associatedContactsNumber =
      currentDeal.data.data.associated_contacts.items.length

    const deal = currentDeal.data.data

    logger(
      'Notifications Fetch',
      'all',
      'read',
      'request',
      `Get Deal Contact Infos By Id - DealId: ${deal.contact_id}`
    )

    const Contacts = new ContactsController(crmClient)
    const dealContactRequest = await Contacts.getInfoById(deal.contact_id)
    const dealContact = dealContactRequest.data.data

    logger('Notifications Fetch', 'all', 'end')

    return new ResponseFactory().build(
      {
        status: 200,
        data: {
          created_at: deal.created_at,
          associatedContacts: associatedContactsNumber,
          jobType: deal.custom_fields.jobType,
          jobTypeSpecific: deal.custom_fields.jobTypeSpecific,
          preferredContactMethod: deal.custom_fields.preferredContactMethod,
          preferredContactTime: deal.custom_fields.preferredContactTime,
          address: {
            city: dealContact.address.city,
            country: dealContact.address.country,
            postal_code: dealContact.address.postal_code.substr(0, 3),
            state: dealContact.address.state,
          },
        },
      },
      event.headers.origin
    )
  } catch (err) {
    logger('Notifications Fetch', 'generic', 'end', 'error')
    return new ErrorFactory().build(err, event.headers.origin)
  }
}

export const fetchEmittedDeals: APIGatewayProxyHandler = async event => {
  logger('Notifications Fetch Emitted Deals', 'all', 'begin')
  try {
    logger(
      'Notifications Fetch Emitted Deals',
      'all',
      'read',
      'Before Cognito Values'
    )
    const connectedUser = await cognitoIdentityClient.getUser(
      cognitoIdentityClient.getEventAuthValues(event)
    )
    logger(
      'Notifications Fetch Emitted Deals',
      'all',
      'read',
      'After Cognito Values',
      `ContactId ${connectedUser['custom:contactId']}, CompanyId ${
        connectedUser['custom:companyId']
        }`
    )

    const requestType = decodeURIComponent(event.pathParameters.requestType)

    if (connectedUser['custom:isActive'] === '0') {
      logger(
        'Notifications Fetch Emitted Deals',
        'all',
        'not active',
        JSON.stringify(connectedUser, null, 2)
      )
      throw 'The user is not active'
    }

    const connectedCompanyId = parseInt(connectedUser['custom:companyId'])
    const connectedContactId = parseInt(connectedUser['custom:contactId'])

    let deals = null
    let filterExpression = ''
    let notifications = null

    if (requestType === 'emitted') {
      logger(
        'Notifications Fetch Emitted Deals',
        'all',
        'read',
        'request',
        `Fetch All Unaccepted Notifications`
      )
      notifications = await dynamoDb.scan({
        TableName: process.env.NOTIFICATIONS_TABLE,
        FilterExpression:
          '#cie = :companyId and #contactId = :contactId and (#answer <> :answer and #answer <> :answer2)',
        ExpressionAttributeNames: {
          '#cie': 'companyId',
          '#contactId': 'contactId',
          '#answer': 'answer',
        },
        ExpressionAttributeValues: {
          ':companyId': connectedCompanyId,
          ':contactId': connectedContactId,
          ':answer': 'Accepted',
          ':answer2': 'Accepted but already owned',
        },
      })
    } else if (requestType === 'leads') {
      logger(
        'Notifications Fetch Emitted Deals',
        'all',
        'read',
        'request',
        `Fetch All Accepted Notifications`
      )
      notifications = await dynamoDb.scan({
        TableName: process.env.NOTIFICATIONS_TABLE,
        FilterExpression:
          '#cie = :companyId and (#answer = :answer or #answer = :answer2)',
        ExpressionAttributeNames: {
          '#cie': 'companyId',
          '#answer': 'answer',
        },
        ExpressionAttributeValues: {
          ':companyId': connectedCompanyId,
          ':answer': 'Accepted',
          ':answer2': 'Accepted but already owned',
        },
      })
    } else {
      logger(
        'Notifications Fetch Emitted Deals',
        'all',
        'wrong request',
        JSON.stringify(connectedUser, null, 2)
      )
      throw 'wrong request'
    }

    // @TODO: Voir pour pagination

    if (notifications.Items.length > 0) {
      logger(
        'Notifications Fetch Emitted Deals',
        'all',
        'read',
        'request',
        'Get All Deals Infos'
      )
      const dealsKeys = notifications.Items.map(notification => ({
        dealId: notification.dealId,
        dealInfosId: notification.dealInfosId,
      }))
      console.log('dealsKeys', JSON.stringify(dealsKeys))

      const requestItemsObj = {
        RequestItems: {},
      }
      requestItemsObj.RequestItems[process.env.DEALINFOS_TABLE] = {
        Keys: _.uniqWith(dealsKeys, _.isEqual),
      }

      deals = await dynamoDb.batchGet(requestItemsObj)
    }

    logger(
      'Notifications Fetch Emitted Deals',
      'all',
      'read',
      'transformation',
      'Transform all opportunities'
    )

    const opportunitiesTransformer = new DealsNotificationsTransformer()
    const opportunitiesResponse = opportunitiesTransformer.transformResponseData(
      {
        notifications,
        deals,
      },
      requestType
    )

    logger('Notifications Fetch Emitted Deals', 'all', 'end')

    return new ResponseFactory().build(
      {
        status: 200,
        data: {
          opportunities: opportunitiesResponse,
        },
      },
      event.headers.origin
    )
  } catch (err) {
    logger('Notifications Fetch Emitted Deals', 'generic', 'end', 'error')
    return new ErrorFactory().build(err, event.headers.origin)
  }
}

export const notifyContactCustomer: APIGatewayProxyHandler = async event => {
  try {
    const Contacts = new ContactsController(crmClient)
    const notifications = await dynamoDb.scan({
      TableName: process.env.NOTIFICATIONS_TABLE,
      FilterExpression:
        '(#answer = :answer or #answer = :answer2) and #firstContact = :firstContact',
      ExpressionAttributeNames: {
        '#answer': 'answer',
        '#firstContact': 'firstContact',
      },
      ExpressionAttributeValues: {
        ':answer': 'Accepted',
        ':answer2': 'Accepted but already owned',
        ':firstContact': 0,
      },
    })

    console.log('notifications scan')

    const dealsKeys = notifications.Items.map(notification => ({
      dealId: notification.dealId,
      dealInfosId: notification.dealInfosId,
    }))

    console.log('dealsKeys', dealsKeys)

    const requestItemsObj = {
      RequestItems: {},
    }
    requestItemsObj.RequestItems[process.env.DEALINFOS_TABLE] = {
      Keys: _.uniqWith(dealsKeys, _.isEqual),
    }

    const deals = await dynamoDb.batchGet(requestItemsObj)

    console.log('deals fetched')

    const opportunitiesTransformer = new DealsNotificationsTransformer()
    const opportunities = opportunitiesTransformer.transformResponseData(
      {
        notifications,
        deals,
      },
      'leads'
    )

    console.log('opportunities', opportunities)

    const getDayPart = () => {
      const timeOfTheDay = parseInt(moment().format('HH'))
      let dayPart = 'disabled'

      if (timeOfTheDay >= 9 && timeOfTheDay < 12) {
        dayPart = 'am'
      } else if (timeOfTheDay >= 12 && timeOfTheDay < 18) {
        dayPart = 'pm'
      } else if (timeOfTheDay >= 18 && timeOfTheDay < 22) {
        dayPart = 'evening'
      }

      return dayPart
    }

    console.log('getDayPart', getDayPart())

    const companyFetched = {}

    const promisesNotifications = opportunities.map((opportunity) => new Promise(async (resolve, reject) => {
      try {
        const contactTime = opportunity.deal.preferredContactTime.split(', ')
        const companyId = parseInt(cryptr.decrypt(opportunity.companyId))
        const dayPart = getDayPart()
        let companyContactsQuery = null


        if (Object.keys(companyFetched).indexOf(companyId) === -1) {
          companyContactsQuery = await Contacts.getInfoById(companyId)
          companyFetched[companyId] = companyContactsQuery
        } else {
          companyContactsQuery = companyFetched[companyId]
        }


        const company = companyContactsQuery.data.data
        const locale = company.custom_fields.locale

        if (contactTime.indexOf(dayPart) >= 0) {
          const companyContactsQuery = await Contacts.searchFor({
            contact_id: companyId,
            is_organization: false,
          })


          if (companyContactsQuery.data.items.length > 0) {
            let urlTo = ''

            if (locale === 'fr') {
              urlTo = process.env.CORS_ORIGIN_1
            } else {
              urlTo = process.env.CORS_ORIGIN_2
            }


            const bitlyLinkSMS = bitlyClient.shorten(
              `${urlTo}/lead/${opportunity.deal.dealInfosId}?t=sms`
            )
            const bitlyLinkWeb = bitlyClient.shorten(
              `${urlTo}/lead/${opportunity.deal.dealInfosId}?t=push-notif`
            )

            const bitlyPromises = await Promise.all([
              bitlyLinkSMS,
              bitlyLinkWeb,
            ])


            const SMSNotification = {
              fr: `* Opportunité à contacter *\n\n${opportunity.deal.dealInfosId}\n${opportunity.deal.firstName}, dans la ville de ${opportunity.deal.city}, a demandé à être contacté en ${(dayPart !== 'evening') ? dayPart : 'soirée'}\n\nAller sur la plateforme\n${bitlyPromises[0].url}`,
              en: `* Opportunity to contact *\n\n${opportunity.deal.dealInfosId}\n${opportunity.deal.firstName}, in the city of ${opportunity.deal.city}, want to be contacted in the ${dayPart}\n\nGo on the platform:\n${bitlyPromises[0].url}`,
            }
            const pushNotification = {
              fr: {
                title: 'Opportunité à contacter',
                message: `${opportunity.deal.firstName} veut être contacté en ${(dayPart !== 'evening') ? dayPart : 'soirée'}. Cliquez pour voir l'opportunité`,
                action: bitlyPromises[1].url,
              },
              en: {
                title: 'Opportunity to contact',
                message: `${opportunity.deal.firstName} want to be contact in ${(dayPart !== 'evening') ? dayPart : 'soirée'}. Click here to see the opportunity`,
                action: bitlyPromises[1].url,
              },
            }


            const notifPromises = companyContactsQuery.data.items.map(companyContact => new Promise((resolveNotif, rejectNotif) => {
              try {
                const companyContactInfos = companyContact.data

                const webNotif = twilioClient.sendNotification(companyContactInfos.id, pushNotification[locale].title, pushNotification[locale].message, pushNotification[locale].action)
                const sms = twilioClient.sendSMS(
                  phoneTransformer.transform('+15819991252' /*companyContactInfos.phone*/), SMSNotification[locale]
                )

                resolveNotif(Promise.all([
                  webNotif,
                  sms,
                ]))
              } catch (e) {
                rejectNotif(e)
              }
            }))

            resolve(notifPromises)
          }
        }
      } catch (e) {
        reject(e)
      }
    }))

    await Promise.all(promisesNotifications)

    return new ResponseFactory().build(
      {
        status: 200,
        data: {
          success: true,
        },
      },
      '*'
    )
  } catch (err) {
    logger('Notify Contact Customer', 'generic', 'end', 'error')
    return new ErrorFactory().build(err, '*')
  }
}
