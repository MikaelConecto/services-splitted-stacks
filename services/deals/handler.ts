import { APIGatewayProxyHandler } from 'aws-lambda'
import Cryptr from 'cryptr'

import AxiosClient from '../../src/Clients/AxiosClient'

import DealsController from '../../src/Controllers/DealsController'
import ContactsController from '../../src/Controllers/ContactsController'

import ResponseFactory from '../../src/Factories/ResponseFactory'
import ErrorFactory from '../../src/Factories/ErrorFactory'

import CognitoServiceProviderClient from '../../src/Clients/CognitoServiceProviderClient'
import StripeClient from '../../src/Clients/StripeClient'
import DynamoDBClient from '../../src/Clients/DynamoDBClient'

const cryptr = new Cryptr(process.env.CRYPTR_SECRET_KEY)

import logger from '../../src/Helpers/logger'

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

export const onAcceptation: APIGatewayProxyHandler = async event => {
  logger('Deal On Acceptation', 'all', 'begin')
  try {
    logger('Deal On Acceptation', 'all', 'read', 'Before Cognito Values')
    const connectedUser = await cognitoIdentityClient.getUser(
      cognitoIdentityClient.getEventAuthValues(event)
    )
    logger(
      'Deal On Acceptation',
      'all',
      'read',
      'After Cognito Values',
      `ContactId ${connectedUser['custom:contactId']}, CompanyId ${
        connectedUser['custom:companyId']
        }`
    )

    if (connectedUser['custom:isActive'] === '0') {
      logger(
        'Deal On Acceptation',
        'all',
        'not active',
        JSON.stringify(connectedUser, null, 2)
      )
      throw 'The user is not active'
    }

    const connectedCompanyId = parseInt(connectedUser['custom:companyId'])
    const connectedContactId = parseInt(connectedUser['custom:contactId'])
    const encryptedDealId = decodeURIComponent(
      event.pathParameters.encryptedDealId
    )
    const encryptedContactId = decodeURIComponent(
      event.pathParameters.encryptedContactId
    )
    const dealId = parseInt(cryptr.decrypt(encryptedDealId))
    const companyContactId = parseInt(cryptr.decrypt(encryptedContactId))
    const answerType = event.pathParameters.answerType

    if (companyContactId !== connectedCompanyId) {
      logger(
        'Deal On Acceptation',
        'all',
        'not the same company ID',
        JSON.stringify(connectedUser, null, 2)
      )
      throw 'The connected company is not the same as the notified one'
    }

    logger(
      'Deal On Acceptation',
      'all',
      'read',
      'request',
      `Get Deal Info - DealId: ${dealId}`
    )

    const timeNow = Date.now()
    const Deals = new DealsController(crmClient)
    const currentDeal = await Deals.getInfoById(dealId)
    const associatedContactsNumber =
      currentDeal.data.data.associated_contacts.items.length
    const associatedContactsIds = currentDeal.data.data.associated_contacts.items.map(
      item => item.data.contact_id
    )
    let remainingSeats =
      parseInt(process.env.MAX_ASSOCIATED_CONTACTS) - associatedContactsNumber

    console.log('remainingSeats', remainingSeats)

    // Si la compagnie est déjà dans les contacts associés
    if (associatedContactsIds.indexOf(connectedCompanyId) !== -1) {
      logger(
        'Deal On Acceptation',
        'all',
        'update',
        'request',
        `Set Notification Answer: 'Accepted but already owned' - DealId: ${dealId}`
      )
      await dynamoDb.update({
        TableName: process.env.NOTIFICATIONS_TABLE,
        Key: {
          id: `${connectedCompanyId}_${connectedContactId}_${
            currentDeal.data.data.id
            }`,
        },
        UpdateExpression:
          'SET answer = :answer, answerType = :answerType, answeredBy = :answeredBy, answeredAt = :answeredAt, updatedAt = :updatedAt',
        ExpressionAttributeValues: {
          ':answer': 'Accepted but already owned',
          ':answerType': answerType,
          ':answeredBy': connectedUser.sub,
          ':answeredAt': timeNow,
          ':updatedAt': timeNow,
        },
        ReturnValues: 'ALL_NEW',
      })

      logger('Deal On Acceptation', 'all', 'end')

      return new ResponseFactory().build(
        {
          status: 200,
          data: {
            message: 'opportunity_already_owned',
          },
        },
        event.headers.origin
      )
    }

    // Si il n'y a plus de place disponible sur ce Deal
    if (remainingSeats === 0) {
      logger(
        'Deal On Acceptation',
        'all',
        'update',
        'request',
        `Set Notification Answer: 'Accepted too late' - DealId: ${dealId}`
      )
      await dynamoDb.update({
        TableName: process.env.NOTIFICATIONS_TABLE,
        Key: {
          id: `${connectedCompanyId}_${connectedContactId}_${
            currentDeal.data.data.id
            }`,
        },
        UpdateExpression:
          'SET answer = :answer, answerType = :answerType, answeredBy = :answeredBy, answeredAt = :answeredAt, updatedAt = :updatedAt',
        ExpressionAttributeValues: {
          ':answer': 'Accepted too late',
          ':answerType': answerType,
          ':answeredBy': connectedUser.sub,
          ':answeredAt': timeNow,
          ':updatedAt': timeNow,
        },
        ReturnValues: 'ALL_NEW',
      })

      logger('Deal On Acceptation', 'all', 'end')

      return new ResponseFactory().build(
        {
          status: 200,
          data: {
            message: 'opportunity_is_full',
          },
        },
        event.headers.origin
      )
    }

    if (remainingSeats > 0) {
      remainingSeats = remainingSeats - 1

      const Contacts = new ContactsController(crmClient)

      logger(
        'Deal On Acceptation',
        'all',
        'read',
        'request',
        `Get Company StripeCustomer and StripeSource`
      )

      const companyInfos = await Contacts.getInfoById(
        connectedUser['custom:companyId']
      )

      if (
        'stripeCustomer' in companyInfos.data.data.custom_fields &&
        'stripeSource' in companyInfos.data.data.custom_fields
      ) {
        logger(
          'Deal On Acceptation',
          'all',
          'write',
          'request',
          `Stripe Payment - Customer: ${
            companyInfos.data.data.custom_fields.stripeCustomer
            }, Cost: ${process.env.OPPORTUNITY_COST}, Title: ${currentDeal.data.data.id} - Conecto ${process.env.SERVICE_NAME} - ${currentDeal.data.data.name}`
        )
        const stripeClient = new StripeClient()
        const transaction = await stripeClient.chargeAmount(
          companyInfos.data.data.custom_fields.stripeCustomer,
          parseInt(process.env.OPPORTUNITY_COST),
          `${currentDeal.data.data.id} - Conecto ${process.env.SERVICE_NAME} - ${
            currentDeal.data.data.name
            }`
        )

        logger(
          'Deal On Acceptation',
          'all',
          'update',
          'request',
          `Set Notification Answer: Accepted`
        )
        const notificationUpdate = await dynamoDb.update({
          TableName: process.env.NOTIFICATIONS_TABLE,
          Key: {
            id: `${connectedCompanyId}_${connectedContactId}_${
              currentDeal.data.data.id
              }`,
          },
          UpdateExpression:
            'SET answer = :answer, answerType = :answerType, answeredBy = :answeredBy, transactionId = :transactionId, answeredAt = :answeredAt, updatedAt = :updatedAt',
          ExpressionAttributeValues: {
            ':answer': 'Accepted',
            ':answerType': answerType,
            ':answeredBy': connectedUser.sub,
            ':transactionId': transaction.id,
            ':answeredAt': timeNow,
            ':updatedAt': timeNow,
          },
          ReturnValues: 'ALL_NEW',
        })
        const notificationsToUpdate = () => new Promise(async (resolve, reject) => {
          try {
            const notifications = await dynamoDb.scan({
              TableName: process.env.NOTIFICATIONS_TABLE,
              FilterExpression:
                '#id <> :id and #dealId = :dealId and (#answer <> :answer and #answer <> :answer2) and #cie = :cie',
              ExpressionAttributeNames: {
                '#id': 'id',
                '#cie': 'companyId',
                '#answer': 'answer',
                '#dealId': 'dealId',
              },
              ExpressionAttributeValues: {
                ':id': `${connectedCompanyId}_${connectedContactId}_${
                  currentDeal.data.data.id
                  }`,
                ':answer': 'Accepted',
                ':answer2': 'Accepted but already owned',
                ':cie': connectedCompanyId,
                ':dealId': currentDeal.data.data.id,
              },
            })

            const updates = notifications.Items.map(async notification => await dynamoDb.update({
              TableName: process.env.NOTIFICATIONS_TABLE,
              Key: {
                id: `${connectedCompanyId}_${notification.contactId}_${
                  notification.dealId
                  }`,
              },
              UpdateExpression:
                'SET answer = :answer, answerType = :answerType, answeredBy = :answeredBy, transactionId = :transactionId, answeredAt = :answeredAt, updatedAt = :updatedAt',
              ExpressionAttributeValues: {
                ':answer': 'Accepted',
                ':answerType': 'colleague',
                ':answeredBy': connectedUser.sub,
                ':transactionId': transaction.id,
                ':answeredAt': timeNow,
                ':updatedAt': timeNow,
              },
              ReturnValues: 'ALL_NEW',
            }))

            Promise.all(updates).then((result) => {
              console.log(result)
              resolve(result)
            })
          } catch (e) {
            reject(e)
          }
        })

        await notificationsToUpdate()

        logger(
          'Deal On Acceptation',
          'all',
          'update',
          'request',
          `Change Deal Infos`
        )
        const dealInfosUpdate = dynamoDb.update({
          TableName: process.env.DEALINFOS_TABLE,
          Key: {
            dealId: currentDeal.data.data.id,
            dealInfosId: notificationUpdate.Attributes.dealInfosId,
          },
          UpdateExpression:
            'SET dealStatus = :dealStatus, remainingSeats = :remainingSeats, #seat = :companyId, updatedAt = :updatedAt',
          ExpressionAttributeValues: {
            ':dealStatus': remainingSeats > 0 ? 'In progress' : 'Full',
            ':remainingSeats': remainingSeats,
            ':companyId': connectedCompanyId,
            ':updatedAt': Date.now(),
          },
          ExpressionAttributeNames: {
            '#seat': `seat${associatedContactsNumber + 1}`,
          },
          ReturnValues: 'ALL_NEW',
        })

        logger(
          'Deal On Acceptation',
          'all',
          'update',
          'request',
          `Add Associated Contact - CompanyId: ${
            companyInfos.data.data.id
            }, DealId: ${dealId}`
        )
        const addAssociatedContact = Deals.addAssociatedContact(
          dealId,
          companyInfos.data.data.id
        )

        await Promise.all([dealInfosUpdate, addAssociatedContact])

        logger('Deal On Acceptation', 'all', 'end')

        return new ResponseFactory().build(
          {
            status: 200,
            data: {
              message: 'opportunity_is_accepted',
            },
          },
          event.headers.origin
        )
      } else {
        logger(
          'Deal On Acceptation',
          'all',
          'not payment set',
          JSON.stringify(connectedUser, null, 2)
        )
        throw 'no_payment_set'
      }
    }
  } catch (err) {
    logger('Deal On Acceptation', 'all', 'end', 'error')
    return new ErrorFactory().build(err, event.headers.origin)
  }
}

