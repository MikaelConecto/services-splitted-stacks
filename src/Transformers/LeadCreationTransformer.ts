import LeadCreationRawData from '../Interfaces/LeadCreationRawData'
import LeadCreationTransformedRawData from '../Interfaces/LeadCreationTransformedRawData'
import GuardAgainstMissingParameter from '../Guards/GuardAgainstMissingParameter'
import DataTransformer from '../Interfaces/DataTransformer'
import LeadCreationTransformedResponseData from '../Interfaces/LeadCreationTransformedResponseData'
import capitalize from '../Helpers/capitalize'

class LeadCreationTransformer implements DataTransformer {
  requiredParams: Array<string>

  constructor(requiredParams: Array<string>) {
    this.requiredParams = requiredParams
  }

  transformRawData(data: LeadCreationRawData): LeadCreationTransformedRawData {
    GuardAgainstMissingParameter.guard(Object.keys(data), this.requiredParams)

    return {
      first_name: capitalize.firstLetters(data.firstname),
      last_name: capitalize.firstLetters(data.lastname),
      title: `${capitalize.firstLetters(
        data.firstname
      )} ${capitalize.firstLetters(data.lastname)} (${data.zipcode.substr(
        0,
        3
      )}) ${data.jobType} ${data.jobTypeSpecific}`,
      email: data.email,
      phone: data.tel,
      address: {
        line1:
          data.address.indexOf(data.number) !== -1
            ? data.number + ' ' + data.address.replace(data.number, '')
            : data.number + ' ' + data.address,
        city: data.city,
        postal_code: data.zipcode,
        state: 'QC',
        country: 'CA',
      },
      description: data.jobInfo,
      custom_fields: {
        jobType: data.jobType,
        jobTypeSpecific: data.jobTypeSpecific,
        jobInfo: data.jobInfo,
        service: 'roofing',
        preferredContactMethod: data.preferredContactMethod,
        preferredContactTime: data.preferredContactTime,
        latitude: data.latitude,
        longitude: data.longitude,
        locale: data.locale,
        conditions: (data.conditions) ? 1 : 0,
        mailing: (data.mailing) ? 1 : 0,
      },
    }
  }

  transformResponseData(response: any): LeadCreationTransformedResponseData {
    return {
      status: response.status,
      data: {
        first_name: response.data.data.first_name,
        last_name: response.data.data.last_name,
        title: response.data.data.title,
        phone: response.data.data.phone,
        email: response.data.data.email,
        description: response.data.data.description,
        address: {
          streetAddress: response.data.data.address.line1,
          city: response.data.data.address.city,
          postal_code: response.data.data.address.postal_code,
          state: response.data.data.address.state,
          country: response.data.data.address.country,
        },
        custom_fields: {
          jobType: response.data.data.custom_fields.jobType,
          jobTypeSpecific: response.data.data.custom_fields.jobTypeSpecific,
          jobInfo: response.data.data.custom_fields.jobInfo,
          preferredContactMethod:
            response.data.data.custom_fields.preferredContactMethod,
          preferredContactTime:
            response.data.data.custom_fields.preferredContactTime,
          conditions: response.data.data.custom_fields.conditions,
          locale: response.data.data.custom_fields.locale,
          latitude: response.data.data.custom_fields.latitude,
          longitude: response.data.data.custom_fields.longitude,
        },
        created_at: response.data.data.created_at,
      },
    }
  }
}

export default LeadCreationTransformer
