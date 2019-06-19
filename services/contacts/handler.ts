import { APIGatewayProxyHandler } from 'aws-lambda'
import Cryptr from 'cryptr'
import nanoidGenerate from 'nanoid/generate'

import AxiosClient from '../../src/Clients/AxiosClient'
import StripeClient from '../../src/Clients/StripeClient'
import DynamoDBClient from '../../src/Clients/DynamoDBClient'
import TwilioClient from '../../src/Clients/TwilioClient'

import DataValidator from '../../src/Validators/DataValidator'
import ContactCreationSchema from '../../src/ValidationSchemas/ContactCreationSchema'
import ContactFastCreationSchema from '../../src/ValidationSchemas/ContactFastCreationSchema'
import ContactAddUserSchema from '../../src/ValidationSchemas/ContactAddUserSchema'
import ContactUpdateSchema from '../../src/ValidationSchemas/ContactUpdateSchema'

import BodyParserTransformer from '../../src/Transformers/BodyParserTransformer'
import ContactCreationTransformer from '../../src/Transformers/ContactCreationTransformer'
import ContactAddUserTransformer from '../../src/Transformers/ContactAddUserTransformer'

import ContactsController from '../../src/Controllers/ContactsController'

import ResponseFactory from '../../src/Factories/ResponseFactory'
import ErrorFactory from '../../src/Factories/ErrorFactory'
import MailchimpContactCreationTransformer from '../../src/Transformers/MailchimpContactCreationTransformer'
import MailchimpContactAddUserTransformer from '../../src/Transformers/MailchimpContactAddUserTransformer'
import MailingController from '../../src/Controllers/MailingController'
import CognitoServiceProviderClient from '../../src/Clients/CognitoServiceProviderClient'
import ContactAndOrganizationTransformer from '../../src/Transformers/ContactAndOrganizationTransformer'
import PhoneNumberTransformer from '../../src/Transformers/PhoneNumberTransformer'

import logger from '../../src/Helpers/logger'


const twilioClient = new TwilioClient()