export const onRejection: APIGatewayProxyHandler = async event => {
  logger('Deal On Rejection', 'all', 'begin')
  try {
    logger('Deal On Rejection', 'all', 'read', 'Before Cognito Values')
    const connectedUser = await cognitoIdentityClient.getUser(
      cognitoIdentityClient.getEventAuthValues(event)
    )
    logger(
      'Deal On Rejection',
      'all',
      'read',
      'After Cognito Values',
      `ContactId ${connectedUser['custom:contactId']}, CompanyId ${
        connectedUser['custom:companyId']
        }`
    )

    if (connectedUser['custom:isActive'] === '0') {
      logger(
        'Deal On Rejection',
        'all',
        'not active',
        JSON.stringify(connectedUser, null, 2)
      )
      throw 'The user is not active'
    }

    const timeNow = Date.now()
    const connectedCompanyId = parseInt(connectedUser['custom:companyId'])
    const connectedContactId = parseInt(connectedUser['custom:contactId'])
    const encryptedDealId = decodeURIComponent(
      event.pathParameters.encryptedDealId
    )
    const encryptedContactId = decodeURIComponent(
      event.pathParameters.encryptedContactId
    )
    const dealId = parseInt(cryptr.decrypt(encryptedDealId))
    const companyContactId = parseInt(cryptr.decrypt(encryptedContactId))
    const answerType = event.pathParameters.answerType

    console.log('companyContactId', companyContactId)

    if (companyContactId !== connectedCompanyId) {
      logger(
        'Deal On Rejection',
        'all',
        'not the same company ID',
        JSON.stringify(connectedUser, null, 2)
      )
      throw 'The connected company is not the same as the notified one'
    }

    logger(
      'Deal On Rejection',
      'all',
      'read',
      'request',
      `Get Deal Info - DealId: ${dealId}`
    )
    const Deals = new DealsController(crmClient)
    const currentDeal = await Deals.getInfoById(dealId)
    const associatedContactsIds = currentDeal.data.data.associated_contacts.items.map(
      item => item.data.contact_id
    )

    // Si la compagnie est déjà dans les contacts associés
    if (associatedContactsIds.indexOf(connectedCompanyId) !== -1) {
      logger(
        'Deal On Rejection',
        'all',
        'update',
        'request',
        `Set Notification Answer: Rejected but already owned`
      )
      await dynamoDb.update({
        TableName: process.env.NOTIFICATIONS_TABLE,
        Key: {
          id: `${connectedCompanyId}_${connectedContactId}_${
            currentDeal.data.data.id
            }`,
        },
        UpdateExpression:
          'SET answer = :answer, answerType = :answerType, answeredBy = :answeredBy, answeredAt = :answeredAt, updatedAt = :updatedAt',
        ExpressionAttributeValues: {
          ':answer': 'Rejected but already owned',
          ':answerType': answerType,
          ':answeredBy': connectedUser.sub,
          ':answeredAt': timeNow,
          ':updatedAt': timeNow,
        },
        ReturnValues: 'ALL_NEW',
      })

      logger('Deal On Rejection', 'all', 'end')

      return new ResponseFactory().build(
        {
          status: 200,
          data: {
            message: 'rejected_opportunity_already_owned',
          },
        },
        event.headers.origin
      )
    } else {
      logger(
        'Deal On Rejection',
        'all',
        'update',
        'request',
        `Set Notification Answer: Rejected`
      )
      await dynamoDb.update({
        TableName: process.env.NOTIFICATIONS_TABLE,
        Key: {
          id: `${connectedCompanyId}_${connectedContactId}_${
            currentDeal.data.data.id
            }`,
        },
        UpdateExpression:
          'SET answer = :answer, answerType = :answerType, answeredBy = :answeredBy, answeredAt = :answeredAt, updatedAt = :updatedAt',
        ExpressionAttributeValues: {
          ':answer': 'Rejected',
          ':answerType': answerType,
          ':answeredBy': connectedUser.sub,
          ':answeredAt': timeNow,
          ':updatedAt': timeNow,
        },
        ReturnValues: 'ALL_NEW',
      })

      logger('Deal On Rejection', 'all', 'end')

      return new ResponseFactory().build(
        {
          status: 200,
          data: {
            message: 'rejected_opportunity',
          },
        },
        event.headers.origin
      )
    }
  } catch (err) {
    logger('Deal On Rejection', 'all', 'end', 'error')
    return new ErrorFactory().build(err, event.headers.origin)
  }
}

