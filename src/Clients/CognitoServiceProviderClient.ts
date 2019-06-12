import { CognitoIdentityServiceProvider } from 'aws-sdk'
import { APIGatewayEvent } from 'aws-lambda'
import nanoidGenerate from 'nanoid/generate'

import CognitoServiceProviderUser from '../Interfaces/CognitoServiceProviderUser'

class CognitoServiceProviderClient {
  private engine: CognitoIdentityServiceProvider

  constructor(
    options?: CognitoIdentityServiceProvider.Types.ClientConfiguration
  ) {
    this.engine = new CognitoIdentityServiceProvider(options)
  }

  getEventAuthValues(event: APIGatewayEvent): CognitoServiceProviderUser {
    const authProvider =
      event.requestContext.identity.cognitoAuthenticationProvider
    let userPoolId = null
    let cognitoSub = null

    if (
      authProvider !== null &&
      typeof authProvider !== 'undefined' &&
      authProvider !== 'offlineContext_cognitoAuthenticationProvider'
    ) {
      const parts = authProvider.split(':')
      const userPoolIdParts = parts[parts.length - 3].split('/')

      userPoolId = userPoolIdParts[userPoolIdParts.length - 1]
      cognitoSub = parts[parts.length - 1]
    }

    return {
      userPoolId,
      cognitoSub,
    }
  }

  async getUser(user: CognitoServiceProviderUser): Promise<any> {
    if (user.userPoolId !== null && user.cognitoSub !== null) {
      const { userPoolId, cognitoSub } = user

      const cognitoData = await this.engine
        .listUsers({
          UserPoolId: userPoolId,
          Limit: 1,
          Filter: `sub="${cognitoSub}"`,
        })
        .promise()

      if (cognitoData.Users.length === 1) {
        const user = cognitoData.Users[0]
        const userAttributes = {}

        user.Attributes.forEach(attribute => {
          userAttributes[attribute.Name] = attribute.Value
        })

        return userAttributes
      } else {
        return 'No user ' + JSON.stringify(cognitoData)
      }
    }

    return 'No user'
  }

  async updateUserAttributes(
    user: CognitoServiceProviderUser,
    attributes: any
  ): Promise<any> {
    if (user.userPoolId !== null && user.cognitoSub !== null) {
      const { userPoolId, cognitoSub } = user
      const attrToUpdate = Object.keys(attributes).map(attribute => ({
        Name: attribute,
        Value: attributes[attribute].toString(),
      }))

      // @TODO: Check for cognitoidentityserviceprovider.updateUserAttributes
      // https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/CognitoIdentityServiceProvider.html#updateUserAttributes-property
      const cognitoData = await this.engine
        .adminUpdateUserAttributes({
          UserPoolId: userPoolId,
          Username: cognitoSub,
          UserAttributes: attrToUpdate,
        })
        .promise()

      return cognitoData
    }

    return 'No user'
  }

  async globalLogout(user: CognitoServiceProviderUser) {
    if (user.userPoolId !== null && user.cognitoSub !== null) {
      const { userPoolId, cognitoSub } = user
      const cognitoData = await this.engine
        .adminUserGlobalSignOut({
          UserPoolId: userPoolId,
          Username: cognitoSub,
        })
        .promise()

      return cognitoData
    }

    return 'No user'
  }

  async createUser(data) {
    const cognitoUser = await this.engine.adminCreateUser({
      UserPoolId: process.env.USER_POOL,
      Username: data.email.toLowerCase(),
      TemporaryPassword: `${nanoidGenerate('abcdefghijklmnopqrstuvwxyz', 4)}${nanoidGenerate('ABCDEFGHIJKLMNOPQRSTUVWXYZ', 4)}${nanoidGenerate('0123456789', 4)}`,
      DesiredDeliveryMediums: ['EMAIL'],
      UserAttributes: [{
        Name: 'given_name',
        Value: data.firstname,
      }, {
        Name: 'family_name',
        Value: data.lastname,
      }, {
        Name: 'phone_number',
        Value: data.tel,
      }, {
        Name: 'phone_number_verified',
        Value: 'false',
      }, {
        Name: 'address',
        Value: data.companyNumber +
          ' ' +
          data.companyAddress +
          ' | ' +
          data.companyCity +
          ' | ' +
          data.companyPostalCode,
      }]
    }).promise()

    return cognitoUser
  }

  async resendUserPassword(data) {
    const cognitoUser = await this.engine.adminCreateUser({
      UserPoolId: process.env.USER_POOL,
      Username: data.email,
      TemporaryPassword: `${nanoidGenerate('abcdefghijklmnopqrstuvwxyz', 4)}${nanoidGenerate('ABCDEFGHIJKLMNOPQRSTUVWXYZ', 4)}${nanoidGenerate('0123456789', 4)}`,
      MessageAction: 'RESEND',
      DesiredDeliveryMediums: ['EMAIL'],
    }).promise()

    return cognitoUser
  }

  async listUsers(paginationToken = null, customParams = {}) {
    const params = {
      UserPoolId: process.env.USER_POOL,
      ...customParams,
    }

    if (paginationToken !== null) {
      params.PaginationToken = paginationToken
    }

    const cognitoUser = await this.engine.listUsers(params).promise()

    return cognitoUser
  }
}

export default CognitoServiceProviderClient
