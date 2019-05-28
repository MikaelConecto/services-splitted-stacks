import { APIGatewayProxyHandler } from 'aws-lambda'
import TwilioClient from '../../src/Clients/TwilioClient'

import ResponseFactory from '../../src/Factories/ResponseFactory'
import ErrorFactory from '../../src/Factories/ErrorFactory'
import CognitoServiceProviderClient from '../../src/Clients/CognitoServiceProviderClient'
import DynamoDBClient from '../../src/Clients/DynamoDBClient'
import BodyParserTransformer from '../../src/Transformers/BodyParserTransformer'

const twilioClient = new TwilioClient()

const dynamoDb = new DynamoDBClient()
const cognitoIdentityClient = new CognitoServiceProviderClient()

export const callRequester: APIGatewayProxyHandler = async event => {
  try {
    const connectedUser = await cognitoIdentityClient.getUser(
      cognitoIdentityClient.getEventAuthValues(event)
    )

    if (connectedUser['custom:isActive'] === '0') {
      throw 'The user is not active'
    }

    const connectedCompanyId = parseInt(connectedUser['custom:companyId'])
    const connectedContactId = parseInt(connectedUser['custom:contactId'])
    const parsedData = new BodyParserTransformer().transform(event.body)
    const dealInfosId = parsedData.dealInfosId
    const contractorPhoneNumber = parsedData.phoneNumber
    const callMessage = parsedData.message
    const language = parsedData.language

    if (!dealInfosId) {
      throw 'No deal infos ID provided'
    }
    if (!contractorPhoneNumber) {
      throw 'No phone number provided'
    }
    if (!callMessage) {
      throw 'No message provided'
    }
    if (language !== 'fr-CA' && language !== 'en-US') {
      throw 'No valid language provided'
    }

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
      throw 'Deal is not owned'
    }

    const call = await twilioClient.sendCallRedirection(
      contractorPhoneNumber,
      deal.Items[0].phone,
      callMessage,
      language
    )
    const dateNow = Date.now()

    await dynamoDb.update({
      TableName: process.env.NOTIFICATIONS_TABLE,
      Key: {
        id: `${connectedCompanyId}_${connectedContactId}_${
          deal.Items[0].dealId
          }`,
      },
      UpdateExpression:
        'SET firstContact = :firstContact, firstContactDate = :firstContactDate, firstContactMethod = :firstContactMethod, firstContactInfo = :firstContactInfo, updatedAt = :updatedAt',
      ConditionExpression: 'dealInfosId = :dealInfosId',
      ExpressionAttributeValues: {
        ':dealInfosId': deal.Items[0].dealInfosId,
        ':firstContact': 1,
        ':firstContactMethod': 'phone',
        ':firstContactInfo': call.sid,
        ':firstContactDate': dateNow,
        ':updatedAt': dateNow,
      },
      ReturnValues: 'ALL_NEW',
    })

    return new ResponseFactory().build({
      status: 200,
      data: {
        call,
      },
    })
  } catch (err) {
    return new ErrorFactory().build(err)
  }
}

export const test: APIGatewayProxyHandler = async event => {
  return new ResponseFactory().build({
    status: 200,
    data: process.env,
  }, event.headers.origin)
}