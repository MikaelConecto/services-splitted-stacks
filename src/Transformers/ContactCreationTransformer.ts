import ContactCreationRawData from '../Interfaces/ContactCreationRawData'
import ContactCreationTransformedRawData from '../Interfaces/ContactCreationTransformedRawData'
import GuardAgainstMissingValue from '../Guards/GuardAgainstMissingValue'
import GuardAgainstMissingParameter from '../Guards/GuardAgainstMissingParameter'
import DataTransformer from '../Interfaces/DataTransformer'
import DataTransformerRawDataOptions from '../Interfaces/DataTransformerRawDataOptions'
import ContactCreationTransformedResponseData from '../Interfaces/ContactCreationTransformedResponseData'
import ContactCreationResponseData from '../Interfaces/ContactCreationResponseData'
import capitalize from '../Helpers/capitalize'

class ContactCreationTransformer implements DataTransformer {
  requiredParams: Array<string>

  constructor(requiredParams: Array<string>) {
    this.requiredParams = requiredParams
  }

  transformRawData(
    data: ContactCreationRawData,
    options: DataTransformerRawDataOptions = {}
  ): ContactCreationTransformedRawData {
    GuardAgainstMissingParameter.guard(Object.keys(data), this.requiredParams)

    if (!options.isCompany) {
      GuardAgainstMissingValue.guard('contactId', 'number', options)
    }

    const transformedAddress = {
      line1: data.companyNumber + ' ' + data.companyAddress,
      city: data.companyCity,
      postal_code: data.companyPostalCode.replace(' ', ''),
      state: 'QC',
      country: 'CA',
    }

    const transformedData = {
      is_organization: options.isCompany,
      contact_id: options.contactId ? options.contactId : null,
      name: capitalize.firstLetters(data.companyName),
      first_name: capitalize.firstLetters(data.firstname),
      last_name: capitalize.firstLetters(data.lastname),
      email: data.email,
      phone: data.tel,
      address: transformedAddress,
      custom_fields: {
        RBQ: options.isCompany ? data.rbq : '',
        NEQ: options.isCompany ? data.neq : '',
        cognitoSub: data.cognitoSub,
        subscribeEmail: data.subscribeEmail,
        latitude: options.isCompany ? data.companyLatitude : null,
        longitude: options.isCompany ? data.companyLongitude : null,
        activeForRoofing: true,
        isAdmin: 1,
        isActive: 1,
        locale: data.locale,
        byFastTrack: data.byFastTrack ? data.byFastTrack : 0,
        conditions: data.byFastTrack === 1 ? 0 : 1,
        verified: data.byFastTrack === 1 ? 0 : 1,
      },
    }

    if (!options.isCompany) {
      delete transformedData.address
    }

    return transformedData
  }

  transformResponseData(
    response: ContactCreationResponseData
  ): ContactCreationTransformedResponseData {
    return {
      status: response.company.status,
      data: {
        company: {
          id: response.company.data.data.id,
          name: response.company.data.data.name,
          email: response.company.data.data.email,
          phone: response.company.data.data.phone,
          address: response.company.data.data.address,
          custom_fields: response.company.data.data.custom_fields,
          customer_status: response.company.data.data.customer_status,
          prospect_status: response.company.data.data.prospect_status,
          created_at: response.company.data.data.created_at,
        },
        contact: {
          id: response.contact.data.data.id,
          first_name: response.contact.data.data.first_name,
          last_name: response.contact.data.data.last_name,
          email: response.contact.data.data.email,
          phone: response.contact.data.data.phone,
          custom_fields: response.contact.data.data.custom_fields,
          created_at: response.contact.data.data.created_at,
        },
      },
    }
  }
}

export default ContactCreationTransformer