export const fetchAcceptedInfos: APIGatewayProxyHandler = async event => {
  logger('Deal Fetch Accepted Infos', 'all', 'begin')
  try {
    logger('Deal Fetch Accepted Infos', 'all', 'read', 'Before Cognito Values')
    const connectedUser = await cognitoIdentityClient.getUser(
      cognitoIdentityClient.getEventAuthValues(event)
    )
    logger(
      'Deal Fetch Accepted Infos',
      'all',
      'read',
      'After Cognito Values',
      `ContactId ${connectedUser['custom:contactId']}, CompanyId ${
        connectedUser['custom:companyId']
        }`
    )

    if (connectedUser['custom:isActive'] === '0') {
      logger(
        'Deal Fetch Accepted Infos',
        'all',
        'not active',
        JSON.stringify(connectedUser, null, 2)
      )
      throw 'The user is not active'
    }

    const connectedCompanyId = parseInt(connectedUser['custom:companyId'])
    const dealInfosId = decodeURIComponent(event.pathParameters.dealInfosId)

    logger(
      'Deal Fetch Accepted Infos',
      'all',
      'read',
      'request',
      `Get Accepted Deal - DealInfosId: ${dealInfosId}`
    )

    const deal = await dynamoDb.scan({
      TableName: process.env.DEALINFOS_TABLE,
      FilterExpression: '#dealInfosId = :dealInfosId',
      ExpressionAttributeNames: {
        '#dealInfosId': 'dealInfosId',
      },
      ExpressionAttributeValues: {
        ':dealInfosId': dealInfosId,
      },
    })
    const maxContacts = parseInt(process.env.MAX_ASSOCIATED_CONTACTS)
    let dealIsOwned = false

    if (deal.Count === 1) {
      for (let i = 1; i <= maxContacts; i++) {
        if (deal.Items[0][`seat${i}`] === connectedCompanyId) {
          dealIsOwned = true
        } else {
          delete deal.Items[0][`seat${i}`]
        }
      }
    }

    if (dealIsOwned === false) {
      logger(
        'Deal Fetch Accepted Infos',
        'all',
        'not owned',
        JSON.stringify(connectedUser, null, 2)
      )
      return new ResponseFactory().build(
        {
          status: 400,
          data: {
            message: 'deal_not_owned',
          },
        },
        event.headers.origin
      )
    }

    logger('Deal Fetch Accepted Infos', 'all', 'end')

    return new ResponseFactory().build(
      {
        status: 200,
        data: {
          ...deal.Items[0],
          dealContactId: cryptr.encrypt(deal.Items[0].dealContactId),
        },
      },
      event.headers.origin
    )
  } catch (err) {
    logger('Deal Fetch Accepted Infos', 'all', 'end', 'error')
    return new ErrorFactory().build(err, event.headers.origin)
  }
}

