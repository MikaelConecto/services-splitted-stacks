import { APIGatewayProxyHandler } from 'aws-lambda'
import nanoidGenerate from 'nanoid/generate'
import Cryptr from 'cryptr'

import ResponseFactory from '../../src/Factories/ResponseFactory'
import ErrorFactory from '../../src/Factories/ErrorFactory'
import CognitoServiceProviderClient from '../../src/Clients/CognitoServiceProviderClient'
import DynamoDBClient from '../../src/Clients/DynamoDBClient'
import BodyParserTransformer from '../../src/Transformers/BodyParserTransformer'
import ContactEmployeesTransformer from '../../src/Transformers/ContactEmployeesTransformer'
import ContactsController from '../../src/Controllers/ContactsController'
import AxiosClient from '../../src/Clients/AxiosClient'
import StripeClient from '../../src/Clients/StripeClient'

import logger from '../../src/Helpers/logger'

const dynamoDb = new DynamoDBClient()
const cognitoIdentityClient = new CognitoServiceProviderClient()
const contactsClient = new AxiosClient({
  baseURL: process.env.ZENDESK_API_V2_URL,
  timeout: 3000,
  headers: {
    Authorization: `Bearer ${process.env.ZENDESK_API_TOKEN}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  },
})
const cryptr = new Cryptr(process.env.CRYPTR_SECRET_KEY)

export const fetchAddresses: APIGatewayProxyHandler = async event => {
  logger('Company Fetch Addresses', 'all', 'begin')
  try {
    logger('Company Fetch Addresses', 'all', 'read', 'Before Cognito Values')
    const connectedUser = await cognitoIdentityClient.getUser(
      cognitoIdentityClient.getEventAuthValues(event)
    )
    logger(
      'Company Fetch Addresses',
      'all',
      'read',
      'After Cognito Values',
      `ContactId ${connectedUser['custom:contactId']}, CompanyId ${
        connectedUser['custom:companyId']
        }`
    )

    if (connectedUser['custom:isActive'] === '0') {
      logger(
        'Company Fetch Addresses',
        'all',
        'not active',
        JSON.stringify(connectedUser, null, 2)
      )
      throw 'The user is not active'
    }

    const companyId = parseInt(connectedUser['custom:companyId'])
    const contactId = parseInt(connectedUser['custom:contactId'])

    logger(
      'Company Fetch Addresses',
      'all',
      'read',
      'request',
      'Company Addressed Query'
    )
    const companyAddresses = dynamoDb.query({
      TableName: process.env.COMPANYADDRESSES_TABLE,
      KeyConditionExpression: 'companyId = :companyId',
      ExpressionAttributeValues: {
        ':companyId': companyId,
      },
    })

    logger(
      'Company Fetch Addresses',
      'all',
      'read',
      'request',
      'Company Address Assignement Query'
    )
    const contactAddressAssignment = dynamoDb.query({
      TableName: process.env.CONTACTADDRESSASSIGNMENTS_TABLE,
      KeyConditionExpression: 'companyId = :companyId',
      ExpressionAttributeValues: {
        ':companyId': companyId,
      },
    })

    const addresses = await Promise.all([
      companyAddresses,
      contactAddressAssignment,
    ])

    logger(
      'Company Fetch Addresses',
      'all',
      'read',
      'transformation',
      'Company Addresses and Assignements Merge'
    )

    const assignedIds = addresses[1].Items.filter(
      item => item.contactId === contactId
    ).map(item => item.addressId)

    const companyAssignedAddresses = addresses[0].Items.map(address => {
      delete address.companyId
      return {
        ...address,
        assigned: assignedIds.indexOf(address.addressId) >= 0,
      }
    })

    logger('Company Fetch Addresses', 'all', 'end')

    return new ResponseFactory().build(
      {
        status: 200,
        data: companyAssignedAddresses.filter(
          address => address.isActive === 1
        ),
      },
      event.headers.origin
    )
  } catch (err) {
    logger('Company Fetch Addresses', 'all', 'end', 'error')
    return new ErrorFactory().build(err, event.headers.origin)
  }
}

export const createAddress: APIGatewayProxyHandler = async event => {
  logger('Company Create Address', 'all', 'begin')
  try {
    logger('Company Create Address', 'all', 'read', 'Before Cognito Values')
    const connectedUser = await cognitoIdentityClient.getUser(
      cognitoIdentityClient.getEventAuthValues(event)
    )
    logger(
      'Company Create Address',
      'all',
      'read',
      'After Cognito Values',
      `ContactId ${connectedUser['custom:contactId']}, CompanyId ${
        connectedUser['custom:companyId']
        }`
    )

    if (connectedUser['custom:isActive'] === '0') {
      logger(
        'Company Create Address',
        'all',
        'not active',
        JSON.stringify(connectedUser, null, 2)
      )
      throw 'The user is not active'
    }

    const parsedData = new BodyParserTransformer().transform(event.body)
    let newAddress = null
    let addressAssignement = null

    logger(
      'Company Create Address',
      'all',
      'read',
      'request',
      'Get All Addresses From Company'
    )

    const companyAddresses = await dynamoDb.query({
      TableName: process.env.COMPANYADDRESSES_TABLE,
      KeyConditionExpression: 'companyId = :companyId',
      ExpressionAttributeValues: {
        ':companyId': parseInt(connectedUser['custom:companyId']),
      },
    })

    if (
      companyAddresses.Items.filter(
        companyAddress => companyAddress.isActive === 1
      ).length < process.env.LIMIT_COMPANY_ADDRESSES
    ) {
      logger(
        'Company Create Address',
        'all',
        'write',
        'generation',
        'Generate UUID for the address'
      )
      const dateNow = Date.now()
      const addressUUID = nanoidGenerate(
        '1234567890abcdefghijklmnopqrstuvwxyz',
        10
      )

      logger(
        'Company Create Address',
        'all',
        'write',
        'request',
        'Create Company Address'
      )
      newAddress = await dynamoDb.put({
        TableName: process.env.COMPANYADDRESSES_TABLE,
        Item: {
          userId: connectedUser['sub'],
          companyId: parseInt(connectedUser['custom:companyId']),
          addressId: addressUUID,
          number: parsedData.number,
          address: parsedData.address,
          city: parsedData.city,
          postal_code: parsedData.postalCode,
          state: parsedData.state,
          country: parsedData.country,
          latitude: parsedData.latitude,
          longitude: parsedData.longitude,
          radius: parsedData.radius,
          isActive: 1,
          createdAt: dateNow,
          updatedAt: dateNow,
        },
      })

      logger(
        'Company Create Address',
        'all',
        'write',
        'request',
        `Create Company Address Assignement - ContactId: ${
          connectedUser['custom:contactId']
          }, AddressUUID: ${addressUUID}`
      )
      addressAssignement = dynamoDb.put({
        TableName: process.env.CONTACTADDRESSASSIGNMENTS_TABLE,
        Item: {
          userId: connectedUser['sub'],
          companyId: parseInt(connectedUser['custom:companyId']),
          addressId: addressUUID,
          contactId: parseInt(connectedUser['custom:contactId']),
          isActive: 1,
          createdAt: dateNow,
          updatedAt: dateNow,
        },
      })
    } else {
      newAddress = 'Limit of company addresses reached'
    }

    const addressQueries = await Promise.all([newAddress, addressAssignement])

    logger('Company Create Address', 'all', 'end')

    return new ResponseFactory().build(
      {
        status: 200,
        data: addressQueries[0],
      },
      event.headers.origin
    )
  } catch (err) {
    logger('Company Create Address', 'all', 'end', 'error')
    return new ErrorFactory().build(err, event.headers.origin)
  }
}

export const deleteAddress: APIGatewayProxyHandler = async event => {
  logger('Company Delete Address', 'all', 'begin')
  try {
    logger('Company Delete Address', 'all', 'read', 'Before Cognito Values')
    const connectedUser = await cognitoIdentityClient.getUser(
      cognitoIdentityClient.getEventAuthValues(event)
    )
    logger(
      'Company Delete Address',
      'all',
      'read',
      'After Cognito Values',
      `ContactId ${connectedUser['custom:contactId']}, CompanyId ${
        connectedUser['custom:companyId']
        }`
    )
    const connectedCompanyId = parseInt(connectedUser['custom:companyId'])
    const connectedContactId = parseInt(connectedUser['custom:contactId'])

    if (connectedUser['custom:isActive'] === '0') {
      logger(
        'Company Delete Address',
        'all',
        'not active',
        JSON.stringify(connectedUser, null, 2)
      )
      throw 'The user is not active'
    }
    if (connectedUser['custom:isAdmin'] === '0') {
      logger(
        'Company Delete Address',
        'all',
        'not admin',
        JSON.stringify(connectedUser, null, 2)
      )
      throw 'Wrong permissions'
    }

    const addressIdToDelete = decodeURIComponent(event.pathParameters.addressId)
    const dateNow = Date.now()

    logger(
      'Company Delete Address',
      'all',
      'update',
      'request',
      `Address ${addressIdToDelete} isActive = 0`
    )

    const updateAddressQuery = dynamoDb.update({
      TableName: process.env.COMPANYADDRESSES_TABLE,
      Key: {
        companyId: connectedCompanyId,
        addressId: addressIdToDelete,
      },
      UpdateExpression: 'SET isActive = :isActive, updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':isActive': 0,
        ':updatedAt': dateNow,
      },
      ReturnValues: 'ALL_NEW',
    })

    logger(
      'Company Delete Address',
      'all',
      'update',
      'request',
      `Address Assignement ${addressIdToDelete} isActive = 0`
    )

    const updateAddressAssignmentQuery = await dynamoDb.update({
      TableName: process.env.CONTACTADDRESSASSIGNMENTS_TABLE,
      Key: {
        companyId: connectedCompanyId,
        addressId: addressIdToDelete,
      },
      UpdateExpression:
        'SET contactId = :contactId, isActive = :isActive, updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':isActive': 0,
        ':contactId': connectedContactId,
        ':updatedAt': Date.now(),
      },
      ReturnValues: 'ALL_NEW',
    })

    const addressQueries = await Promise.all([
      updateAddressQuery,
      updateAddressAssignmentQuery,
    ])

    logger('Company Delete Address', 'all', 'end')

    return new ResponseFactory().build(
      {
        status: 200,
        data: addressQueries[0],
      },
      event.headers.origin
    )
  } catch (err) {
    logger('Company Delete Address', 'all', 'end', 'error')
    return new ErrorFactory().build(err, event.headers.origin)
  }
}

export const assignAddress: APIGatewayProxyHandler = async event => {
  logger('Company Assign Address', 'all', 'begin')
  try {
    logger('Company Assign Address', 'all', 'read', 'Before Cognito Values')
    const connectedUser = await cognitoIdentityClient.getUser(
      cognitoIdentityClient.getEventAuthValues(event)
    )
    logger(
      'Company Assign Address',
      'all',
      'read',
      'After Cognito Values',
      `ContactId ${connectedUser['custom:contactId']}, CompanyId ${
        connectedUser['custom:companyId']
        }`
    )

    if (connectedUser['custom:isActive'] === '0') {
      logger(
        'Company Assign Address',
        'all',
        'not active',
        JSON.stringify(connectedUser, null, 2)
      )
      throw 'The user is not active'
    }

    const connectedCompanyId = parseInt(connectedUser['custom:companyId'])

    const addressIdToUpdate = decodeURIComponent(event.pathParameters.addressId)
    const parsedData = new BodyParserTransformer().transform(event.body)
    const contactId = cryptr.decrypt(parsedData.employeeId)

    logger(
      'Company Assign Address',
      'all',
      'update',
      'request',
      `Address Assignement - AddressId: ${addressIdToUpdate}, ContactId: ${contactId}`
    )

    const addressAssignmentUpdate = await dynamoDb.update({
      TableName: process.env.CONTACTADDRESSASSIGNMENTS_TABLE,
      Key: {
        companyId: connectedCompanyId,
        addressId: addressIdToUpdate,
      },
      UpdateExpression: 'SET contactId = :contactId, updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':contactId': parseInt(contactId),
        ':updatedAt': Date.now(),
      },
      ReturnValues: 'ALL_NEW',
    })

    logger('Company Assign Address', 'all', 'end')

    return new ResponseFactory().build(
      {
        status: 200,
        data: {
          message: `Address ${addressIdToUpdate} have been assigned successfuly`,
        },
      },
      event.headers.origin
    )
  } catch (err) {
    logger('Company Assign Address', 'all', 'end', 'error')
    return new ErrorFactory().build(err, event.headers.origin)
  }
}

export const fetchEmployees: APIGatewayProxyHandler = async event => {
  logger('Company Fetch Employees', 'all', 'begin')
  try {
    logger('Company Fetch Employees', 'all', 'read', 'Before Cognito Values')
    const connectedUser = await cognitoIdentityClient.getUser(
      cognitoIdentityClient.getEventAuthValues(event)
    )
    logger(
      'Company Fetch Employees',
      'all',
      'read',
      'After Cognito Values',
      `ContactId ${connectedUser['custom:contactId']}, CompanyId ${
        connectedUser['custom:companyId']
        }`
    )

    if (connectedUser['custom:isActive'] === '0') {
      logger(
        'Company Fetch Employees',
        'all',
        'not active',
        JSON.stringify(connectedUser, null, 2)
      )
      throw 'The user is not active'
    }

    const connectedCompanyId = parseInt(connectedUser['custom:companyId'])
    const connectedContactId = parseInt(connectedUser['custom:contactId'])

    const transformer = new ContactEmployeesTransformer()
    const Contacts = new ContactsController(contactsClient)

    logger(
      'Company Fetch Employees',
      'all',
      'read',
      'request',
      'Fetch All Employees'
    )

    const contact = await Contacts.searchFor({
      contact_id: connectedCompanyId,
    })

    logger(
      'Company Fetch Employees',
      'all',
      'read',
      'transformation',
      'Transform Employees Result'
    )

    const responseEmployees = transformer.transformResponseData(contact, {
      currentContactId: connectedContactId,
    })

    logger('Company Fetch Employees', 'all', 'end')

    return new ResponseFactory().build(responseEmployees, event.headers.origin)
  } catch (err) {
    logger('Company Fetch Employees', 'all', 'end', 'error')
    return new ErrorFactory().build(err, event.headers.origin)
  }
}

export const deleteEmployee: APIGatewayProxyHandler = async event => {
  logger('Company Delete Employee', 'all', 'begin')
  try {
    logger('Company Delete Employee', 'all', 'read', 'Before Cognito Values')
    const connectedUser = await cognitoIdentityClient.getUser(
      cognitoIdentityClient.getEventAuthValues(event)
    )
    logger(
      'Company Delete Employees',
      'all',
      'read',
      'After Cognito Values',
      `ContactId ${connectedUser['custom:contactId']}, CompanyId ${
        connectedUser['custom:companyId']
        }`
    )

    if (connectedUser['custom:isActive'] === '0') {
      logger(
        'Company Delete Employee',
        'all',
        'not active',
        JSON.stringify(connectedUser, null, 2)
      )
      throw 'The user is not active'
    }
    if (connectedUser['custom:isAdmin'] === '0') {
      logger(
        'Company Delete Employee',
        'all',
        'not admin',
        JSON.stringify(connectedUser, null, 2)
      )
      throw 'Wrong permissions'
    }

    const connectedCompanyId = parseInt(connectedUser['custom:companyId'])
    const connectedContactId = parseInt(connectedUser['custom:contactId'])
    const employeeId = parseInt(
      cryptr.decrypt(
        decodeURIComponent(event.pathParameters.encryptedEmployeeId)
      )
    )
    const Contacts = new ContactsController(contactsClient)
    const dateNow = Date.now()

    logger(
      'Company Delete Employee',
      'all',
      'read',
      'request',
      'Get info By Id'
    )
    const employeeToDelete = Contacts.getInfoById(employeeId)

    logger(
      'Company Delete Employee',
      'all',
      'read',
      'request',
      'Get Company Address Assignement'
    )
    const companyAddressAssignment = dynamoDb.query({
      TableName: process.env.CONTACTADDRESSASSIGNMENTS_TABLE,
      KeyConditionExpression: 'companyId = :companyId',
      ExpressionAttributeValues: {
        ':companyId': connectedCompanyId,
      },
    })

    const firstPromises = await Promise.all([
      employeeToDelete,
      companyAddressAssignment,
    ])

    logger(
      'Company Delete Employee',
      'all',
      'update',
      'request',
      `Set isActive = 0 Zendesk - ContactId: ${employeeId}`
    )

    const employeeDeletionCRM = await Contacts.update(employeeId, {
      first_name: `DELETED ${firstPromises[0].data.data.first_name}`,
      custom_fields: {
        isActive: 0,
      },
    })

    const contactAddressAssignementsIds = firstPromises[1].Items.filter(
      item => item.contactId === employeeId
    ).map(item => {
      logger(
        'Company Delete Employee',
        'all',
        'update',
        'request',
        `Change Address Assignement - ContactId: ${employeeId} to: ${connectedContactId}`
      )

      dynamoDb.update({
        TableName: process.env.CONTACTADDRESSASSIGNMENTS_TABLE,
        Key: {
          companyId: connectedCompanyId,
          addressId: item.addressId,
        },
        ConditionExpression: 'contactId = :contactId',
        UpdateExpression:
          'SET contactId = :newContactId, updatedAt = :updatedAt',
        ExpressionAttributeValues: {
          ':contactId': employeeId,
          ':newContactId': connectedContactId,
          ':updatedAt': dateNow,
        },
        ReturnValues: 'ALL_NEW',
      })
    })

    logger(
      'Company Delete Employee',
      'all',
      'update',
      'request',
      `Set isActive = 0 ContactScore - ContactId: ${employeeId}`
    )

    const deleteContactScoreUpdate = dynamoDb.update({
      TableName: process.env.CONTACTSCORE_TABLE,
      Key: {
        userId: firstPromises[0].data.data.custom_fields.cognitoSub,
        companyId: connectedCompanyId,
      },
      ConditionExpression: 'contactId = :contactId',
      UpdateExpression: 'SET isActive = :isActive, updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':contactId': employeeId,
        ':isActive': 0,
        ':updatedAt': dateNow,
      },
      ReturnValues: 'ALL_NEW',
    })

    logger(
      'Company Delete Employee',
      'all',
      'update',
      'request',
      `Set isActive = 0 Cognito - CognitoSub: ${
        firstPromises[0].data.data.custom_fields.cognitoSub
        }`
    )

    const updateCognitoUser = cognitoIdentityClient.updateUserAttributes(
      {
        cognitoSub: firstPromises[0].data.data.custom_fields.cognitoSub,
        userPoolId: process.env.USER_POOL,
      },
      {
        'custom:isActive': 0,
      }
    )
    const logoutUser = cognitoIdentityClient.globalLogout({
      cognitoSub: firstPromises[0].data.data.custom_fields.cognitoSub,
      userPoolId: process.env.USER_POOL,
    })

    await Promise.all([
      ...contactAddressAssignementsIds,
      deleteContactScoreUpdate,
      employeeDeletionCRM,
      updateCognitoUser,
      logoutUser,
    ])

    logger('Company Delete Employee', 'all', 'end')

    return new ResponseFactory().build(
      {
        status: 200,
        data: 'The employee has been deleted',
      },
      event.headers.origin
    )
  } catch (err) {
    logger('Company Delete Employee', 'all', 'end', 'error')
    return new ErrorFactory().build(err, event.headers.origin)
  }
}

export const updateCompanyInfos: APIGatewayProxyHandler = async event => {
  logger('Company Update Infos', 'all', 'begin')
  try {
    logger('Company Update Infos', 'all', 'read', 'Before Cognito Values')
    const connectedUser = await cognitoIdentityClient.getUser(
      cognitoIdentityClient.getEventAuthValues(event)
    )
    logger(
      'Company Update Infos',
      'all',
      'read',
      'After Cognito Values',
      `ContactId ${connectedUser['custom:contactId']}, CompanyId ${
        connectedUser['custom:companyId']
        }`
    )

    if (connectedUser['custom:isActive'] === '0') {
      logger(
        'Company Update Infos',
        'all',
        'not active',
        JSON.stringify(connectedUser, null, 2)
      )
      throw 'The user is not active'
    }
    if (connectedUser['custom:isAdmin'] === '0') {
      logger(
        'Company Update Infos',
        'all',
        'not admin',
        JSON.stringify(connectedUser, null, 2)
      )
      throw 'Wrong permissions'
    }

    const companyId = parseInt(connectedUser['custom:companyId'])
    const parsedData = new BodyParserTransformer().transform(event.body)

    logger(
      'Company Update Infos',
      'all',
      'update',
      'request',
      'Update Zendesk infos'
    )

    const Contacts = new ContactsController(contactsClient)

    const dataToChange = ('name' in parsedData) ? {
      name: parsedData.name,
      phone: parsedData.tel,
      email: parsedData.email,
      custom_fields: {
        activeForRoofing: parsedData.activeForRoofing,
        locale: parsedData.locale,
      }
    } : {
      custom_fields: {
        activeForRoofing: parsedData.activeForRoofing,
      }
    }

    const company = await Contacts.update(companyId, dataToChange)

    logger('Company Update Infos', 'all', 'end')

    return new ResponseFactory().build(
      {
        status: 200,
        data: company.data,
      },
      event.headers.origin
    )
  } catch (err) {
    logger('Company Update Infos', 'all', 'end', 'error')
    return new ErrorFactory().build(err, event.headers.origin)
  }
}

export const updateCompanyOwner: APIGatewayProxyHandler = async event => {
  logger('Company Change Owner', 'all', 'begin')
  try {
    logger('Company Change Owner', 'all', 'read', 'Before Cognito Values')
    const connectedUser = await cognitoIdentityClient.getUser(
      cognitoIdentityClient.getEventAuthValues(event)
    )
    logger(
      'Company Change Owner',
      'all',
      'read',
      'After Cognito Values',
      `ContactId ${connectedUser['custom:contactId']}, CompanyId ${
        connectedUser['custom:companyId']
        }`
    )

    if (connectedUser['custom:isActive'] === '0') {
      logger(
        'Company Change Owner',
        'all',
        'not active',
        JSON.stringify(connectedUser, null, 2)
      )
      throw 'The user is not active'
    }
    if (connectedUser['custom:isAdmin'] === '0') {
      logger(
        'Company Change Owner',
        'all',
        'not admin',
        JSON.stringify(connectedUser, null, 2)
      )
      throw 'Wrong permissions'
    }

    const companyId = parseInt(connectedUser['custom:companyId'])
    const employeeId = parseInt(
      cryptr.decrypt(
        decodeURIComponent(event.pathParameters.encryptedEmployeeId)
      )
    )

    const Contacts = new ContactsController(contactsClient)

    logger(
      'Company Change Owner',
      'all',
      'read',
      'request',
      `Fetch New Owner Infos - ContactId: ${employeeId}`
    )

    const futureOwner = await Contacts.getInfoById(employeeId)

    logger(
      'Company Change Owner',
      'all',
      'update',
      'request',
      `Set New Owner - CompanyId: ${companyId}, CognitoSub: ${
        futureOwner.data.data.custom_fields.cognitoSub
        }`
    )

    const company = await Contacts.update(companyId, {
      custom_fields: {
        cognitoSub: futureOwner.data.data.custom_fields.cognitoSub,
      },
    })

    logger('Company Change Owner', 'all', 'end')

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
    logger('Company Change Owner', 'all', 'end', 'error')
    return new ErrorFactory().build(err, event.headers.origin)
  }
}

export const listCompanyCharges: APIGatewayProxyHandler = async event => {
  logger('Company List Charges', 'all', 'begin')
  try {
    logger('Company List Charges', 'all', 'read', 'Before Cognito Values')
    const connectedUser = await cognitoIdentityClient.getUser(
      cognitoIdentityClient.getEventAuthValues(event)
    )
    logger(
      'Company List Charges',
      'all',
      'read',
      'After Cognito Values',
      `ContactId ${connectedUser['custom:contactId']}, CompanyId ${
        connectedUser['custom:companyId']
        }`
    )

    if (connectedUser['custom:isActive'] === '0') {
      logger(
        'Company List Charges',
        'all',
        'not active',
        JSON.stringify(connectedUser, null, 2)
      )
      throw 'The user is not active'
    }

    const companyId = parseInt(connectedUser['custom:companyId'])

    const Contacts = new ContactsController(contactsClient)

    const companyInfos = await Contacts.getInfoById(companyId)

    const stripeClient = new StripeClient()
    let charges = null

    if (typeof companyInfos.data.data.custom_fields.stripeCustomer !== 'undefined') {
      charges = await stripeClient.listCharges(
        companyInfos.data.data.custom_fields.stripeCustomer
      )
    }

    logger('Company List Charges', 'all', 'end')

    return new ResponseFactory().build(
      {
        status: 200,
        data: {
          success: true,
          charges,
        },
      },
      event.headers.origin
    )
  } catch (err) {
    logger('Company List Charges', 'all', 'end', 'error')
    return new ErrorFactory().build(err, event.headers.origin)
  }
}
