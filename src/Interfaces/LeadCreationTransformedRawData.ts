interface TransformedAddress {
  line1: string
  city: string
  postal_code: string
  state: string
  country: string
}

interface TransformedCustomFields {
  jobType: string
  jobTypeSpecific: string
  jobInfo: string
  service: string
  preferredContactMethod: string
  preferredContactTime: string
  latitude: number
  longitude: number
  locale: string
  conditions: number
  mailing: number
}

interface LeadCreationTransformedRawData {
  first_name: string
  last_name: string
  title: string
  email: string
  phone: string
  address: TransformedAddress
  description: string
  custom_fields: TransformedCustomFields
}

export default LeadCreationTransformedRawData