const contactsClient = new AxiosClient({
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
const cryptr = new Cryptr(process.env.CRYPTR_SECRET_KEY)


export const creation: APIGatewayProxyHandler = async event => {
  logger('Contractor Creation', 'generic', 'begin')
  try {
    const parsedData = new BodyParserTransformer().transform(event.body)
    logger(
      'Contractor Creation',
      'generic',
      'before',
      'request',
      `Entry for ${parsedData.companyName}, ${parsedData.firstname} ${
        parsedData.lastname
        }, phone: ${parsedData.tel}, email: ${parsedData.email}`
    )

    const validator = new DataValidator(ContactCreationSchema)
    const contactTransformer = new ContactCreationTransformer([
      'companyName',
      'companyAddress',
      'companyCity',
      'companyPostalCode',
      'companyLatitude',
      'companyLongitude',
      'firstname',
      'lastname',
      'tel',
      'email',
      'rbq',
      'neq',
      'cognitoSub',
      'subscribeEmail',
      'locale',
    ])

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

    if (parsedData.companyAddress !== null && parsedData.companyAddress.indexOf(parsedData.companyNumber) >= 0) {
      parsedData.companyAddress = parsedData.companyAddress.replace(parsedData.companyNumber, '')
    }

    const Contacts = new ContactsController(
      contactsClient,
      contactTransformer,
      validator
    )
    const contact = await Contacts.create(parsedData)
    const mailchimpTransformer = new MailchimpContactCreationTransformer()

    logger(
      'Contractor Creation',
      'generic',
      'write',
      'creation',
      'Mailchimp Subscription'
    )
    const Mailing = new MailingController(
      mailchimpClient,
      (contact.data.company.custom_fields.locale === 'fr') ? process.env.MAILCHIMP_ENTREPRENEUR_LIST_ID : process.env.MAILCHIMP_CONTRACTOR_LIST_ID,
      mailchimpTransformer
    )
    const emailIsSubscribed = await Mailing.getSubscriptionStatus(
      contact.data.company.email
    )

    logger(
      'Contractor Creation',
      'generic',
      'read',
      'request',
      `MailChimp User is subscribed: ${emailIsSubscribed}`
    )

    if (!emailIsSubscribed) {
      await Mailing.subscribe(contact)
      logger(
        'Contractor Creation',
        'generic',
        'write',
        'request',
        'After MailChimp subscription'
      )
      if (contact.data.company.custom_fields.subscribeEmail) {
        const MailingNewsletter = new MailingController(
          mailchimpClient,
          (contact.data.company.custom_fields.locale === 'fr') ? process.env.MAILCHIMP_ENTREPRENEUR_NEWSLETTER_LIST_ID : process.env.MAILCHIMP_CONTRACTOR_NEWSLETTER_LIST_ID,
          mailchimpTransformer
        )

        const emailIsSubscribedNewsletter = await MailingNewsletter.getSubscriptionStatus(
          contact.data.company.email
        )

        logger(
          'Contractor Creation',
          'generic',
          'read',
          'request',
          `MailChimp User Newsletter is subscribed: ${emailIsSubscribedNewsletter}`
        )

        if (!emailIsSubscribedNewsletter) {
          await MailingNewsletter.subscribe(contact)
          logger(
            'Contractor Creation',
            'generic',
            'write',
            'request',
            'After MailChimp Newsletter subscription'
          )
        }
      }
    }

    // Score creation
    const dateNow = Date.now()
    const addressUUID = nanoidGenerate(
      '1234567890abcdefghijklmnopqrstuvwxyz',
      10
    )
    logger(
      'Contractor Creation',
      'generic',
      'write',
      'generation',
      `Address Unique ID ${addressUUID}`
    )

    logger(
      'Contractor Creation',
      'generic',
      'write',
      'creation',
      'Company Score'
    )
    const companyScore = dynamoDb.put({
      TableName: process.env.COMPANYSCORE_TABLE,
      Item: {
        companyId: contact.data.company.id,
        score: 0,
        isActive: 1,
        createdAt: dateNow,
        updatedAt: dateNow,
      },
    })
    logger(
      'Contractor Creation',
      'generic',
      'write',
      'creation',
      'Contact Score'
    )
    const contactScore = dynamoDb.put({
      TableName: process.env.CONTACTSCORE_TABLE,
      Item: {
        userId: parsedData.cognitoSub,
        companyId: contact.data.company.id,
        contactId: contact.data.contact.id,
        score: 0,
        isActive: 1,
        createdAt: dateNow,
        updatedAt: dateNow,
      },
    })
    logger(
      'Contractor Creation',
      'generic',
      'write',
      'creation',
      'Company Address'
    )
    const companyAddress = dynamoDb.put({
      TableName: process.env.COMPANYADDRESSES_TABLE,
      Item: {
        userId: parsedData.cognitoSub,
        companyId: contact.data.company.id,
        addressId: addressUUID,
        number: parsedData.companyNumber,
        address: parsedData.companyAddress,
        city: contact.data.company.address.city,
        postal_code: contact.data.company.address.postal_code,
        state: contact.data.company.address.state,
        country: contact.data.company.address.country,
        latitude: parsedData.companyLatitude,
        longitude: parsedData.companyLongitude,
        radius: process.env.BASE_ADDRESS_RADIUS,
        isActive: 1,
        createdAt: dateNow,
        updatedAt: dateNow,
      },
    })
    logger(
      'Contractor Creation',
      'generic',
      'write',
      'creation',
      'Contact Addresses Assignement'
    )
    const contactAddressAssignements = dynamoDb.put({
      TableName: process.env.CONTACTADDRESSASSIGNMENTS_TABLE,
      Item: {
        userId: parsedData.cognitoSub,
        companyId: contact.data.company.id,
        addressId: addressUUID,
        contactId: contact.data.contact.id,
        isActive: 1,
        createdAt: dateNow,
        updatedAt: dateNow,
      },
    })
    logger(
      'Contractor Creation',
      'generic',
      'update',
      'request',
      'Cognito User'
    )

    const updateUser = cognitoIdentityClient.updateUserAttributes(
      {
        cognitoSub: parsedData.cognitoSub,
        userPoolId: process.env.USER_POOL,
      },
      {
        'custom:contactId': contact.data.contact.id,
        'custom:companyId': contact.data.company.id,
        'custom:isAdmin': 1,
        'custom:isActive': 1,
      }
    )

    logger(
      'Contractor Creation',
      'generic',
      'read',
      'request',
      'Active compagnies'
    )

    const companiesWithScores = await dynamoDb.scan({
      TableName: process.env.COMPANYSCORE_TABLE,
      ProjectionExpression: 'companyId, isActive',
    })
    const activeCompanies = companiesWithScores.Items.filter(
      company => company.isActive === 1
    ).map(company => company.companyId)

    logger(
      'Contractor Creation',
      'generic',
      'write',
      'request',
      'Initial stats'
    )

    const statQuery = dynamoDb.put({
      TableName: process.env.COMPANY_STATS_TABLE,
      Item: {
        companyId: parseInt(contact.data.company.id),
        timestamp: dateNow,
        firstContactAverage: 0,
        acceptationDelayAverage: 0,
        opportunitiesCount: 0,
        competitorCount: (activeCompanies.length > 0) ? activeCompanies.length - 1 : 0,
        percentAcceptation: 0,
      },
    })

    await Promise.all([
      contactAddressAssignements,
      companyAddress,
      updateUser,
      companyScore,
      contactScore,
      statQuery,
    ])

    logger('Contractor Creation', 'generic', 'end')
    return new ResponseFactory().build(contact, event.headers.origin)
  } catch (err) {
    logger('Contractor Creation', 'generic', 'end', 'error')
    return new ErrorFactory().build(err, event.headers.origin)
  }
}

export const fastCreation: APIGatewayProxyHandler = async event => {
  logger('Contractor FAST Creation', 'generic', 'begin')
  try {
    const parsedData = new BodyParserTransformer().transform(event.body)
    logger(
      'Contractor FAST Creation',
      'generic',
      'before',
      'request',
      `Entry for ${parsedData.companyName}, ${parsedData.firstname} ${
        parsedData.lastname
        }, phone: ${parsedData.tel}, email: ${parsedData.email}`
    )

    const validator = new DataValidator(ContactFastCreationSchema)
    const contactTransformer = new ContactCreationTransformer([
      'companyName',
      'companyAddress',
      'companyCity',
      'companyPostalCode',
      'companyLatitude',
      'companyLongitude',
      'firstname',
      'lastname',
      'tel',
      'email',
    ])

    if (parsedData.companyAddress !== null && parsedData.companyAddress.indexOf(parsedData.companyNumber) >= 0) {
      parsedData.companyAddress = parsedData.companyAddress.replace(parsedData.companyNumber, '')
    }

    const congitoUser = await cognitoIdentityClient.createUser(parsedData)

    parsedData.cognitoSub = congitoUser.User.Username
    parsedData.byFastTrack = 1

    const Contacts = new ContactsController(
      contactsClient,
      contactTransformer,
      validator
    )
    const contact = await Contacts.create(parsedData)

    // Score creation
    const dateNow = Date.now()
    const addressUUID = nanoidGenerate(
      '1234567890abcdefghijklmnopqrstuvwxyz',
      10
    )

    const companyScore = dynamoDb.put({
      TableName: process.env.COMPANYSCORE_TABLE,
      Item: {
        companyId: contact.data.company.id,
        score: 0,
        isActive: 1,
        createdAt: dateNow,
        updatedAt: dateNow,
      },
    })

    const contactScore = dynamoDb.put({
      TableName: process.env.CONTACTSCORE_TABLE,
      Item: {
        userId: parsedData.cognitoSub,
        companyId: contact.data.company.id,
        contactId: contact.data.contact.id,
        score: 0,
        isActive: 1,
        createdAt: dateNow,
        updatedAt: dateNow,
      },
    })
    logger(
      'Contractor Creation',
      'generic',
      'write',
      'creation',
      'Company Address'
    )
    const companyAddress = dynamoDb.put({
      TableName: process.env.COMPANYADDRESSES_TABLE,
      Item: {
        userId: parsedData.cognitoSub,
        companyId: contact.data.company.id,
        addressId: addressUUID,
        number: parsedData.companyNumber,
        address: parsedData.companyAddress,
        city: contact.data.company.address.city,
        postal_code: contact.data.company.address.postal_code,
        state: contact.data.company.address.state,
        country: contact.data.company.address.country,
        latitude: parsedData.companyLatitude,
        longitude: parsedData.companyLongitude,
        radius: process.env.BASE_ADDRESS_RADIUS,
        isActive: 1,
        createdAt: dateNow,
        updatedAt: dateNow,
      },
    })
    logger(
      'Contractor Creation',
      'generic',
      'write',
      'creation',
      'Contact Addresses Assignement'
    )
    const contactAddressAssignements = dynamoDb.put({
      TableName: process.env.CONTACTADDRESSASSIGNMENTS_TABLE,
      Item: {
        userId: parsedData.cognitoSub,
        companyId: contact.data.company.id,
        addressId: addressUUID,
        contactId: contact.data.contact.id,
        isActive: 1,
        createdAt: dateNow,
        updatedAt: dateNow,
      },
    })
    logger(
      'Contractor Creation',
      'generic',
      'update',
      'request',
      'Cognito User'
    )

    const updateUser = cognitoIdentityClient.updateUserAttributes(
      {
        cognitoSub: parsedData.cognitoSub,
        userPoolId: process.env.USER_POOL,
      },
      {
        'custom:contactId': contact.data.contact.id,
        'custom:companyId': contact.data.company.id,
        'custom:isAdmin': 1,
        'custom:isActive': 1,
      }
    )

    logger(
      'Contractor Creation',
      'generic',
      'read',
      'request',
      'Active compagnies'
    )

    const companiesWithScores = await dynamoDb.scan({
      TableName: process.env.COMPANYSCORE_TABLE,
      ProjectionExpression: 'companyId, isActive',
    })
    const activeCompanies = companiesWithScores.Items.filter(
      company => company.isActive === 1
    ).map(company => company.companyId)

    logger(
      'Contractor Creation',
      'generic',
      'write',
      'request',
      'Initial stats'
    )

    const statQuery = dynamoDb.put({
      TableName: process.env.COMPANY_STATS_TABLE,
      Item: {
        companyId: parseInt(contact.data.company.id),
        timestamp: dateNow,
        firstContactAverage: 0,
        acceptationDelayAverage: 0,
        opportunitiesCount: 0,
        competitorCount: (activeCompanies.length > 0) ? activeCompanies.length - 1 : 0,
        percentAcceptation: 0,
      },
    })

    await Promise.all([
      contactAddressAssignements,
      companyAddress,
      updateUser,
      companyScore,
      contactScore,
      statQuery,
    ])

    logger('Contractor Creation', 'generic', 'end')
    return new ResponseFactory().build(contact, event.headers.origin)
  } catch (err) {
    logger('Contractor Creation', 'generic', 'end', 'error')
    return new ErrorFactory().build(err, event.headers.origin)
  }
}

export const resendFastCreation: APIGatewayProxyHandler = async event => {
  try {
    const parsedData = new BodyParserTransformer().transform(event.body)

    if (typeof parsedData.email === 'undefined') {
      throw 'Must specify an email address'
    }

    const cognitoUser = await cognitoIdentityClient.resendUserPassword(parsedData)

    return new ResponseFactory().build({
      status: 200,
      data: cognitoUser,
    }, event.headers.origin)
  } catch (err) {
    logger('Contractor Creation', 'generic', 'end', 'error')
    return new ErrorFactory().build(err, event.headers.origin)
  }
}

export const addUser: APIGatewayProxyHandler = async event => {
  logger('Contractor Add User', 'all', 'begin')
  try {
    logger('Contractor Add User', 'all', 'read', 'Before Cognito Values')

    const connectedUser = await cognitoIdentityClient.getUser(
      cognitoIdentityClient.getEventAuthValues(event)
    )

    logger(
      'Contractor Add User',
      'all',
      'read',
      'After Cognito Values',
      `ContactId ${connectedUser['custom:contactId']}, CompanyId ${
        connectedUser['custom:companyId']
        }`
    )

    if (connectedUser['custom:isActive'] === '0') {
      logger(
        'Contractor Add User',
        'all',
        'not active',
        JSON.stringify(connectedUser, null, 2)
      )
      throw 'The user is not active'
    }

    const parsedData = new BodyParserTransformer().transform(event.body)
    logger(
      'Contractor Add User',
      'all',
      'before',
      `Entry for ${parsedData.firstName}, ${parsedData.lastName}, phone: ${
        parsedData.tel
        }, email: ${parsedData.email} in company ${
        connectedUser['custom:companyId']
        }`
    )

    const validator = new DataValidator(ContactAddUserSchema)
    const contactTransformer = new ContactAddUserTransformer([
      'firstName',
      'lastName',
      'tel',
      'username',
      'cognitoSub',
    ])

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

    parsedData.companyId = parseInt(connectedUser['custom:companyId'])

    const Contacts = new ContactsController(
      contactsClient,
      contactTransformer,
      validator
    )
    const contact = await Contacts.addUser(parsedData)

    const mailchimpTransformer = new MailchimpContactAddUserTransformer()
    const Mailing = new MailingController(
      mailchimpClient,
      process.env.MAILCHIMP_CUSTOMER_LIST_ID,
      mailchimpTransformer
    )

    logger(
      'Contractor Add User',
      'all',
      'write',
      'creation',
      'Mailchimp Subscription'
    )

    const emailIsSubscribed = await Mailing.getSubscriptionStatus(
      contact.data.email
    )
    let mailchimpRequest = null

    if (!emailIsSubscribed) {
      mailchimpRequest = Mailing.subscribe(contact)

      logger(
        'Contractor Add User',
        'generic',
        'write',
        'request',
        'After MailChimp subscription'
      )
    }

    logger('Contractor Add User', 'all', 'write', 'creation', 'Contact Score')

    const dateNow = Date.now()
    const contactScore = dynamoDb.put({
      TableName: process.env.CONTACTSCORE_TABLE,
      Item: {
        userId: parsedData.cognitoSub,
        companyId: parseInt(connectedUser['custom:companyId']),
        contactId: parseInt(contact.data.id),
        score: 0,
        isActive: 1,
        createdAt: dateNow,
        updatedAt: dateNow,
      },
    })

    logger('Contractor Add User', 'all', 'update', 'request', 'Cognito User')
    const updateUser = cognitoIdentityClient.updateUserAttributes(
      {
        cognitoSub: parsedData.cognitoSub,
        userPoolId: process.env.USER_POOL,
      },
      {
        'custom:contactId': contact.data.id,
        'custom:companyId': connectedUser['custom:companyId'],
        'custom:isActive': 1,
        'custom:isAdmin': 0,
      }
    )
    await Promise.all([mailchimpRequest, updateUser, contactScore])

    logger('Contractor Add User', 'all', 'end')

    return new ResponseFactory().build(contact, event.headers.origin)
  } catch (err) {
    logger('Contractor Creation', 'all', 'end', 'error')
    return new ErrorFactory().build(err, event.headers.origin)
  }
}

export const fetch: APIGatewayProxyHandler = async event => {
  logger('Contractor Fetch Contacts', 'all', 'begin')
  try {
    logger('Contractor Fetch Contacts', 'all', 'read', 'Before Cognito Values')

    const connectedUser = await cognitoIdentityClient.getUser(
      cognitoIdentityClient.getEventAuthValues(event)
    )

    logger(
      'Contractor Fetch Contacts',
      'all',
      'read',
      'After Cognito Values',
      `ContactId ${connectedUser['custom:contactId']}, CompanyId ${
        connectedUser['custom:companyId']
        }`
    )

    logger('Contractor Fetch Contacts', 'all', 'before', 'request')

    if (connectedUser['custom:isActive'] === '0') {
      logger(
        'Contractor Fetch Contacts',
        'all',
        'not active',
        '',
        JSON.stringify(connectedUser, null, 2)
      )

      throw 'The user is not active'
    }

    logger(
      'Contractor Fetch Contacts',
      'all',
      'read',
      'request',
      `Before getContactAndOrganizationByIds - company id ${
        connectedUser['custom:companyId']
        }, contact id ${connectedUser['custom:contactId']}`
    )

    const transformer = new ContactAndOrganizationTransformer()
    const Contacts = new ContactsController(contactsClient, transformer)

    const contact = await Contacts.getContactAndOrganizationByIds(
      connectedUser['custom:contactId'],
      connectedUser['custom:companyId']
    )

    logger(
      'Contractor Fetch Contacts',
      'all',
      'read',
      'request',
      `After getContactAndOrganizationByIds`
    )

    contact.data.contact.id = cryptr.encrypt(contact.data.contact.id)
    contact.data.organization.id = cryptr.encrypt(contact.data.organization.id)

    if (
      contact.data.organization.custom_fields.hasOwnProperty('stripeCustomer')
    ) {
      logger(
        'Contractor Fetch Contacts',
        'all',
        'read',
        'request',
        `Before Stripe Fetch Customer`
      )
      const stripeClient = new StripeClient()
      const customer = await stripeClient.fetchCustomer(
        contact.data.organization.custom_fields.stripeCustomer
      )

      logger(
        'Contractor Fetch Contacts',
        'all',
        'read',
        'request',
        `After Stripe Fetch Customer`
      )

      if (customer.deleted !== true) {
        contact.data.organization.customer = {
          created: customer.created,
          description: customer.description,
          default_source: customer.default_source,
          sources: customer.sources.data.map(source => ({
            id: source.id,
            created: source.created,
            card: {
              brand: source.card.brand,
              last4: source.card.last4,
              exp_year: source.card.exp_year,
              exp_month: source.card.exp_month,
            },
          })),
          total_sources: customer.sources.total_count,
        }
      }
    }

    logger('Contractor Fetch Contacts', 'all', 'end')

    return new ResponseFactory().build(contact, event.headers.origin)
  } catch (err) {
    logger('Contractor Fetch Contacts', 'all', 'end', 'error')
    return new ErrorFactory().build(err, event.headers.origin)
  }
}

export const setAsAdmin: APIGatewayProxyHandler = async event => {
  logger('Contractor Set As Admin', 'admin', 'begin', '', ``)
  try {
    logger('Contractor Set As Admin', 'admin', 'read', 'Before Cognito Values')

    const connectedUser = await cognitoIdentityClient.getUser(
      cognitoIdentityClient.getEventAuthValues(event)
    )

    logger(
      'Contractor Set As Admin',
      'admin',
      'read',
      'After Cognito Values',
      `ContactId ${connectedUser['custom:contactId']}, CompanyId ${
        connectedUser['custom:companyId']
        }`
    )

    if (connectedUser['custom:isActive'] === '0') {
      logger(
        'Contractor Set As Admin',
        'admin',
        'not active',
        '',
        JSON.stringify(connectedUser, null, 2)
      )
      throw 'The user is not active'
    }
    if (connectedUser['custom:isAdmin'] === '0') {
      logger(
        'Contractor Set As Admin',
        'admin',
        'not admin',
        '',
        JSON.stringify(connectedUser, null, 2)
      )
      throw 'Wrong permissions'
    }

    const encryptedContactId = decodeURIComponent(
      event.pathParameters.encryptedContactId
    )
    const contactId = parseInt(cryptr.decrypt(encryptedContactId))

    logger('Contractor Set As Admin', 'admin', 'update', 'request', 'Zendesk')

    const Contacts = new ContactsController(contactsClient)
    const contactUpdated = await Contacts.update(contactId, {
      custom_fields: {
        isAdmin: 1,
      },
    })

    logger('Contractor Set As Admin', 'admin', 'update', 'request', 'Cognito')

    await cognitoIdentityClient.updateUserAttributes(
      {
        cognitoSub: contactUpdated.data.data.custom_fields.cognitoSub,
        userPoolId: process.env.USER_POOL,
      },
      {
        'custom:isAdmin': 1,
      }
    )
    await cognitoIdentityClient.globalLogout({
      cognitoSub: contactUpdated.data.data.custom_fields.cognitoSub,
      userPoolId: process.env.USER_POOL,
    })

    logger('Contractor Set As Admin', 'admin', 'end')

    return new ResponseFactory().build(
      {
        status: 200,
        data: {
          message: 'User has been promoted',
        },
      },
      event.headers.origin
    )
  } catch (err) {
    logger('Contractor Set As Admin', 'admin', 'end', 'error')
    return new ErrorFactory().build(err, event.headers.origin)
  }
}

export const revokeAsAdmin: APIGatewayProxyHandler = async event => {
  logger('Contractor Revoke As Admin', 'admin', 'begin', '', ``)
  try {
    logger(
      'Contractor Revoke As Admin',
      'admin',
      'read',
      'Before Cognito Values'
    )

    const connectedUser = await cognitoIdentityClient.getUser(
      cognitoIdentityClient.getEventAuthValues(event)
    )

    logger(
      'Contractor Revoke As Admin',
      'admin',
      'read',
      'After Cognito Values',
      `ContactId ${connectedUser['custom:contactId']}, CompanyId ${
        connectedUser['custom:companyId']
        }`
    )

    if (connectedUser['custom:isActive'] === '0') {
      logger(
        'Contractor Revoke As Admin',
        'admin',
        'not active',
        '',
        JSON.stringify(connectedUser, null, 2)
      )
      throw 'The user is not active'
    }
    if (connectedUser['custom:isAdmin'] === '0') {
      logger(
        'Contractor Revoke As Admin',
        'admin',
        'not admin',
        '',
        JSON.stringify(connectedUser, null, 2)
      )
      throw 'Wrong permissions'
    }

    const encryptedContactId = decodeURIComponent(
      event.pathParameters.encryptedContactId
    )

    const contactId = parseInt(cryptr.decrypt(encryptedContactId))
    const Contacts = new ContactsController(contactsClient)

    logger(
      'Contractor Revoke As Admin',
      'admin',
      'update',
      'request',
      'Zendesk'
    )

    const contactUpdated = await Contacts.update(contactId, {
      custom_fields: {
        isAdmin: false,
      },
    })

    logger(
      'Contractor Revoke As Admin',
      'admin',
      'update',
      'request',
      'Cognito'
    )

    await cognitoIdentityClient.updateUserAttributes(
      {
        cognitoSub: contactUpdated.data.data.custom_fields.cognitoSub,
        userPoolId: process.env.USER_POOL,
      },
      {
        'custom:isAdmin': 0,
      }
    )
    await cognitoIdentityClient.globalLogout({
      cognitoSub: contactUpdated.data.data.custom_fields.cognitoSub,
      userPoolId: process.env.USER_POOL,
    })

    logger('Contractor Revoke As Admin', 'admin', 'end')

    return new ResponseFactory().build(
      {
        status: 200,
        data: {
          message: 'User has been retrograded',
        },
      },
      event.headers.origin
    )
  } catch (err) {
    logger('Contractor Revoke As Admin', 'admin', 'end', 'error')
    return new ErrorFactory().build(err, event.headers.origin)
  }
}

export const paymentCreation: APIGatewayProxyHandler = async event => {
  logger('Contractor Payment Creation', 'all', 'begin', '', ``)
  try {
    logger(
      'Contractor Payment Creation',
      'all',
      'read',
      'Before Cognito Values'
    )

    const connectedUser = await cognitoIdentityClient.getUser(
      cognitoIdentityClient.getEventAuthValues(event)
    )

    logger(
      'Contractor Payment Creation',
      'all',
      'read',
      'After Cognito Values',
      `ContactId ${connectedUser['custom:contactId']}, CompanyId ${
        connectedUser['custom:companyId']
        }`
    )

    if (connectedUser['custom:isActive'] === '0') {
      logger(
        'Contractor Payment Creation',
        'all',
        'not active',
        '',
        JSON.stringify(connectedUser, null, 2)
      )
      throw 'The user is not active'
    }

    const parsedData = new BodyParserTransformer().transform(event.body)
    const stripeClient = new StripeClient()

    logger(
      'Contractor Payment Creation',
      'all',
      'read',
      'request',
      `Contacts.getInfoById ContactId ${
        connectedUser['custom:contactId']
        }, CompanyId ${connectedUser['custom:companyId']}`
    )

    const Contacts = new ContactsController(contactsClient)
    const companyInfos = await Contacts.getInfoById(
      connectedUser['custom:companyId']
    )

    if (
      !companyInfos.data.data.custom_fields.hasOwnProperty('stripeCustomer')
    ) {
      logger(
        'Contractor Payment Creation',
        'all',
        'write',
        'creation',
        `Stripe Customer`
      )

      const preferred_locales = []
      preferred_locales.push(companyInfos.data.data.custom_fields.locale)

      const customer = await stripeClient.createCustomer({
        email: companyInfos.data.data.email,
        source: companyInfos.data.data.source,
        address: companyInfos.data.data.address,
        name: companyInfos.data.data.name,
        phone: companyInfos.data.data.phone,
        cognitoSub: connectedUser.sub,
        zendeskContactId: connectedUser['custom:contactId'],
        zendeskCompanyId: companyInfos.data.data.id,
        preferred_locales: preferred_locales,
      })

      logger(
        'Contractor Payment Creation',
        'all',
        'update',
        'request',
        `Link Source With Customer - Customer: ${customer.id}, Source: ${
          parsedData.source
          }`
      )

      const stripeUpdate = stripeClient.linkSourceToCustomer(
        customer.id,
        parsedData.source
      )

      logger(
        'Contractor Payment Creation',
        'all',
        'update',
        'request',
        `Zendesk`
      )

      const contactUpdate = Contacts.update(companyInfos.data.data.id, {
        custom_fields: {
          stripeSource: parsedData.source,
          stripeCustomer: customer.id,
        },
      })

      await Promise.all([stripeUpdate, contactUpdate])
    } else {
      logger(
        'Contractor Payment Creation',
        'all',
        'update',
        'request',
        `Link Source With Customer - Customer: ${
          companyInfos.data.data.custom_fields.stripeCustomer
          }, Source: ${parsedData.source}`
      )

      await stripeClient.linkSourceToCustomer(
        companyInfos.data.data.custom_fields.stripeCustomer,
        parsedData.source
      )

      logger(
        'Contractor Payment Creation',
        'all',
        'update',
        'request',
        `Set Default Source - Customer: ${
          companyInfos.data.data.custom_fields.stripeCustomer
          }, Source: ${parsedData.source}`
      )

      const stripeUpdate = stripeClient.updateCustomer(
        companyInfos.data.data.custom_fields.stripeCustomer,
        {
          default_source: parsedData.source,
        }
      )

      logger(
        'Contractor Payment Creation',
        'all',
        'update',
        'request',
        `Zendesk`
      )

      const contactUpdate = Contacts.update(companyInfos.data.data.id, {
        custom_fields: {
          stripeSource: parsedData.source,
        },
      })

      await Promise.all([stripeUpdate, contactUpdate])
    }

    logger('Contractor Payment Creation', 'all', 'end')

    return new ResponseFactory().build(
      {
        status: 200,
        data: {
          message: 'Source' + parsedData.source + ' have been added correctly',
        },
      },
      event.headers.origin
    )
  } catch (err) {
    logger('Contractor Payment Creation', 'all', 'end', 'error')
    return new ErrorFactory().build(err, event.headers.origin)
  }
}

export const detachSource: APIGatewayProxyHandler = async event => {
  logger('Contractor Detach Source', 'admin', 'begin', '', ``)
  try {
    logger('Contractor Detach Source', 'admin', 'read', 'Before Cognito Values')

    const connectedUser = await cognitoIdentityClient.getUser(
      cognitoIdentityClient.getEventAuthValues(event)
    )

    logger(
      'Contractor Detach Source',
      'admin',
      'read',
      'After Cognito Values',
      `ContactId ${connectedUser['custom:contactId']}, CompanyId ${
        connectedUser['custom:companyId']
        }`
    )

    if (connectedUser['custom:isActive'] === '0') {
      logger(
        'Contractor Detach Source',
        'admin',
        'not active',
        '',
        JSON.stringify(connectedUser, null, 2)
      )
      throw 'The user is not active'
    }
    if (connectedUser['custom:isAdmin'] === '0') {
      logger(
        'Contractor Detach Source',
        'admin',
        'not admin',
        '',
        JSON.stringify(connectedUser, null, 2)
      )
      throw 'Wrong permissions'
    }

    const sourceId = decodeURIComponent(event.pathParameters.sourceId)
    const stripeClient = new StripeClient()
    const transformer = new ContactAndOrganizationTransformer()

    logger(
      'Contractor Detach Source',
      'all',
      'read',
      'request',
      `Contacts.getInfoById ContactId ${
        connectedUser['custom:contactId']
        }, CompanyId ${connectedUser['custom:companyId']}`
    )

    const Contacts = new ContactsController(contactsClient, transformer)
    const companyInfos = await Contacts.getInfoById(
      connectedUser['custom:companyId']
    )

    if (companyInfos.data.data.custom_fields.hasOwnProperty('stripeCustomer')) {
      logger(
        'Contractor Detach Source',
        'all',
        'update',
        'request',
        `Detach Source With Customer - Customer: ${
          companyInfos.data.data.custom_fields.stripeCustomer
          }, Source: ${sourceId}`
      )

      await stripeClient.detachSourceFromCustomer(
        companyInfos.data.data.custom_fields.stripeCustomer,
        sourceId
      )

      if (sourceId === companyInfos.data.data.custom_fields.stripeSource) {
        logger(
          'Contractor Detach Source',
          'all',
          'update',
          'request',
          `Zendesk (if default source)`
        )

        await Contacts.update(companyInfos.data.data.id, {
          custom_fields: {
            stripeSource: '',
          },
        })
      }
    }

    logger('Contractor Detach Source', 'all', 'end')

    return new ResponseFactory().build(
      {
        status: 200,
        data: {
          message: 'Source (' + sourceId + ') have been deleted correctly',
        },
      },
      event.headers.origin
    )
  } catch (err) {
    logger('Contractor Detach Source', 'all', 'end', 'error')
    return new ErrorFactory().build(err, event.headers.origin)
  }
}

export const makeSourceDefault: APIGatewayProxyHandler = async event => {
  logger('Contractor Make Source Default', 'admin', 'begin', '', ``)
  try {
    logger(
      'Contractor Make Source Default',
      'admin',
      'read',
      'Before Cognito Values'
    )
    const connectedUser = await cognitoIdentityClient.getUser(
      cognitoIdentityClient.getEventAuthValues(event)
    )
    logger(
      'Contractor Make Source Default',
      'admin',
      'read',
      'After Cognito Values',
      `ContactId ${connectedUser['custom:contactId']}, CompanyId ${
        connectedUser['custom:companyId']
        }`
    )

    if (connectedUser['custom:isActive'] === '0') {
      logger(
        'Contractor Make Source Default',
        'admin',
        'not active',
        '',
        JSON.stringify(connectedUser, null, 2)
      )
      throw 'The user is not active'
    }
    if (connectedUser['custom:isAdmin'] === '0') {
      logger(
        'Contractor Make Source Default',
        'admin',
        'not admin',
        '',
        JSON.stringify(connectedUser, null, 2)
      )
      throw 'Wrong permissions'
    }

    const sourceId = decodeURIComponent(event.pathParameters.sourceId)
    const stripeClient = new StripeClient()
    const transformer = new ContactAndOrganizationTransformer()

    logger(
      'Contractor Make Source Default',
      'all',
      'read',
      'request',
      `Contacts.getInfoById ContactId ${
        connectedUser['custom:contactId']
        }, CompanyId ${connectedUser['custom:companyId']}`
    )

    const Contacts = new ContactsController(contactsClient, transformer)
    const companyInfos = await Contacts.getInfoById(
      connectedUser['custom:companyId']
    )

    if (companyInfos.data.data.custom_fields.hasOwnProperty('stripeCustomer')) {
      logger(
        'Contractor Make Source Default',
        'all',
        'update',
        'request',
        `Update Customer Default Source - Customer: ${
          companyInfos.data.data.custom_fields.stripeCustomer
          }, Source: ${sourceId}`
      )

      const updateStripe = stripeClient.updateCustomer(
        companyInfos.data.data.custom_fields.stripeCustomer,
        {
          default_source: sourceId,
        }
      )

      logger(
        'Contractor Make Source Default',
        'all',
        'update',
        'request',
        `Zendesk`
      )

      const updateContact = Contacts.update(companyInfos.data.data.id, {
        custom_fields: {
          stripeSource: sourceId,
        },
      })

      await Promise.all([updateStripe, updateContact])
    }

    logger('Contractor Make Source Default', 'all', 'end')

    return new ResponseFactory().build(
      {
        status: 200,
        data: {
          message:
            'Source (' + sourceId + ') has been set as the default source',
        },
      },
      event.headers.origin
    )
  } catch (err) {
    logger('Contractor Make Source Default', 'all', 'end', 'error')
    return new ErrorFactory().build(err, event.headers.origin)
  }
}

export const firstContact: APIGatewayProxyHandler = async event => {
  logger('Contractor First Contact', 'all', 'begin', '', ``)
  try {
    logger('Contractor First Contact', 'all', 'read', 'Before Cognito Values')

    const connectedUser = await cognitoIdentityClient.getUser(
      cognitoIdentityClient.getEventAuthValues(event)
    )

    logger(
      'Contractor First Contact',
      'all',
      'read',
      'After Cognito Values',
      `ContactId ${connectedUser['custom:contactId']}, CompanyId ${
        connectedUser['custom:companyId']
        }`
    )

    if (connectedUser['custom:isActive'] === '0') {
      logger(
        'Contractor First Contact',
        'all',
        'not active',
        '',
        JSON.stringify(connectedUser, null, 2)
      )
      throw 'The user is not active'
    }

    const connectedCompanyId = parseInt(connectedUser['custom:companyId'])
    const connectedContactId = parseInt(connectedUser['custom:contactId'])
    const parsedData = new BodyParserTransformer().transform(event.body)
    const dealInfosId = parsedData.dealInfosId
    const contactMethod = parsedData.contactMethod

    if (!dealInfosId) {
      logger('Contractor First Contact', 'all', 'no deal infos')
      throw 'No deal infos ID provided'
    }
    if (!contactMethod) {
      logger('Contractor First Contact', 'all', 'no contact method')
      throw 'No contact method provided'
    }

    logger(
      'Contractor First Contact',
      'all',
      'read',
      'request',
      `Get Deal Infos ID ${dealInfosId}`
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
      logger('Contractor First Contact', 'all', 'deal not owned')
      throw 'Deal is not owned'
    }

    const dateNow = Date.now()

    logger(
      'Contractor First Contact',
      'all',
      'update',
      'request',
      'Update Notification'
    )

    await dynamoDb.update({
      TableName: process.env.NOTIFICATIONS_TABLE,
      Key: {
        id: `${connectedCompanyId}_${connectedContactId}_${
          deal.Items[0].dealId
          }`,
      },
      UpdateExpression:
        'SET firstContact = :firstContact, firstContactDate = :firstContactDate, firstContactMethod = :firstContactMethod, updatedAt = :updatedAt',
      ConditionExpression: 'dealInfosId = :dealInfosId',
      ExpressionAttributeValues: {
        ':dealInfosId': deal.Items[0].dealInfosId,
        ':firstContact': 1,
        ':firstContactMethod': contactMethod,
        ':firstContactDate': dateNow,
        ':updatedAt': dateNow,
      },
      ReturnValues: 'ALL_NEW',
    })

    logger('Contractor First Contact', 'all', 'end')

    return new ResponseFactory().build(
      {
        status: 200,
        data: {
          message: 'first contact',
        },
      },
      event.headers.origin
    )
  } catch (err) {
    logger('Contractor First Contact', 'all', 'end', 'error')
    return new ErrorFactory().build(err, event.headers.origin)
  }
}

export const updateInfos: APIGatewayProxyHandler = async event => {
  logger('Contractor Update Infos', 'all', 'begin', '', ``)
  try {
    logger('Contractor Update Infos', 'all', 'read', 'Before Cognito Values')

    const connectedUser = await cognitoIdentityClient.getUser(
      cognitoIdentityClient.getEventAuthValues(event)
    )

    logger(
      'Contractor Update Infos',
      'all',
      'read',
      'After Cognito Values',
      `ContactId ${connectedUser['custom:contactId']}, CompanyId ${
        connectedUser['custom:companyId']
        }`
    )

    if (connectedUser['custom:isActive'] === '0') {
      logger(
        'Contractor Update Infos',
        'all',
        'not active',
        '',
        JSON.stringify(connectedUser, null, 2)
      )
      throw 'The user is not active'
    }

    const parsedData = new BodyParserTransformer().transform(event.body)
    const contactId = parseInt(connectedUser['custom:contactId'])

    const Contacts = new ContactsController(contactsClient)

    logger(
      'Contractor Update Infos',
      'all',
      'update',
      'verification',
      `Fields validation`
    )

    const validator = new DataValidator(ContactUpdateSchema)
    const validData = await validator.validate(parsedData, {
      abortEarly: false,
    })

    logger('Contractor Update Infos', 'all', 'update', 'request', `Zendesk`)

    const contact = Contacts.update(contactId, {
      first_name: validData.firstName,
      last_name: validData.lastName,
      phone: validData.phone,
    })

    logger('Contractor Update Infos', 'all', 'update', 'request', `Cognito`)

    const cognitoUser = cognitoIdentityClient.updateUserAttributes(
      {
        cognitoSub: connectedUser['sub'],
        userPoolId: process.env.USER_POOL,
      },
      {
        given_name: validData.firstName,
        family_name: validData.lastName,
        phone_number: validData.phone,
      }
    )

    await Promise.all([contact, cognitoUser])

    logger('Contractor Update Infos', 'all', 'end')

    return new ResponseFactory().build(
      {
        status: 200,
        data: {
          success: true,
        },
      },
      event.headers.origin
    )
  } catch (err) {
    logger('Contractor First Contact', 'all', 'end', 'error')
    return new ErrorFactory().build(err, event.headers.origin)
  }
}

export const acceptTOS: APIGatewayProxyHandler = async event => {
  logger('Contractor Accept TOS', 'all', 'begin', '', ``)
  try {
    logger('Contractor Accept TOS', 'all', 'read', 'Before Cognito Values')

    const connectedUser = await cognitoIdentityClient.getUser(
      cognitoIdentityClient.getEventAuthValues(event)
    )

    logger(
      'Contractor Accept TOS',
      'all',
      'read',
      'After Cognito Values',
      `ContactId ${connectedUser['custom:contactId']}, CompanyId ${
        connectedUser['custom:companyId']
        }`
    )

    if (connectedUser['custom:isActive'] === '0') {
      logger(
        'Contractor Accept TOS',
        'all',
        'not active',
        '',
        JSON.stringify(connectedUser, null, 2)
      )
      throw 'The user is not active'
    }

    const parsedData = new BodyParserTransformer().transform(event.body)
    const companyId = parseInt(connectedUser['custom:companyId'])
    const contactId = parseInt(connectedUser['custom:contactId'])

    const Contacts = new ContactsController(contactsClient)

    logger(
      'Contractor Accept TOS',
      'all',
      'update',
      'verification',
      `Fields validation`
    )

    const company = Contacts.update(companyId, {
      custom_fields: {
        conditions: 1,
      }
    })
    const contact = Contacts.update(contactId, {
      custom_fields: {
        conditions: 1,
      }
    })

    logger('Contractor Accept TOS', 'all', 'update', 'request', `Cognito`)

    const cognitoUser = cognitoIdentityClient.updateUserAttributes(
      {
        cognitoSub: connectedUser['sub'],
        userPoolId: process.env.USER_POOL,
      },
      {
        email_verified: true,
      }
    )

    await Promise.all([company, contact, cognitoUser])

    logger('Contractor Accept TOS', 'all', 'end')

    return new ResponseFactory().build(
      {
        status: 200,
        data: {
          success: true,
        },
      },
      event.headers.origin
    )
  } catch (err) {
    logger('Contractor Accept TOS', 'all', 'end', 'error')
    return new ErrorFactory().build(err, event.headers.origin)
  }
}

export const registerToNotification: APIGatewayProxyHandler = async event => {
  logger('Contractor Register Notification', 'all', 'begin', '', ``)
  try {
    logger('Contractor Register Notification', 'all', 'read', 'Before Cognito Values')

    const connectedUser = await cognitoIdentityClient.getUser(
      cognitoIdentityClient.getEventAuthValues(event)
    )

    logger(
      'Contractor Register Notification',
      'all',
      'read',
      'After Cognito Values',
      `ContactId ${connectedUser['custom:contactId']}, CompanyId ${
        connectedUser['custom:companyId']
        }`
    )

    if (connectedUser['custom:isActive'] === '0') {
      logger(
        'Contractor Register Notification',
        'all',
        'not active',
        '',
        JSON.stringify(connectedUser, null, 2)
      )
      throw 'The user is not active'
    }

    const parsedData = new BodyParserTransformer().transform(event.body)
    console.log(connectedUser['custom:contactId'])
    const registration = await twilioClient.registerNotifyServiceUser(connectedUser['custom:contactId'], parsedData.token)

    logger('Contractor Register Notification', 'all', 'end')

    return new ResponseFactory().build(
      {
        status: 200,
        data: {
          success: true,
          registration,
        },
      },
      event.headers.origin
    )
  } catch (err) {
    logger('Contractor Register Notification', 'all', 'end', 'error')
    return new ErrorFactory().build(err, event.headers.origin)
  }
}

export const setVerifyPhoneFalse: APIGatewayProxyHandler = async event => {
  try {
    function updateListing(paginationToken) {
      return new Promise(async (resolve, reject) => {
        const cognitoUsers = await cognitoIdentityClient.listUsers(paginationToken)

        const list = []

        cognitoUsers.Users.forEach((user) => {
          let verifiedAttr = false

          user.Attributes.forEach(attr => {
            if (attr.Name === 'phone_number_verified') {
              verifiedAttr = true
            }
          })

          if (verifiedAttr === false) {
            list.push(user.Username)
          }
        })

        await Promise.all(list.map((username) => {
          const updateCognitoUser = cognitoIdentityClient.updateUserAttributes(
            {
              cognitoSub: username,
              userPoolId: process.env.USER_POOL,
            },
            {
              'phone_number_verified': false,
            }
          )

          return updateCognitoUser
        }))

        if (cognitoUsers.PaginationToken) {
          return updateListing(cognitoUsers.PaginationToken)
        } else {
          resolve()
        }
      })
    }

    await updateListing(null)

    return new ResponseFactory().build(
      {
        status: 200,
        data: {
          success: true,
        },
      },
      event.headers.origin
    )
  } catch (err) {
    logger('Contractor Register Notification', 'all', 'end', 'error')
    return new ErrorFactory().build(err, event.headers.origin)
  }
}

export const verifyPhoneNumber: APIGatewayProxyHandler = async event => {
  try {
    const phoneTransformer = new PhoneNumberTransformer()

    function notifyListing(paginationToken) {
      return new Promise(async (resolve, reject) => {
        const cognitoUsers = await cognitoIdentityClient.listUsers(paginationToken)

        const list = []

        cognitoUsers.Users.forEach((user) => {
          let verifiedAttr = false

          user.Attributes.forEach(attr => {
            if (attr.Name === 'phone_number_verified' && attr.Value === 'true') {
              verifiedAttr = true
            }
          })

          if (verifiedAttr === false) {
            user.Attributes.forEach(attr => {
              if (attr.Name === 'phone_number') {
                list.push(attr.Value)
              }
            })
          }
        })

        const sms = await Promise.all(list.map((phone) => {
          return twilioClient.sendSMS(
            phoneTransformer.transform(phone), '* Message de Conecto *\n\nVérification de votre numéro de cellulaire. Répondez "Conecto"'
          )
        }))

        if (cognitoUsers.PaginationToken) {
          return notifyListing(cognitoUsers.PaginationToken)
        } else {
          resolve()
        }
      })
    }

    await notifyListing(null)

    return new ResponseFactory().build(
      {
        status: 200,
        data: {
          success: true,
        },
      },
      event.headers.origin
    )
  } catch (err) {
    logger('Contractor Register Notification', 'all', 'end', 'error')
    return new ErrorFactory().build(err, event.headers.origin)
  }
}

export const verifySinglePhoneNumber: APIGatewayProxyHandler = async event => {
  try {
    let cognitoUsers
    const list = []
    const parsedData = new BodyParserTransformer().transform(event.body)

    if (typeof parsedData.tel !== 'undefined') {
      const phoneTransformer = new PhoneNumberTransformer()
      const phoneNumber = phoneTransformer.transform(parsedData.tel)

      cognitoUsers = await cognitoIdentityClient.listUsers(null,{
        Filter: `phone_number = "${phoneNumber}"`
      })
    } else {
      cognitoUsers = await cognitoIdentityClient.listUsers(null, {
        Filter: `email = "${parsedData.email}"`
      })
    }

    cognitoUsers.Users.forEach((cognitoUser) => {
      let isConfirmed = false

      cognitoUser.Attributes.forEach(attr => {
        if (attr.Name === 'phone_number_verified' && attr.Value === 'true') {
          isConfirmed = true
        }
      })

      if (isConfirmed === false) {
        cognitoUser.Attributes.forEach(attr => {
          if (attr.Name === 'phone_number') {
            list.push(attr.Value)
          }
        })
      }
    })

    await Promise.all(list.map((phone) => {
      return twilioClient.sendSMS(
        phone, '* Message de Conecto *\n\nVérification de votre numéro de cellulaire. Répondez "Conecto"'
      )
    }))

    return new ResponseFactory().build(
      {
        status: 200,
        data: {
          success: true,
          cognitoUsers,
        },
      },
      event.headers.origin
    )
  } catch (err) {
    logger('Contractor Register Notification', 'all', 'end', 'error')
    return new ErrorFactory().build(err, event.headers.origin)
  }
}
