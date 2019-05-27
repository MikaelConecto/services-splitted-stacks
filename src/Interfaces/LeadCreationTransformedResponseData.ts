interface LeadAddress {
  streetAddress: string
  city: string
  postal_code: string
  state: string
  country: string
}

interface LeadCustomFields {
  jobType: string
  jobTypeSpecific: string
  jobInfo: string
  latitude: number
  longitude: number
  locale: string
  conditions: boolean
  preferredContactMethod: string
  preferredContactTime: string
}

interface LeadData {
  first_name: string
  last_name: string
  title: string
  phone: string
  email: string
  description: string
  address: LeadAddress
  custom_fields: LeadCustomFields
  created_at: string
}

interface LeadCreationTransformedResponseData {
  status: number
  data: LeadData
}

export default LeadCreationTransformedResponseData
