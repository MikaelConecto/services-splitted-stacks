import ContactAddUserRawData from '../Interfaces/ContactAddUserRawData'
import ContactCreationTransformedRawData from '../Interfaces/ContactCreationTransformedRawData'
import ContactAddUserTransformedResponseData from '../Interfaces/ContactAddUserTransformedResponseData'
import GuardAgainstMissingValue from '../Guards/GuardAgainstMissingValue'
import GuardAgainstMissingParameter from '../Guards/GuardAgainstMissingParameter'
import DataTransformer from '../Interfaces/DataTransformer'
import capitalize from '../Helpers/capitalize'

class ContactAddUserTransformer implements DataTransformer {
  requiredParams: Array<string>

  constructor(requiredParams: Array<string>) {
    this.requiredParams = requiredParams
  }

  transformRawData(
    data: ContactAddUserRawData
  ): ContactCreationTransformedRawData {
    GuardAgainstMissingParameter.guard(Object.keys(data), this.requiredParams)
    GuardAgainstMissingValue.guard('companyId', 'number', data)

    const transformedData = {
      is_organization: false,
      contact_id: data.companyId,
      first_name: capitalize.firstLetters(data.firstName),
      last_name: capitalize.firstLetters(data.lastName),
      email: data.email,
      phone: data.tel,
      custom_fields: {
        cognitoSub: data.cognitoSub,
        subscribeEmail: true,
        activeForRoofing: true,
        isActive: 1,
        isAdmin: 0,
      },
    }

    return transformedData
  }

  transformResponseData(response: any): ContactAddUserTransformedResponseData {
    return {
      status: response.status,
      data: {
        id: response.data.data.id,
        contact_id: response.data.data.contact_id,
        first_name: response.data.data.first_name,
        last_name: response.data.data.last_name,
        email: response.data.data.email,
        phone: response.data.data.phone,
        custom_fields: response.data.data.custom_fields,
        created_at: response.data.data.created_at,
      },
    }
  }
}

export default ContactAddUserTransformer