export const fetchEncryptedOpportunity: APIGatewayProxyHandler = async event => {
  logger('Deal Fetch Encrypted Opportunity', 'all', 'begin')
  try {
    logger(
      'Deal Fetch Encrypted Opportunity',
      'all',
      'read',
      'Before Cognito Values'
    )
    const connectedUser = await cognitoIdentityClient.getUser(
      cognitoIdentityClient.getEventAuthValues(event)
    )
    logger(
      'Deal Fetch Encrypted Opportunity',
      'all',
      'read',
      'After Cognito Values',
      `ContactId ${connectedUser['custom:contactId']}, CompanyId ${
        connectedUser['custom:companyId']
        }`
    )

    if (connectedUser['custom:isActive'] === '0') {
      logger(
        'Deal Fetch Encrypted Opportunity',
        'all',
        'not active',
        JSON.stringify(connectedUser, null, 2)
      )
      throw 'The user is not active'
    }

    const connectedCompanyId = parseInt(connectedUser['custom:companyId'])
    const connectedContactId = parseInt(connectedUser['custom:contactId'])
    const encryptedCompanyId = cryptr.encrypt(connectedUser['custom:companyId'])
    const encryptedDealId = decodeURIComponent(
      event.pathParameters.encryptedDealId
    )
    const encryptedContactId = decodeURIComponent(
      event.pathParameters.encryptedContactId
    )
    const dealId = parseInt(cryptr.decrypt(encryptedDealId))
    const companyContactId = parseInt(cryptr.decrypt(encryptedContactId))

    if (connectedCompanyId !== companyContactId) {
      logger(
        'Deal Fetch Encrypted Opportunity',
        'all',
        'not the same company ID',
        JSON.stringify(connectedUser, null, 2)
      )
      throw 'The connected company is not the same as the notified one'
    }

    logger(
      'Deal Fetch Encrypted Opportunity',
      'all',
      'read',
      'request',
      `Fetch Notification - ContactId: ${connectedContactId}, DealId: ${dealId}`
    )

    const notification = await dynamoDb.query({
      TableName: process.env.NOTIFICATIONS_TABLE,
      KeyConditionExpression: '#id = :id',
      ExpressionAttributeNames: {
        '#id': 'id',
      },
      ExpressionAttributeValues: {
        ':id': `${connectedCompanyId}_${connectedContactId}_${dealId}`,
      },
    })

    logger(
      'Deal Fetch Encrypted Opportunity',
      'all',
      'read',
      'request',
      `Fetch Deal - DealId: ${notification.Items[0].dealId}, DealInfosId: ${
        notification.Items[0].dealInfosId
        }`
    )

    const deal = await dynamoDb.query({
      TableName: process.env.DEALINFOS_TABLE,
      KeyConditionExpression: 'dealId = :dealId and dealInfosId = :dealInfosId',
      ExpressionAttributeValues: {
        ':dealId': notification.Items[0].dealId,
        ':dealInfosId': notification.Items[0].dealInfosId,
      },
    })

    const maxContacts = parseInt(process.env.MAX_ASSOCIATED_CONTACTS)
    let dealIsAccepted = false

    for (let i = 1; i <= maxContacts; i++) {
      if (
        typeof deal.Items[0][`seat${i}`] !== 'undefined' &&
        deal.Items[0][`seat${i}`] === connectedCompanyId
      ) {
        dealIsAccepted = true
      }
    }

    logger('Deal Fetch Encrypted Opportunity', 'all', 'end')

    return new ResponseFactory().build(
      {
        status: 200,
        data: {
          companyId: encryptedCompanyId,
          contactId: encryptedContactId,
          dealId: encryptedDealId,
          dealInfosId: notification.Items[0].dealInfosId,
          answer: notification.Items[0].answer,
          deal: {
            dealId: encryptedDealId,
            dealContactId: cryptr.encrypt(deal.Items[0].dealContactId),
            accepted: dealIsAccepted,
            dealStatus: deal.Items[0].dealStatus,
            preferredContactMethod: deal.Items[0].preferredContactMethod,
            remainingSeats: deal.Items[0].remainingSeats,
            postal_code: deal.Items[0].postal_code.substr(0, 3) + ' ***',
            city: deal.Items[0].city,
            state: deal.Items[0].state,
            jobType: deal.Items[0].jobType,
            jobTypeSpecific: deal.Items[0].jobTypeSpecific,
            latitude: deal.Items[0].latitude,
            longitude: deal.Items[0].longitude,
            companiesNotified: deal.Items[0].companiesNotified,
            createdAt: deal.Items[0].createdAt,
            updatedAt: deal.Items[0].updatedAt,
          },
        },
      },
      event.headers.origin
    )
  } catch (err) {
    logger('Deal Fetch Encrypted Opportunity', 'all', 'end', 'error')
    return new ErrorFactory().build(err, event.headers.origin)
  }
}
